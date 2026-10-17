import { usernameSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { createAccount, currentAccount } from "@/server/accounts";
import { artifacts } from "@/server/services";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const GET = route(async () => {
  const account = await currentAccount();
  return json({
    account,
    artifacts: account ? await artifacts().history(account.id) : [],
  });
});
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("username-ip", requestIdentity(request), 10, 3600);
  return json(
    {
      account: await createAccount(
        usernameSchema.parse(await bodyJson(request)).username,
      ),
    },
    201,
  );
});
