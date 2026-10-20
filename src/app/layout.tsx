import type { Viewport } from "next";
import { getI18n } from "@/lib/i18n/server";
import { Header } from "@/components/header";
import { I18nProvider } from "@/components/i18n-provider";
import "./globals.css";
export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8f4" },
    { media: "(prefers-color-scheme: dark)", color: "#101a16" },
  ],
};
export async function generateMetadata() {
  const { t } = await getI18n();
  return {
    title: {
      default: t("Efemero — share for a while"),
      template: "%s · Efemero",
    },
    description: t(
      "Messages and files protected in your browser, with a password and an expiration.",
    ),
    robots: { index: false, follow: false },
  };
}
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { t, locale } = await getI18n();
  return (
    <html lang={locale}>
      <body>
        <I18nProvider locale={locale}>
          <div className="page-shell">
            <Header />
            <main>{children}</main>
            <footer className="footer">
              <span>{t("Made to arrive. Designed to disappear.")}</span>
              <span>
                <a href="/sobre">{t("How we protect your data")}</a>
                <span className="footer-separator">/</span>
                <a href="/revogar">{t("Revoke artifact")}</a>
              </span>
            </footer>
          </div>
        </I18nProvider>
      </body>
    </html>
  );
}
