import { json, route } from "@/server/http";
import { required } from "@/server/config";
import { unauthorized } from "@/server/errors";
import { equalSecret } from "@/server/secrets";
import { artifacts } from "@/server/services";
export const runtime = "nodejs";
export const maxDuration = 60;
export const GET = route(async (request) => {
  if (
    !equalSecret(
      request.headers.get("authorization") || "",
      `Bearer ${required("CRON_SECRET")}`,
    )
  )
    throw unauthorized();
  return json(await artifacts().cleanup());
});
