import "server-only";
import * as opaque from "@serenity-kit/opaque";
import { randomBytes, randomUUID } from "node:crypto";
import {
  ANONYMOUS_FILE_BYTES,
  MAX_FILE_BYTES,
  CIPHER_OVERHEAD_BYTES,
  PROTOCOL_VERSION,
  SLUG_PATTERN,
  type ArtifactSummary,
  type HistoryPage,
  type WrappedKey,
} from "@/lib/protocol";
import { historyCursorSchema } from "./schemas";
import type { Database, QueryClient, Row } from "./db";
import type { Storage } from "./storage";
import { AppError, unauthorized, unavailable } from "./errors";
import {
  equalSecret,
  openState,
  randomToken,
  sealState,
  tokenHash,
} from "./secrets";

type Artifact = Row & {
  id: string;
  owner_id: string | null;
  namespace: string;
  slug: string;
  state: ArtifactSummary["state"];
  created_at: Date;
  expires_at: Date;
  pending_expires_at: Date;
  max_failures: number | null;
  failed_count: number;
  access_count: number;
  max_releases: number | null;
  release_count: number;
  declared_size: number;
  blob_path: string;
  blob_url: string | null;
  registration_record: string | null;
  wrapped_key: WrappedKey | null;
  management_hash: string;
  setup_version: string;
  upload_issued: boolean;
  delete_after: Date | null;
};
type Settings = {
  serverSetup: string;
  setupVersion: string;
  serverIdentity: string;
};
type Reservation = {
  mode: "anonymous" | "account";
  slug?: string;
  size: number;
  ttlMinutes: number;
  maxReleases: number | null;
  maxFailures?: number | null;
  registrationRequest: string;
};
const asDate = (value: Date) => new Date(value);
function active(a: Artifact, now: Date) {
  return (
    a.state === "ready" &&
    asDate(a.expires_at) > now &&
    (a.max_releases === null || a.release_count < a.max_releases)
  );
}

export class ArtifactService {
  constructor(
    private db: Database,
    private storage: Storage,
    private settings: Settings,
    private clock: () => Date = () => new Date(),
  ) {}

  async reserve(
    input: Reservation,
    owner: { id: string; username: string } | null,
  ) {
    if (input.mode === "account" && !owner)
      throw new AppError(
        401,
        "ACCOUNT_REQUIRED",
        "Sign in and choose a username to continue.",
      );
    if (input.mode === "anonymous" && input.slug)
      throw new AppError(
        400,
        "SLUG",
        "Anonymous links use a random identifier.",
      );
    if (input.maxFailures != null && (input.mode !== "account" || !owner))
      throw new AppError(
        400,
        "POLICY",
        "The kill-switch requires an artifact from your account.",
      );
    if (
      input.maxFailures != null &&
      (!Number.isInteger(input.maxFailures) ||
        input.maxFailures < 1 ||
        input.maxFailures > 100)
    )
      throw new AppError(400, "POLICY", "Choose between 1 and 100 failures.");
    const now = this.clock(),
      id = randomUUID(),
      managementToken = randomToken();
    const namespace = input.mode === "account" ? owner!.username : "a";
    let slug = input.slug;
    if (!slug) {
      do {
        slug = randomBytes(9).toString("base64url");
      } while (!SLUG_PATTERN.test(slug));
    }
    const expiresAt = new Date(now.getTime() + input.ttlMinutes * 60_000);
    const pendingExpiresAt = new Date(
      Math.min(expiresAt.getTime(), now.getTime() + 15 * 60_000),
    );
    if (
      input.size < 1 ||
      input.size >
        (input.mode === "account" ? MAX_FILE_BYTES : ANONYMOUS_FILE_BYTES) +
          CIPHER_OVERHEAD_BYTES
    )
      throw new AppError(400, "SIZE", "Invalid size.");
    await opaque.ready;
    let registrationResponse: string;
    try {
      ({ registrationResponse } = opaque.server.createRegistrationResponse({
        serverSetup: this.settings.serverSetup,
        userIdentifier: id,
        registrationRequest: input.registrationRequest,
      }));
    } catch {
      throw new AppError(400, "PROTOCOL", "Invalid cryptographic request.");
    }
    try {
      await this.db.transaction(async (tx) => {
        // Serialize capacity reservations; even simultaneous anonymous uploads
        // cannot race past the total storage budget (1 GiB for the initial MVP).
        await tx.query("SELECT pg_advisory_xact_lock(17420717)");
        // An expired reservation that never authorized an upload has no blob.
        // Keep charging issued uploads until storage confirms deletion.
        const capacity = await tx.query<{ used: string }>(
          `SELECT COALESCE(sum(declared_size),0)::text AS used FROM artifacts
           WHERE purged_at IS NULL AND (upload_issued OR pending_expires_at>$1)`,
          [now],
        );
        if (Number(capacity.rows[0].used) + input.size > 1024 ** 3)
          throw new AppError(
            429,
            "CAPACITY",
            "The service has reached its temporary storage limit.",
          );
        if (input.mode === "account") {
          const own = await tx.query<{ total: string }>(
            "SELECT count(*)::text AS total FROM artifacts WHERE owner_id=$1 AND purged_at IS NULL",
            [owner!.id],
          );
          if (Number(own.rows[0].total) >= 50)
            throw new AppError(
              429,
              "QUOTA",
              "Your account has reached the limit of 50 active artifacts.",
            );
        }
        await tx.query(
          `INSERT INTO artifacts(id,owner_id,namespace,slug,created_at,expires_at,pending_expires_at,max_releases,declared_size,blob_path,setup_version,management_hash,max_failures)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [
            id,
            input.mode === "account" ? owner!.id : null,
            namespace,
            slug,
            now,
            expiresAt,
            pendingExpiresAt,
            input.maxReleases,
            input.size,
            `artifacts/${id}/payload.bin`,
            this.settings.setupVersion,
            tokenHash(managementToken),
            input.maxFailures ?? null,
          ],
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505")
        throw new AppError(
          409,
          "SLUG_TAKEN",
          "This address has already been used. Choose another identifier.",
        );
      throw error;
    }
    return {
      id,
      namespace,
      slug,
      managementToken,
      registrationResponse,
      serverIdentity: this.settings.serverIdentity,
      protocolVersion: PROTOCOL_VERSION,
      expiresAt: expiresAt.toISOString(),
      pathname: `artifacts/${id}/payload.bin`,
    };
  }

  async issueUpload(id: string, managementToken: string, pathname: string) {
    const now = this.clock();
    const result = await this.db.query<Artifact>(
      `UPDATE artifacts SET upload_issued=true WHERE id=$1 AND management_hash=$2 AND blob_path=$3 AND state='pending'
      AND upload_issued=false AND pending_expires_at>$4 RETURNING *`,
      [id, tokenHash(managementToken), pathname, now],
    );
    if (!result.rowCount) throw unauthorized();
    return {
      maximumSizeInBytes: result.rows[0].declared_size,
      validUntil: asDate(result.rows[0].pending_expires_at).getTime(),
    };
  }

  async commit(input: {
    id: string;
    managementToken: string;
    registrationRecord: string;
    wrappedKey: WrappedKey;
  }) {
    const now = this.clock();
    const found = await this.db.query<Artifact>(
      "SELECT * FROM artifacts WHERE id=$1 AND management_hash=$2",
      [input.id, tokenHash(input.managementToken)],
    );
    const a = found.rows[0];
    if (
      !a ||
      a.state !== "pending" ||
      !a.upload_issued ||
      asDate(a.pending_expires_at) <= now
    )
      throw unavailable();
    const blob = await this.storage.inspect(a.blob_path);
    if (
      blob.pathname !== a.blob_path ||
      blob.size > a.declared_size ||
      blob.size < 29 ||
      !blob.contentType.startsWith("application/octet-stream")
    )
      throw new AppError(
        400,
        "UPLOAD",
        "The upload does not match the reserved artifact.",
      );
    // Validate the record through the real protocol before accepting it. No
    // authentication or content release occurs during this structural check.
    await opaque.ready;
    try {
      const probe = opaque.client.startLogin({ password: randomToken() });
      opaque.server.startLogin({
        serverSetup: this.settings.serverSetup,
        registrationRecord: input.registrationRecord,
        userIdentifier: a.id,
        startLoginRequest: probe.startLoginRequest,
        identifiers: { client: a.id, server: this.settings.serverIdentity },
      });
    } catch {
      throw new AppError(400, "PROTOCOL", "Invalid cryptographic record.");
    }
    const result = await this.db.query(
      `UPDATE artifacts SET registration_record=$2,wrapped_key=$3::jsonb,blob_url=$4,state='ready'
      WHERE id=$1 AND management_hash=$5 AND state='pending' AND pending_expires_at>$6 AND expires_at>$6 RETURNING id`,
      [
        a.id,
        input.registrationRecord,
        JSON.stringify(input.wrappedKey),
        blob.url,
        tokenHash(input.managementToken),
        this.clock(),
      ],
    );
    if (!result.rowCount) throw unavailable();
    return {
      id: a.id,
      namespace: a.namespace,
      slug: a.slug,
      expiresAt: asDate(a.expires_at).toISOString(),
    };
  }

  // Invalid final proofs and abandoned challenges both count. Counting only
  // client-reported wrong passwords would let a modified client bypass the fuse.
  private async fail(tx: QueryClient, a: Artifact, count: number, now: Date) {
    if (!count || a.max_failures === null || !active(a, now)) return a;
    const killed = a.failed_count + count >= a.max_failures;
    const result = await tx.query<Artifact>(
      `UPDATE artifacts SET failed_count=failed_count+$2,
       state=CASE WHEN $3 THEN 'destroyed' ELSE state END,
       registration_record=CASE WHEN $3 THEN NULL ELSE registration_record END,
       wrapped_key=CASE WHEN $3 THEN NULL ELSE wrapped_key END WHERE id=$1 RETURNING *`,
      [a.id, count, killed],
    );
    if (killed) {
      await tx.query("DELETE FROM handshakes WHERE artifact_id=$1", [a.id]);
      await enqueue(
        tx,
        a.id,
        new Date(
          Math.max(
            now.getTime(),
            a.delete_after ? asDate(a.delete_after).getTime() : 0,
            asDate(a.pending_expires_at).getTime() + 90_000,
          ),
        ),
      );
    }
    return result.rows[0];
  }

  private async settleExpired(tx: QueryClient, a: Artifact, now: Date) {
    const expired = await tx.query(
      "DELETE FROM handshakes WHERE artifact_id=$1 AND expires_at<=$2 RETURNING id",
      [a.id, now],
    );
    return this.fail(tx, a, expired.rowCount, now);
  }

  async startLogin(namespace: string, slug: string, startLoginRequest: string) {
    await opaque.ready;
    const result = await this.db.transaction(async (tx) => {
      const now = this.clock();
      const found = await tx.query<Artifact>(
        "SELECT * FROM artifacts WHERE namespace=$1 AND slug=$2 FOR UPDATE",
        [namespace, slug],
      );
      let a = found.rows[0];
      if (!a || !active(a, now)) return null;
      a = await this.settleExpired(tx, a, now);
      if (
        !active(a, now) ||
        !a.registration_record ||
        a.setup_version !== this.settings.setupVersion
      )
        return null;
      if (a.max_failures !== null) {
        const pending = await tx.query<{ total: string }>(
          "SELECT count(*)::text AS total FROM handshakes WHERE artifact_id=$1",
          [a.id],
        );
        if (a.failed_count + Number(pending.rows[0].total) >= a.max_failures)
          return { busy: true } as const;
      }
      let login: ReturnType<typeof opaque.server.startLogin>;
      try {
        login = opaque.server.startLogin({
          serverSetup: this.settings.serverSetup,
          registrationRecord: a.registration_record,
          userIdentifier: a.id,
          startLoginRequest,
          identifiers: { client: a.id, server: this.settings.serverIdentity },
        });
      } catch {
        throw new AppError(400, "PROTOCOL", "Invalid cryptographic request.");
      }
      const handshakeId = randomUUID();
      await tx.query(
        "INSERT INTO handshakes(id,artifact_id,sealed_state,expires_at) VALUES($1,$2,$3,$4)",
        [
          handshakeId,
          a.id,
          sealState(login.serverLoginState, a.id),
          new Date(
            Math.min(now.getTime() + 120_000, asDate(a.expires_at).getTime()),
          ),
        ],
      );
      return {
        handshakeId,
        artifactId: a.id,
        loginResponse: login.loginResponse,
        serverIdentity: this.settings.serverIdentity,
        protocolVersion: PROTOCOL_VERSION,
      };
    });
    // Throw outside the transaction so expiry/failure changes remain committed.
    if (!result) throw unavailable();
    if ("busy" in result)
      throw new AppError(
        429,
        "ATTEMPTS_PENDING",
        "Checks are in progress. Wait up to 2 minutes and try again.",
      );
    return result;
  }

  async visit(namespace: string, slug: string) {
    await this.db.query(
      `UPDATE artifacts SET access_count=access_count+1
       WHERE namespace=$1 AND slug=$2 AND owner_id IS NOT NULL AND state='ready' AND expires_at>$3`,
      [namespace, slug, this.clock()],
    );
    // Identical response for unavailable routes; no metadata or visitor history.
    return { recorded: true };
  }

  async authorizeDelivery(handshakeId: string, finishLoginRequest: string) {
    await opaque.ready;
    const result = await this.db.transaction(async (tx) => {
      const lookup = await tx.query<Row & { artifact_id: string }>(
        "SELECT artifact_id FROM handshakes WHERE id=$1",
        [handshakeId],
      );
      if (!lookup.rows[0]) return null;
      // Consistent lock order with revoke/cleanup: artifact, then handshake.
      const found = await tx.query<Artifact>(
        "SELECT * FROM artifacts WHERE id=$1 FOR UPDATE",
        [lookup.rows[0].artifact_id],
      );
      const now = this.clock();
      let a = found.rows[0];
      if (!a) return null;
      a = await this.settleExpired(tx, a, now);
      const handshake = await tx.query<
        Row & { artifact_id: string; sealed_state: string; expires_at: Date }
      >("DELETE FROM handshakes WHERE id=$1 RETURNING *", [handshakeId]);
      const h = handshake.rows[0];
      if (!h) return null;
      if (asDate(h.expires_at) <= now || !active(a, now) || !a.wrapped_key)
        return null;
      try {
        opaque.server.finishLogin({
          serverLoginState: openState(h.sealed_state, a.id),
          finishLoginRequest,
        });
      } catch {
        await this.fail(tx, a, 1, now);
        return null;
      } // Commit failure accounting and deletion even for an invalid proof.
      const exhausted =
        a.max_releases !== null && a.release_count + 1 >= a.max_releases;
      const deleteAfter = new Date(now.getTime() + 90_000);
      await tx.query(
        `UPDATE artifacts SET release_count=release_count+1,state=$2,delete_after=$3,
         registration_record=CASE WHEN $2='exhausted' THEN NULL ELSE registration_record END,
         wrapped_key=CASE WHEN $2='exhausted' THEN NULL ELSE wrapped_key END WHERE id=$1`,
        [a.id, exhausted ? "exhausted" : "ready", deleteAfter],
      );
      if (exhausted)
        await tx.query("DELETE FROM handshakes WHERE artifact_id=$1", [a.id]);
      if (exhausted)
        await enqueue(
          tx,
          a.id,
          new Date(
            Math.max(
              deleteAfter.getTime(),
              asDate(a.pending_expires_at).getTime() + 90_000,
            ),
          ),
        );
      return { id: a.id, pathname: a.blob_path, wrappedKey: a.wrapped_key };
    });
    if (!result) throw unavailable();
    return result;
  }

  async revoke(
    id: string,
    managementToken: string | undefined,
    ownerId: string | null,
  ) {
    return this.db.transaction(async (tx) => {
      const found = await tx.query<Artifact>(
        "SELECT * FROM artifacts WHERE id=$1 FOR UPDATE",
        [id],
      );
      const a = found.rows[0];
      if (
        !a ||
        (!(ownerId && a.owner_id === ownerId) &&
          !(
            managementToken &&
            equalSecret(tokenHash(managementToken), a.management_hash)
          ))
      )
        throw unauthorized();
      if (["revoked", "destroyed"].includes(a.state)) return { revoked: true };
      const now = this.clock();
      await tx.query(
        "UPDATE artifacts SET state='revoked',registration_record=NULL,wrapped_key=NULL WHERE id=$1",
        [id],
      );
      await tx.query("DELETE FROM handshakes WHERE artifact_id=$1", [id]);
      // Allow any in-flight delivery and already-issued PUT token to expire.
      await enqueue(
        tx,
        id,
        new Date(
          Math.max(
            now.getTime(),
            a.delete_after ? asDate(a.delete_after).getTime() : 0,
            asDate(a.pending_expires_at).getTime() + 90_000,
          ),
        ),
      );
      return { revoked: true };
    });
  }

  async history(ownerId: string, cursor?: string): Promise<HistoryPage> {
    let after: { createdAt: string; id: string } | undefined;
    if (cursor) {
      try {
        if (cursor.length > 256) throw new Error();
        after = historyCursorSchema.parse(
          JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
        );
      } catch {
        throw new AppError(400, "CURSOR", "Invalid history page.");
      }
    }
    const result = await this.db.query<Artifact>(
      `SELECT id,namespace,slug,state,created_at,expires_at,release_count,max_releases,declared_size,access_count,failed_count,max_failures
       FROM artifacts WHERE owner_id=$1 AND (purged_at IS NULL OR purged_at>=$4) AND ($2::timestamptz IS NULL OR (created_at,id)<($2::timestamptz,$3::uuid))
       ORDER BY created_at DESC,id DESC LIMIT 51`,
      [
        ownerId,
        after ? new Date(after.createdAt) : null,
        after?.id ?? null,
        new Date(this.clock().getTime() - 30 * 24 * 60 * 60_000),
      ],
    );
    const now = this.clock();
    const rows = result.rows.slice(0, 50);
    const last = rows.at(-1);
    return {
      artifacts: rows.map((a) => ({
        id: a.id,
        namespace: a.namespace,
        slug: a.slug,
        state:
          a.state === "ready" && asDate(a.expires_at) <= now
            ? "expired"
            : a.state,
        createdAt: asDate(a.created_at).toISOString(),
        expiresAt: asDate(a.expires_at).toISOString(),
        releaseCount: a.release_count,
        maxReleases: a.max_releases,
        declaredSize: a.declared_size,
        accessCount: a.access_count,
        failedCount: a.failed_count,
        maxFailures: a.max_failures,
      })),
      nextCursor:
        result.rows.length > 50 && last
          ? Buffer.from(
              JSON.stringify({
                createdAt: asDate(last.created_at).toISOString(),
                id: last.id,
              }),
            ).toString("base64url")
          : null,
    };
  }

  async cleanup(limit = 20) {
    const now = this.clock();
    const moreAttempts = await this.db.transaction(async (tx) => {
      const waiting = await tx.query<Artifact>(
        `SELECT * FROM artifacts a WHERE state='ready' AND max_failures IS NOT NULL
         AND EXISTS (SELECT 1 FROM handshakes h WHERE h.artifact_id=a.id AND h.expires_at<=$1)
         ORDER BY id LIMIT 100 FOR UPDATE`,
        [now],
      );
      for (const a of waiting.rows) await this.settleExpired(tx, a, now);
      if (tx.dialect === "sqlite") {
        const expired = await tx.query<Artifact>(
          `UPDATE artifacts SET state='expired',registration_record=NULL,wrapped_key=NULL WHERE purged_at IS NULL
           AND ((state='ready' AND expires_at<=$1) OR (state='pending' AND pending_expires_at<=$1)) RETURNING *`,
          [now],
        );
        for (const a of expired.rows)
          await enqueue(
            tx,
            a.id,
            new Date(
              Math.max(
                now.getTime(),
                asDate(a.pending_expires_at).getTime() + 90_000,
                a.delete_after ? asDate(a.delete_after).getTime() : 0,
              ),
            ),
          );
      } else
        await tx.query(
          `WITH expired AS (
          UPDATE artifacts SET state='expired',registration_record=NULL,wrapped_key=NULL WHERE purged_at IS NULL
          AND ((state='ready' AND expires_at<=$1) OR (state='pending' AND pending_expires_at<=$1))
          RETURNING id,pending_expires_at,delete_after
        ) INSERT INTO cleanup_jobs(artifact_id,not_before)
          SELECT id,GREATEST($1::timestamptz,pending_expires_at+INTERVAL '90 seconds',delete_after)
          FROM expired WHERE true
          ON CONFLICT(artifact_id) DO UPDATE
          SET not_before=GREATEST(cleanup_jobs.not_before,EXCLUDED.not_before)`,
          [now],
        );
      await tx.query(
        `DELETE FROM handshakes AS h WHERE expires_at<=$1 AND NOT EXISTS
         (SELECT 1 FROM artifacts a WHERE a.id=h.artifact_id AND a.state='ready' AND a.max_failures IS NOT NULL)`,
        [now],
      );
      await tx.query("DELETE FROM rate_limits WHERE expires_at<=$1", [now]);
      return waiting.rows.length === 100;
    });
    const jobs = await this.db.transaction(async (tx) => {
      const found = await tx.query<Row & { artifact_id: string }>(
        `SELECT artifact_id FROM cleanup_jobs WHERE not_before<=$1 AND (leased_until IS NULL OR leased_until<=$1)
        ORDER BY not_before LIMIT $2 FOR UPDATE SKIP LOCKED`,
        [now, limit],
      );
      for (const job of found.rows)
        await tx.query(
          "UPDATE cleanup_jobs SET leased_until=$2,attempts=attempts+1 WHERE artifact_id=$1",
          [job.artifact_id, new Date(now.getTime() + 120_000)],
        );
      return found.rows;
    });
    let deleted = 0;
    for (const job of jobs) {
      const found = await this.db.query<Artifact>(
        "SELECT * FROM artifacts WHERE id=$1",
        [job.artifact_id],
      );
      const a = found.rows[0];
      if (!a) continue;
      try {
        await this.storage.remove(a.blob_path);
        await this.db.transaction(async (tx) => {
          await tx.query(
            "UPDATE artifacts SET purged_at=$2,registration_record=NULL,wrapped_key=NULL,blob_url=NULL,management_hash='' WHERE id=$1",
            [a.id, this.clock()],
          );
          await tx.query("DELETE FROM handshakes WHERE artifact_id=$1", [a.id]);
          await tx.query("DELETE FROM cleanup_jobs WHERE artifact_id=$1", [
            a.id,
          ]);
        });
        deleted++;
      } catch {
        await this.db.query(
          "UPDATE cleanup_jobs SET leased_until=NULL,not_before=$2 WHERE artifact_id=$1",
          [a.id, new Date(now.getTime() + 5 * 60_000)],
        );
      }
    }
    // Account history is retained for 30 days after purge. Anonymous records keep
    // only a route tombstone, so an old address can never target a new artifact.
    await this.db.query(
      "UPDATE artifacts SET owner_id=NULL,declared_size=1,access_count=0,failed_count=0,release_count=0,max_failures=NULL,max_releases=NULL WHERE purged_at<$1 AND owner_id IS NOT NULL",
      [new Date(now.getTime() - 30 * 24 * 60 * 60_000)],
    );
    // Reconcile late PUT completions, including a request started just before
    // token expiry. A purged route can never be republished by an upload.
    const saved = await this.db.query<{ value: string }>(
      "SELECT value FROM maintenance WHERE key='inventory-cursor'",
    );
    const page = await this.storage.inventory(
      saved.rows[0]?.value || undefined,
    );
    for (const path of page.paths) {
      const tombstone = await this.db.query(
        "SELECT id FROM artifacts WHERE blob_path=$1 AND purged_at IS NOT NULL",
        [path],
      );
      if (tombstone.rowCount) await this.storage.remove(path);
    }
    await this.db.query(
      "INSERT INTO maintenance(key,value) VALUES('inventory-cursor',$1) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value",
      [page.cursor || ""],
    );
    return { examined: jobs.length, deleted, moreAttempts };
  }
}
async function enqueue(tx: QueryClient, id: string, notBefore: Date) {
  await tx.query(
    `INSERT INTO cleanup_jobs(artifact_id,not_before) VALUES($1,$2) ON CONFLICT(artifact_id)
    DO UPDATE SET not_before=GREATEST(cleanup_jobs.not_before,EXCLUDED.not_before)`,
    [id, notBefore],
  );
}
