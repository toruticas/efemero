"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LOCALE_COOKIE, isLocale } from "@/lib/i18n";
import { useI18n } from "./i18n-provider";
export function LanguageSelector() {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <select
      className="language-selector"
      aria-label={t("Language")}
      value={locale}
      disabled={pending}
      onChange={(event) => {
        const selected = event.target.value;
        if (!isLocale(selected)) return;
        document.cookie = `${LOCALE_COOKIE}=${selected}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
        startTransition(() => router.refresh());
      }}
    >
      <option lang="pt-BR" value="pt-BR">
        Português (BR)
      </option>
      <option lang="en" value="en">
        English
      </option>
    </select>
  );
}
