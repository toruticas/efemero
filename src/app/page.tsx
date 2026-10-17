import { ArrowDown, CircleCheck, Fingerprint, Timer } from "lucide-react";
import { CreateForm } from "@/components/create-form";
import { configurationStatus } from "@/server/config";
export default function Home() {
  const configured = configurationStatus().sharing;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" /> PRIVADO POR PRINCÍPIO. TEMPORÁRIO POR
            ESCOLHA.
          </p>
          <h1>
            Compartilhe o momento.
            <br />
            <span>Deixe o resto desaparecer.</span>
          </h1>
          <p className="hero-description">
            Uma mensagem, um arquivo, um segredo.
            <br />
            Você escolhe quem pode abrir — e até quando.
          </p>
          <div className="hero-pills">
            <span>
              <Fingerprint size={15} /> Senha só no navegador
            </span>
            <span>
              <Timer size={15} /> Prazo definido por você
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="artifact-shape">
            <div className="artifact-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="artifact-seal">
              <Fingerprint size={47} strokeWidth={1.2} />
            </div>
            <span>ACESSO PROTEGIDO</span>
          </div>
          <span className="floating-tag tag-top">
            <span className="status-dot" /> Criptografado aqui
          </span>
          <span className="floating-tag tag-bottom">
            <CircleCheck size={14} /> Só com a sua senha
          </span>
          <span className="art-coordinate">01 — 256 BIT</span>
        </div>
      </section>
      <section className="section-intro">
        <span>
          COMECE AQUI <ArrowDown size={14} />
        </span>
        <p>Conteúdo privado. Regras claras.</p>
      </section>
      <CreateForm configured={configured} />
      <section className="assurances">
        <article>
          <span>01</span>
          <div>
            <h3>Protegido antes de sair</h3>
            <p>
              A criptografia acontece no seu navegador. O serviço recebe o
              conteúdo já cifrado.
            </p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <h3>Senha para entregar</h3>
            <p>
              A autenticação acontece antes do download. Conhecer o link não
              basta.
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <h3>Um fim definido</h3>
            <p>
              Ao atingir o prazo ou o limite, novas entregas são bloqueadas e a
              exclusão é agendada.
            </p>
          </div>
        </article>
      </section>
    </>
  );
}
