"use client";
import type { Message } from "@/lib/i18n/messages";
import { errorMessage } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
  MAX_READ_CIPHER_BYTES,
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
  const { t, locale } = useI18n();
  const [password, setPassword] = useState(""),
    [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [payload, setPayload] = useState<ArtifactPayload | null>(null),
    [stage, setStage] = useState<{
      message: Message;
      values?: Record<string, string | number>;
    } | null>(null);
  const visited = useRef("");
  useEffect(() => {
    const path = `${namespace}/${slug}`;
    if (!configured || visited.current === path) return;
    visited.current = path;
    // Aggregate only: no visitor identifier, cookies or analytics SDK.
    void api("/api/artifacts/access/visit", { namespace, slug }).catch(
      () => {},
    );
  }, [configured, namespace, slug]);
  async function open(event: FormEvent) {
    event.preventDefault();
    setError("");
    let session: CryptoSession | undefined;
    try {
      validatePassword(password);
      setBusy(true);
      setStage({ message: "Validating your password without sending it…" });
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
      const proof = await session.run<{
        finishLoginRequest: string;
        rejected?: boolean;
      }>("login-finish", start);
      if (proof.rejected) {
        // A wrong password is detected locally. Finalize with an invalid random
        // proof so the server burns this attempt without receiving the password.
        await api("/api/artifacts/access/finish", {
          handshakeId: start.handshakeId,
          finishLoginRequest: proof.finishLoginRequest,
        }).catch(() => {});
        throw new Error(t("Incorrect password or unavailable artifact."));
      }
      setStage({ message: "Receiving encrypted content…" });
      const response = await fetch("/api/artifacts/access/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handshakeId: start.handshakeId, ...proof }),
        cache: "no-store",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || t("Artifact unavailable."));
      }
      const id = response.headers.get("x-artifact-id"),
        wrapped = response.headers.get("x-wrapped-key");
      if (id !== start.artifactId || !wrapped)
        throw new Error(t("Could not verify the delivery."));
      const reader = response.body!.getReader(),
        chunks: Uint8Array[] = [];
      let length = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > MAX_READ_CIPHER_BYTES) {
          await reader.cancel();
          throw new Error(t("Artifact exceeds the allowed size."));
        }
        chunks.push(value);
      }
      const ciphertext = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        ciphertext.set(chunk, offset);
        offset += chunk.length;
      }
      setStage({ message: "Decrypting on your device…" });
      const content = await session.run<ArtifactPayload>("decrypt", {
        artifactId: id,
        ciphertext: ciphertext.buffer,
        wrappedKey: JSON.parse(
          new TextDecoder().decode(fromBase64(wrapped)),
        ) as WrappedKey,
      });
      setPayload(content);
    } catch (cause) {
      setError(errorMessage(cause, locale));
    } finally {
      session?.close();
      setBusy(false);
      setStage(null);
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
    link.download = payload.name || t("file");
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
        <p className="eyebrow">{t("OPENED ON THIS DEVICE")}</p>
        <h1>
          {payload.kind === "message"
            ? t("A message for you.")
            : t("Your file is ready.")}
        </h1>
        {payload.kind === "message" ? (
          <pre className="decrypted-message">
            {new TextDecoder().decode(payload.data)}
          </pre>
        ) : (
          <div className="received-file">
            <strong>{payload.name}</strong>
            <span className="muted">
              {(payload.data.byteLength / 1024).toLocaleString(locale, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{" "}
              KB
            </span>
          </div>
        )}
        <div className="success-actions">
          <button className="button primary" onClick={download}>
            <Download size={17} />
            {payload.kind === "message"
              ? t("Save message")
              : t("Download file")}
          </button>
          <button className="button secondary" onClick={clear}>
            <X size={16} /> {t("Close content")}
          </button>
        </div>
        <p className="small muted">
          {t(
            "This content has already been delivered. Closing it does not guarantee you can open it again.",
          )}
        </p>
      </section>
    );
  return (
    <section className="viewer-card">
      <span className="viewer-icon">
        <LockKeyhole size={29} />
      </span>
      <p className="eyebrow">{t("SHARED WITH YOU")}</p>
      <h1>{t("You have the key.")}</h1>
      <p className="muted">
        {t(
          "Enter the password sent by the sender. Content is delivered only after authentication.",
        )}
      </p>
      <div className="artifact-address">
        /{namespace}/{slug}
      </div>
      <form onSubmit={open}>
        <label htmlFor="access-password">{t("Artifact password")}</label>
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
            placeholder={t("Enter the password you received")}
            disabled={busy}
          />
          <button
            type="button"
            aria-label={show ? t("Hide password") : t("Show password")}
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
              <span className="spinner" /> {t("Verifying…")}
            </>
          ) : (
            <>
              {t("Open artifact")} <ArrowRight size={17} />
            </>
          )}
        </button>
        {busy && (
          <p role="status" className="progress">
            {stage && t(stage.message, stage.values)}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {errorMessage(error, locale)}
          </p>
        )}
        {!configured && (
          <p className="setup-note">
            {t("The service is still being configured.")}
          </p>
        )}
      </form>
      <p className="viewer-footnote">
        <ShieldCheck size={16} />{" "}
        {t(
          "The password stays in your browser. Opening this page does not consume an access.",
        )}
      </p>
    </section>
  );
}
