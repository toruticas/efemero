import { describe, expect, it } from "vitest";
import {
  errorMessage,
  localeFromHeaders,
  resolveLocale,
  translator,
} from "@/lib/i18n";
import { portuguese } from "@/lib/i18n/messages";
import { AppError } from "@/server/errors";
import { route } from "@/server/http";
import { z } from "zod";

describe("internationalization", () => {
  it("uses explicit preference before weighted browser language and defaults to Portuguese", () => {
    expect(resolveLocale("pt-BR", "en-US,en;q=0.9")).toBe("pt-BR");
    expect(resolveLocale("en", "pt-BR")).toBe("en");
    expect(resolveLocale(null, "fr-FR,pt-BR;q=0.7,en-GB;q=0.9")).toBe("en");
    expect(resolveLocale(null, "en;q=0,pt-PT;q=0.5")).toBe("pt-BR");
    expect(resolveLocale("invalid", "en-AU")).toBe("en");
    expect(resolveLocale(null, "de-DE,*;q=0.1")).toBe("pt-BR");
    expect(resolveLocale(null, "en;q=NaN,en-US;q=2")).toBe("pt-BR");
    expect(resolveLocale()).toBe("pt-BR");
  });
  it("allows only exact preference cookies and never uses a URL as a locale", () => {
    expect(
      localeFromHeaders(
        new Headers({
          cookie: "session=ignored; efemero_locale=en",
          "accept-language": "pt-BR",
        }),
      ),
    ).toBe("en");
    expect(
      localeFromHeaders(
        new Headers({
          cookie: "efemero_locale=../../en",
          "accept-language": "pt-BR",
        }),
      ),
    ).toBe("pt-BR");
    expect(
      localeFromHeaders(new Headers({ cookie: "other_efemero_locale=en" })),
    ).toBe("pt-BR");
  });
  it("keeps interpolation placeholders in every translation", () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{([a-zA-Z]+)\}/g)].map((m) => m[1]).sort();
    for (const [english, translation] of Object.entries(portuguese)) {
      expect(translation.trim()).not.toBe("");
      expect(placeholders(translation), english).toEqual(placeholders(english));
    }
    expect(
      translator("en")("Created as @{username}", { username: "alice" }),
    ).toBe("Created as @alice");
    expect(
      translator("pt-BR")("Created as @{username}", { username: "alice" }),
    ).toBe("Criado como @alice");
    expect(
      translator("en")("Created as @{username}", { username: "$&{username}" }),
    ).toBe("Created as @$&{username}");
  });
  it("translates known safe errors and redacts unknown internal exceptions", () => {
    expect(
      errorMessage(
        new Error("Artefato indisponível ou acesso inválido."),
        "en",
      ),
    ).toBe("Artifact unavailable or invalid access.");
    expect(
      errorMessage(
        new Error("Artifact unavailable or invalid access."),
        "pt-BR",
      ),
    ).toBe("Artefato indisponível ou acesso inválido.");
    expect(
      errorMessage(new Error("secret-password postgres://private"), "en"),
    ).toBe("Could not complete the operation. Try again.");
  });
  it("localizes API errors without changing status, codes or privacy headers", async () => {
    const handler = route(async () => {
      throw new AppError(
        404,
        "UNAVAILABLE",
        "Artifact unavailable or invalid access.",
      );
    });
    for (const locale of ["en", "pt-BR"] as const) {
      const response = await handler(
        new Request("https://example.test/api", {
          headers: { cookie: `efemero_locale=${locale}` },
        }),
      );
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(await response.json()).toEqual({
        code: "UNAVAILABLE",
        error: translator(locale)("Artifact unavailable or invalid access."),
      });
    }
    const validation = route(async () => {
      z.string().parse(42);
      return Response.json({});
    });
    const response = await validation(
      new Request("https://example.test/api", {
        headers: { "accept-language": "en" },
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: "VALIDATION",
      error: "Check the submitted fields and try again.",
    });
  });
});
