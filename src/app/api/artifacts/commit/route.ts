import { commitSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("commit-ip", requestIdentity(request), 30, 3600);
  return json(
    await artifacts().commit(commitSchema.parse(await bodyJson(request))),
  );
});
