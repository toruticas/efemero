// Keep this module free of Node-only imports: the request proxy also uses it.
function option<T extends string>(
  name: string,
  fallback: T,
  allowed: readonly T[],
): T {
  const value = process.env[name] || fallback;
  if (!allowed.includes(value as T)) throw new Error(`Invalid ${name}.`);
  return value as T;
}
export function databaseDriver() {
  return option("DATABASE_DRIVER", "neon", [
    "neon",
    "postgres",
    "sqlite",
  ] as const);
}
export function storageDriver() {
  return option("STORAGE_DRIVER", "vercel-blob", [
    "vercel-blob",
    "local",
  ] as const);
}
export function authProvider() {
  return option("AUTH_PROVIDER", "clerk", ["clerk", "none"] as const);
}
export function clerkPublishableKey() {
  // Dynamic lookup allows a generic standalone image to receive this public key
  // at runtime instead of baking one installation's key into its client bundle.
  const name = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";
  return process.env[name];
}
export function accountsEnabled() {
  return (
    authProvider() === "clerk" &&
    Boolean(process.env.CLERK_SECRET_KEY && clerkPublishableKey())
  );
}
export function loopbackHTTP() {
  try {
    const url = new URL(process.env.APP_ORIGIN || "");
    return (
      process.env.VERCEL !== "1" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
export function assertPersistentRuntime() {
  if (
    process.env.VERCEL === "1" &&
    (databaseDriver() === "sqlite" || storageDriver() === "local")
  )
    throw new Error(
      "SQLite and local storage require a persistent host, not Vercel Functions.",
    );
}
