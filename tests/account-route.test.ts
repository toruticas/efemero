import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { AppError } from "@/server/errors";
const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  create: vi.fn(),
  history: vi.fn(),
  revoke: vi.fn(),
}));
vi.mock("@/server/accounts", () => ({
  currentAccount: mocks.current,
  createAccount: mocks.create,
}));
vi.mock("@/server/services", () => ({
  artifacts: () => ({ history: mocks.history, revoke: mocks.revoke }),
}));
vi.mock("@/server/rate-limit", () => ({
  rateLimit: async () => {},
  requestIdentity: () => "test",
}));
import { GET, POST } from "@/app/api/account/route";
import { POST as revoke } from "@/app/api/artifacts/revoke/route";
const origin = "https://example.test";
const post = (path: string, body: unknown) =>
  new Request(`${origin}${path}`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
describe("account HTTP authorization and immutable controls", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APP_ORIGIN = origin;
  });
  it("does not query history without a verified session", async () => {
    mocks.current.mockRejectedValue(
      new AppError(401, "LOGIN_REQUIRED", "Entre na sua conta."),
    );
    expect(
      (await GET(new Request(`${origin}/api/account?ownerId=another`))).status,
    ).toBe(401);
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it("scopes history to the verified account and forwards only its pagination cursor", async () => {
    mocks.current.mockResolvedValue({
      id: "verified-account",
      username: "alice",
    });
    mocks.history.mockResolvedValue({ artifacts: [], nextCursor: null });
    const response = await GET(
      new Request(`${origin}/api/account?ownerId=another&cursor=page-two`),
    );
    expect(response.status).toBe(200);
    expect(mocks.history).toHaveBeenCalledWith("verified-account", "page-two");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("rejects extra profile/policy changes instead of accepting an update", async () => {
    expect(
      (
        await POST(
          post("/api/account", {
            username: "alice",
            id: "another",
            update: true,
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(
      (
        await revoke(
          post("/api/artifacts/revoke", {
            id: randomUUID(),
            ownerId: "another",
            maxFailures: 100,
          }),
        )
      ).status,
    ).toBe(400);
    expect(mocks.revoke).not.toHaveBeenCalled();
  });
  it("uses server-side account ownership for removal, without a client-selected owner", async () => {
    const id = randomUUID();
    mocks.current.mockResolvedValue({
      id: "verified-account",
      username: "alice",
    });
    mocks.revoke.mockResolvedValue({ revoked: true });
    expect((await revoke(post("/api/artifacts/revoke", { id }))).status).toBe(
      200,
    );
    expect(mocks.revoke).toHaveBeenCalledWith(
      id,
      undefined,
      "verified-account",
    );
  });
});
