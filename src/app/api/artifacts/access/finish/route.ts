import { finishSchema } from "@/server/schemas";
import { bodyJson, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { getStorage } from "@/server/storage";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
import { readDelivery } from "@/server/delivery";
export const runtime = "nodejs";
export const maxDuration = 60;
export const POST = route(async (request) => {
  sameOrigin(request);
  await rateLimit("finish-ip", requestIdentity(request), 60, 900);
  const input = finishSchema.parse(await bodyJson(request));
  const delivery = await artifacts().authorizeDelivery(
    input.handshakeId,
    input.finishLoginRequest,
  );
  const stream = await readDelivery(
    getStorage(),
    delivery.pathname,
    request.signal,
  );
  // A one-shot response: no reusable storage URL or bearer download token.
  return new Response(stream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": "attachment; filename=artifact.bin",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Artifact-Id": delivery.id,
      "X-Wrapped-Key": Buffer.from(
        JSON.stringify(delivery.wrappedKey),
      ).toString("base64url"),
    },
  });
});
