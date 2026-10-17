import "server-only";
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
    throw new AppError(403, "ORIGIN", "Origem não autorizada.");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new AppError(403, "ORIGIN", "Origem não autorizada.");
}
export async function bodyJson(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError(415, "CONTENT_TYPE", "Formato de requisição inválido.");
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, "BODY", "Requisição inválida.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(413, "TOO_LARGE", "Requisição muito grande.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AppError(400, "JSON", "Requisição inválida.");
  }
}
export function route(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      return await handler(request);
    } catch (error) {
      if (error instanceof AppError)
        return json({ error: error.message, code: error.code }, error.status);
      if (error instanceof z.ZodError)
        return json(
          {
            error: "Confira os campos enviados e tente novamente.",
            code: "VALIDATION",
          },
          400,
        );
      // Never log requests, protocol messages, credentials or raw provider errors.
      return json(
        {
          error: "Não foi possível concluir a operação. Tente novamente.",
          code: "UNEXPECTED",
        },
        503,
      );
    }
  };
}
