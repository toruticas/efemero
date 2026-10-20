import { z } from "zod";
import { json, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { getStorage } from "@/server/storage";
import { storageDriver } from "@/lib/runtime-options";
import { AppError } from "@/server/errors";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const maxDuration = 60;
export const PUT = route(async (request) => {
  if (storageDriver() !== "local")
    throw new AppError(404, "UNAVAILABLE", "Unavailable.");
  sameOrigin(request);
  await rateLimit("upload-ip", requestIdentity(request), 20, 3600);
  const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
  const token = z
    .string()
    .min(40)
    .max(64)
    .parse(request.headers.get("x-management-token"));
  if (
    request.headers.get("content-type") !== "application/octet-stream" ||
    !request.body
  )
    throw new AppError(415, "CONTENT_TYPE", "Invalid upload format.");
  const path = `artifacts/${id}/payload.bin`;
  const permission = await artifacts().issueUpload(id, token, path);
  await getStorage().write!(
    path,
    request.body,
    permission.maximumSizeInBytes,
    request.signal,
  );
  return json({ uploaded: true }, 201);
});
