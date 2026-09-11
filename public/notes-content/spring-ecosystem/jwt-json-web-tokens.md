# JSON Web Tokens (JWT)

> **Topic:** The three JWT components in full detail, signing algorithms, internal signing/verification mechanics, and what real-world data belongs in each part

---

## 1. What Is a JWT, and Why Does It Exist?

A **JSON Web Token (JWT)**, standardized in **RFC 7519**, is a compact, URL-safe way to represent a set of **claims** (statements about an entity, typically a user) as a single string that can be **verified as authentic and untampered** by anyone holding the right key — without needing to contact the party that originally issued it.

Recall from the Spring Security notes: a traditional session-based system requires the server to keep a record of every logged-in user's session in memory (or a shared store). A JWT flips this — the token itself is **self-contained**, carrying everything needed to verify who the user is and what they're allowed to do, directly within the token. This is precisely what makes JWT-based authentication genuinely **stateless**, and precisely why it became the dominant token format for REST APIs and microservices architectures.

> 💡 **Key insight — the single most important thing to understand about JWT:** A JWT is **signed, not encrypted**, by default. Anyone who intercepts a JWT can trivially read every claim inside it (it's just Base64-encoded JSON, not secret) — what the signature guarantees is that the content has **not been tampered with** and genuinely **originated from a trusted issuer**, not that the content is hidden from view. This single fact drives nearly every rule about what should and shouldn't go inside a JWT, covered in Section 6.

---

## 2. The Three Components — Structure at a Glance

A JWT is a single string made of exactly three parts, separated by periods (`.`):

```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFsaWNlIiwiaWF0IjoxNzM1Njg5NjAwfQ.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk

└──────────────── Header ────────────────┘.└──────────────────── Payload ────────────────────┘.└─────────── Signature ───────────┘
```

```
Header    →  {"alg": "HS256", "typ": "JWT"}
Payload   →  {"sub": "1234567890", "name": "Alice", "iat": 1735689600}
Signature →  HMACSHA256(base64UrlEncode(header) + "." + base64UrlEncode(payload), secretKey)
```

Each of the three parts is separately **Base64URL-encoded** (a URL-safe variant of Base64 that replaces `+`/`/` with `-`/`_` and typically omits padding, so the resulting token can be safely placed in a URL, an HTTP header, or a cookie without any additional escaping).

> ⚠️ **Base64URL encoding is not encryption.** It is a purely reversible, non-secret encoding scheme — anyone can decode a JWT's header and payload instantly, with no key, no password, and no special tooling beyond a basic Base64 decoder (or simply pasting the token into a site like jwt.io). This single fact is the source of the most important, most commonly violated JWT security rule, covered fully in Section 6.

---

## 3. Component 1 — The Header

The header is a small JSON object describing **metadata about the token itself** — specifically, how it was signed and what kind of token it is.

```json
{
  "alg": "HS256",
  "typ": "JWT"
}
```

| Field | Purpose |
|---|---|
| `alg` | The signing algorithm used to produce the signature (Section 5) — required, since the verifier needs to know which algorithm to use to check the signature |
| `typ` | The token type — conventionally `"JWT"`, present mostly for clarity/tooling, since the overall structure already implies it |
| `kid` (optional) | **Key ID** — identifies *which specific key* (out of potentially several active keys) was used to sign this token, critical for supporting key rotation (Section 9) |
| `cty` (optional, rare) | Content type, used only in the uncommon case of "nested" JWTs |

```json
{
  "alg": "RS256",
  "typ": "JWT",
  "kid": "2024-11-key-a1b2c3"
}
```

> 💡 **Why `kid` matters in real-world systems:** An authentication server doesn't sign every token with the same key forever — keys are periodically rotated for security hygiene, and multiple keys may be valid simultaneously during a rotation transition window. `kid` tells a verifying service exactly which public key (out of potentially several currently-trusted ones, typically published at a well-known endpoint called a **JWKS — JSON Web Key Set**) to use to verify this specific token's signature, without needing to guess or try every key in turn.

---

## 4. Component 2 — The Payload (Claims)

The payload is where the actual **data about the user/session** lives — a JSON object made up of **claims**, split into three categories by the spec.

### Registered claims (standardized, optional, but widely recommended)

| Claim | Full name | Purpose |
|---|---|---|
| `iss` | Issuer | Identifies who issued/signed the token (e.g., `"https://auth.mycompany.com"`) — lets a verifier confirm the token came from a trusted source |
| `sub` | Subject | Identifies the entity the token is *about* — almost always the user's unique ID |
| `aud` | Audience | Identifies who the token is *intended for* — a verifying service should reject a token whose `aud` doesn't match itself, preventing a token issued for Service A from being replayed against Service B |
| `exp` | Expiration Time | A Unix timestamp after which the token must be considered invalid, no matter what — the single most important claim for limiting the damage a leaked token can do |
| `nbf` | Not Before | A Unix timestamp before which the token must **not** be accepted yet (useful for tokens issued in advance, intended to become valid only at a future time) |
| `iat` | Issued At | A Unix timestamp recording when the token was created — useful for auditing and for calculating a token's age |
| `jti` | JWT ID | A unique identifier for this specific token instance — enables tracking or blocklisting one specific token (relevant to the revocation discussion in Section 9) |

```json
{
  "iss": "https://auth.mycompany.com",
  "sub": "user-88213",
  "aud": "orders-api",
  "exp": 1735693200,
  "iat": 1735689600,
  "jti": "a1b2c3d4-e5f6-7890"
}
```

### Public claims

Claims that are not part of the official registered set, but are intended to be **shared and understood across different systems/organizations** — to avoid naming collisions, the JWT specification recommends these either be registered in the IANA JSON Web Token Claims registry, or namespaced as a collision-resistant URI (e.g., `"https://mycompany.com/claims/department"`).

### Private (custom) claims

Claims specific to **your own application**, agreed upon between the token issuer and the specific consumers that understand them — this is where most real-world, application-specific data actually lives:

```json
{
  "sub": "user-88213",
  "roles": ["USER", "PREMIUM_MEMBER"],
  "tenantId": "acme-corp",
  "email": "alice@example.com"
}
```

> 💡 **Why the payload is where "who is this and what can they do" actually lives:** Recall from the Spring Security notes that a validated JWT is turned directly into an `Authentication` object — the `sub` claim typically becomes the principal's identity, and a custom `roles`/`authorities` claim is typically what a `@PreAuthorize` SpEL expression or a `hasRole(...)` URL rule actually checks against, all extracted straight out of the payload without any database lookup required at all (the entire point of statelessness, as covered in that file).

---

## 5. Component 3 — The Signature

The signature is a cryptographic value computed over the **header and payload combined**, using a specific algorithm and a **secret or private key** that only the issuer possesses.

```
signature = Sign( base64UrlEncode(header) + "." + base64UrlEncode(payload), key, algorithm )
```

Its entire purpose is **integrity and authenticity** — proving two specific things to any verifier:
1. **The content hasn't been altered** since it was signed (even changing a single character in the header or payload would produce a completely different signature, which would then fail verification).
2. **The token genuinely came from whoever holds the signing key** — nobody without that key could have produced a signature that verifies correctly against a given header+payload.

> ⚠️ **What the signature explicitly does NOT provide: confidentiality.** As emphasized in Section 2, the header and payload remain fully readable by anyone who has the token — the signature only prevents *undetected tampering*, it does not hide the content from view. A JWT is not a safe for secrets; it's a tamper-evident seal on a piece of paper anyone can already read.

---

## 6. Types of Signatures — The Algorithms Behind `alg`

### Symmetric algorithms — HMAC family (`HS256`, `HS384`, `HS512`)

```java
String signature = Hmac(header + "." + payload, sharedSecretKey, "SHA-256");
```

A **single shared secret key** is used both to **sign** the token (by the issuer) and to **verify** it (by anyone checking it) — the same key does both jobs, exactly like a symmetric encryption cipher.

| | Detail |
|---|---|
| Key type | One shared secret, known by both the issuer and every verifier |
| Best suited for | A single service (or a small, tightly-controlled set of services that can all safely hold the same secret) both issuing and validating its own tokens |
| Critical risk | **Anyone who can verify a token can also forge one** — since verification and signing use the identical key, distributing the secret to multiple independent services for verification purposes also hands each of them the ability to mint arbitrary, fraudulent tokens |

### Asymmetric algorithms — RSA family (`RS256`, `RS384`, `RS512`)

```java
String signature = RsaSign(header + "." + payload, issuerPrivateKey);
boolean valid = RsaVerify(header + "." + payload, signature, issuerPublicKey);
```

A **key pair** is used: the issuer signs using a **private key** it keeps strictly secret, while any number of independent verifying services can check the signature using the corresponding, freely-distributable **public key** — mirroring the same public/private key asymmetry already discussed conceptually in the Java 25 notes' cryptography section (KDFs, PEM encodings).

| | Detail |
|---|---|
| Key type | A private key (issuer only) + a public key (freely distributed to any verifier) |
| Best suited for | Microservices architectures (recall the Spring Cloud notes) where **many independent services** need to verify tokens, but only **one** central authentication service should ever be able to issue them |
| Critical advantage | Verifying services can safely publish/distribute the public key (or fetch it from a JWKS endpoint) without ever risking the ability to forge a token themselves — verification and signing capability are cleanly separated |

### Asymmetric algorithms — ECDSA family (`ES256`, `ES384`, `ES512`)

Functionally the same asymmetric public/private key relationship as RSA, but built on **elliptic curve cryptography** instead — producing significantly **smaller keys and signatures** for an equivalent level of cryptographic security, at the cost of somewhat higher computational complexity per operation. Increasingly preferred in modern systems (and in constrained environments like mobile or IoT) specifically for its smaller token size and comparable security guarantees.

### `RS256` vs `PS256` — a subtler distinction

`PS256` (RSASSA-PSS) is a more modern RSA-based signing scheme using a randomized padding scheme, offering a stronger security proof than the older, deterministic `RS256` padding — increasingly recommended over `RS256` in newer systems, though `RS256` remains extremely widely deployed and is not considered broken.

### The `none` algorithm — and why it must be rejected

The JWT specification technically defines an `alg: "none"` option, indicating **no signature at all**. This exists for narrow, legitimate use cases (e.g., a JWT already secured by an outer transport-layer mechanism), but has been the root cause of real, well-documented vulnerabilities in poorly-implemented JWT libraries — an attacker modifying a token's header to claim `alg: "none"` and stripping the signature entirely, tricking a naive verifier into skipping signature verification altogether.

> ⚠️ **Critical security rule:** A JWT verification library must be explicitly configured to only accept a **specific, expected algorithm** (or small whitelist of algorithms) — never allow the token's own `alg` header to dictate which verification strategy is used, and never accept `"none"` unless that is a deliberate, fully understood design decision. This single class of vulnerability (letting the attacker choose the verification algorithm) has been responsible for real, significant JWT library security incidents historically.

| Algorithm family | Symmetric/Asymmetric | Typical use case |
|---|---|---|
| `HS256`/`HS384`/`HS512` | Symmetric (shared secret) | A single service issuing and verifying its own tokens |
| `RS256`/`RS384`/`RS512` | Asymmetric (RSA key pair) | Many independent microservices verifying tokens from one central issuer |
| `ES256`/`ES384`/`ES512` | Asymmetric (elliptic curve) | Same as RSA, but with smaller keys/tokens — increasingly preferred |
| `PS256`/`PS384`/`PS512` | Asymmetric (RSA-PSS) | A more modern, stronger-proofed alternative to `RS256` |
| `none` | No signature | Should essentially never be accepted in production |

---

## 7. How JWT Actually Works Internally — The Full Signing and Verification Flow

### Issuing (signing) a token

```
1. The issuer builds the header JSON:  {"alg": "RS256", "typ": "JWT"}
2. The issuer builds the payload JSON: {"sub": "user-123", "exp": ..., "roles": [...]}
3. Both are Base64URL-encoded independently
4. The two encoded strings are joined with a "." :  base64(header) + "." + base64(payload)
5. This combined string is cryptographically signed using the issuer's PRIVATE key (or shared secret)
6. The resulting signature bytes are ALSO Base64URL-encoded
7. All three pieces are joined with "." to form the final token:
   base64(header) + "." + base64(payload) + "." + base64(signature)
```

### Verifying a token

```
1. The verifier splits the incoming token string on "." into its three original parts
2. It Base64URL-DECODES the header to read "alg" (and "kid", if present)
3. It looks up the correct verification key:
   - For HS*: the pre-shared secret it already holds
   - For RS*/ES*/PS*: the issuer's PUBLIC key, often fetched dynamically from a JWKS endpoint using "kid"
4. It RE-COMPUTES the signature over the received header+payload string, using that key and algorithm
5. It compares the RECOMPUTED signature to the SIGNATURE ACTUALLY PRESENT in the token
6. If they don't match EXACTLY → reject the token immediately (tampered or forged)
7. If they DO match → the content is verified as authentic and untampered
8. The verifier THEN checks the payload's own claims:
   - Has "exp" already passed? → reject (expired)
   - Is "nbf" still in the future? → reject (not yet valid)
   - Does "aud" match this specific service? → reject if not
   - Does "iss" match a trusted, expected issuer? → reject if not
9. Only after ALL of these checks pass is the token considered fully valid
```

> 💡 **Why step 6's exact-match comparison is the entire security foundation of JWT:** Because even a single-bit change anywhere in the header or payload produces a **completely different** signature output (a fundamental property of cryptographic signing/hashing functions — the same avalanche-effect property discussed for password hashing in the Spring Security notes), any tampering at all — changing a role from `"USER"` to `"ADMIN"`, extending an `exp` timestamp, swapping the `sub` to impersonate a different user — is detected immediately and unavoidably at step 6, without the verifier needing to understand or interpret *what* was changed, only *that* something was.

---

## 8. Where Real-World Data Actually Belongs — A Practical Guide

This is the part most frequently gotten wrong in real systems, precisely because of the "signed, not encrypted" fact from Section 2.

| Data | Where it belongs | Why |
|---|---|---|
| User's unique ID (`sub`) | **Payload** — registered claim | Needed by every verifier to identify the principal; not sensitive on its own |
| User's roles/permissions | **Payload** — private/custom claim | Needed for authorization checks (`@PreAuthorize`, `hasRole`) without a database round-trip; acceptable to expose, since roles aren't typically secret |
| Token expiration (`exp`) | **Payload** — registered claim | Must be readable and checkable by every verifier without decryption |
| Which service the token is for (`aud`) | **Payload** — registered claim | Needed to prevent token replay across unintended services |
| Signing algorithm (`alg`) | **Header** | Needed by the verifier before it can even attempt to check the signature |
| Which key was used (`kid`) | **Header** | Needed to select the correct verification key during rotation |
| **Passwords, credit card numbers, SSNs, raw secrets** | **Nowhere in a plain JWT** | The payload is trivially readable by anyone who intercepts the token — this is never an acceptable place for genuinely confidential data |
| Large objects (a full user profile, a large permissions list) | **Generally avoid** — keep in the payload only if genuinely small | Every request carries the full token in a header; a bloated payload means unnecessary overhead on every single request |
| The actual signing secret/private key | **Never in the token itself** — held securely server-side only | The whole security model depends on this key remaining exclusively with the issuer (and, for asymmetric schemes, the public key alone with verifiers) |

> ⚠️ **A genuinely common real-world mistake:** Storing sensitive PII (full name, email, address, sensitive internal flags) directly in a JWT payload "because it's convenient and avoids a database call." Since the payload is plainly readable by the browser, by any browser extension, by anyone who captures network traffic on an improperly-secured connection, and by anyone who simply pastes the token into a JWT decoder tool, this can constitute a genuine data exposure — the standard, recommended practice is to keep the payload limited to an identifier and authorization-relevant claims, fetching any additional sensitive profile data from a proper, access-controlled backend endpoint using that identifier instead.

### If confidentiality is genuinely required — JWE, not JWS

A standard signed JWT (what this entire note has described) is technically called a **JWS (JSON Web Signature)**. If the payload itself genuinely needs to be **encrypted**, not just signed, the related but distinct standard **JWE (JSON Web Encryption)** exists specifically for that purpose — producing a token with five dot-separated parts instead of three, where the payload segment is genuinely unreadable without the correct decryption key. JWE is considerably less common in typical REST API authentication scenarios (since the transport layer, HTTPS/TLS, already provides confidentiality for the token in transit — recall TLS from the Java 11 notes), but is the correct tool when a token's contents must remain confidential even from parties who can see the token itself (for example, when a token passes through an untrusted intermediary that should not be able to read its claims).

---

## 9. Access Tokens vs Refresh Tokens — A Standard Real-World Pattern

Recall the revocation trade-off already introduced in the Spring Security notes: a self-contained JWT can't be "logged out early" the way a server-side session can, since there's no central record to delete. The standard, real-world mitigation is a **two-token pattern**:

| | Access Token | Refresh Token |
|---|---|---|
| Lifetime | Short — typically minutes | Long — typically days or weeks |
| Format | Usually a JWT | Sometimes a JWT, often just an opaque, random string |
| Sent with every request? | Yes, on every API call (`Authorization: Bearer ...`) | No — only sent to a dedicated token-refresh endpoint |
| Stored server-side? | No — genuinely stateless | Often yes — stored in a database, enabling explicit revocation |
| Purpose | Prove identity/authorization for actual API calls | Obtain a new access token once the current one expires, without forcing the user to log in again |

```
1. User logs in → server issues a short-lived JWT access token + a longer-lived refresh token
2. Client attaches the access token to every API request until it expires
3. Once expired, the client sends the refresh token to a /token/refresh endpoint
4. The server validates the refresh token (checking its server-side record — this IS revocable)
5. If valid, the server issues a BRAND NEW short-lived access token
6. If the user needs to be "logged out" immediately, the server deletes/invalidates the
   refresh token's server-side record — the still-outstanding access token simply expires
   naturally within minutes, limiting the exposure window
```

> 💡 **Why this pattern balances statelessness with revocability:** The access token stays genuinely stateless and fast to verify (no database lookup on every single API call, exactly the scalability benefit described in the Spring Security notes), while the refresh token — checked far less frequently, only at renewal time — is where the system deliberately reintroduces a small amount of server-side state specifically to regain the ability to revoke access, accepting a short window of continued access (the remaining lifetime of an already-issued access token) as a reasonable trade-off.

---

## 10. Key Rotation and JWKS

```json
// A JWKS endpoint response (e.g., GET /.well-known/jwks.json)
{
  "keys": [
    { "kid": "2024-11-key-a1b2c3", "kty": "RSA", "use": "sig", "n": "...", "e": "AQAB" },
    { "kid": "2025-01-key-d4e5f6", "kty": "RSA", "use": "sig", "n": "...", "e": "AQAB" }
  ]
}
```

Real-world identity providers periodically rotate their signing keys as a security best practice (limiting the damage if a key is ever compromised, and as a matter of routine hygiene). Rather than every verifying service needing to be manually reconfigured with a new key every time this happens, they instead fetch the current set of valid public keys from a well-known **JWKS (JSON Web Key Set)** endpoint, using each token's `kid` header (Section 3) to select the specific key that was actually used to sign it — allowing multiple keys to be simultaneously valid during a rotation transition window, and allowing key rotation to happen without any coordinated, manual reconfiguration across every dependent service.

---

## 11. Real-World Scenarios

### Microservices — One issuer, many independent verifiers via RS256
Recall the Spring Cloud notes' scenario of an Order Service and Inventory Service both independently validating tokens issued by a central authentication service. This is the textbook case for **RS256** rather than **HS256** — dozens of independently-deployed services can each hold only the issuer's *public* key (fetched via JWKS) and verify tokens confidently, with no risk that a compromised or misconfigured downstream service could ever use its verification key to forge new, fraudulent tokens — a risk that would be very real if every service instead shared the same HMAC secret.

### E-commerce — Keeping the payload lean for a high-traffic API
```json
{ "sub": "user-88213", "roles": ["USER"], "exp": 1735693200 }
```
Rather than embedding a user's full name, shipping address, and order history directly in the token (bloating every single API request's header), an e-commerce platform keeps the JWT payload minimal — just enough to identify the user and check basic authorization — fetching any additional profile data from a proper backend endpoint only when actually needed.

### Banking — Short-lived access tokens with a revocable refresh token
A banking app issues 5-minute access tokens paired with a 14-day refresh token stored server-side. If a user reports a stolen device, support staff revoke that specific refresh token's server-side record immediately — the thief's already-obtained access token still works for, at most, the remaining few minutes of its own natural lifetime, dramatically limiting the exposure window compared to a long-lived, unrevoked token.

### Public APIs — Rejecting a token with the wrong audience
```json
{ "sub": "user-1", "aud": "partner-api", "exp": ... }
```
An internal "orders" service receiving a token whose `aud` claim says `"partner-api"` rejects it outright, even though the signature itself is perfectly valid — preventing a token that was legitimately issued for one specific external partner integration from being replayed against unrelated internal services it was never intended for.

---

## 12. Common Mistakes / Gotchas

> ⚠️ **Storing sensitive PII or secrets directly in the JWT payload**, forgetting that it's merely Base64URL-encoded, not encrypted, and trivially readable by anyone who has the token.

> ⚠️ **Trusting the token's own `alg` header to decide how to verify it**, opening the door to the classic `alg: none` / algorithm-confusion class of vulnerability.

> ⚠️ **Using a single shared HMAC secret (`HS256`) across many independently-deployed microservices**, when RSA/ECDSA (`RS256`/`ES256`) would let each service safely hold only a public key, incapable of forging new tokens.

> ⚠️ **Issuing excessively long-lived access tokens** with no accompanying refresh-token/revocation strategy, making a stolen token dangerously long-lived with no way to cut off access early.

> ⚠️ **Bloating the payload with large, rarely-needed data**, adding unnecessary size overhead to every single request the token is attached to.

> ⚠️ **Forgetting to validate `exp`, `aud`, and `iss`** even after a signature check passes — signature validity alone does not mean the token is currently valid, intended for this service, or from a trusted issuer.

---

## 13. Comparison: JWT vs Traditional Opaque Session Tokens

| | JWT (self-contained) | Opaque session token |
|---|---|---|
| Server-side storage needed to validate? | No | Yes — a lookup against a session store is required |
| Scales across independent services without shared storage? | Yes | No — requires a shared/replicated session store |
| Immediately revocable? | No — only via short lifetimes + a refresh-token pattern | Yes — simply delete the server-side session record |
| Content readable without server access? | Yes, by anyone holding the token (Base64URL, not encrypted) | No — the token itself is a meaningless random string; all data lives server-side |
| Typical use case | REST APIs, microservices, mobile app backends | Traditional server-rendered web applications |

---

## Interview Questions

1. What are the three components of a JWT, and what specific role does each one play in the overall security model?
2. Why is it inaccurate to say a JWT is "encrypted," and what security property does the signature actually provide instead?
3. Walk through, step by step, exactly how a verifier checks whether a received JWT has been tampered with.
4. What is the difference between `HS256` and `RS256` in terms of which keys are needed to sign versus verify, and why is `RS256` generally preferred in a microservices architecture with many independent verifying services?
5. What real, historically-exploited vulnerability class arises from a naive JWT library trusting the token's own `alg` header, and how should a correct implementation avoid it?
6. What is the purpose of the `exp`, `aud`, and `iss` claims, and why must a verifier check all three even after a signature check has already passed?
7. What is `kid`, and why does it matter specifically in systems that perform periodic key rotation?
8. What is a JWKS endpoint, and how does it let a verifying service handle key rotation without manual reconfiguration?
9. Why is it considered bad practice to store sensitive personal information directly inside a JWT's payload, even though doing so would technically work?
10. Explain the access-token/refresh-token pattern, and specifically how it reintroduces a limited, deliberate amount of server-side state to solve JWT's revocation problem.
11. What is the difference between a JWS and a JWE, and under what circumstance would you actually need a JWE instead of a standard signed JWT?
12. Why does even a single-character change to a JWT's payload cause signature verification to fail, and what fundamental cryptographic property makes this guarantee possible?