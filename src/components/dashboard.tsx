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
  revoked: "Removido",
  destroyed: "Kill-switch acionado",
};
type Data = {
  account: { id: string; username: string } | null;
  artifacts: ArtifactSummary[];
  nextCursor: string | null;
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
    [busy, setBusy] = useState(false),
    [loadingMore, setLoadingMore] = useState(false),
    [removing, setRemoving] = useState<string | null>(null);
  async function refresh() {
    try {
      setError("");
      setData(await api<Data>("/api/account"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function loadMore() {
    if (!data?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api<Data>(
        `/api/account?cursor=${encodeURIComponent(data.nextCursor)}`,
      );
      setData((current) =>
        current
          ? {
              ...current,
              nextCursor: page.nextCursor,
              artifacts: [
                ...current.artifacts,
                ...page.artifacts.filter(
                  (a) => !current.artifacts.some((b) => b.id === a.id),
                ),
              ],
            }
          : page,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
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
          Seu username fará parte dos links compartilhados. Depois de definido,
          não poderá ser alterado.
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
        <CreateForm
          configured={sharingConfigured}
          account={data.account}
          onCreated={() => {
            void refresh();
          }}
        />
      )}
      <div className="history-card">
        <div className="card-heading">
          <h2>Histórico de criação</h2>
          <span className="muted small">
            {data.artifacts.length} artefatos listados
          </span>
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
                  <th>Aberturas da página</th>
                  <th>Entregas autorizadas</th>
                  <th>Falhas / kill-switch</th>
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
                    <td>{a.accessCount}</td>
                    <td>
                      {a.releaseCount}
                      {a.maxReleases === null ? " / ∞" : ` / ${a.maxReleases}`}
                    </td>
                    <td>
                      {a.maxFailures === null
                        ? "Desativado"
                        : `${a.failedCount} / ${a.maxFailures}`}
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
                          aria-label={`Bloquear e remover ${a.slug}`}
                          title="Bloquear e remover definitivamente"
                          disabled={removing !== null}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                `Bloquear e remover /${a.namespace}/${a.slug}? Esta ação não pode ser desfeita.`,
                              )
                            )
                              return;
                            setRemoving(a.id);
                            try {
                              await api("/api/artifacts/revoke", { id: a.id });
                              await refresh();
                            } catch (e) {
                              setError((e as Error).message);
                            } finally {
                              setRemoving(null);
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
      {data.nextCursor && (
        <button
          className="button secondary"
          disabled={loadingMore}
          onClick={loadMore}
        >
          {loadingMore ? "Carregando…" : "Carregar mais artefatos"}
        </button>
      )}
      <p className="small muted">
        As aberturas da página são uma estimativa e podem incluir recargas e
        robôs. Entregas autorizadas consomem o limite, mesmo se a conexão for
        interrompida; não confirmam descriptografia ou leitura. Não guardamos
        conteúdo, senha nem histórico dos destinatários. Os metadados deixam de
        ser listados 30 dias após a exclusão física. O bloqueio é definitivo e
        agenda a remoção do conteúdo; nada pode ser editado.
      </p>
    </>
  );
}
