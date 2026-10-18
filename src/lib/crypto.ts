import {
  MAX_READ_CIPHER_BYTES,
  MAX_FILE_BYTES,
  MAX_MESSAGE_BYTES,
  type ArtifactPayload,
  type WrappedKey,
} from "./protocol";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const context = (id: string) => encoder.encode(`artefatos:payload:v1:${id}`);
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++)
    binary += String.fromCharCode(bytes[i]);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Formato inválido.");
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
async function wrappingKey(exportKey: string, id: string) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(exportKey),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode(id),
      info: encoder.encode("artefatos:key-wrap:v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
export async function encryptArtifact(
  payload: ArtifactPayload,
  exportKey: string,
  id: string,
) {
  if (
    payload.data.byteLength >
    (payload.kind === "file" ? MAX_FILE_BYTES : MAX_MESSAGE_BYTES)
  )
    throw new Error("O conteúdo excede o limite permitido.");
  const header = encoder.encode(
    JSON.stringify({
      kind: payload.kind,
      name: payload.name.slice(0, 255),
      mime: payload.mime.slice(0, 128),
    }),
  );
  const plaintext = new Uint8Array(4 + header.length + payload.data.byteLength);
  new DataView(plaintext.buffer).setUint32(0, header.length);
  plaintext.set(header, 4);
  plaintext.set(new Uint8Array(payload.data), 4 + header.length);
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "encrypt",
  ]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce, additionalData: context(id) },
    key,
    plaintext,
  );
  plaintext.fill(0);
  const output = new Uint8Array(13 + ciphertext.byteLength);
  output[0] = 1;
  output.set(nonce, 1);
  output.set(new Uint8Array(ciphertext), 13);
  const wrapNonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: wrapNonce, additionalData: context(id) },
    await wrappingKey(exportKey, id),
    rawKey,
  );
  rawKey.fill(0);
  const wrappedKey: WrappedKey = {
    version: 1,
    nonce: toBase64(wrapNonce),
    ciphertext: toBase64(new Uint8Array(wrapped)),
  };
  return { ciphertext: output.buffer, wrappedKey };
}
export async function decryptArtifact(
  ciphertext: ArrayBuffer,
  wrapped: WrappedKey,
  exportKey: string,
  id: string,
): Promise<ArtifactPayload> {
  const input = new Uint8Array(ciphertext);
  if (
    input.length < 29 ||
    input.length > MAX_READ_CIPHER_BYTES ||
    input[0] !== 1 ||
    wrapped.version !== 1
  )
    throw new Error("Formato de artefato não suportado.");
  const rawKey = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(wrapped.nonce),
      additionalData: context(id),
    },
    await wrappingKey(exportKey, id),
    fromBase64(wrapped.ciphertext),
  );
  const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, [
    "decrypt",
  ]);
  new Uint8Array(rawKey).fill(0);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: input.slice(1, 13), additionalData: context(id) },
    key,
    input.slice(13),
  );
  const length = new DataView(plaintext).getUint32(0);
  if (length > 2048 || length + 4 > plaintext.byteLength)
    throw new Error("Cabeçalho inválido.");
  const h = JSON.parse(
    decoder.decode(new Uint8Array(plaintext, 4, length)),
  ) as Record<string, unknown>;
  if (
    (h.kind !== "message" && h.kind !== "file") ||
    typeof h.name !== "string" ||
    typeof h.mime !== "string"
  )
    throw new Error("Conteúdo inválido.");
  const data = plaintext.slice(4 + length);
  new Uint8Array(plaintext).fill(0);
  return {
    kind: h.kind,
    name: h.name.slice(0, 255).replace(/[\u0000-\u001f/\\]/g, "_"),
    mime: h.mime,
    data,
  };
}
