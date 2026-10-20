import "server-only";
import { getDatabase, type Database } from "./db";
import { AppError } from "./errors";
import { rateKey } from "./secrets";
export async function rateLimit(
  scope: string,
  identity: string,
  limit: number,
  windowSeconds: number,
  db: Database = getDatabase(),
  now = new Date(),
) {
  const bucket = Math.floor(now.getTime() / (windowSeconds * 1000));
  const key = rateKey(`${scope}:${identity}:${bucket}`);
  const expiry = new Date((bucket + 1) * windowSeconds * 1000);
  const result = await db.query(
    `INSERT INTO rate_limits(key,count,expires_at) VALUES ($1,1,$2)
    ON CONFLICT(key) DO UPDATE SET count=rate_limits.count+1 WHERE rate_limits.count < $3 RETURNING count`,
    [key, expiry, limit],
  );
  if (!result.rowCount)
    throw new AppError(
      429,
      "RATE_LIMITED",
      "Too many attempts. Wait a few minutes before trying again.",
    );
}
export function requestIdentity(request: Request) {
  // Only trust the platform-owned forwarding header on Vercel. Outside Vercel,
  // use a shared conservative bucket instead of accepting spoofable IP headers.
  return process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
        "unknown"
    : "local";
}
