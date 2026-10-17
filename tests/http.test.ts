import { beforeAll, describe, expect, it } from "vitest";
import { bodyJson, route, sameOrigin } from "@/server/http";
import { reserveSchema, startSchema, commitSchema } from "@/server/schemas";
import { randomUUID } from "node:crypto";

describe("request boundaries", () => {
  beforeAll(() => {
    process.env.APP_ORIGIN = "https://example.test";
  });
  it("rejects the password field rather than accepting accidental password transmission", () => {
    expect(() =>
      reserveSchema.parse({
        mode: "anonymous",
        size: 100,
        ttlMinutes: 60,
        maxReleases: 1,
        registrationRequest: "a".repeat(32),
        password: "should-never-be-here",
      }),
    ).toThrow();
    expect(() =>
      startSchema.parse({
        namespace: "a",
        slug: "abc",
        startLoginRequest: "a".repeat(32),
        password: "should-never-be-here",
      }),
    ).toThrow();
  });
  it("rejects oversized policies, malformed envelopes and unbounded TTL", () => {
    expect(() =>
      reserveSchema.parse({
        mode: "anonymous",
        size: 100,
        ttlMinutes: 999999,
        maxReleases: 1,
        registrationRequest: "a".repeat(32),
      }),
    ).toThrow();
    expect(() =>
      commitSchema.parse({
        id: randomUUID(),
        managementToken: "a".repeat(43),
        registrationRecord: "a".repeat(32),
        wrappedKey: { version: 1, nonce: "bad", ciphertext: "bad" },
      }),
    ).toThrow();
  });
  it("rejects missing and foreign Origin, including cross-site requests", () => {
    expect(() => sameOrigin(new Request("https://example.test/api"))).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://example.test/api", {
          headers: { origin: "https://evil.test" },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://example.test/api", {
          headers: {
            origin: "https://example.test",
            "sec-fetch-site": "cross-site",
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      sameOrigin(
        new Request("https://example.test/api", {
          headers: { origin: "https://example.test" },
        }),
      ),
    ).not.toThrow();
  });
  it("bounds actual streamed JSON bytes even without Content-Length", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(200) }),
    });
    await expect(bodyJson(request, 100)).rejects.toMatchObject({ status: 413 });
  });
  it("does not expose internal failures or secrets in responses", async () => {
    const handler = route(async () => {
      throw new Error("secret-password database-connection-string");
    });
    const response = await handler(new Request("https://example.test/api"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("secret-password");
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
