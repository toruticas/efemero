import "server-only";
import { errorMessage, localeFromHeaders, translator } from "@/lib/i18n";
import { z } from "zod";
import { AppError } from "./errors";
import { origin } from "./config";
const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers });
}
export function sameOrigin(request: Request) {
  if (request.headers.get("origin") !== origin())
    throw new AppError(403, "ORIGIN", "Origin not allowed.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError(403, "ORIGIN", "Origin not allowed.");
}
export async function bodyJson(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "CONTENT_TYPE", "Invalid request format.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "BODY", "Invalid request.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(413, "TOO_LARGE", "Request too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "JSON", "Invalid request.");
  }
}
export function route(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    const locale = localeFromHeaders(request.headers);
    const t = translator(locale);
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof AppError)
        return json(
          { error: errorMessage(error, locale), code: error.code },
          error.status,
        );
      if (error instanceof z.ZodError)
        return json(
          {
            error: t("Check the submitted fields and try again."),
            code: "VALIDATION",
          },
          400,
        );
      // Never log requests, protocol messages, credentials or raw provider errors.
      return json(
        {
          error: t("Could not complete the operation. Try again."),
          code: "UNEXPECTED",
        },
        503,
      );
    }
  };
}
