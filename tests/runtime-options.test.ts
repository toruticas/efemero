import { afterEach, describe, expect, it, vi } from "vitest";
import {
  accountsEnabled,
  assertPersistentRuntime,
  databaseDriver,
  storageDriver,
} from "@/lib/runtime-options";
import { configurationStatus, origin } from "@/server/config";
describe("deployment configuration", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("keeps the existing managed defaults", () => {
    vi.stubEnv("DATABASE_DRIVER", "");
    vi.stubEnv("STORAGE_DRIVER", "");
    expect(databaseDriver()).toBe("neon");
    expect(storageDriver()).toBe("vercel-blob");
  });
  it("disables all Clerk identity even if credentials remain present", () => {
    vi.stubEnv("AUTH_PROVIDER", "none");
    vi.stubEnv("CLERK_SECRET_KEY", "test-key");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "test-public-key");
    expect(accountsEnabled()).toBe(false);
    expect(configurationStatus().accounts).toBe(false);
  });
  it("rejects local state in Vercel Functions", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("DATABASE_DRIVER", "sqlite");
    expect(assertPersistentRuntime).toThrow();
    vi.stubEnv("DATABASE_DRIVER", "neon");
    vi.stubEnv("STORAGE_DRIVER", "local");
    expect(assertPersistentRuntime).toThrow();
  });
  it("requires HTTPS in production except on standalone loopback", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    expect(origin()).toBe("http://localhost:3000");
    vi.stubEnv("APP_ORIGIN", "http://example.test");
    expect(origin).toThrow();
    vi.stubEnv("APP_ORIGIN", "https://example.test");
    expect(origin()).toBe("https://example.test");
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    expect(origin).toThrow();
  });
  it("does not silently fall back from unknown drivers", () => {
    vi.stubEnv("DATABASE_DRIVER", "typo");
    expect(databaseDriver).toThrow();
    vi.stubEnv("STORAGE_DRIVER", "typo");
    expect(storageDriver).toThrow();
  });
});
