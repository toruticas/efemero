import { getI18n } from "@/lib/i18n/server";
import Link from "next/link";
export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <div className="empty-state">
      <p className="eyebrow">404</p>
      <h1>{t("This address is unavailable.")}</h1>
      <p className="muted">
        {t("Check the link you received or create a new artifact.")}
      </p>
      <Link className="button primary" href="/">
        {t("Create artifact")}
      </Link>
    </div>
  );
}
