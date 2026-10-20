import "server-only";
import { headers } from "next/headers";
import { localeFromHeaders, translator } from "./index";
export async function getI18n() {
  const locale = localeFromHeaders(await headers());
  return { locale, t: translator(locale) };
}
