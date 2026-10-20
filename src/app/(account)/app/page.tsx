import { getI18n } from "@/lib/i18n/server";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { configurationStatus } from "@/server/config";
import { Dashboard } from "@/components/dashboard";
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("My account") };
}
export default async function AccountPage() {
  const { t } = await getI18n();
  if (!configurationStatus().accounts) return null;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <section className="dashboard">
      <div className="dashboard-title">
        <div>
          <p className="eyebrow">{t("YOUR SPACE")}</p>
          <h1>{t("Your artifacts.")}</h1>
          <p className="muted">
            {t("Manage addresses, deadlines and deliveries.")}
          </p>
        </div>
        <UserButton />
      </div>
      <Dashboard sharingConfigured={configurationStatus().sharing} />
    </section>
  );
}
