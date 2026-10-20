import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { encryptArtifact, decryptArtifact } from "@/lib/crypto";

describe("client-side authenticated encryption", () => {
  const key = "client-only-export-key-for-testing-which-is-never-a-session-key";
  const message = () => ({
    kind: "message" as const,
    name: "confidential.txt",
    mime: "text/plain",
    data: new TextEncoder().encode("highly confidential secret").buffer,
  });
  it("encrypts metadata and payload, and reconstructs both on the client", async () => {
    const id = randomUUID(),
      payload = message(),
      encrypted = await encryptArtifact(payload, key, id);
    const raw = new TextDecoder().decode(encrypted.ciphertext);
    expect(raw).not.toContain(payload.name);
    expect(raw).not.toContain("confidential");
    const decrypted = await decryptArtifact(
      encrypted.ciphertext,
      encrypted.wrappedKey,
      key,
      id,
    );
    expect(decrypted.name).toBe(payload.name);
    expect(new Uint8Array(decrypted.data)).toEqual(
      new Uint8Array(payload.data),
    );
  });
  it("rejects a different client export key", async () => {
    const id = randomUUID(),
      encrypted = await encryptArtifact(message(), key, id);
    await expect(
      decryptArtifact(
        encrypted.ciphertext,
        encrypted.wrappedKey,
        "other-key",
        id,
      ),
    ).rejects.toThrow();
  });
  it("binds the ciphertext and wrapped key to the immutable artifact ID", async () => {
    const encrypted = await encryptArtifact(message(), key, randomUUID());
    await expect(
      decryptArtifact(
        encrypted.ciphertext,
        encrypted.wrappedKey,
        key,
        randomUUID(),
      ),
    ).rejects.toThrow();
  });
  it("detects a changed ciphertext byte", async () => {
    const id = randomUUID(),
      encrypted = await encryptArtifact(message(), key, id);
    new Uint8Array(encrypted.ciphertext)[20] ^= 1;
    await expect(
      decryptArtifact(encrypted.ciphertext, encrypted.wrappedKey, key, id),
    ).rejects.toThrow();
  });
  it("randomizes repeated encryption and supports arbitrary binary files", async () => {
    const id = randomUUID(),
      payload = {
        kind: "file" as const,
        name: "binary.bin",
        mime: "application/octet-stream",
        data: new Uint8Array([0, 255, 128, 0, 13, 10]).buffer,
      };
    const a = await encryptArtifact(payload, key, id),
      b = await encryptArtifact(payload, key, id);
    expect(new Uint8Array(a.ciphertext)).not.toEqual(
      new Uint8Array(b.ciphertext),
    );
    expect(a.wrappedKey).not.toEqual(b.wrappedKey);
    expect(
      new Uint8Array(
        (await decryptArtifact(a.ciphertext, a.wrappedKey, key, id)).data,
      ),
    ).toEqual(new Uint8Array(payload.data));
  });
});
