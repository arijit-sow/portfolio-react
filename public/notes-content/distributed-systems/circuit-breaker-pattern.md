# Circuit Breaker Pattern

A circuit breaker prevents repeated calls to an unhealthy dependency from exhausting application resources.

## States

- **Closed:** calls flow normally and failures are measured.
- **Open:** calls fail fast while the dependency recovers.
- **Half-open:** a limited number of probe calls test recovery.

Configure failure thresholds, open duration, timeouts, and fallbacks based on the dependency's behavior. A fallback should be explicit about degraded data or unavailable functionality; it must not hide persistent failures.
