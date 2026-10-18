import { usernameSchema } from "@/server/schemas";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { createAccount, currentAccount } from "@/server/accounts";
import { artifacts } from "@/server/services";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const GET = route(async (request) => {
  const account = await currentAccount();
  const cursor = new URL(request.url).searchParams.get("cursor") || undefined;
  const history = account
    ? await artifacts().history(account.id, cursor)
    : { artifacts: [], nextCursor: null };
  return json({ account, ...history });
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
