import "server-only";
import { z } from "zod";
import {
  MAX_CIPHER_BYTES,
  MAX_TTL_MINUTES,
  SLUG_PATTERN,
  USERNAME_PATTERN,
} from "@/lib/protocol";
const protocolMessage = z
  .string()
  .min(16)
  .max(4096)
  .regex(/^[A-Za-z0-9_+/=-]+$/);
export const reserveSchema = z.strictObject({
  mode: z.enum(["anonymous", "account"]),
  slug: z.string().regex(SLUG_PATTERN).optional(),
  size: z.number().int().min(1).max(MAX_CIPHER_BYTES),
  ttlMinutes: z.number().int().min(1).max(MAX_TTL_MINUTES),
  maxReleases: z.number().int().min(1).max(100).nullable(),
  maxFailures: z.number().int().min(1).max(100).nullable().optional(),
  registrationRequest: protocolMessage,
});
export const commitSchema = z.strictObject({
  id: z.uuid(),
  managementToken: z.string().min(40).max(64),
  registrationRecord: protocolMessage,
  wrappedKey: z.strictObject({
    version: z.literal(1),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{16}$/),
    ciphertext: z.string().regex(/^[A-Za-z0-9_-]{64}$/),
  }),
});
export const addressSchema = z.strictObject({
  namespace: z.string().min(1).max(24),
  slug: z.string().regex(SLUG_PATTERN),
});
export const historyCursorSchema = z.strictObject({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});
export const startSchema = addressSchema.extend({
  startLoginRequest: protocolMessage,
});
export const finishSchema = z.strictObject({
  handshakeId: z.uuid(),
  finishLoginRequest: protocolMessage,
});
export const revokeSchema = z.strictObject({
  id: z.uuid(),
  managementToken: z.string().min(40).max(64).optional(),
});
export const usernameSchema = z.strictObject({
  username: z.string().regex(USERNAME_PATTERN),
});
