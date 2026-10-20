import { configurationStatus } from "@/server/config";
import { getDatabase } from "@/server/db";
import { json, route } from "@/server/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = route(async () => {
  if (!configurationStatus().sharing) return json({ ok: false }, 503);
  await getDatabase().query("SELECT 1");
  return json({ ok: true });
});
