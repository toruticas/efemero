import "server-only";
import type { Storage } from "./storage";

export async function readDelivery(
  storage: Pick<Storage, "read">,
  pathname: string,
  requestSignal: AbortSignal,
) {
  const deadline = new AbortController();
  const signal = AbortSignal.any([requestSignal, deadline.signal]);
  // maxDuration is deployment metadata; standalone needs its own deadline.
  const timer = setTimeout(() => {
    deadline.abort(new DOMException("Delivery timed out.", "TimeoutError"));
  }, 60_000);
  timer.unref();
  let abortOpening!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    abortOpening = () => reject(signal.reason);
    signal.addEventListener("abort", abortOpening, { once: true });
  });
  try {
    signal.throwIfAborted();
    const opening = storage.read(pathname, signal).then((source) => {
      if (signal.aborted) {
        void source.cancel(signal.reason).catch(() => {});
        signal.throwIfAborted();
      }
      return source;
    });
    // Filesystem open/stat cannot be aborted. Stop waiting at the deadline and
    // cancel the stream above if that operation eventually completes.
    const source = await Promise.race([opening, aborted]);
    const body = new TransformStream<Uint8Array, Uint8Array>();
    // pipeTo propagates failure to the response and cancellation to storage,
    // including when backpressure prevents the recipient from reading.
    void source
      .pipeTo(body.writable, { signal })
      .catch(() => {}) // The response body carries the stream error.
      .finally(() => clearTimeout(timer));
    return body.readable;
  } catch (error) {
    clearTimeout(timer);
    throw error;
  } finally {
    signal.removeEventListener("abort", abortOpening);
  }
}
