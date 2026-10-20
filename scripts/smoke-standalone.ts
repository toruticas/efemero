import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import * as opaque from "@serenity-kit/opaque";
import { encryptArtifact, decryptArtifact } from "../src/lib/crypto";
import { KEY_STRETCHING, type WrappedKey } from "../src/lib/protocol";

// Synthetic data only. No provider credentials or original service secrets.
const base = process.argv[2] || "http://localhost:3000";
const canonicalOrigin = process.env.SMOKE_ORIGIN || new URL(base).origin;
const stateFile = process.env.SMOKE_STATE_FILE;
const password = randomBytes(24).toString("base64url");
type Artifact = {
  id: string;
  namespace: string;
  slug: string;
  managementToken: string;
  pathname: string;
  registrationResponse: string;
  serverIdentity: string;
  uploadTransport: string;
};
async function post(path: string, body: unknown) {
  return fetch(new URL(path, base), {
    method: "POST",
    headers: { origin: canonicalOrigin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function create(maxReleases: number | null, ttlMinutes = 60) {
  const start = opaque.client.startRegistration({ password });
  const reservation = await post("/api/artifacts/reserve", {
    mode: "anonymous",
    size: 4096,
    ttlMinutes,
    maxReleases,
    registrationRequest: start.registrationRequest,
  });
  assert.equal(reservation.status, 201);
  const artifact: Artifact = await reservation.json();
  assert.equal(artifact.uploadTransport, "local");
  const registration = opaque.client.finishRegistration({
    clientRegistrationState: start.clientRegistrationState,
    registrationResponse: artifact.registrationResponse,
    password,
    keyStretching: KEY_STRETCHING,
    identifiers: { client: artifact.id, server: artifact.serverIdentity },
  });
  const encrypted = await encryptArtifact(
    {
      kind: "message",
      name: "synthetic.txt",
      mime: "text/plain",
      data: new TextEncoder().encode("standalone synthetic smoke test").buffer,
    },
    registration.exportKey,
    artifact.id,
  );
  const uploaded = await fetch(
    new URL(`/api/artifacts/upload/local?id=${artifact.id}`, base),
    {
      method: "PUT",
      headers: {
        origin: canonicalOrigin,
        "content-type": "application/octet-stream",
        "x-management-token": artifact.managementToken,
      },
      body: encrypted.ciphertext,
    },
  );
  assert.equal(uploaded.status, 201);
  assert.equal(
    (
      await post("/api/artifacts/commit", {
        id: artifact.id,
        managementToken: artifact.managementToken,
        registrationRecord: registration.registrationRecord,
        wrappedKey: encrypted.wrappedKey,
      })
    ).status,
    200,
  );
  assert.equal(
    (await fetch(new URL(`/artifacts/${artifact.id}/payload.bin`, base)))
      .status,
    404,
  );
  return artifact;
}
async function login(artifact: Artifact, candidate: string) {
  const start = opaque.client.startLogin({ password: candidate });
  const response = await post("/api/artifacts/access/start", {
    namespace: artifact.namespace,
    slug: artifact.slug,
    startLoginRequest: start.startLoginRequest,
  });
  assert.equal(response.status, 200);
  const challenge = await response.json();
  const proof = opaque.client.finishLogin({
    clientLoginState: start.clientLoginState,
    loginResponse: challenge.loginResponse,
    password: candidate,
    keyStretching: KEY_STRETCHING,
    identifiers: { client: artifact.id, server: artifact.serverIdentity },
  });
  return { challenge, proof };
}
async function finish(attempt: Awaited<ReturnType<typeof login>>) {
  return post("/api/artifacts/access/finish", {
    handshakeId: attempt.challenge.handshakeId,
    finishLoginRequest:
      attempt.proof?.finishLoginRequest ||
      randomBytes(64).toString("base64url"),
  });
}
async function checkContent(
  response: Response,
  artifact: Artifact,
  exportKey: string,
) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const wrappedKey: WrappedKey = JSON.parse(
    Buffer.from(response.headers.get("x-wrapped-key")!, "base64url").toString(
      "utf8",
    ),
  );
  const payload = await decryptArtifact(
    await response.arrayBuffer(),
    wrappedKey,
    exportKey,
    artifact.id,
  );
  assert.equal(
    new TextDecoder().decode(payload.data),
    "standalone synthetic smoke test",
  );
  assert.equal(payload.name, "synthetic.txt");
}
async function main() {
  await opaque.ready;
  if (process.env.SMOKE_RESUME === "1") {
    assert(stateFile, "SMOKE_STATE_FILE is required");
    const saved = JSON.parse(await readFile(stateFile, "utf8"));
    if (process.env.SMOKE_EXPECT_LOSS === "1") {
      const start = opaque.client.startLogin({ password: saved.password });
      assert.equal(
        (
          await post("/api/artifacts/access/start", {
            namespace: saved.artifact.namespace,
            slug: saved.artifact.slug,
            startLoginRequest: start.startLoginRequest,
          })
        ).status,
        404,
      );
      console.info("In-memory restart data loss confirmed.");
      return;
    }
    const attempt = await login(saved.artifact, saved.password);
    await checkContent(
      await finish(attempt),
      saved.artifact,
      attempt.proof!.exportKey,
    );
    if (process.env.SMOKE_KEEP_ARTIFACT !== "1") {
      assert.equal(
        (
          await post("/api/artifacts/revoke", {
            id: saved.artifact.id,
            managementToken: saved.artifact.managementToken,
          })
        ).status,
        200,
      );
    }
    console.info(
      "Persistent artifact and cryptographic secrets survived restart.",
    );
    return;
  }
  const health = await fetch(new URL("/api/health", base));
  assert.equal(health.status, 200);
  const home = await (await fetch(base)).text();
  assert(!home.includes("Minha conta"));
  assert.equal((await fetch(new URL("/api/account", base))).status, 503);
  const artifact = await create(1);
  const incorrect = await login(artifact, "an-incorrect-synthetic-password");
  assert.equal(incorrect.proof, undefined);
  const rejected = await finish(incorrect);
  assert.equal(rejected.status, 404);
  assert.equal(rejected.headers.get("x-wrapped-key"), null);
  const attempts = await Promise.all([
    login(artifact, password),
    login(artifact, password),
  ]);
  const responses = await Promise.all(attempts.map(finish));
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 404]);
  const winner = responses.findIndex((r) => r.status === 200);
  await checkContent(
    responses[winner],
    artifact,
    attempts[winner].proof!.exportKey,
  );
  assert.equal((await finish(attempts[winner])).status, 404);
  console.info(
    "Standalone creation, private upload, incorrect password, decryption, replay protection, and concurrent final access passed.",
  );
  if (stateFile) {
    const persistent = await create(null);
    await writeFile(
      stateFile,
      JSON.stringify({ artifact: persistent, password }),
      { mode: 0o600 },
    );
    console.info(
      "Synthetic restart fixture saved privately; no credentials printed.",
    );
  }
  if (process.env.SMOKE_WAIT_EXPIRY === "1") {
    const expiring = await create(null, 1);
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const start = opaque.client.startLogin({ password });
    assert.equal(
      (
        await post("/api/artifacts/access/start", {
          namespace: expiring.namespace,
          slug: expiring.slug,
          startLoginRequest: start.startLoginRequest,
        })
      ).status,
      404,
    );
    console.info("Expiration blocks access without waiting for cleanup.");
  }
}
main().catch(() => {
  console.error(
    "Standalone smoke test failed; sensitive response details omitted.",
  );
  process.exitCode = 1;
});
