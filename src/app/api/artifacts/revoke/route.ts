import { revokeSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { currentAccount } from "@/server/accounts";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("revoke-ip", requestIdentity(request), 30, 3600);
  const input = revokeSchema.parse(await bodyJson(request));
  const owner = input.managementToken ? null : await currentAccount();
  return json(
    await artifacts().revoke(
      input.id,
      input.managementToken,
      owner?.id || null,
    ),
  );
});
