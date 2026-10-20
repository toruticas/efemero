import { getI18n } from "@/lib/i18n/server";
export async function generateMetadata() {
  const { t } = await getI18n();
  return { title: t("Protection and limits") };
}
export default async function About() {
  const { t } = await getI18n();
  return (
    <article className="about-page">
      <p className="eyebrow">{t("HOW IT WORKS")}</p>
      <h1>{t("Privacy with clear rules.")}</h1>
      <h2>{t("Content is protected in your browser")}</h2>
      <p>
        {t(
          "Messages, original filenames and files are encrypted before upload. A random key protects each artifact. The OPAQUE protocol lets you use your password to authenticate and recover that key without sending the original password to the API.",
        )}
      </p>
      <h2>{t("The link is an address")}</h2>
      <p>
        {t(
          "To receive content, the recipient must prove they know the password. The link contains neither the password nor a secret key. Send the password through a separate channel and prefer a generated password or a long passphrase.",
        )}
      </p>
      <h2>{t("The deadline blocks new deliveries")}</h2>
      <p>
        {t(
          "When the deadline or delivery limit is reached, the service blocks new deliveries. A daily job removes content in the background, retrying when needed. The infrastructure may take some time to remove all internal copies and caches.",
        )}
      </p>
      <h2>{t("One access means one authorized delivery")}</h2>
      <p>
        {t(
          "Opening the page does not consume an access. A delivery is counted before the transfer starts. An interrupted connection may consume it. We cannot prove a person read the content or erase copies already received.",
        )}
      </p>
      <h2>{t("Optional kill-switch for your account")}</h2>
      <p>
        {t(
          "At creation, you can choose deletion after a total number of failures. Successful attempts do not reset this total. Abandoned or interrupted checks count after 2 minutes. Anyone with the link can deliberately trigger deletion. Blocking is permanent; physical removal follows the daily cleanup. Content, address and rules cannot be edited.",
        )}
      </p>
      <h2>{t("Small files, simple sharing")}</h2>
      <p>
        {t(
          "Anonymous links accept files up to 2 MB. In your signed-in space, the limit is 5 MB. Messages can be up to 256 KB.",
        )}
      </p>
      <h2>{t("Passwords and infrastructure also have limits")}</h2>
      <p>
        {t(
          "A compromise that obtains the server's OPAQUE secrets and records may enable offline password guessing. The service operator also has the technical ability to test guesses. A compromised browser or website code can capture data during use. OPAQUE does not eliminate these conditions.",
        )}
      </p>
      <h2>{t("Accounts and history")}</h2>
      <p>
        {t(
          "Clerk handles sign-in. History keeps addresses, sizes, dates, status and aggregate counters, without plaintext content or filenames. Usernames cannot be changed. Page opens are estimates, including reloads and possible bots; authorized deliveries do not prove decryption or reading. We do not store recipient history. The link between history and the account is removed 30 days after content deletion. The address stays reserved to prevent old links from pointing to another artifact.",
        )}
      </p>
      <h2>{t("Anonymous sharing")}</h2>
      <p>
        {t(
          "No account is required. Infrastructure still processes information such as IP addresses, sizes and timestamps. The application uses HMAC-derived identifiers for request limits; providers may keep their own operational logs. Keep the revocation credential provided at creation.",
        )}
      </p>
    </article>
  );
}
