"use client";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Download,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { CryptoSession } from "@/lib/crypto-session";
import { api } from "@/lib/api";
import { fromBase64 } from "@/lib/crypto";
import {
  MAX_CIPHER_BYTES,
  validatePassword,
  type ArtifactPayload,
  type WrappedKey,
} from "@/lib/protocol";
export function Viewer({
  namespace,
  slug,
  configured,
}: {
  namespace: string;
  slug: string;
  configured: boolean;
}) {
  const [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [payload, setPayload] = useState<ArtifactPayload | null>(null),
    [stage, setStage] = useState("");
  async function open(event: FormEvent) {
    event.preventDefault();
    setError("");
    let session: CryptoSession | undefined;
    try {
      validatePassword(password);
      setBusy(true);
      setStage("Validando sua senha sem enviá-la…");
      session = new CryptoSession();
      const first = await session.run<{ startLoginRequest: string }>(
        "login-start",
        { password },
      );
      setPassword("");
      const start = await api<{
        handshakeId: string;
        artifactId: string;
        loginResponse: string;
        serverIdentity: string;
      }>("/api/artifacts/access/start", { namespace, slug, ...first });
      const proof = await session.run<{ finishLoginRequest: string }>(
        "login-finish",
        start,
      );
      setStage("Recebendo o conteúdo criptografado…");
      const response = await fetch("/api/artifacts/access/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handshakeId: start.handshakeId, ...proof }),
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Artefato indisponível.");
      }
      const id = response.headers.get("x-artifact-id"),
        wrapped = response.headers.get("x-wrapped-key");
      if (id !== start.artifactId || !wrapped)
        throw new Error("Não foi possível verificar a entrega.");
      const reader = response.body!.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_CIPHER_BYTES) {
          await reader.cancel();
          throw new Error("Artefato acima do limite permitido.");
        }
        chunks.push(value);
      }
      const ciphertext = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        ciphertext.set(chunk, offset);
        offset += chunk.length;
      }
      setStage("Descriptografando no seu dispositivo…");
      const content = await session.run<ArtifactPayload>("decrypt", {
        artifactId: id,
        ciphertext: ciphertext.buffer,
        wrappedKey: JSON.parse(
          new TextDecoder().decode(fromBase64(wrapped)),
        ) as WrappedKey,
      });
      setPayload(content);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível abrir este artefato.",
      );
    } finally {
      session?.close();
      setBusy(false);
      setStage("");
    }
  }
  function clear() {
    if (payload) new Uint8Array(payload.data).fill(0);
    setPayload(null);
  }
  function download() {
    if (!payload) return;
    // Never render active file content in this origin. Always force a download.
    const blob = new Blob([payload.data], { type: "application/octet-stream" }),
      url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = payload.name || "arquivo";
    link.rel = "noopener";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (payload)
    return (
      <section className="viewer-card unlocked">
        <span className="viewer-icon">
          <ShieldCheck size={28} />
        </span>
        <p className="eyebrow">ABERTO NESTE DISPOSITIVO</p>
        <h1>
          {payload.kind === "message"
            ? "Uma mensagem para você."
            : "Seu arquivo está pronto."}
        </h1>
        {payload.kind === "message" ? (
          <pre className="decrypted-message">
            {new TextDecoder().decode(payload.data)}
          </pre>
        ) : (
          <div className="received-file">
            <strong>{payload.name}</strong>
            <span className="muted">
              {(payload.data.byteLength / 1024).toFixed(1)} KB
            </span>
          </div>
        )}
        <div className="success-actions">
          <button className="button primary" onClick={download}>
            <Download size={17} />
            {payload.kind === "message" ? "Salvar mensagem" : "Baixar arquivo"}
          </button>
          <button className="button secondary" onClick={clear}>
            <X size={16} /> Fechar conteúdo
          </button>
        </div>
        <p className="small muted">
          Este conteúdo já foi entregue. Fechá-lo não garante que você poderá
          abri-lo novamente.
        </p>
      </section>
    );
  return (
    <section className="viewer-card">
      <span className="viewer-icon">
        <LockKeyhole size={29} />
      </span>
      <p className="eyebrow">COMPARTILHADO COM VOCÊ</p>
      <h1>Você tem a chave.</h1>
      <p className="muted">
        Digite a senha enviada pelo remetente. O conteúdo só será entregue
        depois da autenticação.
      </p>
      <div className="artifact-address">
        /{namespace}/{slug}
      </div>
      <form onSubmit={open}>
        <label htmlFor="access-password">Senha do artefato</label>
        <div className="password-input">
          <input
            autoFocus
            id="access-password"
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={12}
            maxLength={256}
            autoComplete="off"
            placeholder="Digite a senha recebida"
            disabled={busy}
          />
          <button
            type="button"
            aria-label={show ? "Ocultar senha" : "Mostrar senha"}
            className="icon-button"
            onClick={() => setShow(!show)}
          >
            {show ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        <button
          className="button primary"
          disabled={busy || !configured}
          type="submit"
        >
          {busy ? (
            <>
              <span className="spinner" /> Verificando…
            </>
          ) : (
            <>
              Abrir artefato <ArrowRight size={17} />
            </>
          )}
        </button>
        {busy && (
          <p role="status" className="progress">
            {stage}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!configured && (
          <p className="setup-note">O serviço ainda está sendo configurado.</p>
        )}
      </form>
      <p className="viewer-footnote">
        <ShieldCheck size={16} /> A senha fica no navegador. Abrir esta página
        não consome acesso.
      </p>
    </section>
  );
}
