import { getI18n } from "@/lib/i18n/server";
import { SignUp } from "@clerk/nextjs";
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Create account") };
}
export default async function SignUpPage() {
  return (
    <div className="auth-page">
      <SignUp fallbackRedirectUrl="/app" />
    </div>
  );
}
