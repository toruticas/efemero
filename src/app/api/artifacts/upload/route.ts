import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { bodyJson, json, route, sameOrigin } from "@/server/http";
import { artifacts } from "@/server/services";
import { AppError } from "@/server/errors";
import { required } from "@/server/config";
import { rateLimit, requestIdentity } from "@/server/rate-limit";
export const runtime = "nodejs";
export const POST = route(async (request) => {
  const body = (await bodyJson(request)) as HandleUploadBody;
  if (body.type === "blob.generate-client-token") {
    sameOrigin(request);
    await rateLimit("upload-ip", requestIdentity(request), 20, 3600);
  } else if (body.type !== "blob.upload-completed")
    throw new AppError(400, "UPLOAD", "Requisição inválida.");
  const result = await handleUpload({
    body,
    request,
    token: required("BLOB_READ_WRITE_TOKEN"),
    onBeforeGenerateToken: async (pathname, clientPayload, multipart) => {
      if (multipart)
        throw new AppError(
          400,
          "UPLOAD",
          "Uploads multipart não estão disponíveis nesta versão.",
        );
      const input = z
        .strictObject({
          id: z.uuid(),
          managementToken: z.string().min(40).max(64),
        })
        .parse(JSON.parse(clientPayload || "{}"));
      const permission = await artifacts().issueUpload(
        input.id,
        input.managementToken,
        pathname,
      );
      return {
        ...permission,
        addRandomSuffix: false,
        allowOverwrite: false,
        allowedContentTypes: ["application/octet-stream"],
        cacheControlMaxAge: 60,
        tokenPayload: JSON.stringify({ id: input.id }),
      };
    },
    // SDK authenticates callbacks. Publication happens only in commit(), using
    // the creator capability and an independent HEAD of the exact reserved path.
    onUploadCompleted: async () => {},
  });
  return json(result);
});
