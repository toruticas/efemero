import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import proxy from "@/proxy";
describe("response security policy", () => {
  it("generates a fresh CSP nonce, forwards it to rendering and prohibits embedding", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    try {
      const a = await proxy(
        new NextRequest("https://example.test/a/abc"),
        {} as NextFetchEvent,
      );
      const b = await proxy(
        new NextRequest("https://example.test/a/abc"),
        {} as NextFetchEvent,
      );
      const policy = a.headers.get("content-security-policy")!;
      expect(policy).toContain("frame-ancestors 'none'");
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("'wasm-unsafe-eval'");
      expect(policy).not.toContain("'unsafe-eval'");
      expect(policy).not.toContain("script-src 'unsafe-inline'");
      const nonce = policy.match(/'nonce-([^']+)'/)![1];
      expect(a.headers.get("x-middleware-request-x-nonce")).toBe(nonce);
      expect(b.headers.get("content-security-policy")).not.toContain(
        `'nonce-${nonce}'`,
      );
      expect(a.headers.get("cache-control")).toBe("private, no-store");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
