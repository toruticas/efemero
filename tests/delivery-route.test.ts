import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AppError } from "@/server/errors";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), read: vi.fn() }));
vi.mock("@/server/services", () => ({
  artifacts: () => ({ authorizeDelivery: mocks.authorize }),
}));
vi.mock("@/server/storage", () => ({
  getStorage: () => ({ read: mocks.read }),
}));
vi.mock("@/server/rate-limit", () => ({
  rateLimit: async () => {},
  requestIdentity: () => "test",
}));
import { POST } from "@/app/api/artifacts/access/finish/route";

describe("delivery HTTP boundary", () => {
  const handshakeId = randomUUID(),
    id = randomUUID();
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    process.env.APP_ORIGIN = "https://example.test";
    mocks.authorize.mockResolvedValue({
      id,
      pathname: "artifacts/test/payload.bin",
      wrappedKey: {
        version: 1,
        nonce: "A".repeat(16),
        ciphertext: "A".repeat(64),
      },
    });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  const request = (origin = "https://example.test", signal?: AbortSignal) =>
    new Request("https://example.test/api/artifacts/access/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ handshakeId, finishLoginRequest: "A".repeat(86) }),
      signal,
    });
  it("never reads or delivers ciphertext when the proof is rejected", async () => {
    mocks.authorize.mockRejectedValue(
      new AppError(404, "UNAVAILABLE", "Unavailable."),
    );
    const response = await POST(request());
    expect(response.status).toBe(404);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(response.headers.get("x-wrapped-key")).toBeNull();
  });
  it("never reaches authorization or storage for a foreign Origin", async () => {
    const response = await POST(request("https://evil.test"));
    expect(response.status).toBe(403);
    expect(mocks.authorize).not.toHaveBeenCalled();
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("returns only the authorized stream and envelope, without a reusable redirect", async () => {
    const wrappedKey = {
      version: 1,
      nonce: "A".repeat(16),
      ciphertext: "A".repeat(64),
    };
    mocks.authorize.mockResolvedValue({
      id,
      pathname: "artifacts/test/payload.bin",
      wrappedKey,
    });
    mocks.read.mockImplementation(
      async () =>
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1, 2, 3]));
            controller.close();
          },
        }),
    );
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith(
      "artifacts/test/payload.bin",
      expect.any(AbortSignal),
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBeNull();
    expect(
      JSON.parse(
        Buffer.from(
          response.headers.get("x-wrapped-key")!,
          "base64url",
        ).toString("utf8"),
      ),
    ).toEqual(wrappedKey);
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("interrupts a stalled transfer after 60 seconds and cancels storage", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel,
      }),
    );
    const response = await POST(request());
    const reader = response.body!.getReader();
    expect((await reader.read()).value).toEqual(new Uint8Array([1]));
    const interrupted = expect(reader.read()).rejects.toMatchObject({
      name: "TimeoutError",
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(cancel).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await interrupted;
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TimeoutError" }),
    );
    expect(vi.getTimerCount()).toBe(0);
  });
  it("enforces the deadline even when the response body is not read", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValue(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1]));
        },
        cancel,
      }),
    );
    const response = await POST(request());
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(response.arrayBuffer()).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("includes opening storage in the delivery deadline", async () => {
    mocks.read.mockImplementation(
      (_path: string, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get("x-wrapped-key")).toBeNull();
    expect(mocks.read.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops waiting for unresponsive storage and cancels a late stream", async () => {
    let finishOpening!: (stream: ReadableStream<Uint8Array>) => void;
    mocks.read.mockReturnValue(
      new Promise<ReadableStream<Uint8Array>>((resolve) => {
        finishOpening = resolve;
      }),
    );
    const pending = POST(request());
    await vi.advanceTimersByTimeAsync(60_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(response.headers.get("x-wrapped-key")).toBeNull();
    expect(mocks.read.mock.calls[0][1].aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);

    const cancel = vi.fn();
    finishOpening(new ReadableStream({ cancel }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledWith(
      expect.objectContaining({ name: "TimeoutError" }),
    );
  });
  it("does not open storage for an already disconnected request", async () => {
    const client = new AbortController();
    client.abort();
    const response = await POST(request("https://example.test", client.signal));
    expect(response.status).toBe(503);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels storage when the client aborts the request", async () => {
    const client = new AbortController();
    const cancel = vi.fn();
    mocks.read.mockResolvedValue(new ReadableStream({ cancel }));
    const response = await POST(request("https://example.test", client.signal));
    const interrupted = expect(response.arrayBuffer()).rejects.toMatchObject({
      name: "AbortError",
    });
    client.abort();
    await interrupted;
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels storage and clears the deadline when the response is cancelled", async () => {
    const cancel = vi.fn();
    mocks.read.mockResolvedValue(new ReadableStream({ cancel }));
    const response = await POST(request());
    await response.body!.cancel();
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the deadline when storage fails before responding", async () => {
    mocks.read.mockRejectedValue(new Error("storage unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("propagates storage stream failures and clears the deadline", async () => {
    mocks.read.mockResolvedValue(
      new ReadableStream({
        start(controller) {
          controller.error(new Error("storage interrupted"));
        },
      }),
    );
    const response = await POST(request());
    await expect(response.arrayBuffer()).rejects.toThrow("storage interrupted");
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
