import { getI18n } from "@/lib/i18n/server";
import { ArrowDown, CircleCheck, Fingerprint, Timer } from "lucide-react";
import { CreateForm } from "@/components/create-form";
import { configurationStatus } from "@/server/config";
export default async function Home() {
  const { t } = await getI18n();
  const configured = configurationStatus().sharing;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="tiny-line" />{" "}
            {t("PRIVATE BY PRINCIPLE. TEMPORARY BY CHOICE.")}
          </p>
          <h1>
            {t("Share the moment.")} <br />
            <span>{t("Let the rest disappear.")}</span>
          </h1>
          <p className="hero-description">
            {t("A message, a file, a secret.")} <br />
            {t("You choose who can open it — and until when.")}
          </p>
          <div className="hero-pills">
            <span>
              <Fingerprint size={15} /> {t("Password stays in your browser")}
            </span>
            <span>
              <Timer size={15} /> {t("A deadline you control")}
            </span>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="artifact-shape">
            <div className="artifact-lines">
              <i />
              <i />
              <i />
            </div>
            <div className="artifact-seal">
              <Fingerprint size={47} strokeWidth={1.2} />
            </div>
            <span>{t("PROTECTED ACCESS")}</span>
          </div>
          <span className="floating-tag tag-top">
            <span className="status-dot" /> {t("Encrypted here")}
          </span>
          <span className="floating-tag tag-bottom">
            <CircleCheck size={14} /> {t("Only with your password")}
          </span>
          <span className="art-coordinate">01 — 256 BIT</span>
        </div>
      </section>
      <section className="section-intro">
        <span>
          {t("START HERE")} <ArrowDown size={14} />
        </span>
        <p>{t("Private content. Clear rules.")}</p>
      </section>
      <CreateForm configured={configured} />
      <section className="assurances">
        <article>
          <span>01</span>
          <div>
            <h3>{t("Protected before it leaves")}</h3>
            <p>
              {t(
                "Encryption happens in your browser. The service receives content that is already encrypted.",
              )}
            </p>
          </div>
        </article>
        <article>
          <span>02</span>
          <div>
            <h3>{t("A password before delivery")}</h3>
            <p>
              {t(
                "Authentication happens before download. Knowing the link is not enough.",
              )}
            </p>
          </div>
        </article>
        <article>
          <span>03</span>
          <div>
            <h3>{t("An end you define")}</h3>
            <p>
              {t(
                "Once the deadline or limit is reached, new deliveries are blocked and deletion is scheduled.",
              )}
            </p>
          </div>
        </article>
      </section>
    </>
  );
}
