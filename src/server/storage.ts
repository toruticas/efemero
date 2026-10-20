import "server-only";
import { del, get, head, list } from "@vercel/blob";
import { AppError } from "./errors";
import { required } from "./config";
import { storageDriver, assertPersistentRuntime } from "@/lib/runtime-options";
import { LocalStorage } from "./storage/local";
export interface Storage {
  write?(
    path: string,
    body: ReadableStream<Uint8Array>,
    maximumBytes: number,
    signal?: AbortSignal,
  ): Promise<void>;
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
let local: LocalStorage | undefined;
export function getStorage(): Storage {
  assertPersistentRuntime();
  if (storageDriver() === "vercel-blob") return blobStorage;
  return (local ??= new LocalStorage(required("LOCAL_STORAGE_PATH")));
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
        "Private storage has not been configured yet.",
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
      throw new AppError(503, "STORAGE", "Could not start delivery.");
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
