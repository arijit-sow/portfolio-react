# Spring Security

> **Topic:** The security filter chain, authentication vs authorization, password encoding, method security, CSRF/CORS, sessions, and JWT-based stateless auth

---

## 1. Why Spring Security Exists

Security concerns — authentication (who are you?) and authorization (what are you allowed to do?) — cut across almost every endpoint in a real application, exactly the kind of pervasive, repetitive concern the Servlets notes' **filter** mechanism and the Spring Core notes' **AOP proxy** mechanism both exist to centralize rather than duplicate.

Without a dedicated security framework, every application would need to hand-roll: credential verification, session/token management, protection against well-known web attack classes (CSRF, session fixation, clickjacking), and a consistent way to express "only admins can call this endpoint" — each a genuine, easy-to-get-subtly-wrong security concern, not just a convenience feature. **Spring Security** provides a battle-tested, extensively audited, configurable framework for all of this, plugged into the same Servlet filter chain already covered in the Servlets notes.

> 💡 **Key insight:** Spring Security is, at its architectural core, just a carefully designed **chain of Servlet filters** (recall `FilterChain` from the Servlets notes) sitting in front of your `DispatcherServlet`, plus a set of well-defined extension points for plugging in your own authentication and authorization logic. Nearly everything else — annotations, configuration DSLs — is a more convenient way of assembling and configuring that underlying filter chain.

---

## 2. The Security Filter Chain — The Architectural Core

```
Incoming HTTP Request
        │
        ▼
┌───────────────────────────────────────────────────────┐
│              Spring Security's Filter Chain            │
│  (a SEPARATE chain of filters, distinct from your own  │
│   application filters, registered as ONE servlet filter │
│   — DelegatingFilterProxy / FilterChainProxy — that     │
│   internally delegates through many security filters)  │
│                                                          │
│   SecurityContextPersistenceFilter                      │
│         │                                                │
│   CsrfFilter                                             │
│         │                                                │
│   UsernamePasswordAuthenticationFilter (or similar)      │
│         │                                                │
│   ExceptionTranslationFilter                             │
│         │                                                │
│   FilterSecurityInterceptor / AuthorizationFilter        │
└───────────────────────────────────────────────────────┘
        │
        ▼
   DispatcherServlet → your controllers
```

Spring Security registers itself into the servlet container as effectively **one big filter** (`FilterChainProxy`, wired in via `DelegatingFilterProxy`), which then internally delegates to a whole ordered sequence of its own specialized filters — each responsible for exactly one concern (parsing credentials, checking CSRF tokens, populating the security context, enforcing authorization rules). This is directly analogous to how the Servlets notes described a `FilterChain` of multiple cooperating filters, just applied specifically, and extensively, to security concerns.

### Modern configuration — `SecurityFilterChain`

```java
@Configuration
@EnableWebSecurity
public class SecurityConfig {
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/public/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .formLogin(Customizer.withDefaults())
            .csrf(Customizer.withDefaults());
        return http.build();
    }
}
```

This declarative, builder-style configuration is what most modern Spring Security applications use to assemble the filter chain from Section-2's diagram — under the hood, calling `.authorizeHttpRequests(...)` and `.formLogin(...)` is really just configuring and wiring together the specific filters (`AuthorizationFilter`, `UsernamePasswordAuthenticationFilter`) that will end up in the final chain.

---

## 3. Authentication vs Authorization

These two terms are frequently conflated but represent genuinely distinct concerns:

| | Authentication | Authorization |
|---|---|---|
| Question answered | "Who are you?" | "What are you allowed to do?" |
| Happens | Once, typically at login (or per-request, for token-based auth) | On every protected request, potentially per-resource |
| Failure result | `401 Unauthorized` — credentials missing or invalid | `403 Forbidden` — identity known, but insufficient permission |
| Spring Security abstraction | `Authentication` object, produced by an `AuthenticationManager` | `AccessDecisionManager`/`AuthorizationManager`, consulted by `AuthorizationFilter` |

> ⚠️ **A common, subtle mistake:** Returning `401` for an authorization failure (or vice versa) confuses API consumers about whether they need to log in again (`401`) or whether they're logged in correctly but simply lack permission for this specific action (`403`) — a small but genuinely meaningful distinction for both human users and automated API clients.

---

## 4. The `Authentication` Object and `SecurityContext`

Once a request is successfully authenticated, Spring Security represents the authenticated identity as an `Authentication` object — containing the principal (typically a `UserDetails` object representing the user), their granted authorities (roles/permissions), and whether authentication actually succeeded.

```java
Authentication auth = SecurityContextHolder.getContext().getAuthentication();
String username = auth.getName();
Collection<? extends GrantedAuthority> authorities = auth.getAuthorities();
```

### `SecurityContextHolder` — a `ThreadLocal`-backed mechanism (with the same caveats as MDC)

By default, `SecurityContextHolder` stores the current `Authentication` in a **`ThreadLocal`**, exactly the same underlying mechanism (and exactly the same class of pitfall) already covered in the Logging Frameworks notes' MDC discussion and the Servlets notes' thread-safety discussion.

> ⚠️ **The exact same async/thread-hop gotcha as MDC applies here too:** If application code hands off work to a different thread mid-request (a `CompletableFuture.supplyAsync()` call, a manually-managed background thread, or in some configurations, even certain reactive/async request-handling paths), the `SecurityContext` — like `MDC` — does **not** automatically follow to that new thread by default, since it's tied to the originating thread specifically. Spring Security provides `DelegatingSecurityContextExecutor` and similar utilities specifically to propagate the security context across such thread hops, mirroring the manual `MDC.getCopyOfContextMap()` propagation pattern from the Logging Frameworks notes.

---

## 5. `AuthenticationManager`, `AuthenticationProvider`, and `UserDetailsService`

```
Login request (username + password)
            │
            ▼
UsernamePasswordAuthenticationFilter
            │
            ▼
     AuthenticationManager
            │
            ▼
   DaoAuthenticationProvider  ← the standard, built-in provider for username/password auth
            │
      ┌─────┴─────┐
      ▼           ▼
UserDetailsService  PasswordEncoder
(loads the user     (verifies the submitted
 from your DB)       password matches)
```

```java
@Service
public class CustomUserDetailsService implements UserDetailsService {
    private final UserRepository userRepository; // a Spring Data JPA repository, from the earlier notes

    @Override
    public UserDetails loadUserByUsername(String username) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> new UsernameNotFoundException("User not found: " + username));
        return org.springframework.security.core.userdetails.User.builder()
                .username(user.getUsername())
                .password(user.getPasswordHash())
                .authorities(user.getRoles().toArray(new String[0]))
                .build();
    }
}
```

`UserDetailsService` is the single, well-defined extension point where your application plugs in "how do I actually look up a user and their credentials?" — typically backed by exactly the kind of Spring Data JPA repository already covered in the previous notes file. `DaoAuthenticationProvider` orchestrates the process: it calls your `UserDetailsService` to load the stored user record, then uses a `PasswordEncoder` (Section 6) to verify the submitted raw password actually matches the stored, hashed one — without your application code ever needing to implement that comparison logic itself.

---

## 6. `PasswordEncoder` — Why Plain Hashing Isn't Enough

> ⚠️ **Never store plaintext passwords, and never use a fast, general-purpose hash function (like plain SHA-256 or MD5) for passwords either** — both are serious, well-documented security mistakes.

### Why a fast hash function is actually a liability for passwords

A cryptographic hash function like SHA-256 is deliberately designed to be **fast** — a property that's exactly right for verifying file integrity or building a hash table, but exactly *wrong* for password storage: an attacker who steals a database of SHA-256 password hashes can attempt **billions of guesses per second** on modern hardware (especially with GPU/ASIC acceleration), making brute-force and dictionary attacks against stolen hashes highly practical.

### The `BCrypt` solution (Spring Security's default)

```java
@Bean
public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder(); // Spring Security's long-standing recommended default
}

// registering a new user
String hashed = passwordEncoder.encode(rawPassword);
userRepository.save(new User(username, hashed));

// verifying login
boolean matches = passwordEncoder.matches(submittedRawPassword, storedHash);
```

**BCrypt** is a deliberately **slow**, computationally expensive hashing algorithm, specifically designed to make brute-force attacks impractical even with significant computing power — the same property that makes it slightly slower for your own application to verify one legitimate login is exactly what makes it prohibitively slow for an attacker trying billions of guesses.

BCrypt also automatically generates and embeds a random **salt** into its output hash string itself — meaning two users with the identical password produce **completely different** stored hash values, defeating precomputed "rainbow table" attacks that rely on identical inputs producing identical, look-up-able hash outputs.

```
$2a$10$N9qo8uLOickgx2ZMRZoMye.IjPeHqcxKX8k9uz.pjZ5EHM8kBAyIC
 │  │  │                    │
 │  │  │                    └── the actual hash + embedded salt
 │  │  └── cost factor (work factor) — controls how computationally expensive verification is
 │  └── BCrypt version identifier
 └── algorithm identifier
```

> 💡 **The "cost factor" as a tunable security/performance trade-off:** BCrypt's cost factor (commonly 10–12 in real deployments) directly controls how many rounds of internal computation each hash/verify operation requires — a higher cost factor means a legitimate login takes marginally longer (typically still well under 100ms), but makes each individual brute-force guess proportionally more expensive for an attacker too. This value can, and often should, be increased over time as hardware gets faster, to keep pace with growing brute-force capability.

---

## 7. Authorization — Restricting Access by Role/Authority

### URL-based authorization

```java
http.authorizeHttpRequests(auth -> auth
    .requestMatchers("/api/public/**").permitAll()
    .requestMatchers(HttpMethod.POST, "/api/orders/**").hasRole("USER")
    .requestMatchers("/api/admin/**").hasRole("ADMIN")
    .anyRequest().authenticated()
);
```

Rules are evaluated **in order**, and the **first matching rule wins** — a subtlety directly analogous to the ordered, first-match-wins behavior of exception catch blocks and pattern-matching switch cases covered elsewhere in this notes series. A common, real configuration mistake is placing a broad rule (like `anyRequest().authenticated()`) *before* a more specific one, accidentally shadowing the specific rule entirely.

### Method-level security

```java
@Configuration
@EnableMethodSecurity
public class MethodSecurityConfig { }

@Service
public class OrderService {
    @PreAuthorize("hasRole('ADMIN')")
    public void deleteOrder(Long orderId) { ... }

    @PreAuthorize("#order.customerId == authentication.principal.id")
    public void updateOrder(Order order) { ... } // only the order's own owner may update it
}
```

`@PreAuthorize` evaluates a **Spring Expression Language (SpEL)** expression *before* the method body runs, with direct access to the method's own arguments (`#order`) and the current `Authentication` object — enabling fine-grained, per-resource authorization checks (like "only this order's owner may modify it") that a simple, coarse URL-pattern-based rule could never express.

> 💡 **How this is actually implemented — recall `BeanPostProcessor` from the Spring Core notes:** `@PreAuthorize` works via exactly the same AOP-proxy mechanism already covered for `@Transactional` — a `BeanPostProcessor` wraps any bean containing `@PreAuthorize`-annotated methods in a proxy that evaluates the SpEL expression before delegating to the real method, and it is subject to the **exact same self-invocation pitfall**: calling a `@PreAuthorize`-annotated method from another method within the same class bypasses the proxy and silently skips the authorization check entirely.

---

## 8. CSRF Protection

**Cross-Site Request Forgery (CSRF)** exploits the fact that a browser automatically attaches a user's session cookie to **every** request to a given domain, regardless of which site actually initiated that request. A malicious site can trick a victim's browser into submitting a form (or firing an AJAX request) to your application, and the browser will happily attach the victim's valid session cookie, making the malicious request look legitimate to your server.

### How Spring Security's CSRF protection works

```java
http.csrf(Customizer.withDefaults()); // enabled by default for traditional, session-based applications
```

Spring Security generates a unique, unpredictable **CSRF token** per session, which must be included in any state-changing request (`POST`/`PUT`/`DELETE`) as either a hidden form field or a custom request header. Since a malicious third-party site has no way to know this token (it can't read it out of your application's own session-scoped cookie or page content due to the browser's same-origin policy), it cannot forge a valid, token-included request on the victim's behalf — even though it *can* still make the browser send the session cookie automatically.

> ⚠️ **A very common, real-world configuration decision:** For a **stateless**, token-based (JWT) API — where authentication doesn't rely on browser-managed session cookies at all, but on an explicit `Authorization: Bearer <token>` header the client must deliberately attach itself — CSRF protection is generally **disabled** (`http.csrf(csrf -> csrf.disable())`), since the entire attack relies specifically on the browser's automatic, involuntary cookie attachment behavior, which simply doesn't apply when authentication is carried in a header the browser never attaches automatically.

---

## 9. CORS — A Distinct, Frequently-Confused Concern

**Cross-Origin Resource Sharing (CORS)** is a **browser-enforced** mechanism controlling whether JavaScript running on one origin (domain/port/protocol) is allowed to make requests to a different origin — a completely separate concern from CSRF, though the two are frequently confused since both relate to cross-site request behavior.

```java
@Bean
public CorsConfigurationSource corsConfigurationSource() {
    CorsConfiguration config = new CorsConfiguration();
    config.setAllowedOrigins(List.of("https://myfrontend.com"));
    config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
    config.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", config);
    return source;
}
```

| | CSRF | CORS |
|---|---|---|
| Protects against | A malicious site tricking a victim's browser into making an unwanted **state-changing** request using the victim's own credentials | A browser script on one origin reading a response from a different origin's API without permission |
| Enforced by | Your server, checking a token | The **browser itself**, based on response headers your server sends |
| Relevant even without JavaScript involved? | Yes — a plain HTML `<form>` submission can trigger CSRF | No — CORS specifically concerns script-initiated cross-origin requests |

---

## 10. Session Management — Stateful vs Stateless Authentication

### Stateful (traditional, session-cookie-based)

```java
http.sessionManagement(session -> session
    .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED) // the default
);
```

The server creates and maintains an `HttpSession` (recall this in full detail from the Servlets notes) after a successful login, and the client's browser automatically attaches the session cookie on every subsequent request. This inherits every consideration already covered in the Servlets notes' session-management section — including the load-balanced, multi-server session-locality problem, and the need for sticky sessions, session replication, or externalized session storage in a clustered deployment.

### Stateless (token-based, typically JWT)

```java
http.sessionManagement(session -> session
    .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
);
```

No server-side session is created at all. Instead, upon successful login, the server issues a **JSON Web Token (JWT)** — a self-contained, cryptographically signed token encoding the user's identity and claims (roles, expiration time) directly within it. The client stores this token (commonly in memory or local storage) and attaches it as an `Authorization: Bearer <token>` header on every subsequent request.

```
Header.Payload.Signature
   │       │        │
   │       │        └── HMAC or RSA signature over header+payload, using a server-held secret/private key
   │       └── Base64-encoded claims: { "sub": "alice", "roles": ["USER"], "exp": 1735689600 }
   └── Base64-encoded algorithm/type metadata
```

### Why this is genuinely "stateless"

The server needs **zero stored session state** to validate a request — it simply re-verifies the token's signature (using its own secret/public key) and checks the embedded expiration claim, entirely locally, with no database or session-store lookup required at all. This is precisely why JWTs are so well-suited to horizontally-scaled microservices architectures: **any** server instance can validate **any** token independently, without needing shared session storage or sticky-session routing — directly solving the exact multi-server session-locality problem the Servlets notes described for traditional cookie-based sessions.

> ⚠️ **The real trade-off — revocation is hard.** Because a JWT is self-contained and independently verifiable, there's no natural way to "log a user out early" or revoke a single compromised token before its embedded expiration time arrives — the server has no session record to simply delete. Common mitigations include keeping JWT lifetimes deliberately short (minutes, not days), pairing them with a separate, longer-lived "refresh token" that *can* be revoked via a server-side store, or maintaining a (defeating some of the statelessness benefit) server-side blocklist of explicitly revoked token IDs.

---

## 11. A Custom JWT Authentication Filter — How the Pieces Fit Together

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String header = request.getHeader("Authorization");
        if (header != null && header.startsWith("Bearer ")) {
            String token = header.substring(7);
            if (jwtService.isValid(token)) {
                String username = jwtService.extractUsername(token);
                UserDetails userDetails = userDetailsService.loadUserByUsername(username);
                Authentication auth = new UsernamePasswordAuthenticationToken(
                        userDetails, null, userDetails.getAuthorities());
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(request, response); // always continue the chain, per the Servlets notes' filter pattern
    }
}
```

```java
http.addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);
```

This directly reuses the `OncePerRequestFilter`/`FilterChain` mechanics from the Servlets notes: the filter inspects the incoming `Authorization` header, validates the JWT, and — if valid — manually populates `SecurityContextHolder` with an `Authentication` object **before** calling `chain.doFilter()`, so that everything downstream (authorization checks, `@PreAuthorize`, controller methods calling `SecurityContextHolder.getContext().getAuthentication()`) sees a properly authenticated request, exactly as if the user had logged in via a traditional session-based flow.

---

## 12. Real-World Scenarios

### E-commerce — Role-based access separating customers from admin staff
```java
.requestMatchers("/api/admin/**").hasRole("ADMIN")
.requestMatchers("/api/orders/**").hasAnyRole("USER", "ADMIN")
```
A single API application safely serves both regular customers and internal admin staff, with clean, declarative rules preventing a regular customer from ever reaching admin-only endpoints, without duplicating authorization checks inside every individual controller method.

### Banking — Resource-level authorization ensuring users can only access their own accounts
```java
@PreAuthorize("#accountId == authentication.principal.accountId or hasRole('ADMIN')")
public Account getAccount(Long accountId) { ... }
```
Coarse, URL-pattern-based rules alone can't express "a user may view account 42, but not account 43" — method-level `@PreAuthorize` with SpEL access to both the method arguments and the authenticated principal handles this fine-grained, per-resource authorization directly.

### Microservices — Stateless JWT validation across independently-scaled services
A checkout microservice and an inventory microservice both independently validate the same JWT issued by a central authentication service, using only a shared public key — neither service needs to query a shared session store or coordinate with the other to authenticate a request, letting both scale horizontally and independently, exactly the benefit described in Section 10.

### Public APIs — Distinguishing CSRF-relevant browser clients from token-based API clients
A platform exposing both a traditional, session-cookie-based web dashboard **and** a stateless JWT-based public API applies CSRF protection only to the session-based dashboard routes, while disabling it for the stateless API routes — correctly recognizing that CSRF protection is meaningful only where the browser's automatic cookie attachment is actually in play.

---

## 13. Common Mistakes / Gotchas

> ⚠️ **Storing plaintext passwords, or using a fast general-purpose hash (SHA-256/MD5) instead of BCrypt/Argon2** — both make credential theft catastrophically easier to exploit at scale.

> ⚠️ **Confusing `401` and `403`**, sending the wrong status code and confusing API consumers about whether they need to re-authenticate versus request different permissions.

> ⚠️ **Ordering `authorizeHttpRequests` rules incorrectly**, placing a broad rule before a more specific one that then never gets evaluated, since the first matching rule wins.

> ⚠️ **Disabling CSRF protection on a traditional, cookie-session-based application** without understanding why — this is appropriate for stateless, header-token-based APIs, but genuinely dangerous for session-cookie-based ones.

> ⚠️ **Calling a `@PreAuthorize`-annotated method from another method in the same class**, silently bypassing the authorization check entirely — the exact same AOP self-invocation pitfall already covered for `@Transactional` in the Spring Core notes.

> ⚠️ **Assuming `SecurityContextHolder`'s `Authentication` automatically propagates across manually-spawned threads or async task boundaries**, without realizing it needs the same explicit propagation care as `MDC` from the Logging Frameworks notes.

> ⚠️ **Issuing JWTs with an excessively long lifetime**, making a stolen token dangerously long-lived with no easy way to revoke it before expiration.

---

## 14. Comparison: Session-Based vs Token-Based Authentication

| Aspect | Session-Based (Stateful) | JWT-Based (Stateless) |
|---|---|---|
| Server-side storage required | Yes — an `HttpSession` per logged-in user | No — the token is fully self-contained |
| Scales horizontally without extra infrastructure? | No — needs sticky sessions, replication, or externalized session storage | Yes — any server instance can validate any token independently |
| Easy to revoke immediately? | Yes — simply invalidate the server-side session | Hard — requires short lifetimes, refresh tokens, or a revocation blocklist |
| CSRF-relevant? | Yes — session cookies are attached automatically by the browser | Generally no — tokens are attached explicitly via a header the browser doesn't send automatically |
| Typical use case | Traditional server-rendered web applications | REST APIs, microservices, mobile app backends |

---

## Interview Questions

1. How is Spring Security's filter chain related to the plain Servlet `Filter`/`FilterChain` mechanism covered in the Servlets notes, and how are they actually wired together in a running application?
2. What is the difference between authentication and authorization, and what HTTP status code should each type of failure produce?
3. Why is `SecurityContextHolder`'s default `ThreadLocal`-based storage subject to the same cross-thread propagation problem already covered for MDC, and what utility does Spring Security provide to address it?
4. Walk through the collaboration between `AuthenticationManager`, `DaoAuthenticationProvider`, `UserDetailsService`, and `PasswordEncoder` during a username/password login attempt.
5. Why is a fast, general-purpose cryptographic hash function like SHA-256 considered unsuitable for password storage, and what specific property does BCrypt have that makes it more appropriate?
6. How does BCrypt's embedded salt defeat rainbow-table attacks, and why do two users with the identical password end up with completely different stored hash values?
7. Explain the self-invocation pitfall as it applies to `@PreAuthorize`, tying your answer back to the same underlying AOP proxy mechanism responsible for `@Transactional`.
8. What specific browser behavior does CSRF exploit, and why does disabling CSRF protection make sense for a stateless, JWT-based API but not for a traditional session-cookie-based application?
9. What is the fundamental difference between what CSRF and CORS each protect against, even though both are frequently confused as "the same cross-site security thing"?
10. Why is a JWT-based authentication scheme described as "stateless," and what specific multi-server scalability problem (already discussed in the Servlets notes) does this solve?
11. What is the core trade-off of JWT-based authentication regarding token revocation, and name two common mitigations for it.
12. Why must a security rule ordering mistake in `authorizeHttpRequests` (a broad rule placed before a specific one) be considered a serious bug, tying your answer to the general "first matching rule wins" principle seen elsewhere in this notes series (exception handling, pattern-matching switch)?