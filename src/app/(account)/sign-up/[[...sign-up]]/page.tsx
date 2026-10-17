import { SignUp } from "@clerk/nextjs";
export const metadata = { title: "Criar conta" };
export default function SignUpPage() {
  return (
    <div className="auth-page">
      <SignUp fallbackRedirectUrl="/app" />
    </div>
  );
}
