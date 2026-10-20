import { getI18n } from "@/lib/i18n/server";
import { SignIn } from "@clerk/nextjs";
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Sign in") };
}
export default async function SignInPage() {
  return (
    <div className="auth-page">
      <SignIn fallbackRedirectUrl="/app" />
    </div>
  );
}
