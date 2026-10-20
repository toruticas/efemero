"use client";
import { useI18n } from "@/components/i18n-provider";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="empty-state">
      <h1>{t("Could not open this page.")}</h1>
      <p className="muted">{t("Try again in a few moments.")}</p>
      <button className="button primary" onClick={reset}>
        {t("Try again")}
      </button>
    </div>
  );
}
