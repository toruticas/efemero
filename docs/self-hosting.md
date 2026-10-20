# Self-hosting

Efemero can run on a single host without Clerk, PostgreSQL, Vercel, or a separate object-storage service. The standalone image contains the Next.js server, Node.js's built-in SQLite driver, and a private filesystem storage adapter. It performs the same OPAQUE authentication and browser-side encryption as the managed deployment.

The existing production deployment at `efemero.rafael.run` remains stateless Vercel Functions with Neon, private Vercel Blob, and Clerk. These standalone settings do not migrate or replace that deployment.

## Quick start with Docker Compose

Install Docker with Compose, clone the repository, and run:

```sh
docker compose up -d --build
```

Open <http://localhost:3000>. The default Compose file binds port 3000 to host loopback, disables account authentication, uses file-backed SQLite, and saves ciphertext on disk. No cloud account, external database, or preconfigured application secret is required.

On first startup, the entrypoint generates OPAQUE and service secrets and saves them in the named volume. It never prints their values. SQLite migrations run transactionally when the database is opened. An in-process task runs cleanup every five minutes; an external scheduler is optional.

Repository documentation and operational messages use English. The product interface supports Brazilian Portuguese and English, including installations without Clerk or external services. Language detection and selection require no additional configuration or dependency.

## Build and run without Compose

```sh
docker build -t efemero:local .
docker volume create efemero-data
docker run -d --name efemero \
  -p 127.0.0.1:3000:3000 \
  -v efemero-data:/data \
  efemero:local
```

The image runs as the unprivileged `node` user, UID 1000. Named volumes inherit the prepared directory ownership. When using a bind mount, prepare a directory writable by UID 1000 and restrict access; do not solve permission errors by making the directory world-writable.

The build context excludes `.env*`, Git history, local credentials, SQLite files, and local data. Secrets are created at runtime, not baked into image layers. A generic image can be reused for different installations; each installation needs its own data volume and secrets.

## Public deployment and TLS

For an internet-facing instance, terminate HTTPS at a reverse proxy and set the exact public origin:

```sh
APP_ORIGIN=https://share.example.com docker compose up -d --build
```

Keep the application port restricted to the proxy. Forward requests without caching artifact responses or logging request bodies, management-token headers, or OPAQUE messages. Configure proxy upload limits for the ciphertext allowance and timeouts compatible with the 60-second upload/delivery window.

Public HTTP origins are refused. Plain HTTP is allowed only for a standalone loopback origin (`localhost`, `127.0.0.1`, or `[::1]`). Browser Web Crypto requires a secure context; an arbitrary LAN HTTP address is not a supported workaround. The CSP omits automatic HTTPS upgrading only for this loopback exception. Production Vercel continues to require HTTPS.

## Configuration options

| Setting                    | Managed default            | Standalone image default  | Meaning                                                                                                             |
| -------------------------- | -------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_DRIVER`          | `neon`                     | `sqlite`                  | `neon` uses WebSocket PostgreSQL; `postgres` uses ordinary PostgreSQL TCP; `sqlite` uses a local database.          |
| `DATABASE_URL`             | Required                   | Unused with SQLite        | PostgreSQL connection string, backend only.                                                                         |
| `SQLITE_PATH`              | Unused                     | `/data/efemero.sqlite`    | Persistent database file, or explicitly acknowledged `:memory:`.                                                    |
| `STORAGE_DRIVER`           | `vercel-blob`              | `local`                   | Private Vercel Blob or private filesystem ciphertext.                                                               |
| `LOCAL_STORAGE_PATH`       | Unused                     | `/data/blobs`             | Dedicated private object directory, outside any public/static directory.                                            |
| `BLOB_READ_WRITE_TOKEN`    | Required                   | Unused with local storage | Token for a private Vercel Blob store.                                                                              |
| `AUTH_PROVIDER`            | `clerk` when configured    | `none`                    | `none` explicitly disables Clerk even if its keys are present.                                                      |
| `APP_ORIGIN`               | Explicit production origin | `http://localhost:3000`   | Canonical origin used by OPAQUE and request-origin checks.                                                          |
| `DATA_DIR`                 | Unused by Vercel           | `/data`                   | Standalone entrypoint's secret-file directory. Keep this volume durable.                                            |
| `CLEANUP_INTERVAL_SECONDS` | `0`                        | `300`                     | In-process cleanup, minimum 60 seconds when enabled; `0` disables the timer. Vercel uses its external cron instead. |
| `ALLOW_EPHEMERAL_DATABASE` | Disabled                   | Disabled                  | Must equal `true` to accept loss of an in-memory database.                                                          |

Unknown driver/provider values are rejected. There is no silent fallback from an unavailable persistent database to an empty memory database. SQLite and local storage are refused inside Vercel Functions because their filesystem/process lifetime cannot provide the required persistence.

Provider choices are independent: for example, an ordinary PostgreSQL server can be combined with local storage on one host. To use PostgreSQL, set `DATABASE_DRIVER=postgres` and `DATABASE_URL`, then run `npm run db:migrate` against that database before starting the application. `neon` retains the existing driver and migration path.

The implemented storage adapters are private Vercel Blob and local disk. S3 and MinIO adapters are not included yet; the `Storage` interface is the extension point. Switching providers does not copy artifacts, translate schemas, or migrate existing installations automatically.

## Optional accounts

`AUTH_PROVIDER=none` disables Clerk middleware and provider loading and hides account navigation. Only anonymous creation is available. Creating username-prefixed artifacts, account history, account-sized uploads, and the account-only kill-switch require account identity. Recipients of existing links still need only the artifact password, including when account management is disabled.

To enable accounts, configure `AUTH_PROVIDER=clerk`, `CLERK_SECRET_KEY`, and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, plus the instance's allowed origins, callbacks, DNS, and certificates. Compose accepts these settings from the shell or a private, Git-ignored `.env` file. The standalone provider receives its public key at runtime, without requiring a separate image build for that key. Never place `CLERK_SECRET_KEY` in a public variable.

Account login and the artifact password remain separate. Disabling Clerk does not disable OPAQUE password authentication for artifact delivery. Real-account production/session validation remains a separate outstanding check documented in the [validation log](validation.md).

## Persistence and secrets

The `/data` volume contains:

- `secrets.json`: OPAQUE setup and its version, handshake sealing key, rate-limit HMAC key, and cleanup credential, mode `0600`.
- `efemero.sqlite` and its WAL/SHM companions: policies, records, key envelopes, counters, history, and route reservations.
- `blobs/artifacts/<UUID>/payload.bin`: ciphertext only, with private directories and mode `0600` files. Original filename, MIME type, and content are encrypted in the browser.

The SQLite database is not encrypted as a whole, and `secrets.json` contains server secrets in plaintext under filesystem permissions. A full-volume compromise exposes both OPRF material and registration records, enabling offline password guessing as described in the security model. File permissions do not protect against a compromised host or stolen backup; protect the volume and backup access accordingly.

Uploads use a temporary private file and become visible to commit only after the full stream has been bounded, written, and synchronized. Publication uses an atomic hard link that cannot overwrite an existing object. File reads reject path traversal and final-component symlinks. The data directory must remain under the operator's control; these checks do not protect against a compromised host or administrator.

Back up the database, object directory, and secrets as one consistent installation. For a simple backup, stop the container and copy the entire volume, including SQLite sidecar files. Online SQLite backups require SQLite-aware procedures, not copying an actively changing database file alone. Backups create additional retained copies; their lifecycle must match the operator's privacy commitments.

Restarting a container with the same volume preserves artifacts and cryptographic secrets. `docker compose down` normally preserves the named volume; **`docker compose down -v` deletes it**. Losing the secrets can make existing artifacts unrecoverable even with correct passwords. The entrypoint refuses to invent replacement secrets when an existing SQLite database has no saved secrets and original secrets were not supplied explicitly.

Optional environment-supplied service secrets are persisted on first initialization. Later overrides must match the saved set; the entrypoint refuses implicit rotation. There is no automatic key migration or multi-version keyring. Plan rotations and incident response explicitly rather than deleting `secrets.json` while keeping an active database.

## In-memory SQLite: explicit data-loss mode

For disposable demonstrations or tests only:

```sh
docker run --rm --name efemero-disposable \
  -p 127.0.0.1:3000:3000 \
  -e SQLITE_PATH=:memory: \
  -e ALLOW_EPHEMERAL_DATABASE=true \
  efemero:local
```

The opt-in is mandatory and startup emits a warning. Every process restart loses artifacts, deadlines, counters, rate-limit buckets, account associations, and route reservations. Old links stop working. A persisted ciphertext file does not restore its lost OPAQUE record or encrypted key envelope.

Disk ciphertext can remain orphaned after memory-state loss and is not guaranteed to be removed by the normal metadata-driven cleanup. A disposable, non-retained data volume and explicit disposal of orphaned files are the operator's responsibility. Persisting only `secrets.json` does not make an in-memory database durable. Never use this mode to claim persistent history, durable revocation records, or permanent URL non-reuse across restarts.

Use a single Node.js process. Separate processes do not share an in-memory database; clustering, multiple replicas, and serverless execution are unsupported in this mode.

## Concurrency and scaling

SQLite uses WAL mode, foreign keys, a busy timeout, and synchronous durability. Each write transaction acquires `BEGIN IMMEDIATE`; a process-wide queue keeps unrelated requests from entering an asynchronous transaction. This replaces PostgreSQL's row/advisory locks with serialized database writes while preserving single-use proofs and atomic policy decisions.

Application SQL uses bound parameters. The SQLite adapter handles the small set of PostgreSQL casts and lock clauses used by this repository; it is not a general PostgreSQL emulator. Expiration batching has an explicit SQLite implementation. SQLite schema migrations are maintained separately under `migrations/sqlite/`; the PostgreSQL migration history is unchanged.

The local mode targets one application process on one host with a local durable filesystem. Do not place the SQLite database on NFS or run replicated containers against the same data volume. For distributed deployment, use PostgreSQL and a shared object-storage adapter appropriate to that deployment. Local disk alone does not provide cross-host object replication or failover.

Outside Vercel, rate limits deliberately share a conservative network bucket instead of trusting arbitrary forwarded IP headers. This means the default five reservations per hour can be shared by all users of a standalone instance. A proxy-specific client-IP policy requires review and must ensure attackers cannot bypass or spoof that proxy.

## Cleanup, health, and validation

The standalone timer runs the same bounded cleanup service as the cron endpoint. Deadline checks still happen during access, independently of the timer. Physical deletion can lag and backups are not erased by application cleanup. Interrupted temporary uploads are removed after a safety margin when their artifact is purged/reconciled.

`GET /api/health` checks sharing configuration and a database query, returning only a minimal success/failure response. It does not verify every storage operation, authentication flow, or provider. Docker uses it as a health check. The authenticated cleanup endpoint remains available to an external scheduler; do not expose its credential to recipients.

From a development checkout with dependencies installed:

```sh
npm test
npm run test:sqlite
npm run smoke:standalone -- http://localhost:3000
# Uses disposable containers and volumes; never targets the running production service.
sh scripts/test-docker.sh efemero:local
```

The smoke test uses synthetic data and actual OPAQUE against a running local-storage instance: private upload, incorrect password rejection, local decryption, replay rejection, and concurrent final access. It consumes anonymous creation quota, so use a disposable instance rather than the public deployment. Optional `SMOKE_WAIT_EXPIRY=1` also verifies a one-minute deadline. Restart fixtures use a private file selected by `SMOKE_STATE_FILE`; never use real user data for this procedure.

Self-hosting changes who operates the infrastructure. It does not remove weak-password attacks after OPRF/record compromise, malicious frontend risk, endpoint compromise, metadata retention, or the inability to erase copies already received. See the [security limits](../README.md#security-risks-and-limitations).
