import Link from "next/link";
import {
  ArrowUpRight,
  KeyRound,
  LockKeyhole,
  Network,
  ShieldAlert,
} from "lucide-react";
import { getI18n } from "@/lib/i18n/server";

export async function WhySection() {
  const { t } = await getI18n();
  return (
    <section
      id="why"
      className="why-section"
      aria-labelledby="why-title"
      tabIndex={-1}
    >
      <div className="why-intro">
        <div>
          <p className="eyebrow">{t("WHY EFEMERO")}</p>
          <h2 id="why-title">
            {t("Your content deserves another layer of privacy.")}
          </h2>
        </div>
        <p className="why-lead">
          {t(
            "HTTPS protects the connection. Efemero adds encryption to the message or file itself, in your browser, before upload.",
          )}
        </p>
      </div>
      <div className="why-context">
        <h3>{t("When HTTPS is inspected")}</h3>
        <p>
          {t(
            "On some networks, proxies and security agents use a certificate authority trusted by the device to inspect HTTPS connections. When they mediate a connection this way, they can read its requests and responses, even when the browser shows a secure connection.",
          )}
        </p>
        <p>
          {t(
            "With Efemero's code delivered intact, the artifact travels already encrypted. Observing that traffic alone does not reveal the message, file or original filename. The recipient uses the password to open the content in their browser.",
          )}
        </p>
      </div>
      <ol
        role="list"
        className="why-flow"
        aria-label={t("How the extra layer works")}
      >
        <li>
          <LockKeyhole size={21} aria-hidden="true" />
          <h3>{t("Encrypt before sending")}</h3>
          <p>
            {t(
              "The message, file and original filename are encrypted on the sender's device.",
            )}
          </p>
        </li>
        <li>
          <Network size={21} aria-hidden="true" />
          <h3>{t("Transfer encrypted content")}</h3>
          <p>
            {t(
              "The service receives ciphertext. HTTPS also protects the connection carrying it.",
            )}
          </p>
        </li>
        <li>
          <KeyRound size={21} aria-hidden="true" />
          <h3>{t("Open with the password")}</h3>
          <p>
            {t(
              "Send the password through a separate, trusted channel. The recipient decrypts locally.",
            )}
          </p>
        </li>
      </ol>
      <div className="why-limits">
        <ShieldAlert size={23} aria-hidden="true" />
        <div>
          <h3>{t("The browser and the code must also be trusted.")}</h3>
          <p>
            {t(
              "An intermediary that changes the site's code can capture the password and content before encryption. Extensions or agents with access to the device may also capture them.",
            )}
          </p>
          <p>
            {t(
              "Efemero does not guarantee bypassing monitoring. Metadata such as the domain, IP addresses, timing and traffic volume can still be visible. Copies already received cannot be erased remotely.",
            )}
          </p>
          <Link className="why-details" href="/sobre">
            {t("Explore our protection and its limits")}{" "}
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
