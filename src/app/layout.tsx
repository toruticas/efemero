import type { Metadata } from "next";
import { Header } from "@/components/header";
import { headers } from "next/headers";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Artefatos — compartilhe por um tempo",
    template: "%s · Artefatos",
  },
  description:
    "Mensagens e arquivos protegidos no seu navegador, com senha e prazo para terminar.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await headers(); // Per-response rendering is required by nonce-based CSP.
  return (
    <html lang="pt-BR">
      <body>
        <div className="page-shell">
          <Header />
          <main>{children}</main>
          <footer className="footer">
            <span>Feito para chegar. Pensado para desaparecer.</span>
            <span>
              <a href="/sobre">Como protegemos seus dados</a>
              <span className="footer-separator">/</span>
              <a href="/revogar">Revogar artefato</a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
