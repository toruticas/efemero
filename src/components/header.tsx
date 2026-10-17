import Link from "next/link";
import { ArrowUpRight, LockKeyhole } from "lucide-react";
export function Header() {
  return (
    <header className="header">
      <Link className="brand" href="/" aria-label="Efemero, página inicial">
        <span className="brand-symbol">
          <LockKeyhole size={18} strokeWidth={2.2} />
        </span>
        efemero<span className="brand-dot">.</span>
      </Link>
      <nav aria-label="Navegação principal">
        <span className="header-note">
          <span className="status-dot" /> Criptografia no navegador
        </span>
        <Link className="nav-link" href="/app">
          Minha conta <ArrowUpRight size={15} />
        </Link>
      </nav>
    </header>
  );
}
