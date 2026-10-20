import { getI18n } from "@/lib/i18n/server";
import { RevokeForm } from "@/components/revoke-form";
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Revoke artifact") };
}
export default async function RevokePage() {
  return (
    <div className="viewer-page">
      <RevokeForm />
    </div>
  );
}
