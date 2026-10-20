import { beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.clearAllMocks();
    process.env.APP_ORIGIN = "https://example.test";
  });
  const request = (origin = "https://example.test") =>
    new Request("https://example.test/api/artifacts/access/finish", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin },
      body: JSON.stringify({ handshakeId, finishLoginRequest: "A".repeat(86) }),
    });
  it("never reads or delivers ciphertext when the proof is rejected", async () => {
    mocks.authorize.mockRejectedValue(
      new AppError(404, "UNAVAILABLE", "Unavailable"),
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
    expect(mocks.read).toHaveBeenCalledWith("artifacts/test/payload.bin");
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
  });
});
