import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { required } from "./config";
export const randomToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function equalSecret(a: string, b: string) {
  const x = Buffer.from(tokenHash(a), "hex"),
    y = Buffer.from(tokenHash(b), "hex");
  return timingSafeEqual(x, y);
}
export function rateKey(value: string) {
  return createHmac("sha256", required("RATE_LIMIT_HMAC_KEY"))
    .update(value)
    .digest("hex");
}
function sealKey() {
  const key = Buffer.from(required("HANDSHAKE_SEAL_KEY"), "base64url");
  if (key.length !== 32) throw new Error("Invalid seal key configuration");
  return key;
}
export function sealState(state: string, artifactId: string) {
  const nonce = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", sealKey(), nonce);
  cipher.setAAD(Buffer.from(artifactId));
  return Buffer.concat([
    nonce,
    cipher.update(state, "utf8"),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString("base64url");
}
export function openState(sealed: string, artifactId: string) {
  const value = Buffer.from(sealed, "base64url"),
    decipher = createDecipheriv(
      "aes-256-gcm",
      sealKey(),
      value.subarray(0, 12),
    );
  decipher.setAAD(Buffer.from(artifactId));
  decipher.setAuthTag(value.subarray(-16));
  return Buffer.concat([
    decipher.update(value.subarray(12, -16)),
    decipher.final(),
  ]).toString("utf8");
}
