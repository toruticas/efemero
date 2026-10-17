import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { configurationStatus } from "@/server/config";
import { Dashboard } from "@/components/dashboard";
export const metadata = { title: "Minha conta" };
export default async function AccountPage() {
  if (!configurationStatus().accounts) return null;
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return (
    <section className="dashboard">
      <div className="dashboard-title">
        <div>
          <p className="eyebrow">SEU ESPAÇO</p>
          <h1>Seus artefatos.</h1>
          <p className="muted">Gerencie endereços, prazos e entregas.</p>
        </div>
        <UserButton />
      </div>
      <Dashboard sharingConfigured={configurationStatus().sharing} />
    </section>
  );
}
