import { startSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("access-ip", requestIdentity(request), 30, 900);
  await rateLimit("access-global", "all", 600, 60);
  const input = startSchema.parse(await bodyJson(request));
  await rateLimit(
    "access-artifact",
    `${input.namespace}/${input.slug}`,
    15,
    900,
  );
  return json(
    await artifacts().startLogin(
      input.namespace,
      input.slug,
      input.startLoginRequest,
    ),
  );
});
