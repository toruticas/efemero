import { ClerkProvider } from "@clerk/nextjs";
import { ptBR } from "@clerk/localizations";
import { headers } from "next/headers";
import { configurationStatus } from "@/server/config";
export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!configurationStatus().accounts)
    return (
      <div className="empty-state">
        <p className="eyebrow">ÁREA DE CONTAS</p>
        <h1>Seu espaço está a caminho.</h1>
        <p className="muted">
          O login ainda precisa ser configurado. O compartilhamento anônimo
          funciona assim que os serviços de armazenamento estiverem conectados.
        </p>
        <a className="button secondary" href="/">
          Voltar ao compartilhamento
        </a>
      </div>
    );
  const nonce = (await headers()).get("x-nonce") || undefined;
  return (
    <ClerkProvider localization={ptBR} nonce={nonce} telemetry={false} dynamic>
      {children}
    </ClerkProvider>
  );
}
