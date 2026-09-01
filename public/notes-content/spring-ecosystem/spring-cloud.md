# Spring Cloud

> **Topic:** Service discovery, client-side load balancing, API gateways, centralized configuration, circuit breakers, and distributed tracing

---

## 1. Why Spring Cloud Exists — The Problems Unique to Microservices

Every notes file in this Spring series so far has focused on building **one well-structured application**. Spring Cloud addresses an entirely different category of problem: what happens when your system is composed of **many independently deployed services**, each potentially built and scaled independently, communicating with each other over the network?

Splitting a monolith into microservices trades a set of in-process problems (tight coupling, difficult independent scaling, one team blocking another's deploys) for a **new** set of genuinely hard distributed-systems problems that a single, monolithic Spring Boot application never had to face at all:

| Problem | Why it's hard in a distributed system |
|---|---|
| **Where is service B, exactly?** | Service instances are created and destroyed dynamically (auto-scaling, rolling deployments) — a hard-coded URL/IP for "the inventory service" breaks the moment that instance is replaced |
| **What if service B is slow or down?** | A single failing downstream service can cause cascading failures and thread/connection exhaustion across every service that calls it (recall the JDBC connection pool exhaustion scenario) |
| **How do I configure dozens of services consistently?** | Each service has its own `application.yml`, and keeping shared configuration (a database URL, a feature flag) consistent across many independently-deployed services is error-prone if done manually, one service at a time |
| **How do I trace one logical request across ten services?** | The single-process, single-log-file debugging model this entire notes series has otherwise assumed breaks down completely once a request fans out across many independent processes |

**Spring Cloud** is an umbrella project providing a curated, opinionated set of libraries specifically addressing these distributed-systems concerns, building on top of the Spring Boot foundation already covered in earlier notes.

> 💡 **Key insight:** Nearly every Spring Cloud component is solving a problem that simply **doesn't exist** in a single-process application — this is precisely why these tools are irrelevant to a monolith, but become essential the moment an application is decomposed into multiple independently-deployed services that must discover, call, and reason about each other reliably over an unreliable network.

---

## 2. Service Discovery — Finding Services Dynamically

### The problem

In a monolith, calling another part of your own system is just a Java method call — no network, no address to resolve. In a microservices architecture, calling the inventory service means making an HTTP call to **some** running instance of it — but which one, and at what address, given that instances are constantly being created, destroyed, and rescheduled by the underlying infrastructure (Kubernetes, an auto-scaling group)?

### The service discovery solution

```
     Service Registry (e.g., Eureka Server)
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  Order Service  Inventory Svc  Payment Svc
  (registers      (registers    (registers
   itself on       itself on     itself on
   startup)        startup)      startup)
```

Every service instance **registers itself** with a central **service registry** on startup (announcing "I am `inventory-service`, reachable at `10.0.4.12:8080`"), and periodically sends **heartbeats** to prove it's still alive. Any service wanting to call another service **looks up** the current, live set of instances from the registry, rather than relying on a hard-coded address.

```java
@EnableEurekaServer
@SpringBootApplication
public class DiscoveryServerApplication { }
```

```yaml
# a client service's configuration
eureka:
  client:
    service-url:
      defaultZone: http://discovery-server:8761/eureka
```

```java
@EnableDiscoveryClient
@SpringBootApplication
public class OrderServiceApplication { }
```

> 💡 **Why this matters practically:** Without service discovery, deploying a new instance of the inventory service (or losing one to a crash) would require manually updating every other service's configuration with the new address — completely impractical at any real scale, and fundamentally incompatible with the elastic, auto-scaling, frequently-redeployed nature of modern cloud infrastructure. Service discovery makes "where is this service right now" a dynamic, queryable fact rather than a static configuration value.

> 💡 **A modern nuance:** In Kubernetes-based deployments specifically, the platform itself already provides DNS-based service discovery natively (a Kubernetes `Service` resource gives you a stable DNS name automatically) — meaning a dedicated tool like Eureka is sometimes unnecessary in a pure Kubernetes environment, though it remains widely used in non-Kubernetes deployments and in applications that need Spring Cloud's specific client-side load-balancing integration described next.

---

## 3. Client-Side Load Balancing

Once a service knows there are **three** live instances of the inventory service, something needs to decide which one to actually call for any given request — and to do so intelligently, avoiding instances that are known to be down.

```java
@Service
public class OrderService {
    private final RestClient restClient;

    public Inventory checkInventory(String sku) {
        // "inventory-service" is a logical name resolved dynamically via the load balancer,
        // NOT a literal hostname — this could be any of several live instances
        return restClient.get()
                .uri("http://inventory-service/api/inventory/{sku}", sku)
                .retrieve()
                .body(Inventory.class);
    }
}
```

```java
@Bean
@LoadBalanced // marks this RestClient/RestTemplate builder as service-discovery-aware
public RestClient.Builder restClientBuilder() {
    return RestClient.builder();
}
```

`@LoadBalanced` (backed by Spring Cloud LoadBalancer) intercepts the outgoing call, resolves the logical service name (`inventory-service`) against the current list of live instances from the service registry, applies a load-balancing strategy (round-robin by default) to pick one, and rewrites the request to that specific instance's actual address — all transparently, without the calling code ever dealing with actual IP addresses or ports directly.

> 💡 **This is "client-side" load balancing, as distinct from a traditional load balancer:** Rather than every request passing through one centralized load-balancer appliance/service (which itself becomes a potential bottleneck and single point of failure), each calling service independently maintains its own up-to-date view of available instances and makes its own routing decision locally — removing an extra network hop and a shared point of failure, at the cost of every client needing to participate in the discovery/load-balancing mechanism itself.

---

## 4. Spring Cloud Gateway — The API Gateway Pattern

### The problem

Exposing every individual microservice directly to external clients (a mobile app, a browser) is unwieldy and insecure — clients would need to know the address of every single service, handle cross-cutting concerns (authentication, rate limiting, logging) redundantly against each one, and every internal service topology change would become a client-facing breaking change.

### The API gateway solution

```
External Client
       │
       ▼
┌─────────────────┐
│  API Gateway      │  ← the ONLY externally-exposed entry point
└─────────────────┘
       │
   ┌───┼────────┬─────────┐
   ▼            ▼         ▼
Order Svc  Inventory Svc  Payment Svc   (internal-only, never directly exposed)
```

```java
@Bean
public RouteLocator customRoutes(RouteLocatorBuilder builder) {
    return builder.routes()
            .route("orders", r -> r.path("/api/orders/**")
                    .filters(f -> f.stripPrefix(1))
                    .uri("lb://order-service")) // "lb://" — load-balanced, discovery-aware routing
            .route("inventory", r -> r.path("/api/inventory/**")
                    .uri("lb://inventory-service"))
            .build();
}
```

An **API Gateway** (Spring Cloud Gateway being Spring's own implementation) is a single, centralized entry point that routes incoming external requests to the correct internal microservice, while also serving as the natural, single place to apply cross-cutting concerns uniformly across every downstream service — directly analogous to the **Front Controller pattern** from the Spring MVC notes, just applied at the level of an entire distributed system rather than within a single application.

> 💡 **Why this is the Front Controller pattern at a system level:** Recall from the Spring MVC notes that `DispatcherServlet` centralizes request routing so that cross-cutting infrastructure doesn't need to be duplicated across every individual controller. An API Gateway does the exact same thing, one architectural layer up — centralizing authentication, rate limiting, and logging so that individual microservices don't each need to reimplement them, and so that internal service topology can change freely without breaking external clients who only ever talk to the gateway's stable, public-facing routes.

---

## 5. Centralized Configuration — Spring Cloud Config

### The problem

Recall from the Spring Boot notes that `application.yml` externalizes configuration outside your compiled code — but in a microservices architecture with dozens of independently-deployed services, keeping **shared** configuration (a common database connection pool setting, a shared feature flag, a third-party API endpoint) consistent across every service's own local configuration file is itself an error-prone, manual synchronization problem.

### The Config Server solution

```
Git repository (or another backing store)
   containing centrally-managed application-*.yml files
                    │
                    ▼
          Spring Cloud Config Server
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
  Order Service  Inventory Svc  Payment Svc
  (fetches its config from the Config Server at startup)
```

```yaml
# a client service's bootstrap configuration
spring:
  config:
    import: "configserver:http://config-server:8888"
  application:
    name: order-service
```

Each service, at startup, fetches its configuration from the centralized **Config Server** rather than (or in addition to) its own local `application.yml` — and because the Config Server is typically backed by a version-controlled Git repository, configuration changes are themselves versioned, auditable, and reviewable exactly like application code changes, rather than being scattered, untracked edits across dozens of separately-deployed services.

> 💡 **Dynamic refresh, without a redeploy:** Combined with Spring Cloud Bus (a lightweight message-broker-backed mechanism for broadcasting events across all instances of a service), a configuration change pushed to the Config Server's backing Git repository can be propagated to every running service instance and picked up via a `/actuator/refresh` call — directly analogous to the Actuator-driven dynamic log-level change scenario from the Spring Boot notes, just applied to arbitrary configuration values rather than just log levels.

---

## 6. Circuit Breakers — Preventing Cascading Failures

### The problem — cascading failure

Recall the JDBC & Connection Pooling notes' discussion of connection pool exhaustion: if every request to a slow downstream dependency holds a thread/connection for the full timeout duration, a large enough volume of slow requests can exhaust the calling service's own resources entirely — and in a microservices architecture, this failure doesn't stay contained to one service. If Service A calls a struggling Service B, and Service A's own threads/connections become exhausted waiting on B, then **Service C, which calls Service A**, starts experiencing the exact same problem, one level removed — a **cascading failure** that can bring down an entire, otherwise-healthy system because of a single struggling downstream dependency.

### The circuit breaker solution

```java
@Service
public class OrderService {
    private final InventoryClient inventoryClient;

    @CircuitBreaker(name = "inventoryService", fallbackMethod = "inventoryFallback")
    public Inventory checkInventory(String sku) {
        return inventoryClient.getInventory(sku);
    }

    public Inventory inventoryFallback(String sku, Throwable t) {
        return Inventory.unknown(sku); // a safe, degraded default response
    }
}
```

A **circuit breaker** (implemented via **Resilience4j** in modern Spring Cloud applications, having succeeded the now-retired Netflix Hystrix) monitors the failure rate of calls to a specific downstream dependency, and — modeled directly on an electrical circuit breaker — **"trips" open** once failures exceed a configured threshold, immediately failing (or invoking a fallback) for a period of time **without even attempting** the real downstream call, rather than letting every single request continue to wait on a slow, struggling dependency.

```
CLOSED (normal operation, calls pass through)
   │  failure rate exceeds threshold
   ▼
OPEN (calls immediately fail/fallback, real downstream call is NOT attempted at all)
   │  after a configured wait duration
   ▼
HALF-OPEN (a limited number of test calls are allowed through)
   │                                      │
   ▼ succeed                              ▼ still failing
 CLOSED (resume normal operation)      OPEN (trip again)
```

> 💡 **Why this specifically prevents cascading failure:** The moment the circuit trips open, calling threads stop being tied up waiting on the struggling dependency entirely — they get an immediate fallback response instead, freeing up their own service's resources (threads, connection pool slots) to continue serving requests that don't depend on the struggling service, exactly the resource-exhaustion scenario the circuit breaker exists to prevent from cascading upward through the call chain.

---

## 7. Declarative REST Clients — OpenFeign

```java
@FeignClient(name = "inventory-service")
public interface InventoryClient {
    @GetMapping("/api/inventory/{sku}")
    Inventory getInventory(@PathVariable String sku);
}

@Service
public class OrderService {
    private final InventoryClient inventoryClient; // just an interface — Spring generates the implementation

    public void placeOrder(Order order) {
        Inventory inventory = inventoryClient.getInventory(order.getSku());
    }
}
```

This should look immediately familiar: `@FeignClient` applies **the exact same dynamic-proxy technique already covered in the Spring Data JPA notes** for repository interfaces — you declare an interface describing the calls you want to make, and Spring generates a working implementation at runtime, this time backed by an actual HTTP client (rather than an `EntityManager`) making calls to the named, service-discovery-resolved downstream service. Feign integrates directly with the load-balancing (Section 3) and circuit-breaking (Section 6) mechanisms already described, letting you add `@CircuitBreaker` around a Feign-backed method exactly as you would around any other method.

> 💡 **A recurring theme across this entire notes series:** JDBC drivers behind a standard interface, Hibernate behind JPA, `SimpleJpaRepository` behind a repository interface, and now an actual HTTP client behind a `@FeignClient` interface — Spring's ecosystem repeatedly applies the same underlying pattern: **declare an interface describing your intent, let a proxy generate the real, mechanical implementation.**

---

## 8. Distributed Tracing

### The problem, revisited from the Logging Frameworks notes

The Logging Frameworks notes already introduced the idea of an MDC-propagated trace ID for correlating a single request's logs across multiple services. Distributed tracing tools formalize and automate this, going further than a simple correlation ID by capturing the actual **timing and parent-child relationship** of every hop a request makes across a distributed system.

```
Trace: abc123
 └─ Span: API Gateway (12ms)
     └─ Span: Order Service (145ms)
         ├─ Span: Inventory Service call (40ms)
         └─ Span: Payment Service call (95ms)
             └─ Span: Database query (30ms)
```

Modern Spring applications use **Micrometer Tracing** (the successor to the now-retired Spring Cloud Sleuth) to automatically instrument outgoing HTTP calls, database queries, and message-broker interactions with **trace IDs** (identifying the overall, end-to-end request) and **span IDs** (identifying one specific hop/operation within that trace), exporting this data to a tracing backend like **Zipkin** or **Jaeger** for visualization.

```yaml
management:
  tracing:
    sampling:
      probability: 1.0 # sample 100% of requests — often reduced in high-traffic production systems
  zipkin:
    tracing:
      endpoint: http://zipkin:9411/api/v2/spans
```

> 💡 **Why this directly extends, rather than replaces, the MDC-based correlation approach:** The trace ID Micrometer Tracing generates is automatically injected into the MDC (the same `MDC` mechanism from the Logging Frameworks notes) for every log line, meaning your existing structured, JSON-based logging setup automatically gains trace correlation with no extra logging code — while the tracing backend additionally captures the timing/hierarchy data that plain log correlation alone never could, letting you visualize exactly which specific hop in a 10-service call chain was actually responsible for a slow overall response.

---

## 9. Real-World Scenarios

### E-commerce checkout — The full Spring Cloud stack working together
```
Mobile App → API Gateway → Order Service → (via Feign, load-balanced, circuit-breaker-protected)
                                              ├─ Inventory Service
                                              └─ Payment Service
```
A checkout request enters through the API Gateway (the only externally-exposed endpoint), is routed to the Order Service, which uses a `@FeignClient` (discovered via the service registry, load-balanced across live instances) to call Inventory and Payment services, each call wrapped in a circuit breaker so that a struggling Payment Service doesn't exhaust Order Service's own resources and cascade into an outage of Order Service itself — with a trace ID automatically propagated and logged across all four services for post-incident diagnosis.

### Configuration management — Rotating a shared API key across a dozen services without twelve redeployments
A shared third-party API key used by several services is updated once, in the Config Server's backing Git repository, and propagated to every affected running instance via Spring Cloud Bus and an Actuator refresh — rather than requiring a coordinated, manual redeployment of a dozen separate services just to pick up one changed value.

### Resilience engineering — A circuit breaker protecting against a recommendation service outage
```java
@CircuitBreaker(name = "recommendations", fallbackMethod = "defaultRecommendations")
public List<Product> getRecommendations(Long userId) {
    return recommendationClient.getRecommendations(userId);
}

public List<Product> defaultRecommendations(Long userId, Throwable t) {
    return productService.getPopularProducts(); // a reasonable, generic fallback
}
```
An e-commerce product page continues to render (with a generic "popular products" fallback instead of personalized recommendations) even if the recommendation service is completely down — a genuinely valuable degraded-but-functional user experience, rather than the entire page failing because of one non-critical dependency.

### Incident response — Using distributed tracing to pinpoint a slow hop in a 6-service call chain
An engineer investigating a slow checkout endpoint uses a Zipkin trace view (rather than manually correlating log timestamps across six separate services' log files) to immediately see that 90% of the total request time was spent in one specific downstream database query inside the Inventory Service — turning what could have been an hours-long, cross-team log-hunting exercise into a five-minute, visually-obvious diagnosis.

---

## 10. Common Mistakes / Gotchas

> ⚠️ **Hard-coding a downstream service's address instead of using service discovery**, reintroducing exactly the brittleness (breaking on every redeploy/rescale of the downstream service) that service discovery exists to eliminate.

> ⚠️ **Exposing every individual microservice directly to external clients** rather than routing everything through a single API Gateway, duplicating cross-cutting concerns across services and coupling external clients to internal service topology.

> ⚠️ **Not setting a circuit breaker's failure threshold and wait duration deliberately**, either tripping too aggressively on normal, brief blips (unnecessarily degrading service) or not tripping quickly enough to actually prevent cascading resource exhaustion.

> ⚠️ **Treating a fallback method as "handling the error" without considering what a degraded response actually means for the user** — a fallback that silently returns an empty or nonsensical result can be worse than a clear, visible failure, depending on the specific use case.

> ⚠️ **Assuming a Config Server refresh automatically propagates instantly to every service without wiring up Spring Cloud Bus (or manually triggering `/actuator/refresh` on every instance)** — configuration changes don't magically appear in running instances without an explicit refresh mechanism.

> ⚠️ **Sampling 100% of traces in a very high-traffic production system without considering the storage/performance cost**, when a much lower sampling rate (still capturing a statistically meaningful, representative sample) is usually sufficient for real-world diagnostic needs.

---

## 11. Comparison: The Core Spring Cloud Components and the Problem Each Solves

| Component | Problem it solves |
|---|---|
| **Service Discovery (Eureka)** | "Where is a live instance of this service, right now?" |
| **Client-Side Load Balancing** | "Given several live instances, which one should I call for this request?" |
| **Spring Cloud Gateway** | "What is the single, stable entry point external clients should talk to?" |
| **Spring Cloud Config** | "How do I keep shared configuration consistent across many independently-deployed services?" |
| **Resilience4j Circuit Breaker** | "How do I stop a struggling downstream dependency from cascading into an outage of my own service?" |
| **OpenFeign** | "How do I call another service without hand-writing boilerplate HTTP client code?" |
| **Micrometer Tracing + Zipkin** | "How do I understand the timing and structure of one logical request across many services?" |

---

## Interview Questions

1. Why do problems like service discovery and circuit breaking simply not exist in a single-process, monolithic Spring Boot application, and what specifically about a microservices architecture introduces them?
2. Explain how service discovery works end to end: what does a service do on startup, and how does a calling service find a live instance to call?
3. What is the difference between client-side load balancing (as used with `@LoadBalanced`) and a traditional, centralized load balancer, and what specific trade-off does the client-side approach make?
4. How does an API Gateway embody the same Front Controller pattern already covered for `DispatcherServlet` in the Spring MVC notes, just applied at a different architectural layer?
5. Why is centralizing configuration in a Git-backed Config Server considered an improvement over each service maintaining its own local `application.yml` independently?
6. Explain cascading failure in a microservices context, tying your answer back to the connection-pool-exhaustion scenario from the JDBC & Connection Pooling notes.
7. Walk through a circuit breaker's three states (closed, open, half-open) and explain what triggers each transition.
8. How is `@FeignClient` conceptually similar to a Spring Data JPA repository interface, in terms of how its actual implementation comes into existence at runtime?
9. What specific benefit does formal distributed tracing (spans, parent-child relationships, a visual trace timeline) provide beyond what a simple MDC-propagated correlation ID (from the Logging Frameworks notes) already offers?
10. Why might sampling 100% of requests for distributed tracing be inappropriate in a very high-traffic production system, and what would you do instead?
11. What is the actual difference between a circuit breaker's fallback response and simply letting a call fail with an exception, and why might a fallback sometimes be the wrong choice depending on what the fallback actually returns?
12. In a Kubernetes-based deployment, why might a team decide they don't need a dedicated service discovery tool like Eureka at all, and what does the platform provide instead?