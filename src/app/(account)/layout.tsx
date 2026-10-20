import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { headers } from "next/headers";
import { configurationStatus } from "@/server/config";
import { clerkPublishableKey } from "@/lib/runtime-options";
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configurationStatus().accounts)
    return (
      <div className="empty-state">
        <p className="eyebrow">ÁREA DE CONTAS</p>
        <h1>Área de contas indisponível.</h1>
        <p className="muted">
          Esta instalação não está com o login habilitado. Você pode usar o
          compartilhamento anônimo.
        </p>
        <a className="button secondary" href="/">
          Voltar ao compartilhamento
        </a>
      </div>
    );
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey()}
      localization={ptBR}
      nonce={nonce}
      telemetry={false}
      dynamic
    >
      {children}
    </ClerkProvider>
  );
}
