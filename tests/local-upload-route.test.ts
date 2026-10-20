import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AppError } from "@/server/errors";
const mocks = vi.hoisted(() => ({ permit: vi.fn(), write: vi.fn() }));
vi.mock("@/server/services", () => ({
  artifacts: () => ({ issueUpload: mocks.permit }),
}));
vi.mock("@/server/storage", () => ({
  getStorage: () => ({ write: mocks.write }),
}));
vi.mock("@/server/rate-limit", () => ({
  rateLimit: vi.fn(),
  requestIdentity: () => "test",
}));
import { PUT } from "@/app/api/artifacts/upload/local/route";
describe("local upload HTTP boundary", () => {
  const id = randomUUID(),
    token = "a".repeat(43);
  const request = (origin = "https://example.test") =>
    new Request(`https://example.test/api/artifacts/upload/local?id=${id}`, {
      method: "PUT",
      headers: {
        origin,
        "content-type": "application/octet-stream",
        "x-management-token": token,
      },
      body: new Uint8Array(32),
    });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("APP_ORIGIN", "https://example.test");
    vi.stubEnv("STORAGE_DRIVER", "local");
    mocks.permit.mockResolvedValue({
      maximumSizeInBytes: 4096,
      validUntil: Date.now() + 60_000,
    });
    mocks.write.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllEnvs());
  it("writes only after management authorization and uses the server-computed path and quota", async () => {
    const response = await PUT(request());
    expect(response.status).toBe(201);
    expect(mocks.permit).toHaveBeenCalledWith(
      id,
      token,
      `artifacts/${id}/payload.bin`,
    );
    expect(mocks.write.mock.calls[0][0]).toBe(`artifacts/${id}/payload.bin`);
    expect(mocks.write.mock.calls[0][2]).toBe(4096);
  });
  it("never writes without a valid one-shot management permission", async () => {
    mocks.permit.mockRejectedValue(
      new AppError(401, "UNAUTHORIZED", "Unavailable."),
    );
    expect((await PUT(request())).status).toBe(401);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects another origin before consuming upload permission", async () => {
    expect((await PUT(request("https://other.test"))).status).toBe(403);
    expect(mocks.permit).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("has no local filesystem upload path in the managed storage mode", async () => {
    vi.stubEnv("STORAGE_DRIVER", "vercel-blob");
    expect((await PUT(request())).status).toBe(404);
    expect(mocks.permit).not.toHaveBeenCalled();
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
