# Spring Security

Spring Security provides authentication, authorization, protection against common web attacks, and integration with OAuth2 and JWT-based systems.

## Core concepts

- **Authentication** identifies the caller.
- **Authorization** decides what the caller may access.
- **Security filter chain** applies security rules to each request.
- **Granted authorities** represent roles or permissions.

Prefer explicit endpoint rules, least-privilege authorities, secure password hashing, and CSRF protection for browser sessions.
