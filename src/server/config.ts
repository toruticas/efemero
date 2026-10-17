import "server-only";
import { AppError } from "./errors";
export function required(name: string): string {
  const value = process.env[name];
  if (!value)
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "O serviço ainda está sendo configurado. Tente novamente mais tarde.",
    );
  return value;
}
export function origin() {
  const url = new URL(required("APP_ORIGIN"));
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:")
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "Configuração de origem inválida.",
    );
  return url.origin;
}
export function configurationStatus() {
  return {
    sharing: [
      "APP_ORIGIN",
      "DATABASE_URL",
      "BLOB_READ_WRITE_TOKEN",
      "OPAQUE_SERVER_SETUP",
      "HANDSHAKE_SEAL_KEY",
      "RATE_LIMIT_HMAC_KEY",
      "CRON_SECRET",
    ].every((k) => Boolean(process.env[k])),
    accounts: Boolean(
      process.env.CLERK_SECRET_KEY &&
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    ),
  };
}
