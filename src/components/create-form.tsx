"use client";
import { useRef, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Check,
  CheckCheck,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  FileText,
  KeyRound,
  Link2,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { upload } from "@vercel/blob/client";
import { api } from "@/lib/api";
import { CryptoSession } from "@/lib/crypto-session";
import {
  ANONYMOUS_FILE_BYTES,
  MAX_FILE_BYTES,
  CIPHER_OVERHEAD_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_TTL_MINUTES,
  publicPath,
  validatePassword,
  type WrappedKey,
} from "@/lib/protocol";

type Reservation = {
  id: string;
  namespace: string;
  slug: string;
  managementToken: string;
  registrationResponse: string;
  serverIdentity: string;
  pathname: string;
  expiresAt: string;
  uploadTransport?: "local" | "vercel-blob";
};
export function CreateForm({
  configured,
  account,
  onCreated,
}: {
  configured: boolean;
  account?: { username: string };
  onCreated?: () => void;
}) {
  const [kind, setKind] = useState<"message" | "file">("message"),
    [message, setMessage] = useState(""),
    [file, setFile] = useState<globalThis.File | null>(null);
  const [password, setPassword] = useState(""),
    [showPassword, setShowPassword] = useState(false),
    [ttl, setTtl] = useState(24),
    [unit, setUnit] = useState("hours"),
    [views, setViews] = useState(""),
    [failures, setFailures] = useState(""),
    [slug, setSlug] = useState("");
  const [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [result, setResult] = useState<
      (Reservation & { url: string; recipientPassword: string }) | null
    >(null),
    [copied, setCopied] = useState(false),
    [revoked, setRevoked] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const maxFileBytes = account ? MAX_FILE_BYTES : ANONYMOUS_FILE_BYTES;
  const maxFileMB = maxFileBytes / 1024 / 1024;
  function generatePassword() {
    const random = crypto.getRandomValues(new Uint8Array(20)),
      alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    // Rejection sampling avoids modulo bias.
    let output = "";
    for (const value of random)
      if (value < Math.floor(256 / alphabet.length) * alphabet.length)
        output += alphabet[value % alphabet.length];
    if (output.length < 16) {
      generatePassword();
      return;
    }
    setPassword(
      output
        .slice(0, 16)
        .match(/.{1,4}/g)!
        .join("-"),
    );
    setShowPassword(true);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    let session: CryptoSession | undefined,
      reservation: Reservation | undefined;
    try {
      validatePassword(password);
      const ttlMinutes =
        ttl * (unit === "days" ? 1440 : unit === "hours" ? 60 : 1);
      if (
        !Number.isInteger(ttlMinutes) ||
        ttlMinutes < 1 ||
        ttlMinutes > MAX_TTL_MINUTES
      )
        throw new Error("Escolha um prazo entre 1 minuto e 7 dias.");
      const maxReleases = views === "" ? null : Number(views);
      if (
        maxReleases !== null &&
        (!Number.isInteger(maxReleases) || maxReleases < 1 || maxReleases > 100)
      )
        throw new Error("Escolha entre 1 e 100 liberações.");
      const maxFailures = account && failures !== "" ? Number(failures) : null;
      if (
        maxFailures !== null &&
        (!Number.isInteger(maxFailures) || maxFailures < 1 || maxFailures > 100)
      )
        throw new Error("Escolha entre 1 e 100 falhas para o kill-switch.");
      if (kind === "file" && (!file || file.size > maxFileBytes))
        throw new Error(`Escolha um arquivo de até ${maxFileMB} MB.`);
      const data =
        kind === "message"
          ? new TextEncoder().encode(message).buffer
          : await file!.arrayBuffer();
      if (
        kind === "message" &&
        (!message.trim() || data.byteLength > MAX_MESSAGE_BYTES)
      )
        throw new Error("Escreva uma mensagem de até 256 KB.");
      setBusy(true);
      setProgress("Preparando a proteção no seu navegador…");
      session = new CryptoSession();
      const start = await session.run<{ registrationRequest: string }>(
        "register-start",
        { password },
      );
      setPassword("");
      reservation = await api<Reservation>("/api/artifacts/reserve", {
        mode: account ? "account" : "anonymous",
        ...(account && slug ? { slug } : {}),
        size: data.byteLength + CIPHER_OVERHEAD_BYTES,
        ttlMinutes,
        maxReleases,
        ...(account ? { maxFailures } : {}),
        ...start,
      });
      setProgress("Criptografando. O conteúdo continua neste dispositivo…");
      const encrypted = await session.run<{
        ciphertext: ArrayBuffer;
        wrappedKey: WrappedKey;
        registrationRecord: string;
      }>("register-finish", {
        artifactId: reservation.id,
        registrationResponse: reservation.registrationResponse,
        serverIdentity: reservation.serverIdentity,
        payload: {
          kind,
          name: kind === "file" ? file!.name : "mensagem.txt",
          mime:
            kind === "file"
              ? file!.type || "application/octet-stream"
              : "text/plain",
          data,
        },
      });
      setProgress("Enviando o conteúdo já criptografado…");
      if (reservation.uploadTransport === "local") {
        const response = await fetch(
          `/api/artifacts/upload/local?id=${encodeURIComponent(reservation.id)}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-Management-Token": reservation.managementToken,
            },
            body: encrypted.ciphertext,
            credentials: "same-origin",
            cache: "no-store",
          },
        );
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Não foi possível enviar o arquivo.");
        }
      } else
        await upload(
          reservation.pathname,
          new Blob([encrypted.ciphertext], {
            type: "application/octet-stream",
          }),
          {
            access: "private",
            contentType: "application/octet-stream",
            handleUploadUrl: "/api/artifacts/upload",
            clientPayload: JSON.stringify({
              id: reservation.id,
              managementToken: reservation.managementToken,
            }),
            multipart: false,
            onUploadProgress: (p) =>
              setProgress(
                `Enviando conteúdo criptografado… ${Math.round(p.percentage)}%`,
              ),
          },
        );
      setProgress("Finalizando seu artefato…");
      await api("/api/artifacts/commit", {
        id: reservation.id,
        managementToken: reservation.managementToken,
        registrationRecord: encrypted.registrationRecord,
        wrappedKey: encrypted.wrappedKey,
      });
      setResult({
        ...reservation,
        url: new URL(
          publicPath(reservation.namespace, reservation.slug),
          location.origin,
        ).href,
        recipientPassword: password,
      });
      onCreated?.();
      setMessage("");
      setFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar o artefato.",
      );
      if (reservation)
        void api("/api/artifacts/revoke", {
          id: reservation.id,
          managementToken: reservation.managementToken,
        }).catch(() => {});
    } finally {
      session?.close();
      setBusy(false);
      setProgress("");
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result!.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Não foi possível copiar. Selecione e copie o link abaixo.");
    }
  }
  function saveRecovery() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            artifactId: result!.id,
            managementToken: result!.managementToken,
            url: result!.url,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "artefato-revogacao.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (result)
    return (
      <section className="success-card">
        <span className="success-icon">
          <CheckCheck size={30} />
        </span>
        <p className="eyebrow">PRONTO PARA COMPARTILHAR</p>
        <h2>{revoked ? "Artefato revogado." : "O segredo está com você."}</h2>
        <p className="muted">
          {revoked
            ? "Novas entregas foram bloqueadas. A exclusão do conteúdo será concluída em segundo plano."
            : "Compartilhe o link. Envie a senha por outro canal e guarde-a: ela não pode ser recuperada pelo serviço."}
        </p>
        <div className="share-box">
          <Link2 size={18} />
          <input
            aria-label="Link do artefato"
            value={result.url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button
            className="icon-button"
            aria-label="Copiar link"
            onClick={copyLink}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
        <div className="result-password">
          <label htmlFor="created-password">
            Sua senha — disponível somente nesta tela
          </label>
          <div className="password-input">
            <input
              id="created-password"
              type={showPassword ? "text" : "password"}
              readOnly
              value={result.recipientPassword}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              className="icon-button"
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Copiar senha"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.recipientPassword);
                } catch {
                  setError("Selecione e copie a senha manualmente.");
                }
              }}
            >
              <Copy size={17} />
            </button>
          </div>
          <p className="field-help">
            Copie a senha antes de fechar esta tela e envie por outro canal. Ela
            não foi enviada ao servidor.
          </p>
        </div>
        <p className="small muted">
          Expira em {new Date(result.expiresAt).toLocaleString("pt-BR")}. Abrir
          a página não consome uma liberação.
        </p>
        <div className="recovery-note">
          <KeyRound size={20} />
          <div>
            <strong>Guarde sua credencial de revogação</strong>
            <p>
              Ela permite bloquear o artefato antes do prazo. Mantenha este
              arquivo com você.
            </p>
            <button className="text-button" onClick={saveRecovery}>
              <Download size={15} /> Salvar credencial
            </button>
          </div>
        </div>
        <div className="success-actions">
          <button
            className="button primary"
            onClick={() => {
              setResult(null);
              setRevoked(false);
              setError("");
            }}
          >
            Criar outro artefato <ArrowRight size={17} />
          </button>
          <button
            className="button danger subtle"
            disabled={revoked}
            onClick={async () => {
              try {
                await api("/api/artifacts/revoke", {
                  id: result.id,
                  managementToken: result.managementToken,
                });
                setRevoked(true);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Trash2 size={16} /> Revogar agora
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </section>
    );

  return (
    <form onSubmit={submit} className="composer-layout">
      <section className="composer-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">NOVO ARTEFATO</p>
            <h2>O que você quer compartilhar?</h2>
          </div>
          <span className="step-label">01 / 02</span>
        </div>
        <div className="tabs" role="tablist" aria-label="Tipo do artefato">
          <button
            type="button"
            role="tab"
            aria-selected={kind === "message"}
            className={kind === "message" ? "active" : ""}
            onClick={() => setKind("message")}
            disabled={busy}
          >
            <FileText size={17} /> Mensagem
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "file"}
            className={kind === "file" ? "active" : ""}
            onClick={() => setKind("file")}
            disabled={busy}
          >
            <File size={17} /> Arquivo
          </button>
        </div>
        {kind === "message" ? (
          <div className="message-input">
            <label className="sr-only" htmlFor="message">
              Sua mensagem
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Uma mensagem que só precisa chegar a quem importa…"
              maxLength={MAX_MESSAGE_BYTES}
              disabled={busy}
              required
            />
            <div className="input-caption">
              <span>O conteúdo é criptografado antes de sair daqui.</span>
              <span>{message.length.toLocaleString("pt-BR")} caracteres</span>
            </div>
          </div>
        ) : (
          <div className="file-area">
            <input
              ref={fileInput}
              type="file"
              id="artifact-file"
              className="sr-only"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <label htmlFor="artifact-file" className="drop-zone">
              <span className="upload-icon">
                <Upload size={25} />
              </span>
              <strong>{file ? file.name : "Escolha um arquivo"}</strong>
              <span>
                {file
                  ? `${(file.size / 1024 / 1024).toFixed(2)} MB · clique para trocar`
                  : `Qualquer formato, até ${maxFileMB} MB`}
              </span>
              <span className="file-select">
                Selecionar arquivo <ArrowRight size={15} />
              </span>
            </label>
          </div>
        )}
        <div className="password-section">
          <div className="field-title">
            <label htmlFor="password">
              <KeyRound size={17} /> Senha de acesso
            </label>
            <span>Obrigatória</span>
          </div>
          <div className="password-row">
            <div className="password-input">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={12}
                maxLength={256}
                required
                autoComplete="new-password"
                placeholder="Uma frase longa ou senha gerada"
                disabled={busy}
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                className="icon-button"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <button
              type="button"
              className="button secondary generate"
              onClick={generatePassword}
              disabled={busy}
            >
              <RefreshCw size={15} /> Gerar
            </button>
          </div>
          <p className="field-help">
            Mínimo de 12 caracteres. A senha é processada no seu navegador e não
            é enviada à API.
          </p>
        </div>
        {account && (
          <div className="slug-section">
            <label htmlFor="slug">
              Endereço personalizado <span className="muted">(opcional)</span>
            </label>
            <div className="slug-input">
              <span>/{account.username}/</span>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}"
                maxLength={48}
                placeholder="identificador-aleatorio"
                disabled={busy}
              />
            </div>
            <p className="field-help">
              Letras ASCII, números, hífen e sublinhado; até 48 caracteres. O
              endereço será definitivo e não poderá ser reutilizado.
            </p>
          </div>
        )}
        <div className="local-note">
          <ShieldCheck size={17} />
          <span>
            Mensagem, nome do arquivo e conteúdo protegidos no seu dispositivo.
          </span>
        </div>
      </section>
      <aside className="policy-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">SUAS REGRAS</p>
            <h2>Até quando?</h2>
          </div>
          <Clock3 size={21} className="muted" />
        </div>
        <p className="policy-intro">
          Escolha quando o compartilhamento deve terminar.
        </p>
        <label htmlFor="ttl">Tempo de vida</label>
        <div className="duration-input">
          <input
            id="ttl"
            type="number"
            min="1"
            max={unit === "days" ? 7 : unit === "hours" ? 168 : 10080}
            step="1"
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value))}
            disabled={busy}
            required
          />
          <select
            aria-label="Unidade do tempo de vida"
            value={unit}
            onChange={(e) => {
              setUnit(e.target.value);
              setTtl(
                e.target.value === "days"
                  ? 1
                  : e.target.value === "hours"
                    ? 24
                    : 60,
              );
            }}
            disabled={busy}
          >
            <option value="minutes">minutos</option>
            <option value="hours">horas</option>
            <option value="days">dias</option>
          </select>
        </div>
        <p className="field-help">De 1 minuto a 7 dias.</p>
        <div className="divider" />
        <label htmlFor="views">
          Limite de acessos <span className="muted">(opcional)</span>
        </label>
        <div className="views-input">
          <Eye size={17} />
          <input
            id="views"
            type="number"
            min="1"
            max="100"
            step="1"
            placeholder="Sem limite adicional"
            value={views}
            onChange={(e) => setViews(e.target.value)}
            disabled={busy}
          />
        </div>
        <p className="field-help">
          Cada entrega autorizada conta um acesso. Uma conexão interrompida pode
          consumi-lo.
        </p>
        {account && (
          <>
            <div className="divider" />
            <label htmlFor="failures">
              Kill-switch <span className="muted">(opcional)</span>
            </label>
            <div className="views-input">
              <ShieldCheck size={17} />
              <input
                id="failures"
                type="number"
                min="1"
                max="100"
                step="1"
                placeholder="Desativado"
                value={failures}
                onChange={(e) => setFailures(e.target.value)}
                disabled={busy}
              />
            </div>
            <p className="field-help">
              Exclui o artefato ao atingir este total de falhas, sem reiniciar
              após acertos. Verificações abandonadas ou interrompidas contam
              após 2 minutos. Qualquer pessoa com o link pode provocar a
              exclusão deliberadamente.
            </p>
          </>
        )}
        <p className="field-help">
          Conteúdo, endereço e regras não poderão ser alterados após a criação.
          Você poderá bloquear e remover o artefato.
        </p>
        <div className="policy-summary">
          <span className="status-dot" />
          <p>
            O que acontecer primeiro encerra o acesso: prazo, limite de entregas
            ou kill-switch, quando definido.
          </p>
        </div>
        <button
          type="submit"
          className="button primary create-button"
          disabled={busy || !configured}
        >
          {busy ? (
            <>
              <span className="spinner" /> Protegendo…
            </>
          ) : (
            <>
              <LockKeyhole size={17} /> Criar link seguro{" "}
              <ArrowRight size={17} />
            </>
          )}
        </button>
        <p className="submit-note">
          {account
            ? `Criado como @${account.username}`
            : "Sem conta. Sem conteúdo em claro no servidor."}
        </p>
        {busy && (
          <p className="progress" role="status">
            {progress}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!configured && (
          <p className="setup-note">
            O compartilhamento será liberado após a configuração do
            armazenamento e das chaves do serviço.
          </p>
        )}
      </aside>
    </form>
  );
}
