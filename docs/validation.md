# Validation — 2026-10-17

## Results

- TypeScript: no errors.
- Next.js production build: completed, including the cryptographic Web Worker and API routes.
- Vitest: 32 tests; default execution with PGlite and CI with real PostgreSQL 17. Includes a daily queue larger than one deletion batch.
- Formatting: Prettier and `git diff --check` passed.
- `npm audit --omit=dev`: no known vulnerabilities reported by the registry on this date. This is not a cryptographic audit.
- HTTP against a local production server: home, retrieval, information, revocation, and account pages responded; the per-response nonce CSP was compatible with rendered scripts; no-storage and frame-blocking headers were present.
- HTTP: external Origin rejected; GET access to the delivery endpoint rejected; missing credentials disabled sharing without returning the envelope or content.

## Behaviors exercised

Actual OPAQUE registration and authentication, stable export-key recovery, incorrect passwords, artifact isolation, authentication before storage reads, encrypted key envelope, payload integrity, incorrect key and context, replay, concurrent final access, expiration without cron, handshake expiration, concurrent revocation, idempotency, deletion failure and retry, late writes after purge, upload authorization, and owner scoping. Final access also removes the OPAQUE record and envelope from the database.

Real PostgreSQL uses independent connections to test concurrency. The in-memory storage adapter replaces only the object provider; tests do not mock cryptography. Separate HTTP-boundary tests use mocks to verify that a rejected proof never triggers an object read.

## Repository access

Access to `toruticas/efemero` was granted on 2026-10-17. Both the integration and CLI confirmed private visibility and write permission. The initial remote commit, containing only the README title, was incorporated into local history while retaining the application's complete README.

## Production and real browser

- HTTPS at `efemero.rafael.run`: 200 response with validated certificate, nonce-based CSP, and `no-store`. Home page had no JavaScript errors in Chromium.
- Git integration: a push to `main` automatically created a production deployment in `iad1`; no manual deployment was needed.
- Message: actual OPAQUE registration, Worker encryption, private upload, and commit. Opening in another browser context correctly recovered the text. An incorrect password produced no delivery. Observed requests contained neither the password nor plaintext; the link had no fragment.
- File: actual upload, original-name recovery, and download with bytes identical to the synthetic input. Revocation returned 200 and a new attempt with the correct password was blocked.
- Single-release limit: the first authorized delivery worked; a subsequent attempt received 404 at authentication start, without calling the delivery endpoint. The database confirmed removal of the OPAQUE record and envelope in `exhausted` state.
- One-minute lifetime: a new attempt after expiration received 404 without delivery, before any post-deadline cleanup. Access blocking does not depend on cron.
- Cleanup: a call without credentials received 403; a call with the configured secret received 200 and processed the queue. Upload safety windows remained respected.
- Mobile viewport in Chromium: no horizontal page scrolling, creation form and button visible, and no JavaScript errors. This is not a real Safari/iPhone test.

Browser execution exposed an incompatibility between the initial CSP and the SDK upload endpoint, `https://vercel.com/api/blob/`. CSP was corrected to allow only that path and its form without a trailing slash; the actual upload passed after the fix. Script execution remains nonce-restricted.

## Outstanding checks

- Clerk: the five CNAMEs were configured on 2026-10-19 and public DNS is correct. Clerk DNS and HTTPS were activated on 2026-10-19; the sign-in form renders in production. Validate sign-up, sign-in, session, username, and history with a real account.
- Confirm automatic daily scheduler execution. The route and its authorization were tested manually; the test did not wait for the next daily window.
- Exercise real Safari/iOS and maximum-size transfers on mobile networks before expanding use.

Tests used only synthetic artifacts. They do not prove providers' internal retention, backup, or cache timelines. Vercel remains on Hobby; no upgrade to a paid plan was performed.

## Account-area update — 2026-10-18

- Migration `002_account_controls` applied to production Neon transactionally, with an advisory lock, before code deployment. No changes to existing artifact policies or cryptographic material.
- 46 tests passed with real PostgreSQL 17 and concurrent connections. New cases cover 2/5 MiB limits, HTTP and service account scoping, database-enforced immutable usernames, pagination beyond 100 records, aggregate counters, invalid-proof replay, pending-challenge budgets, accumulated failures, abandonment without cron, cleanup racing a valid proof, and multiple kill-switch batches.
- Type checking, formatting, and production build passed. Visual validation of real components in Chromium used a local server and simulated HTTP responses: onboarding, pagination, removal, custom ID, account-only kill-switch, and rejection of files above 2/5 MiB before any reservation. The table container was repositioned to prevent page overflow in a 390 px viewport.
- The dashboard shows authorized deliveries without claiming completed decryptions or reads. Page opens are aggregate estimates introduced in this update. No analytics cookies, recipient tracking, or plaintext history content were added.
- At this point, the real production browser still failed to load Clerk: a CORS error on the script served by `clerk.rafael.run` left the page without login fields. Exact Clerk DNS configuration was still required to verify sign-up/session and the authenticated dashboard end to end in production; dashboard tests with simulated responses did not replace that verification.
- Deployment `f497122` completed on the production domain. CI [39083399770](https://github.com/toruticas/efemero/actions/runs/39083399770) passed, including real PostgreSQL tests and build.
- Chromium against production: a binary file of exactly 2 MiB was created using OPAQUE/private Blob; an incorrect password concluded with a rejected proof (404), the correct password was authorized (200), the original name was recovered in the browser, and the download matched byte for byte. The one-delivery limit blocked another start (404). A file over 2 MiB was rejected in the browser without a reservation; a ciphertext reservation above the anonymous budget was rejected by the API (400). `/api/account` without a session returned 401. API calls included neither the password nor original filename, and the browser recorded no JavaScript errors. QA artifacts were revoked or exhausted for removal through the normal flow.

## Clerk DNS — 2026-10-19

The following entries preserve the sequence of observations; later checks supersede earlier DNS, TLS, and rendering failures.

- Exact values came from Clerk's generated prompt, including application-specific DKIM and mail targets. Before the change, none of the five CNAMEs existed; Vercel returned a wildcard response.
- The official CLI was authenticated as `toruticascom`; project `efemero` and team `vercel-toruticascos-projects` were confirmed before individual record creation. All five records were created successfully. No paid plan or service was purchased.
- Vercel API verification: 21 records total; the previous 16 retained IDs, names, types, values, TTLs, MX priorities, and comments. DMARC remained `p=quarantine`.
- A public DNS resolver returned the five expected CNAME targets and Vercel nameservers. No explicit records for those names had incorrect values; all five were missing.
- First browser test after the change: `/sign-in` returned 200 but the Clerk script still failed. An HTTPS request to the script confirmed an upstream TLS error without disabling certificate verification. The owner was asked to repeat domain verification in Clerk; neither the form nor authenticated session was considered validated at that stage.
- The owner reported completing Clerk verification. The immediately following test still received `SSLV3_ALERT_HANDSHAKE_FAILURE` from the HTTPS upstream at `clerk.rafael.run`, so certificate activation was not yet proven. Public CNAMEs remained correct.
- Official Clerk documentation confirmed an explicit **Deploy certificates** step after the production checklist. Public CAA records permitted LetsEncrypt (`letsencrypt.org`) and Google Trust Services (`pki.goog`) in addition to the existing issuer; they were neither removed nor changed. The owner was asked to complete Clerk certificate activation.
- Later recheck: `clerk.browser.js` returned 200 with a JavaScript content type and allowed CORS. Chromium rendered identifier and password fields and the continue button. Tests did not disable TLS verification.
- Actual loading exposed Clerk Protect CSP violations: `blob:` workers and HTTPS probes on ports beyond 443. Only `/app`, `/sign-in`, and `/sign-up` were adjusted according to [Clerk's CSP documentation](https://clerk.com/docs/guides/secure/best-practices/csp-headers). Public pages retain same-origin workers only. Optional SDK telemetry was disabled; abuse protections remain enabled. Policy tests cover both route groups and similar prefixes.
- Type checking, 47 local tests, and production build passed after the CSP adjustment. A real user's form submission and authenticated session were not automated.

## Standalone adapters — 2026-10-19

- Added selectable Neon, standard PostgreSQL TCP, and SQLite database adapters, plus local ciphertext storage. Managed defaults remain Neon and private Vercel Blob; no production environment variables, DNS, service plans, or PostgreSQL migrations were changed for this feature.
- The same lifecycle suite passed locally with PGlite and SQLite. The expanded suite has 65 tests, covering the existing OPAQUE/authorization invariants plus disk quotas, atomic upload visibility, no overwrite, path/symlink rejection, interrupted-upload cleanup, local-upload authorization, deployment configuration, persistent SQLite reopening, and async transaction isolation.
- A clean Docker build succeeded without application/provider credentials. The image ran with `--network none` and completed actual OPAQUE registration, local private upload, incorrect-password rejection, decryption, single-use proof enforcement, concurrent final access, and a one-minute expiration before cleanup.
- An artifact and its cryptographic secrets survived a container restart with the same volume. Explicitly acknowledged in-memory mode completed the same core flow and lost its database state on restart as documented; starting memory mode without opt-in was refused.
- Chromium against the standalone image created and recovered a file of exactly 2 MiB. The downloaded bytes and original filename matched. A second access was blocked by its one-release limit. No JavaScript errors, CSP violations, external requests, or artifact passwords/original filenames in JSON API calls were observed. Account navigation was absent and the disabled sign-in page loaded without Clerk requests.
- Automated CI now includes the SQLite suite and an offline Docker smoke job. The Docker runner also checks container recreation with a preserved setup version and refusal to replace missing secrets beside an existing database. These are application-level checks, not power-loss, hardware, or independent cryptographic certification.
- The standalone guide documents a single persistent host/process, volume and secret retention, public HTTPS, the shared conservative rate-limit bucket outside Vercel, and orphaned disk ciphertext after in-memory metadata loss. S3/MinIO adapters and automatic backend migration are not implemented.

## Internationalization — 2026-10-19

- Added Brazilian Portuguese and English without locale segments in shared links or additional runtime dependencies. A validated language-only preference cookie overrides weighted browser preferences; unsupported preferences fall back to Brazilian Portuguese. Clerk's UI localization is selected only in the existing account route group.
- Type checking, formatting, 70 tests with PGlite, and the same 70 tests with SQLite passed. New tests cover language negotiation, cookie precedence and rejection, catalog placeholder parity, interpolation, known-message translation, internal-error redaction, and localized API responses with unchanged status, code and no-store headers. Public API error messages are constrained to catalog keys at compile time.
- A clean standalone Docker build completed without application/provider credentials. Its offline smoke verified real OPAQUE creation/decryption, wrong-password rejection, private upload, replay and final-access protection, persistence across restart/recreation, missing-secret refusal, and explicitly acknowledged in-memory data loss.
- Chromium against the production-mode standalone image verified browser-language detection, explicit-language persistence, translated titles, preserved draft message/password and creation-result state when switching language, and unchanged artifact URLs. An English-created message was recovered in Portuguese without altering user content. A Portuguese-created file of exactly 2 MiB was downloaded in English with identical bytes and original filename. Wrong-password and exhausted-artifact errors, revocation, safety explanations, 404 and disabled-account pages rendered in the selected language. Both languages fit a 390-pixel viewport. No JavaScript errors, CSP violations, external requests, or plaintext password/message/filename in JSON API requests were observed.
- Browser tests of disabled authentication do not validate a real Clerk user session. Language selection does not localize user-provided content, change account identity, or modify cryptographic identifiers or request schemas. See [internationalization](internationalization.md) for maintenance and browser-native dialog limitations.

## System color scheme — 2026-10-20

- Added a CSS-driven light/dark palette using `prefers-color-scheme`, native `color-scheme`, and `light-dark()` colors. The document also advertises matching browser-toolbar colors. Current browsers supporting these standard CSS features apply the system preference before hydration and update it live; no theme cookie, local storage, tracking, JavaScript listener, or runtime dependency was added.
- Adapted page and card surfaces, inputs, placeholders, focus, buttons, notices, artifact results, decrypted content, dashboard tables and state badges. Clerk's appearance variables share the same palette in the existing account route group, including account popovers and modal backdrops.
- Type checking, the 70-test regression suite, and a clean standalone Docker build passed. Chromium verified dark initial rendering, live changes to light and back, preserved draft/password and decrypted-content state, and an actual encrypted sharing flow in dark mode. Main text, input and primary-button contrast exceeded 7:1; helper text exceeded 4.5:1 against its dark card surface. Informational, revocation, 404 and disabled-account pages, plus a 390-pixel viewport, were checked. No JavaScript errors or CSP violations were observed. These checks do not replace real-account session validation or a full accessibility audit.
