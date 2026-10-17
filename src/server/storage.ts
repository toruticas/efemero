import "server-only";
import { del, get, head, list } from "@vercel/blob";
import { AppError } from "./errors";
import { required } from "./config";
export interface Storage {
  inspect(path: string): Promise<{
    pathname: string;
    url: string;
    size: number;
    contentType: string;
  }>;
  read(path: string): Promise<ReadableStream<Uint8Array>>;
  remove(path: string): Promise<void>;
  inventory(cursor?: string): Promise<{ paths: string[]; cursor?: string }>;
}
export const blobStorage: Storage = {
  async inspect(path) {
    const result = await head(path, {
      token: required("BLOB_READ_WRITE_TOKEN"),
    });
    if (
      !new URL(result.url).hostname.endsWith(".private.blob.vercel-storage.com")
    )
      throw new AppError(
        503,
        "PRIVATE_STORE_REQUIRED",
        "O armazenamento privado ainda não foi configurado.",
      );
    return result;
  },
  async read(path) {
    const result = await get(path, {
      access: "private",
      token: required("BLOB_READ_WRITE_TOKEN"),
      useCache: false,
    });
    if (!result || result.statusCode !== 200)
      throw new AppError(503, "STORAGE", "Não foi possível iniciar a entrega.");
    return result.stream;
  },
  async remove(path) {
    await del(path, { token: required("BLOB_READ_WRITE_TOKEN") });
  },
  async inventory(cursor) {
    const result = await list({
      prefix: "artifacts/",
      limit: 50,
      cursor,
      token: required("BLOB_READ_WRITE_TOKEN"),
    });
    return {
      paths: result.blobs.map((blob) => blob.pathname),
      cursor: result.hasMore ? result.cursor : undefined,
    };
  },
};
