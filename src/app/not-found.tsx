import Link from "next/link";
export default function NotFound() {
  return (
    <div className="empty-state">
      <p className="eyebrow">404</p>
      <h1>Este endereço não está disponível.</h1>
      <p className="muted">Confira o link recebido ou crie um novo artefato.</p>
      <Link className="button primary" href="/">
        Criar artefato
      </Link>
    </div>
  );
}
