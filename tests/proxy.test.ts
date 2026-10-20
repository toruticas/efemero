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
      const connectSources = policy
        .split(";")
        .find((directive) => directive.trim().startsWith("connect-src"))!
        .trim()
        .split(/\s+/);
      expect(connectSources).toContain("https://vercel.com/api/blob");
      expect(connectSources).toContain("https://vercel.com/api/blob/");
      expect(connectSources).not.toContain("https://vercel.com");
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
  it("allows Clerk Protect workers and port probes only on account pages", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    try {
      for (const path of [
        "/sign-in",
        "/sign-up",
        "/app",
        "/sign-in/factor-one",
      ]) {
        const response = await proxy(
          new NextRequest(`https://example.test${path}`),
          {} as NextFetchEvent,
        );
        const policy = response.headers.get("content-security-policy")!;
        expect(policy).toContain("worker-src 'self' blob:");
        expect(policy).toContain("https://*.protect.clerk.com:*");
        expect(policy).toMatch(
          /frame-src[^;]*https:\/\/\*\.protect\.clerk\.com/,
        );
        expect(policy).not.toContain("'unsafe-eval'");
        expect(policy).not.toContain("script-src 'unsafe-inline'");
      }
      for (const path of [
        "/",
        "/a/abc",
        "/alice/contract",
        "/sign-in-lookalike/x",
        "/api/artifacts/reserve",
      ]) {
        const response = await proxy(
          new NextRequest(`https://example.test${path}`),
          {} as NextFetchEvent,
        );
        const policy = response.headers.get("content-security-policy")!;
        expect(policy).toContain("worker-src 'self';");
        expect(policy).not.toContain("https://*.protect.clerk.com:*");
        expect(policy).not.toMatch(
          /frame-src[^;]*https:\/\/\*\.protect\.clerk\.com/,
        );
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
