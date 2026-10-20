# Internationalization

Efemero supports Brazilian Portuguese (`pt-BR`) and English (`en`) across the public interface, account dashboard, safety explanations, accessibility labels, page metadata, and application errors. Clerk's sign-in, sign-up and account controls use its matching `ptBR` or `enUS` localization when authentication is enabled.

## Language selection

Each request resolves its language in this order:

1. A valid explicit `efemero_locale` preference cookie.
2. The first supported language in the browser's weighted `Accept-Language` preferences. English regional variants use English; Portuguese variants use Brazilian Portuguese. Unsupported languages and preferences with zero or invalid weights are ignored.
3. Brazilian Portuguese when no supported preference is available.

The header selector lets users override detection. It writes a host-only, one-year preference cookie with `Path=/`, `SameSite=Lax`, and `Secure` on HTTPS, then refreshes server-rendered content without navigating away. It contains only a language value, no identifier, password, key or artifact information. It is readable by frontend JavaScript because the selector writes it. It is not an analytics cookie or an access credential. Clearing it restores browser-language detection. The application does not persist inferred language or change Clerk's authentication cookies for this purpose.

The selected language applies to this browser installation, not to an account or shared artifact. A recipient sees their own language preference. Artifact URLs remain `/a/:id` and `/:username/:id`, with no locale prefixes, query parameters or fragments. Existing `/sobre` and `/revogar` routes also stay compatible.

## Implementation

- `src/lib/i18n/messages.ts` contains the typed catalog. English source messages are the keys; each value is its Brazilian Portuguese translation. English text therefore has no separate duplicate catalog to maintain.
- `src/lib/i18n/index.ts` implements bounded language negotiation, interpolation and safe error translation. It has no platform or translation-service dependency.
- `src/lib/i18n/server.ts` resolves request headers for server components and metadata. Request-scoped rendering continues to support nonce-based CSP.
- `I18nProvider` exposes the same locale to client components, avoiding a separate browser guess during hydration. `LanguageSelector` refreshes the route after saving the preference, preserving client form state through React reconciliation.
- The root document's `lang`, dates, decimal values and counters follow the locale. Browser-native form validation and file picker dialogs follow browser/OS settings; Efemero cannot translate those dialogs itself. Dates retain the browser's existing local timezone behavior.
- API failures retain their status and stable machine-readable `code`. Their safe human-readable `error` message follows the request cookie or `Accept-Language`. Unexpected exceptions use a generic localized message; provider details are not returned. Crypto worker failures are similarly mapped to a known message in the document language. Changing language does not alter request-body schemas or send artifact passwords to the server.
- Anonymous pages still do not load Clerk. The same translation code works in Vercel deployments and the standalone Docker image, including `AUTH_PROVIDER=none`.

## Adding or changing messages

Use `t("English source message")` in components. Add or update the corresponding Portuguese entry in the catalog; TypeScript rejects unknown keys. Server components obtain `t` from `getI18n()`; client components use `useI18n()`. Keep server-generated errors in the known catalog so the API can translate them safely.

Use named placeholders for complete sentences, for example `t("Created as @{username}", { username })`. Keep the same placeholder names in both languages. Interpolation is one pass and produces plain strings; React escapes text and attributes. Do not add HTML translations or translate user-provided content, usernames, custom IDs, revocation JSON field names, cryptographic contexts, wire fields or protocol constants. Default message-download and revocation-download filenames are localized; uploaded original filenames are preserved inside the encrypted payload.

New locales require extending the locale allowlist, negotiation, catalog model, selector and Clerk mapping together. There is no automatic translation or fallback to a third-party service.

## Verification

The automated suite covers weighted negotiation, explicit-preference precedence, invalid-cookie fallback, catalog placeholder parity, safe interpolation, safe-error redaction and localized API errors with unchanged status/code/privacy headers. Browser checks should cover both locales, switching with an unfinished form, unchanged artifact URLs, creation and decryption across different languages, disabled-auth installations, and Clerk form language. A successful Clerk form render does not validate a real user's authenticated session.
