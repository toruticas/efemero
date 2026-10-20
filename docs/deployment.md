# Configuration and deployment

This guide describes the existing managed Vercel/Neon deployment. For Docker, SQLite, local storage, and disabled account authentication, use the [self-hosting guide](self-hosting.md). The standalone configuration is separate and does not replace these production resources.

## Private repository

The owner's repository is [`toruticas/efemero`](https://github.com/toruticas/efemero). Keep visibility **Private** and authorize integrations for this repository only when possible. Verify `private: true` through the API before pushing code. Do not copy `.env.local`, tokens, or CLI authentication directories into the repository.

## Primary domain

The chosen domain is **efemero.rafael.run**, entirely ASCII and without an accent. The product and project name is **Efemero**.

Set `APP_ORIGIN=https://efemero.rafael.run` only in production. Use that same application origin when configuring Clerk origins and callbacks.

Associate this hostname with the `efemero` project and obtain the DNS records and any ownership challenges returned by Vercel. Do not use a generic CNAME target. Association is complete only after checking DNS, the HTTPS certificate, and application flows at that address.

Project `prj_VQR4e2oJNhmkv8lgCe4dpQ3RSLAC` belongs to team `team_iE6kuuhAKPwML0NhvJVmmrPj` (`vercel-toruticascos-projects`). `efemero.rafael.run` is associated, verified, and published over HTTPS. Automatic deployment of `70f304a` was confirmed as `dpl_FrW5sgL2LhPw4yQNEmwaxaqbSqy4`; anonymous deliveries were exercised in Chromium against the actual services.

## Provisioning status

- Neon: project `old-tooth-31877519`, branch `br-morning-sound-b8fxg85q` (`production`), database `efemero`, PostgreSQL 17 in `aws-us-east-1`. Migration `001_initial` was applied transactionally through the authenticated integration and confirmed in the version table. Connection pooling is enabled and restore history is configured to zero. This does not prove the absence of all provider backups.
- Blob: store `store_UDExr0Rlu7Ri4KZG` (`efemero-production`), private access, region `iad1`.
- Sharing-service variables are configured only in production, including OPAQUE secrets and the database connection. The Blob token is restricted to production and marked sensitive. Upload, commit, read, and download were validated through the deployed application without copying that token to the browser.
- Clerk is installed for the team: configuration `icfg_HRrgUWb30vz3mQ90d8bPt7gr`, Hobby plan, product `clerk-alizarin-grass`. Both Clerk keys reached the project for production and preview. The configured Frontend API is `clerk.rafael.run`. On 2026-10-19, the five required CNAMEs were created through the official CLI and checked through Vercel's API and public DNS. The owner reported completing DNS verification in Clerk. The Frontend API script returns 200 over HTTPS and the sign-in form rendered in Chromium; sign-up and a real-account session still require testing.
- The Hobby plan is unchanged. Cron `0 3 * * *` schedules daily cleanup, processing multiple batches within an execution budget; its response reports `limited: true` when time or batch limits leave work remaining. Deletion initialization uses a batched SQL operation. Expiration blocks new access immediately and independently of the scheduler.

The migration script uses the default `@next/env` import, compatible with ESM execution on Node.js 24. The application's WebSocket connection to Neon was validated in production. Do not copy local secrets into documentation or Git.

## Region

`vercel.json` configures Functions in `iad1` (US). Configure Neon and Blob in compatible nearby regions before deployment. The development environment's region is independent; setting the Functions region does not guarantee residency of all data. Identity, logs, backups, and caches have separate provider settings.

## Neon

Create a separate production project and database. Use Neon's connection address in `DATABASE_URL`; the adapter uses `@neondatabase/serverless` with WebSocket connections for interactive transactions. Each release operation checks the primary database record, not a replica or cache.

Run `npm run db:migrate` with the target environment's configuration. The script uses a transaction, a migration lock, and a version table. Errors are reported without printing the database URL. Confirm the effective target privately before execution; see the [development environment precautions](../README.md#prerequisites-and-a-separate-environment).

## Private Blob storage

Create a dedicated **Private** store in the chosen region. Set `BLOB_READ_WRITE_TOKEN` on the server only. Storage access must never use a `NEXT_PUBLIC_*` variable.

The browser receives PUT permission for one reserved path, with no overwrite, valid for up to 15 minutes and bounded by the declared size. Commit inspects the object at the server-computed path; client-provided URLs are not accepted. A public-store configuration is rejected during upload validation.

Uploads use the `artifacts/` prefix. Cleanup maintains an inventory cursor to remove files that reappear after deletion, including late transfers. Do not reuse this prefix in another application.

## Service secrets

Run `npm run setup:secrets` in a trusted environment. Configure generated values through Vercel's secret-management channel without pasting them into issues, code, commits, or logs.

| Variable               | Purpose                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `APP_ORIGIN`           | Canonical HTTPS origin for the environment; validates Origin and binds the OPAQUE context. |
| `OPAQUE_SERVER_SETUP`  | Secret OPAQUE library configuration, including OPRF material and the server private key.   |
| `OPAQUE_SETUP_VERSION` | Setup version; starts at `1`.                                                              |
| `HANDSHAKE_SEAL_KEY`   | Base64url-encoded 32-byte AES key to protect temporary database state.                     |
| `RATE_LIMIT_HMAC_KEY`  | Independent key to pseudonymize rate-limit identifiers.                                    |
| `CRON_SECRET`          | Cleanup-job authentication.                                                                |

Keep protected secret backups while dependent artifacts exist. The current version rejects new handshakes when the setup version differs from the one used at creation. It does not implement automatic migration or a keyring of old seeds: do not replace the setup while artifacts are active. For a planned MVP rotation, wait for artifacts to expire before replacing it. Rotating the state-sealing key invalidates ongoing authentication. A suspected compromise requires incident handling rather than simply waiting for a planned rotation.

Provision separate secrets, database, and store for each environment. A preview must not share production credentials; existing preview Clerk keys alone do not constitute complete preview provisioning.

## Clerk

Create a Clerk application and configure `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`. Set sign-in and sign-up URLs to `/sign-in` and `/sign-up`, targeting `/app`. Register allowed origins and callbacks in Clerk.

In Vercel's native integration, installing Clerk for a team and connecting its resource to a project are separate steps. In the team dashboard, open **Integrations → Clerk** and the created Clerk resource. On **Projects**, choose **Connect Project**, select `efemero`, and confirm **Connect**, without a custom variable prefix. If no resource exists, create an `efemero` application on Hobby with the production application domain `efemero.rafael.run` before connecting it. The connection synchronizes keys by environment. Check the resource's production-domain configuration and Clerk DNS before deployment.

References: [Clerk installation and linking](https://clerk.com/docs/guides/development/integrations/platforms/vercel-marketplace), [connecting a resource to a Vercel project](https://vercel.com/docs/integrations/install-an-integration/product-integration). Installing the Vercel plugin in ChatGPT does not itself install or connect this resource.

### Clerk DNS

The application remains at `efemero.rafael.run`. Clerk's primary domain is `rafael.run`, with Frontend API at `clerk.rafael.run` and portal at `accounts.rafael.run`. Names below are relative to `rafael.run`; all use CNAME, a 60-second TTL, and no proxy.

| Name              | Target                              |
| ----------------- | ----------------------------------- |
| `accounts`        | `accounts.clerk.services`           |
| `clerk`           | `frontend-api.clerk.services`       |
| `clk._domainkey`  | `dkim1.xx88d1upb0a2.clerk.services` |
| `clk2._domainkey` | `dkim2.xx88d1upb0a2.clerk.services` |
| `clkmail`         | `mail.xx88d1upb0a2.clerk.services`  |

All five records were missing; previously observed IPs came from Vercel's wildcard response. Creating records individually preserved the 16 preexisting records, including the DMARC TXT value `v=DMARC1; p=quarantine`. Do not weaken the existing DMARC policy. Confirmed nameservers: `ns1.vercel-dns.com` and `ns2.vercel-dns.com`.

After saving records, repeat verification in **Clerk → Domains → Configure** and complete **Deploy certificates** in the Overview / production checklist. This Clerk step enables the instance's HTTPS; see the [certificate documentation](https://clerk.com/docs/guides/development/deployment/production#deploy-certificates). DNS acceptance by Vercel does not prove certificate issuance or Clerk domain activation. Check Frontend API HTTPS and form loading before considering sign-in available.

The connector's zone-import operation returned errors without changing records. This configuration used individual `vercel dns add` commands with an explicit team and separate CLI session. Authentication directories and the private zone backup stay outside the repository.

The Clerk provider and scripts are confined to the account area; shared-artifact pages do not load that provider. Optional SDK telemetry is disabled. Only `/app`, `/sign-in`, and `/sign-up` allow `blob:` workers and HTTPS connections to `*.protect.clerk.com` on extra ports required by Clerk's abuse protection. Scripts retain nonce and `strict-dynamic`, without production `unsafe-eval`. Usernames are maintained by the application and immutable, including database protection. Setting a username and viewing history require verified backend identity.

## Cleanup and limits

`/api/cron/cleanup` requires `Authorization: Bearer <CRON_SECRET>`. Cron `0 3 * * *` schedules one daily execution, compatible with the owner's chosen Hobby plan. On that plan, timing can vary within the platform window. The routine removes objects whose deadline and safety window have elapsed and retries failed deletions; it does not deploy. Artifact access checks the deadline on every request, independently of cron. Deployments follow code changes on the default branch (`main`) through Git integration.

- New files: up to 2 MiB in anonymous mode and 5 MiB in the account area; messages: up to 256 KiB. The ciphertext budget allows up to 4 KiB of format overhead.
- Kill-switch: optional, 1 to 100 accumulated failures; abandoned challenges count after 2 minutes.
- Lifetime: 1 minute to 7 days, counted from the initial reservation.
- Releases: optional, 1 to 100; a lifetime always applies.
- Initial total capacity: 1 GiB reserved, including pending uploads not yet cleaned up.
- Account: up to 50 artifacts not yet purged.
- Creation: 5 reservations per hour per network identity and 100 per hour service-wide.
- Authentication: 30 starts per network identity per 15 minutes, 15 per artifact per 15 minutes, and 600 per minute service-wide.

Limits are conservative and defined in code in this version. On Vercel, network identity uses the platform-controlled header. Elsewhere, all clients share a conservative bucket rather than trusting client-supplied IP headers; adapting to another proxy requires explicit review.

Delivery is a streaming response of up to 60 seconds, without resumption. An interruption after authorization consumes a release. Object deletion waits for the delivery window and upload-permission expiration, with a margin; later inventory removes late writes. Account history stops listing artifacts 30 days after purge; their addresses remain reserved. See the [README](../README.md#what-remains-after-deletion) for residual metadata and provider-retention limitations.

## Account-area migrations

Apply `002_account_controls` before deploying the account-area update. The migration adds counters and failure policy, expands valid states, adds pagination/challenge indexes, and protects usernames with a trigger. Existing records receive zero counters and a disabled kill-switch. It does not change existing artifact addresses, passwords, content, TTLs, or rules. The migrator processes SQL files in order and records each version within the same transaction and advisory lock.

## Validation before public availability

Run CI and an actual test of creation, upload, retrieval in another browser, incorrect password, final access, expiration, and revocation against configured services. Check CSP and the actual Clerk flow. Automated tests use real OPAQUE and SQL but replace storage access with an in-memory adapter; they do not prove external Blob or Clerk configuration.

A build without credentials must succeed while leaving sharing disabled. Do not present an initial deployment as operational before completing tests against the actual services.
