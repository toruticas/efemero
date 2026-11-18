# Changelog

## [0.0.1] - 2026-11-18

Initial tagged release of Efemero.

### Features

- Temporary message and file sharing with browser-side AES-GCM encryption and OPAQUE password authentication before delivery.
- Mandatory expiration, optional delivery limits, anonymous revocation credentials, and an optional account-only password-failure kill-switch.
- Optional Clerk accounts with immutable usernames, custom artifact IDs, paginated history, aggregate counters, and owner revocation.
- Managed deployment with Neon/PostgreSQL and private Vercel Blob, or standalone Docker hosting with SQLite and local ciphertext storage.
- Brazilian Portuguese and English interfaces, automatic light/dark appearance, and explanations of the security model and its limits.

### Fixes included

- Update Next.js and `@next/env` to `16.4.6`, which includes the fixes for GHSA-mfr8-8qww-v76h and GHSA-vc7v-qv4w-wrv8.
- Enforce a 60-second delivery deadline, including storage opening and streaming, and propagate cancellation to storage.
- Restrict existing environment-file permissions to `0600` before writing service secrets.
- Prevent repeated artifact submissions while a file read or publication is in progress.

### Validation and limitations

- All 87 tests passed with PGlite and again with SQLite on Node.js 24.21.0. Type checking, formatting, the production build, and the synthetic standalone smoke test passed.
- This release has not undergone an independent cryptographic audit. Real-account Clerk validation and provider-specific operational checks remain documented in the [validation log](docs/validation.md).
- Outside Vercel, clients share a conservative rate-limit bucket. Expiration and revocation cannot erase copies already delivered.

[0.0.1]: https://github.com/toruticas/efemero/releases/tag/v0.0.1
