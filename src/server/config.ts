import "server-only";
import { AppError } from "./errors";
import {
  accountsEnabled,
  assertPersistentRuntime,
  databaseDriver,
  storageDriver,
} from "@/lib/runtime-options";
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
  const localHTTP =
    process.env.VERCEL !== "1" &&
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    process.env.NODE_ENV === "production" &&
    url.protocol !== "https:" &&
    !localHTTP
  )
    throw new AppError(
      503,
      "NOT_CONFIGURED",
      "Configuração de origem inválida.",
    );
  return url.origin;
}
export function configurationStatus() {
  assertPersistentRuntime();
  return {
    sharing: [
      "APP_ORIGIN",
      databaseDriver() === "sqlite" ? "SQLITE_PATH" : "DATABASE_URL",
      ...(storageDriver() === "local"
        ? ["LOCAL_STORAGE_PATH"]
        : ["BLOB_READ_WRITE_TOKEN"]),
      "OPAQUE_SERVER_SETUP",
      "HANDSHAKE_SEAL_KEY",
      "RATE_LIMIT_HMAC_KEY",
      "CRON_SECRET",
    ].every((k) => Boolean(process.env[k])),
    accounts: accountsEnabled(),
  };
}
