# MVP protocol

## Dependencies and domain

`@serenity-kit/opaque` is pinned to 1.1.0. The library implements OPAQUE primitives; the application does not introduce a custom password protocol. The `memory-constrained` profile is explicit during registration and retrieval. The application format is version 1. Tests exercise the actual library and verify that the same record recovers the same export key, different passwords fail, and different IDs isolate artifacts.

Authentication binds `client` to the artifact's immutable internal UUID and `server` to the canonical origin. The UUID is also used as `userIdentifier` in the library's derivation. Username and slug only locate that record.

## Registration

The browser creates the initial OPAQUE message. `POST /api/artifacts/reserve` receives the initial message, maximum size, lifetime, limit, and mode. It does not accept a password field. The backend reserves a UUID, address, and storage path, then returns the OPAQUE response and a random 256-bit management credential. Only that credential's SHA-256 hash is stored.

The browser completes registration with the fixed profile and recovers `registrationRecord` and `exportKey`. The `sessionKey` value is not used as a content key.

## Encryption

The plaintext payload contains four big-endian bytes specifying the JSON header length, the header (`kind`, name, and MIME type), and the message or file bytes. All of this is encrypted using AES-256-GCM, a random 32-byte key, and a random 12-byte nonce. Additional authenticated data is `artefatos:payload:v1:<UUID>`.

The transmitted ciphertext starts with a version byte (`1`), followed by a 12-byte nonce and ciphertext with its GCM tag. The content key is wrapped using another AES-GCM operation with an independent nonce.

The wrapping key is derived through HKDF-SHA-256: input material is the UTF-8 encoding of the library's export key, the salt is the UUID, and the context is `artefatos:key-wrap:v1`. The envelope stores the version, nonce, and encrypted key in base64url. There is no parallel derivation from only a password and public salt. The existing `artefatos:*` context strings are protocol identifiers and must retain their spelling for compatibility.

The browser sends ciphertext to the private store and publishes the record and envelope through `POST /api/artifacts/commit`, authenticated with the management credential. The API verifies the object at the reserved path before publication. Original names and MIME types are not transmitted as public upload metadata.

## Retrieval and delivery

`POST /api/artifacts/access/start` receives the path and initial OPAQUE message. Limits apply before responding because an attacker can abandon the exchange after checking a guess. Server state is encrypted in the database, bound to the artifact, and valid for no more than two minutes or until artifact expiration.

`POST /api/artifacts/access/finish` receives the handshake ID and final proof. The transaction locks the artifact and consumes the handshake, validates deadline, state, and proof, increments the counter, and exhausts the artifact if necessary. A used, invalid, or expired handshake cannot be replayed; an invalid proof consumes the handshake but not a release.

Only after authorization is committed does the route read and stream the object. The key envelope is sent in `X-Wrapped-Key`; `X-Artifact-Id` binds the response to the record. There is no reusable GET URL that could bypass counters. The response uses `private, no-store` and a binary content type. The client recovers the export key, opens the envelope, and decrypts. Active content is never rendered as a document on the site's origin.

## Limitations

OPAQUE does not turn a human password into an unguessable secret. A server holding the seed and record can make offline guesses; the operator also has this ability. Separating secrets from the database reduces the impact of an isolated leak without protecting against complete application compromise.

The browser must trust the JavaScript delivered by the service. A nonce-based CSP, absence of recipient analytics, and separation of login scripts reduce exposure, but do not protect against a malicious operator or deployment. The current version does not replace an independent production cryptographic assessment.

References: [OPAQUE, RFC 9807](https://www.rfc-editor.org/rfc/rfc9807.html), [OPRF, RFC 9497](https://www.rfc-editor.org/rfc/rfc9497.html), [library](https://github.com/serenity-kit/opaque).
