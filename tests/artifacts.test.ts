import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as opaque from "@serenity-kit/opaque";
import { randomBytes } from "node:crypto";
import { ArtifactService } from "@/server/artifacts";
import { rateLimit } from "@/server/rate-limit";
import { dailyCleanup } from "@/server/daily-cleanup";
import { encryptArtifact, decryptArtifact } from "@/lib/crypto";
import { KEY_STRETCHING } from "@/lib/protocol";
import type { Storage } from "@/server/storage";
import { testDatabase } from "./database";

describe("artifact protocol and lifecycle", () => {
  let database: Awaited<ReturnType<typeof testDatabase>>,
    service: ArtifactService,
    setup: string;
  let now: Date,
    failures = 0;
  const serverIdentity = "https://example.test",
    password = "uma-frase-longa-e-secreta";
  const objects = new Map<string, ArrayBuffer>();
  const storage: Storage = {
    async inspect(pathname) {
      const data = objects.get(pathname);
      if (!data) throw new Error("Missing object");
      return {
        pathname,
        url: `https://test.private.blob.vercel-storage.com/${pathname}`,
        size: data.byteLength,
        contentType: "application/octet-stream",
      };
    },
    async read(pathname) {
      const data = objects.get(pathname);
      if (!data) throw new Error("Missing object");
      return new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(data));
          c.close();
        },
      });
    },
    async remove(pathname) {
      if (failures > 0) {
        failures--;
        throw new Error("Temporary storage failure");
      }
      objects.delete(pathname);
    },
    async inventory() {
      return { paths: Array.from(objects.keys()) };
    },
  };
  beforeAll(async () => {
    process.env.HANDSHAKE_SEAL_KEY = randomBytes(32).toString("base64url");
    process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("base64url");
    await opaque.ready;
    setup = opaque.server.createSetup();
    database = await testDatabase();
  });
  beforeEach(async () => {
    await database.reset();
    objects.clear();
    failures = 0;
    now = new Date("2026-10-17T12:00:00Z");
    service = new ArtifactService(
      database.db,
      storage,
      { serverSetup: setup, setupVersion: "1", serverIdentity },
      () => new Date(now),
    );
  });
  afterAll(async () => {
    await database?.close();
  });

  async function create(
    maxReleases: number | null = 1,
    ttlMinutes = 60,
    account?: { id: string; username: string },
    slug?: string,
  ) {
    const first = opaque.client.startRegistration({ password });
    const reservation = await service.reserve(
      {
        mode: account ? "account" : "anonymous",
        ...(slug ? { slug } : {}),
        size: 4096,
        ttlMinutes,
        maxReleases,
        registrationRequest: first.registrationRequest,
      },
      account || null,
    );
    const registration = opaque.client.finishRegistration({
      clientRegistrationState: first.clientRegistrationState,
      registrationResponse: reservation.registrationResponse,
      password,
      keyStretching: KEY_STRETCHING,
      identifiers: { client: reservation.id, server: serverIdentity },
    });
    const encrypted = await encryptArtifact(
      {
        kind: "message",
        name: "secreto.txt",
        mime: "text/plain",
        data: new TextEncoder().encode("somente o destinatário pode ler")
          .buffer,
      },
      registration.exportKey,
      reservation.id,
    );
    await service.issueUpload(
      reservation.id,
      reservation.managementToken,
      reservation.pathname,
    );
    objects.set(reservation.pathname, encrypted.ciphertext);
    await service.commit({
      id: reservation.id,
      managementToken: reservation.managementToken,
      registrationRecord: registration.registrationRecord,
      wrappedKey: encrypted.wrappedKey,
    });
    return { ...reservation, registration, encrypted };
  }
  async function login(
    a: Awaited<ReturnType<typeof create>>,
    candidate = password,
  ) {
    const first = opaque.client.startLogin({ password: candidate });
    const response = await service.startLogin(
      a.namespace,
      a.slug,
      first.startLoginRequest,
    );
    const proof = opaque.client.finishLogin({
      clientLoginState: first.clientLoginState,
      loginResponse: response.loginResponse,
      password: candidate,
      keyStretching: KEY_STRETCHING,
      identifiers: { client: a.id, server: serverIdentity },
    });
    return { response, proof };
  }
  const count = async (id: string) =>
    (
      await database.db.query<{ release_count: number }>(
        "SELECT release_count FROM artifacts WHERE id=$1",
        [id],
      )
    ).rows[0].release_count;

  it("authenticates before delivery and decrypts using the client export key", async () => {
    const a = await create();
    const l = await login(a);
    expect(l.proof).toBeDefined();
    expect(l.response).not.toHaveProperty("wrappedKey");
    expect(l.response).not.toHaveProperty("pathname");
    expect(await count(a.id)).toBe(0);
    const delivery = await service.authorizeDelivery(
      l.response.handshakeId,
      l.proof!.finishLoginRequest,
    );
    expect(await count(a.id)).toBe(1);
    expect(l.proof!.exportKey).toBe(a.registration.exportKey);
    const cleared = (
      await database.db.query(
        "SELECT registration_record,wrapped_key FROM artifacts WHERE id=$1",
        [a.id],
      )
    ).rows[0];
    expect(cleared.registration_record).toBeNull();
    expect(cleared.wrapped_key).toBeNull();
    const data = await decryptArtifact(
      objects.get(delivery.pathname)!,
      delivery.wrappedKey,
      l.proof!.exportKey,
      a.id,
    );
    expect(new TextDecoder().decode(data.data)).toBe(
      "somente o destinatário pode ler",
    );
    await expect(
      service.authorizeDelivery(
        l.response.handshakeId,
        l.proof!.finishLoginRequest,
      ),
    ).rejects.toMatchObject({ status: 404 });
    // The AKE session key shared with the server cannot decrypt the artifact.
    await expect(
      decryptArtifact(
        a.encrypted.ciphertext,
        a.encrypted.wrappedKey,
        l.proof!.sessionKey,
        a.id,
      ),
    ).rejects.toThrow();
  });
  it("rejects an incorrect password without consuming an access", async () => {
    const a = await create(),
      l = await login(a, "esta-senha-esta-incorreta");
    expect(l.proof).toBeUndefined();
    expect(await count(a.id)).toBe(0);
    const state = await database.db.query<{ sealed_state: string }>(
      "SELECT sealed_state FROM handshakes WHERE id=$1",
      [l.response.handshakeId],
    );
    expect(state.rows[0].sealed_state).not.toContain(password);
  });
  it("burns a handshake after an invalid final proof, without consuming a release", async () => {
    const a = await create(),
      l = await login(a);
    await expect(
      service.authorizeDelivery(
        l.response.handshakeId,
        randomBytes(64).toString("base64url"),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      service.authorizeDelivery(
        l.response.handshakeId,
        l.proof!.finishLoginRequest,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(await count(a.id)).toBe(0);
  });
  it("enforces the last access across simultaneous valid handshakes", async () => {
    const a = await create(1),
      l1 = await login(a),
      l2 = await login(a);
    const results = await Promise.allSettled([
      service.authorizeDelivery(
        l1.response.handshakeId,
        l1.proof!.finishLoginRequest,
      ),
      service.authorizeDelivery(
        l2.response.handshakeId,
        l2.proof!.finishLoginRequest,
      ),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await count(a.id)).toBe(1);
  });
  it("prevents simultaneous replay of one valid final proof", async () => {
    const a = await create(5),
      l = await login(a);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        service.authorizeDelivery(
          l.response.handshakeId,
          l.proof!.finishLoginRequest,
        ),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await count(a.id)).toBe(1);
  });
  it("blocks TTL expiration even if cleanup has not run", async () => {
    const a = await create(null, 1),
      l = await login(a);
    now = new Date(now.getTime() + 60_000);
    await expect(
      service.authorizeDelivery(
        l.response.handshakeId,
        l.proof!.finishLoginRequest,
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(login(a)).rejects.toMatchObject({ status: 404 });
    expect(objects.has(a.pathname)).toBe(true);
    expect(await count(a.id)).toBe(0);
  });
  it("expires abandoned authentication state", async () => {
    const a = await create(5),
      l = await login(a);
    now = new Date(now.getTime() + 120_000);
    await expect(
      service.authorizeDelivery(
        l.response.handshakeId,
        l.proof!.finishLoginRequest,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(await count(a.id)).toBe(0);
  });
  it("revokes new deliveries immediately but waits before deleting an in-flight object", async () => {
    const a = await create(5),
      l = await login(a);
    await expect(
      service.revoke(a.id, "wrong-token", null),
    ).rejects.toMatchObject({ status: 403 });
    await service.revoke(a.id, a.managementToken, null);
    await expect(
      service.authorizeDelivery(
        l.response.handshakeId,
        l.proof!.finishLoginRequest,
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect((await service.cleanup()).deleted).toBe(0);
    expect(objects.has(a.pathname)).toBe(true);
    now = new Date(now.getTime() + 17 * 60_000);
    expect((await service.cleanup()).deleted).toBe(1);
    expect(objects.has(a.pathname)).toBe(false);
  });
  it("retries failed storage deletion and clears protocol records after purge", async () => {
    const a = await create(1),
      l = await login(a);
    await service.authorizeDelivery(
      l.response.handshakeId,
      l.proof!.finishLoginRequest,
    );
    now = new Date(now.getTime() + 17 * 60_000);
    failures = 1;
    expect((await service.cleanup()).deleted).toBe(0);
    expect(objects.has(a.pathname)).toBe(true);
    now = new Date(now.getTime() + 300_000);
    expect((await service.cleanup()).deleted).toBe(1);
    const row = (
      await database.db.query(
        "SELECT registration_record,wrapped_key,management_hash FROM artifacts WHERE id=$1",
        [a.id],
      )
    ).rows[0];
    expect(row.registration_record).toBeNull();
    expect(row.wrapped_key).toBeNull();
    expect(row.management_hash).toBe("");
  });
  it("drains a daily backlog larger than one cleanup batch", async () => {
    const first = opaque.client.startRegistration({ password });
    for (let i = 0; i < 25; i++) {
      const a = await service.reserve(
        {
          mode: "anonymous",
          size: 64,
          ttlMinutes: 1,
          maxReleases: null,
          registrationRequest: first.registrationRequest,
        },
        null,
      );
      await service.issueUpload(a.id, a.managementToken, a.pathname);
      objects.set(a.pathname, new ArrayBuffer(64));
    }
    now = new Date(now.getTime() + 17 * 60_000);
    const result = await dailyCleanup(service);
    expect(result.deleted).toBe(25);
    expect(result.limited).toBe(false);
    expect(objects.size).toBe(0);
    const remaining = await database.db.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM artifacts WHERE purged_at IS NULL",
    );
    expect(Number(remaining.rows[0].count)).toBe(0);
  });
  it("isolates identical passwords across artifacts", async () => {
    const a = await create(),
      b = await create();
    expect(a.registration.exportKey).not.toBe(b.registration.exportKey);
    const l = await login(a);
    await expect(
      decryptArtifact(
        b.encrypted.ciphertext,
        b.encrypted.wrappedKey,
        l.proof!.exportKey,
        b.id,
      ),
    ).rejects.toThrow();
  });
  it("keeps account authorization scoped to its own artifacts and retains route tombstones", async () => {
    const owner = { id: "owner", username: "alice" };
    await database.db.query(
      "INSERT INTO accounts(id,clerk_id,username) VALUES($1,$2,$3)",
      [owner.id, "clerk-alice", owner.username],
    );
    const a = await create(2, 60, owner, "contrato");
    await expect(
      service.revoke(a.id, undefined, "other-owner"),
    ).rejects.toMatchObject({ status: 403 });
    expect(await service.history("other-owner")).toEqual([]);
    expect((await service.history(owner.id))[0].slug).toBe("contrato");
    await service.revoke(a.id, undefined, owner.id);
    now = new Date(now.getTime() + 17 * 60_000);
    await service.cleanup();
    const first = opaque.client.startRegistration({ password });
    await expect(
      service.reserve(
        {
          mode: "account",
          slug: "contrato",
          size: 4096,
          ttlMinutes: 60,
          maxReleases: 1,
          registrationRequest: first.registrationRequest,
        },
        owner,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("does not accept uploads into another reservation or reissue a PUT capability", async () => {
    const first = opaque.client.startRegistration({ password }),
      a = await service.reserve(
        {
          mode: "anonymous",
          size: 4096,
          ttlMinutes: 60,
          maxReleases: 1,
          registrationRequest: first.registrationRequest,
        },
        null,
      );
    await expect(
      service.issueUpload(a.id, "wrong-token", a.pathname),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      service.issueUpload(a.id, a.managementToken, "other/path"),
    ).rejects.toMatchObject({ status: 403 });
    await service.issueUpload(a.id, a.managementToken, a.pathname);
    await expect(
      service.issueUpload(a.id, a.managementToken, a.pathname),
    ).rejects.toMatchObject({ status: 403 });
    now = new Date(now.getTime() + 16 * 60_000);
    await service.cleanup();
    expect(
      (
        await database.db.query("SELECT state FROM artifacts WHERE id=$1", [
          a.id,
        ])
      ).rows[0].state,
    ).toBe("expired");
  });
  it("does not reactivate a revoked artifact during commit", async () => {
    const a = await create(5);
    await service.revoke(a.id, a.managementToken, null);
    await expect(
      service.commit({
        id: a.id,
        managementToken: a.managementToken,
        registrationRecord: a.registration.registrationRecord,
        wrappedKey: a.encrypted.wrappedKey,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("keeps revocation idempotent without postponing physical deletion", async () => {
    const a = await create(5);
    await service.revoke(a.id, a.managementToken, null);
    const first = (
      await database.db.query<{ not_before: Date }>(
        "SELECT not_before FROM cleanup_jobs WHERE artifact_id=$1",
        [a.id],
      )
    ).rows[0].not_before;
    now = new Date(now.getTime() + 5 * 60_000);
    await service.revoke(a.id, a.managementToken, null);
    const second = (
      await database.db.query<{ not_before: Date }>(
        "SELECT not_before FROM cleanup_jobs WHERE artifact_id=$1",
        [a.id],
      )
    ).rows[0].not_before;
    expect(new Date(second).getTime()).toBe(new Date(first).getTime());
  });
  it("cleans a late upload completion even after the original purge succeeded", async () => {
    const a = await create(1),
      l = await login(a);
    await service.authorizeDelivery(
      l.response.handshakeId,
      l.proof!.finishLoginRequest,
    );
    now = new Date(now.getTime() + 17 * 60_000);
    await service.cleanup();
    expect(objects.has(a.pathname)).toBe(false);
    objects.set(a.pathname, a.encrypted.ciphertext);
    await service.cleanup();
    expect(objects.has(a.pathname)).toBe(false);
    await expect(login(a)).rejects.toMatchObject({ status: 404 });
  });
  it("serializes revocation and authorization without a lock-order deadlock", async () => {
    const a = await create(5),
      l = await login(a);
    const [delivery, revocation] = await Promise.allSettled([
      service.authorizeDelivery(
        l.response.handshakeId,
        l.proof!.finishLoginRequest,
      ),
      service.revoke(a.id, a.managementToken, null),
    ]);
    expect(revocation.status).toBe("fulfilled");
    if (delivery.status === "rejected")
      expect(delivery.reason).toMatchObject({ status: 404 });
    await expect(login(a)).rejects.toMatchObject({ status: 404 });
  });
  it("limits starts atomically, even if callers abandon the protocol", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () =>
        rateLimit("start", "same-artifact", 3, 60, database.db, now),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(9);
    now = new Date(now.getTime() + 60_000);
    await expect(
      rateLimit("start", "same-artifact", 3, 60, database.db, now),
    ).resolves.toBeUndefined();
  });
});
