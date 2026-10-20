import { reserveSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { currentAccount } from "@/server/accounts";
import { artifacts } from "@/server/services";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
import { storageDriver } from "@/lib/runtime-options";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("reserve-ip", requestIdentity(request), 5, 3600);
  await rateLimit("reserve-global", "all", 100, 3600);
  const input = reserveSchema.parse(await bodyJson(request));
  const owner = input.mode === "account" ? await currentAccount() : null;
  return json(
    {
      ...(await artifacts().reserve(input, owner)),
      uploadTransport: storageDriver(),
    },
    201,
  );
});
