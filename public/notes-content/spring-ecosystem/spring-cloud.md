# Spring Cloud

Spring Cloud provides patterns and integrations for distributed Spring applications.

Common capabilities include centralized configuration, service discovery, API gateways, declarative HTTP clients, resilience patterns, and distributed tracing.

## Design guidance

- Keep configuration external to application binaries.
- Set timeouts on every remote call.
- Combine retries with backoff and a clear retry budget.
- Use correlation IDs and structured logs for cross-service diagnosis.
