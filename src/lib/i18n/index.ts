import { portuguese, type Message } from "./messages";
export type Locale = "pt-BR" | "en";
export const DEFAULT_LOCALE: Locale = "pt-BR";
export const LOCALE_COOKIE = "efemero_locale";
export function isLocale(value: unknown): value is Locale {
  return value === "pt-BR" || value === "en";
}
export function resolveLocale(
  cookie?: string | null,
  acceptLanguage?: string | null,
): Locale {
  if (isLocale(cookie)) return cookie;
  const preferences = (acceptLanguage || "")
    .slice(0, 4096)
    .split(",")
    .map((part, order) => {
      const [tag, ...parameters] = part.trim().toLowerCase().split(";");
      const q = parameters.find((p) => p.trim().startsWith("q="));
      const weight = q ? Number(q.trim().slice(2)) : 1;
      return { tag, weight, order };
    })
    .filter(
      ({ weight }) => Number.isFinite(weight) && weight > 0 && weight <= 1,
    )
    .sort((a, b) => b.weight - a.weight || a.order - b.order);
  for (const { tag } of preferences) {
    if (/^en(?:-[a-z0-9]+)*$/.test(tag)) return "en";
    if (/^pt(?:-[a-z0-9]+)*$/.test(tag)) return "pt-BR";
  }
  return DEFAULT_LOCALE;
}
export function localeFromHeaders(headers: Headers): Locale {
  const cookie = headers
    .get("cookie")
    ?.split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LOCALE_COOKIE}=`))
    ?.slice(LOCALE_COOKIE.length + 1);
  return resolveLocale(cookie, headers.get("accept-language"));
}
export function translator(locale: Locale) {
  return (message: Message, values: Record<string, string | number> = {}) => {
    const text = locale === "pt-BR" ? portuguese[message] : message;
    return text.replace(/\{([a-zA-Z]+)\}/g, (match, key: string) =>
      Object.hasOwn(values, key) ? String(values[key]) : match,
    );
  };
}
const sourceMessages = new Map<string, Message>();
for (const [english, translation] of Object.entries(portuguese)) {
  sourceMessages.set(english, english as Message);
  sourceMessages.set(translation, english as Message);
}
// Only expose known safe messages, never raw browser/provider exceptions.
export function errorMessage(error: unknown, locale: Locale): string {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const key =
    sourceMessages.get(text) || "Could not complete the operation. Try again.";
  return translator(locale)(key);
}
export function browserLocale(): Locale {
  return typeof document !== "undefined" &&
    isLocale(document.documentElement.lang)
    ? document.documentElement.lang
    : DEFAULT_LOCALE;
}
