import { getI18n } from "@/lib/i18n/server";
import { LanguageSelector } from "./language-selector";
import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
import { accountsEnabled } from "@/lib/runtime-options";
export async function Header() {
  const { t } = await getI18n();
  return (
    <header className="header">
      <Link className="brand" href="/" aria-label={t("Efemero, home page")}>
        <span className="brand-symbol">
          <LockKeyhole size={18} strokeWidth={2.2} />
        </span>
        efemero<span className="brand-dot">.</span>
      </Link>
      <nav aria-label={t("Main navigation")}>
        <LanguageSelector />
        <span className="header-note">
          <span className="status-dot" /> {t("Encryption in your browser")}
        </span>
        {accountsEnabled() && (
          <Link className="nav-link" href="/app">
            {t("My account")} <ArrowUpRight size={15} />
          </Link>
        )}
      </nav>
    </header>
  );
}
