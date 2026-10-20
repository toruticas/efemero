import { getI18n } from "@/lib/i18n/server";
import { ClerkProvider } from "@clerk/nextjs";
import { ptBR, enUS } from "@clerk/localizations";
import { headers } from "next/headers";
import { configurationStatus } from "@/server/config";
import { clerkPublishableKey } from "@/lib/runtime-options";
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, locale } = await getI18n();
  if (!configurationStatus().accounts)
    return (
      <div className="empty-state">
        <p className="eyebrow">{t("ACCOUNT AREA")}</p>
        <h1>{t("Account area unavailable.")}</h1>
        <p className="muted">
          {t(
            "Sign-in is not enabled on this installation. You can use anonymous sharing.",
          )}
        </p>
        <a className="button secondary" href="/">
          {t("Back to sharing")}
        </a>
      </div>
    );
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey()}
      localization={locale === "en" ? enUS : ptBR}
      nonce={nonce}
      telemetry={false}
      dynamic
    >
      {children}
    </ClerkProvider>
  );
}
