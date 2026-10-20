"use client";
import type { Message } from "@/lib/i18n/messages";
import { errorMessage } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

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
  const { t, locale } = useI18n();
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
    [progress, setProgress] = useState<{
      message: Message;
      values?: Record<string, string | number>;
    } | null>(null),
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
        throw new Error(t("Choose a lifetime between 1 minute and 7 days."));
      const maxReleases = views === "" ? null : Number(views);
      if (
        maxReleases !== null &&
        (!Number.isInteger(maxReleases) || maxReleases < 1 || maxReleases > 100)
      )
        throw new Error(t("Choose between 1 and 100 deliveries."));
      const maxFailures = account && failures !== "" ? Number(failures) : null;
      if (
        maxFailures !== null &&
        (!Number.isInteger(maxFailures) || maxFailures < 1 || maxFailures > 100)
      )
        throw new Error(
          t("Choose between 1 and 100 failures for the kill-switch."),
        );
      if (kind === "file" && (!file || file.size > maxFileBytes))
        throw new Error(t("The file exceeds the allowed size."));
      const data =
        kind === "message"
          ? new TextEncoder().encode(message).buffer
          : await file!.arrayBuffer();
      if (
        kind === "message" &&
        (!message.trim() || data.byteLength > MAX_MESSAGE_BYTES)
      )
        throw new Error(t("Write a message of up to 256 KB."));
      setBusy(true);
      setProgress({ message: "Preparing protection in your browser…" });
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
      setProgress({
        message: "Encrypting. Your content is still on this device…",
      });
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
          name: kind === "file" ? file!.name : t("message.txt"),
          mime:
            kind === "file"
              ? file!.type || "application/octet-stream"
              : "text/plain",
          data,
        },
      });
      setProgress({ message: "Uploading already encrypted content…" });
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
          throw new Error(error.error || t("Could not upload the file."));
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
              setProgress({
                message: "Uploading encrypted content… {percent}%",
                values: {
                  percent: Math.round(p.percentage),
                },
              }),
          },
        );
      setProgress({ message: "Finalizing your artifact…" });
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
      setError(errorMessage(cause, locale));
      if (reservation)
        void api("/api/artifacts/revoke", {
          id: reservation.id,
          managementToken: reservation.managementToken,
        }).catch(() => {});
    } finally {
      session?.close();
      setBusy(false);
      setProgress(null);
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(result!.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(t("Could not copy. Select and copy the link below."));
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
    a.download = t("artifact-revocation.json");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (result)
    return (
      <section className="success-card">
        <span className="success-icon">
          <CheckCheck size={30} />
        </span>
        <p className="eyebrow">{t("READY TO SHARE")}</p>
        <h2>{revoked ? t("Artifact revoked.") : t("The secret is yours.")}</h2>
        <p className="muted">
          {revoked
            ? t(
                "New deliveries have been blocked. Content deletion will finish in the background.",
              )
            : t(
                "Share the link. Send the password through another channel and keep it safe: the service cannot recover it.",
              )}
        </p>
        <div className="share-box">
          <Link2 size={18} />
          <input
            aria-label={t("Artifact link")}
            value={result.url}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button
            className="icon-button"
            aria-label={t("Copy link")}
            onClick={copyLink}
          >
            {copied ? <Check size={18} /> : <Copy size={18} />}
          </button>
        </div>
        <div className="result-password">
          <label htmlFor="created-password">
            {t("Your password — available only on this screen")}
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
              aria-label={
                showPassword ? t("Hide password") : t("Show password")
              }
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={t("Copy password")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(result.recipientPassword);
                } catch {
                  setError(t("Select and copy the password manually."));
                }
              }}
            >
              <Copy size={17} />
            </button>
          </div>
          <p className="field-help">
            {t(
              "Copy the password before closing this screen and send it through another channel. It was not sent to the server.",
            )}
          </p>
        </div>
        <p className="small muted">
          {t(
            "Expires on {date}. Opening the page does not consume a delivery.",
            { date: new Date(result.expiresAt).toLocaleString(locale) },
          )}
        </p>
        <div className="recovery-note">
          <KeyRound size={20} />
          <div>
            <strong>{t("Keep your revocation credential")}</strong>
            <p>
              {t(
                "It lets you block the artifact before its deadline. Keep this file safe.",
              )}
            </p>
            <button className="text-button" onClick={saveRecovery}>
              <Download size={15} /> {t("Save credential")}
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
            {t("Create another artifact")} <ArrowRight size={17} />
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
                setError(errorMessage(e, locale));
              }
            }}
          >
            <Trash2 size={16} /> {t("Revoke now")}
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {errorMessage(error, locale)}
          </p>
        )}
      </section>
    );

  return (
    <form onSubmit={submit} className="composer-layout">
      <section className="composer-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">{t("NEW ARTIFACT")}</p>
            <h2>{t("What would you like to share?")}</h2>
          </div>
          <span className="step-label">01 / 02</span>
        </div>
        <div className="tabs" role="tablist" aria-label={t("Artifact type")}>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "message"}
            className={kind === "message" ? "active" : ""}
            onClick={() => setKind("message")}
            disabled={busy}
          >
            <FileText size={17} /> {t("Message")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === "file"}
            className={kind === "file" ? "active" : ""}
            onClick={() => setKind("file")}
            disabled={busy}
          >
            <File size={17} /> {t("File")}
          </button>
        </div>
        {kind === "message" ? (
          <div className="message-input">
            <label className="sr-only" htmlFor="message">
              {t("Your message")}
            </label>
            <textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t(
                "A message that only needs to reach the right person…",
              )}
              maxLength={MAX_MESSAGE_BYTES}
              disabled={busy}
              required
            />
            <div className="input-caption">
              <span>
                {t("Content is encrypted before it leaves this device.")}
              </span>
              <span>
                {t(
                  message.length === 1
                    ? "{count} character"
                    : "{count} characters",
                  {
                    count: message.length.toLocaleString(locale),
                  },
                )}
              </span>
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
              <strong>{file ? file.name : t("Choose a file")}</strong>
              <span>
                {file
                  ? t("{size} MB · click to change", {
                      size: (file.size / 1024 / 1024).toLocaleString(locale, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      }),
                    })
                  : t("Any format, up to {size} MB", { size: maxFileMB })}
              </span>
              <span className="file-select">
                {t("Select file")} <ArrowRight size={15} />
              </span>
            </label>
          </div>
        )}
        <div className="password-section">
          <div className="field-title">
            <label htmlFor="password">
              <KeyRound size={17} /> {t("Access password")}
            </label>
            <span>{t("Required")}</span>
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
                placeholder={t("A long passphrase or generated password")}
                disabled={busy}
              />
              <button
                type="button"
                aria-label={
                  showPassword ? t("Hide password") : t("Show password")
                }
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
              <RefreshCw size={15} /> {t("Generate")}
            </button>
          </div>
          <p className="field-help">
            {t(
              "At least 12 characters. Your password is processed in your browser and is not sent to the API.",
            )}
          </p>
        </div>
        {account && (
          <div className="slug-section">
            <label htmlFor="slug">
              {t("Custom address")}{" "}
              <span className="muted">{t("(optional)")}</span>
            </label>
            <div className="slug-input">
              <span>/{account.username}/</span>
              <input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}"
                maxLength={48}
                placeholder={t("random-identifier")}
                disabled={busy}
              />
            </div>
            <p className="field-help">
              {t(
                "ASCII letters, numbers, hyphens and underscores; up to 48 characters. The address is permanent and cannot be reused.",
              )}
            </p>
          </div>
        )}
        <div className="local-note">
          <ShieldCheck size={17} />
          <span>
            {t("Message, filename and content protected on your device.")}
          </span>
        </div>
      </section>
      <aside className="policy-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">{t("YOUR RULES")}</p>
            <h2>{t("Until when?")}</h2>
          </div>
          <Clock3 size={21} className="muted" />
        </div>
        <p className="policy-intro">{t("Choose when sharing should end.")} </p>
        <label htmlFor="ttl">{t("Lifetime")}</label>
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
            aria-label={t("Lifetime unit")}
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
            <option value="minutes">{t("minutes")}</option>
            <option value="hours">{t("hours")}</option>
            <option value="days">{t("days")}</option>
          </select>
        </div>
        <p className="field-help">{t("From 1 minute to 7 days.")}</p>
        <div className="divider" />
        <label htmlFor="views">
          {t("Access limit")} <span className="muted">{t("(optional)")}</span>
        </label>
        <div className="views-input">
          <Eye size={17} />
          <input
            id="views"
            type="number"
            min="1"
            max="100"
            step="1"
            placeholder={t("No additional limit")}
            value={views}
            onChange={(e) => setViews(e.target.value)}
            disabled={busy}
          />
        </div>
        <p className="field-help">
          {t(
            "Each authorized delivery counts as one access. An interrupted connection may consume it.",
          )}
        </p>
        {account && (
          <>
            <div className="divider" />
            <label htmlFor="failures">
              Kill-switch <span className="muted">{t("(optional)")}</span>
            </label>
            <div className="views-input">
              <ShieldCheck size={17} />
              <input
                id="failures"
                type="number"
                min="1"
                max="100"
                step="1"
                placeholder={t("Disabled")}
                value={failures}
                onChange={(e) => setFailures(e.target.value)}
                disabled={busy}
              />
            </div>
            <p className="field-help">
              {t(
                "Deletes the artifact when this total number of failures is reached, without resetting after successful attempts. Abandoned or interrupted checks count after 2 minutes. Anyone with the link can deliberately trigger deletion.",
              )}
            </p>
          </>
        )}
        <p className="field-help">
          {t(
            "Content, address and rules cannot be changed after creation. You can block and remove the artifact.",
          )}
        </p>
        <div className="policy-summary">
          <span className="status-dot" />
          <p>
            {t(
              "Access ends at whichever comes first: the deadline, delivery limit or kill-switch, when set.",
            )}
          </p>
        </div>
        <button
          type="submit"
          className="button primary create-button"
          disabled={busy || !configured}
        >
          {busy ? (
            <>
              <span className="spinner" /> {t("Protecting…")}
            </>
          ) : (
            <>
              <LockKeyhole size={17} /> {t("Create secure link")}{" "}
              <ArrowRight size={17} />
            </>
          )}
        </button>
        <p className="submit-note">
          {account
            ? t("Created as @{username}", { username: account.username })
            : t("No account. No plaintext content on the server.")}
        </p>
        {busy && (
          <p className="progress" role="status">
            {progress && t(progress.message, progress.values)}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {errorMessage(error, locale)}
          </p>
        )}
        {!configured && (
          <p className="setup-note">
            {t(
              "Sharing will be enabled once storage and service keys have been configured.",
            )}
          </p>
        )}
      </aside>
    </form>
  );
}
