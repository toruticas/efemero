import { addressSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("visit-ip", requestIdentity(request), 120, 900);
  await rateLimit("visit-global", "all", 600, 60);
  const input = addressSchema.parse(await bodyJson(request));
  await rateLimit(
    "visit-artifact",
    `${input.namespace}/${input.slug}`,
    120,
    900,
  );
  return json(await artifacts().visit(input.namespace, input.slug));
});
