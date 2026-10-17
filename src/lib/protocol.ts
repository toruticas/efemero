export const PROTOCOL_VERSION = 1;
export const KEY_STRETCHING = "memory-constrained" as const;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_CIPHER_BYTES = MAX_FILE_BYTES + 4096;
export const MAX_MESSAGE_BYTES = 256 * 1024;
export const MAX_TTL_MINUTES = 7 * 24 * 60;
export const RESERVED_NAMES = new Set([
  "a",
  "api",
  "app",
  "sign-in",
  "sign-up",
  "login",
  "admin",
  "settings",
  "new",
  "_next",
]);
export const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/;
export const USERNAME_PATTERN = /^[a-z][a-z0-9_-]{2,23}$/;
export type WrappedKey = { version: 1; nonce: string; ciphertext: string };
export type ArtifactPayload = {
  kind: "message" | "file";
  name: string;
  mime: string;
  data: ArrayBuffer;
};
export type ArtifactState =
  "pending" | "ready" | "revoked" | "expired" | "exhausted";
export type ArtifactSummary = {
  id: string;
  namespace: string;
  slug: string;
  state: ArtifactState;
  createdAt: string;
  expiresAt: string;
  releaseCount: number;
  maxReleases: number | null;
  declaredSize: number;
};

export function publicPath(namespace: string, slug: string) {
  return `/${encodeURIComponent(namespace)}/${encodeURIComponent(slug)}`;
}
export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 256)
    throw new Error(
      "Use uma senha de 12 a 256 caracteres. Prefira uma frase longa ou a senha gerada.",
    );
}
