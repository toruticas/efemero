"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { publicPath, type ArtifactSummary } from "@/lib/protocol";
import { CreateForm } from "./create-form";
const statuses: Record<string, string> = {
  pending: "Preparando",
  ready: "Disponível",
  exhausted: "Limite atingido",
  expired: "Expirado",
  revoked: "Revogado",
};
type Data = {
  account: { id: string; username: string } | null;
  artifacts: ArtifactSummary[];
};
export function Dashboard({
  sharingConfigured,
}: {
  sharingConfigured: boolean;
}) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [username, setUsername] = useState(""),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false);
  async function refresh() {
    try {
      setError("");
      setData(await api<Data>("/api/account"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function setName(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/account", { username });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <div className="empty-state">
        {error ? (
          <>
            <p role="alert" className="error">
              {error}
            </p>
            <button className="button secondary" onClick={refresh}>
              Tentar novamente
            </button>
          </>
        ) : (
          <p role="status">Carregando seu espaço…</p>
        )}
      </div>
    );
  if (!data.account)
    return (
      <form className="onboarding" onSubmit={setName}>
        <p className="eyebrow">SEU PRIMEIRO PASSO</p>
        <h2>Como você quer aparecer?</h2>
        <p className="muted">
          Seu username fará parte dos links compartilhados. Ele permanece fixo
          nesta versão.
        </p>
        <label htmlFor="username">Username</label>
        <div className="slug-input">
          <span>@</span>
          <input
            id="username"
            pattern="[a-z][a-z0-9_-]{2,23}"
            minLength={3}
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase())}
            placeholder="seu-nome"
            required
          />
        </div>
        <p className="field-help">
          De 3 a 24 caracteres: letras minúsculas, números, hífen ou sublinhado.
        </p>
        <button className="button primary" disabled={busy}>
          Definir username
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    );
  return (
    <>
      <div className="dashboard-toolbar">
        <span className="username-badge">@{data.account.username}</span>
        <div>
          <button className="button secondary" onClick={refresh}>
            <RefreshCw size={15} /> Atualizar
          </button>
          <button
            className="button primary"
            onClick={() => setCreating(!creating)}
          >
            <Plus size={16} />
            {creating ? "Fechar criação" : "Novo artefato"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {creating && (
        <CreateForm configured={sharingConfigured} account={data.account} />
      )}
      <div className="history-card">
        <div className="card-heading">
          <h2>Histórico de criação</h2>
          <span className="muted small">Últimos 100 artefatos</span>
        </div>
        {data.artifacts.length === 0 ? (
          <div className="history-empty">
            <h3>Seu primeiro artefato começa aqui.</h3>
            <p className="muted">
              Crie um compartilhamento para acompanhar o prazo e as liberações.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Endereço</th>
                  <th>Estado</th>
                  <th>Liberações</th>
                  <th>Expiração</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.artifacts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <a
                        className="history-link"
                        href={publicPath(a.namespace, a.slug)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        /{a.namespace}/{a.slug} <ArrowUpRight size={13} />
                      </a>
                      <span className="small muted">
                        {new Date(a.createdAt).toLocaleDateString("pt-BR")}
                      </span>
                    </td>
                    <td>
                      <span className={`state state-${a.state}`}>
                        {statuses[a.state]}
                      </span>
                    </td>
                    <td>
                      {a.releaseCount}
                      {a.maxReleases === null ? " / ∞" : ` / ${a.maxReleases}`}
                    </td>
                    <td>
                      {new Date(a.expiresAt).toLocaleString("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      {["ready", "pending"].includes(a.state) && (
                        <button
                          className="icon-button danger"
                          aria-label={`Revogar ${a.slug}`}
                          onClick={async () => {
                            try {
                              await api("/api/artifacts/revoke", { id: a.id });
                              await refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="small muted">
        O histórico não guarda o conteúdo nem sua senha. Abrir um endereço pede
        a senha; somente uma entrega autorizada consome acesso.
      </p>
    </>
  );
}
