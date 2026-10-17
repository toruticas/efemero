"use client";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api";
export function RevokeForm() {
  const [id, setId] = useState(""),
    [token, setToken] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/artifacts/revoke", { id, managementToken: token });
      setStatus("Artefato revogado. Novas entregas estão bloqueadas.");
      setToken("");
    } catch (e) {
      setStatus((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="revoke-form" onSubmit={submit}>
      <h2>Revogar um artefato anônimo</h2>
      <p className="muted">
        Use os dados do arquivo de revogação salvo na criação.
      </p>
      <label htmlFor="revoke-id">Identificador interno</label>
      <input
        id="revoke-id"
        value={id}
        onChange={(e) => setId(e.target.value)}
        required
        placeholder="UUID do artefato"
      />
      <label htmlFor="revoke-token">Credencial de revogação</label>
      <input
        id="revoke-token"
        type="password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        required
        autoComplete="off"
      />
      <button className="button secondary" disabled={busy}>
        Revogar artefato
      </button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}
