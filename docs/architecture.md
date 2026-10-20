# Architecture decisions

The application supports both managed deployment and [standalone self-hosting](self-hosting.md). Database adapters cover Neon, standard PostgreSQL TCP, and SQLite; storage adapters cover private Vercel Blob and local disk. `AUTH_PROVIDER=none` disables account identity while keeping artifact password authentication. The current Vercel + Neon production configuration remains unchanged.

## Addressing and identity

The short path is a locator, not a credential. The artifact's immutable internal identifier binds its OPAQUE registration and cryptographic context independently of the public username and slug. Slugs must be unique per user and must not be automatically reused after expiration. System prefixes are reserved.

Clerk identifies creators and authorizes management of their own artifacts. Recipient authentication is independent of the creator's account and does not require Clerk login.

## Authentication and encryption

An OPAQUE record is created for each artifact. The API never receives the original artifact password. The browser generates a random content key, encrypts the payload using authenticated encryption, and protects that key with material derived from the OPAQUE `export_key`, using context separation and artifact binding.

The `export_key` stays on the client. The `session_key` is known to both client and server and must not be used to encrypt the content key. Do not add an alternative derivation using only the password and a public salt that would create an offline test independent of OPAQUE.

The application uses an existing OPAQUE library; it does not implement cryptographic primitives or a custom challenge-response protocol. Parameters and formats must be versioned. Library review must cover browser support, the Node runtime, password hardening, and implementation protections.

The server keeps OPAQUE secrets outside the database. An isolated database/storage leak and complete application compromise have different properties. The OPRF seed and a record enable offline guessing even without the AKE private key. Secret retention, versioning, and rotation must respect record lifetimes; losing the seed can make content unrecoverable even with the correct password.

## Creation flow

1. Reserve a pending artifact and enforce quotas before starting expensive operations.
2. Perform OPAQUE registration in the browser and backend, binding it to the authorized reservation.
3. Encrypt in the browser, including original names and sensitive metadata.
4. Upload ciphertext directly to private storage with authorization restricted to the object and size.
5. Validate upload completion before publishing the artifact.

Abandoned reservations and uploads have deadlines and are removed by cleanup. Upload callbacks cannot reactivate revoked or expired artifacts.

## Delivery flow

1. Opening a page does not consume a release or deliver the payload.
2. Rate-limit handshake starts, including when the client abandons the exchange before the final proof.
3. Validate the final OPAQUE proof and prevent temporary-state replay.
4. Atomically check state, deadline, and limits in the primary database; consume one release.
5. Stream ciphertext through the authorized gateway, without storage credentials or a reusable link that could bypass policy.
6. Unwrap the key and decrypt in the browser.

The MVP counts a release when authorizing delivery. Connection failures may consume it. Human reading completion is not verifiable. Authentication state does not depend on a single Function's memory. Database failures block delivery. SQLite uses serialized `BEGIN IMMEDIATE` transactions and a process-wide queue in place of row/advisory locks; its in-memory mode is explicitly opt-in and loses these records on restart.

## Expiration and deletion

The backend uses absolute deadlines calculated by the server and allows a lifetime to be combined with a maximum release count. A maximum lifetime is mandatory. The first condition reached blocks new deliveries.

Checks happen on requests and do not depend on cron. Cleanup deletes objects with retries and handles orphaned uploads. Already authorized deliveries have an explicit maximum window. Physical deletion from provider storage/caches can be delayed; do not promise erasure of external copies or immediate removal across all infrastructure.

The dashboard retains metadata under the documented history policy. Payload expiration does not mean all metadata is erased: route tombstones remain indefinitely to prevent address reuse, including the public namespace and timestamps. See the [README retention details](../README.md#what-remains-after-deletion).

## Application security

- Private storage and authorization immediately before object access.
- Content responses use `Cache-Control: private, no-store`.
- Messages render as text; active content does not execute on the application origin.
- Passwords, keys, intermediate material, and proofs must not enter logs or analytics.
- Retrieval pages avoid unnecessary third-party scripts.
- Size, lifetime, frequency, and storage limits for accounts and anonymous users.
- Anonymous revocation credential independent of the shared password.
- Real tests for authentication, incorrect passwords, artifact isolation, replay, concurrency, expiration, quotas, and deletion.

## Initial operations

New files: up to 2 MiB for anonymous links and 5 MiB for account artifacts, plus up to 4 KiB of encrypted-format overhead in the backend budget. The browser checks original size; the server enforces the ciphertext limit without knowing the content. Existing artifacts retain their policy until expiration. Uploads go directly to private Blob storage; downloads are streamed. Vercel Cron runs daily cleanup on Hobby; time-based access blocking works independently of cron. Actual services and secrets are configured through secure channels, never commits.

Deployment and public availability require complete behavior and configured services. Do not replace the product with a demonstration that delivers ciphertext before authentication or stores plaintext passwords/keys.

## Account area and statistics

A username is selected once, with protection also enforced by a PostgreSQL trigger. The ID is random or an ASCII slug of up to 48 characters, unique within the user's namespace. There are no routes for editing content, addresses, or rules. A reservation can be published only once. Dashboard revocation uses verified Clerk identity, permanently blocks new deliveries, removes the OPAQUE record and wrapped key, and schedules physical deletion. There is no unblocking or address reuse.

History uses `(created_at, id)` pagination and always filters by the authenticated owner, without a global 100-item limit. It lists metadata and counters for up to 30 days after purge. Cleanup subsequently removes the direct account association and counters. Public paths remain reserved; their username namespace remains identifiable even after the owner foreign key is cleared.

Page opens are aggregate counts from a POST sent when the browser mounts the viewer; HTML prefetch does not increment the counter. Reloads, JavaScript-capable bots, and deliberate requests may inflate the estimate. These are not unique visitors: there are no analytics cookies, fingerprinting, or recipient identification. Rate limiting uses the existing temporary HMAC buckets. Counting began with the account-area update; previous traffic is not reconstructed.

The server counts authorized deliveries before transmitting bytes. It does not know whether decryption completed or someone read the content. A browser callback would not prove those actions, so no counter called “decryptions” was added.

## Kill-switch and OPAQUE

An optional policy for account artifacts only, from 1 to 100 accumulated failures. Successful attempts do not reset the counter. An invalid final proof consumes its challenge once and counts as a failure. The OPAQUE client detects an incorrect password locally: the Worker produces a random invalid proof to conclude that attempt, without sending the password, a static hash, or a reusable verifier. The API never delivers ciphertext in this case.

A modified client can omit the final message, so unfinished challenges count after 120 seconds. This includes leaving the page and network failures, even with the correct password. The backend settles these challenges under the artifact lock before accepting new starts or final proofs; daily cleanup also processes them. Evaluation does not depend on cron to block new deliveries. Pending challenges are bounded by the remaining budget, preventing concurrent over-allocation. When all slots are in use, a new start receives 429 without destroying the artifact early.

At the limit, state becomes `destroyed`: pending proofs cease to be valid, the record and wrapped key are removed in the same transaction, and private Blob deletion is scheduled while respecting authorized deliveries and issued upload tokens. Anyone who knows the link can deliberately trigger the kill-switch. This risk is inherent to the policy and is displayed at creation; the feature is disabled by default.
