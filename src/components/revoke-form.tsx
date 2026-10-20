"use client";
import { errorMessage } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
export function RevokeForm() {
  const { t, locale } = useI18n();
  const [id, setId] = useState(""),
    [token, setToken] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/artifacts/revoke", { id, managementToken: token });
      setStatus(t("Artifact revoked. New deliveries are blocked."));
      setToken("");
    } catch (e) {
      setStatus(errorMessage(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="revoke-form" onSubmit={submit}>
      <h2>{t("Revoke an anonymous artifact")}</h2>
      <p className="muted">
        {t(
          "Use the details from the revocation file saved when you created it.",
        )}
      </p>
      <label htmlFor="revoke-id">{t("Internal identifier")}</label>
      <input
        id="revoke-id"
        value={id}
        onChange={(e) => setId(e.target.value)}
        required
        placeholder={t("Artifact UUID")}
      />
      <label htmlFor="revoke-token">{t("Revocation credential")}</label>
      <input
        id="revoke-token"
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
        autoComplete="off"
      />
      <button className="button secondary" disabled={busy}>
        {t("Revoke artifact")}
      </button>
      {status && <p role="status">{errorMessage(status, locale)}</p>}
    </form>
  );
}
