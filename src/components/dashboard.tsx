"use client";
import { errorMessage } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Plus, RefreshCw, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { publicPath, type ArtifactSummary } from "@/lib/protocol";
import { CreateForm } from "./create-form";

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
  const { t, locale } = useI18n();
  const statuses: Record<string, string> = {
    pending: t("Preparing"),
    ready: t("Available"),
    exhausted: t("Limit reached"),
    expired: t("Expired"),
    revoked: t("Removed"),
    destroyed: t("Kill-switch triggered"),
  };
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
      setError(errorMessage(e, locale));
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
      setError(errorMessage(e, locale));
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
      setError(errorMessage(e, locale));
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
              {errorMessage(error, locale)}
            </p>
            <button className="button secondary" onClick={refresh}>
              {t("Try again")}
            </button>
          </>
        ) : (
          <p role="status">{t("Loading your space…")}</p>
        )}
      </div>
    );
  if (!data.account)
    return (
      <form className="onboarding" onSubmit={setName}>
        <p className="eyebrow">{t("YOUR FIRST STEP")}</p>
        <h2>{t("How would you like to appear?")}</h2>
        <p className="muted">
          {t(
            "Your username will be part of shared links. Once set, it cannot be changed.",
          )}
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
            placeholder={t("your-name")}
            required
          />
        </div>
        <p className="field-help">
          {t(
            "3 to 24 characters: lowercase letters, numbers, hyphens or underscores.",
          )}
        </p>
        <button className="button primary" disabled={busy}>
          {t("Set username")}
        </button>
        {error && (
          <p role="alert" className="error">
            {errorMessage(error, locale)}
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
            <RefreshCw size={15} /> {t("Refresh")}
          </button>
          <button
            className="button primary"
            onClick={() => setCreating(!creating)}
          >
            <Plus size={16} />
            {creating ? t("Close creator") : t("New artifact")}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          {errorMessage(error, locale)}
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
          <h2>{t("Creation history")}</h2>
          <span className="muted small">
            {t(
              data.artifacts.length === 1
                ? "{count} artifact listed"
                : "{count} artifacts listed",
              {
                count: data.artifacts.length.toLocaleString(locale),
              },
            )}
          </span>
        </div>
        {data.artifacts.length === 0 ? (
          <div className="history-empty">
            <h3>{t("Your first artifact starts here.")}</h3>
            <p className="muted">
              {t(
                "Create a share to track its deadline and authorized deliveries.",
              )}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Address")}</th>
                  <th>{t("Status")}</th>
                  <th>{t("Page opens")}</th>
                  <th>{t("Authorized deliveries")}</th>
                  <th>{t("Failures / kill-switch")}</th>
                  <th>{t("Expiration")}</th>
                  <th>
                    <span className="sr-only">{t("Actions")}</span>
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
                        {new Date(a.createdAt).toLocaleDateString(locale)}
                      </span>
                    </td>
                    <td>
                      <span className={`state state-${a.state}`}>
                        {statuses[a.state]}
                      </span>
                    </td>
                    <td>{a.accessCount.toLocaleString(locale)}</td>
                    <td>
                      {a.releaseCount.toLocaleString(locale)}
                      {a.maxReleases === null ? " / ∞" : ` / ${a.maxReleases}`}
                    </td>
                    <td>
                      {a.maxFailures === null
                        ? t("Disabled")
                        : `${a.failedCount} / ${a.maxFailures}`}
                    </td>
                    <td>
                      {new Date(a.expiresAt).toLocaleString(locale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td>
                      {["ready", "pending"].includes(a.state) && (
                        <button
                          className="icon-button danger"
                          aria-label={t("Block and remove {slug}", {
                            slug: a.slug,
                          })}
                          title={t("Permanently block and remove")}
                          disabled={removing !== null}
                          onClick={async () => {
                            if (
                              !window.confirm(
                                t(
                                  "Block and remove /{namespace}/{slug}? This action cannot be undone.",
                                  { namespace: a.namespace, slug: a.slug },
                                ),
                              )
                            )
                              return;
                            setRemoving(a.id);
                            try {
                              await api("/api/artifacts/revoke", { id: a.id });
                              await refresh();
                            } catch (e) {
                              setError(errorMessage(e, locale));
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
          {loadingMore ? t("Loading…") : t("Load more artifacts")}
        </button>
      )}
      <p className="small muted">
        {t(
          "Page opens are estimates and may include reloads and bots. Authorized deliveries consume the limit even if the connection is interrupted; they do not confirm decryption or reading. We do not store recipient content, passwords or history. Metadata stops appearing here 30 days after physical deletion. Blocking is permanent and schedules content removal; nothing can be edited.",
        )}
      </p>
    </>
  );
}
