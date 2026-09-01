# Spring Boot Essentials

> **Topic:** Auto-configuration internals, starters, the executable fat JAR, embedded servers, externalized configuration, and Actuator

---

## 1. Why Spring Boot Exists — The Problem It Solved

By the mid-2010s, Spring itself had become the dominant framework for enterprise Java, but a genuinely new problem had emerged: **setting up a new Spring application required a large amount of repetitive, error-prone configuration** before you could write a single line of actual business logic.

### The pre-Spring-Boot reality

A typical Spring web application before Boot required:
- Manually declaring and version-matching a large web of dependencies (Spring MVC, Jackson, a logging framework, a connection pool, Hibernate, a specific Servlet API version) — and getting any of these versions subtly wrong could cause obscure, hard-to-diagnose runtime failures.
- Manually configuring a `DispatcherServlet` registration, a `ViewResolver`, a `DataSource`, an `EntityManagerFactory`, and dozens of other beans, typically via verbose XML or, later, `@Configuration` classes that still had to be written by hand, bean by bean.
- Manually packaging a WAR file and deploying it to a separately-installed, separately-managed application server (Tomcat, JBoss, WebLogic) — meaning the deployment environment and the application were two separate things that had to be kept in version-compatible lockstep.

> 💡 **Key insight:** Spring Boot's entire value proposition can be summarized as **"convention over configuration, applied specifically to the Spring ecosystem."** Rather than requiring you to explicitly wire up dozens of beans that 95% of applications configure the exact same way, Spring Boot ships sensible, well-tested defaults automatically — while still allowing any of those defaults to be overridden explicitly the moment your application's needs diverge from the common case.

---

## 2. `@SpringBootApplication` — The Single Entry-Point Annotation

```java
@SpringBootApplication
public class MyApplication {
    public static void main(String[] args) {
        SpringApplication.run(MyApplication.class, args);
    }
}
```

This one annotation is actually a **meta-annotation** — a combination of three separate annotations, each pulling its own weight:

```java
@SpringBootConfiguration  // effectively @Configuration — this class itself can declare @Bean methods
@EnableAutoConfiguration  // triggers Spring Boot's auto-configuration mechanism (Section 3)
@ComponentScan            // scans this class's own package (and sub-packages) for @Component beans
public @interface SpringBootApplication { }
```

> ⚠️ **A real, common consequence of `@ComponentScan`'s implicit scope:** Because component scanning defaults to the package containing your `@SpringBootApplication` class (and everything beneath it), placing this class in the **wrong package** — or placing some of your `@Component`/`@Service`/`@Repository` classes in a sibling package that isn't a sub-package of it — silently causes those beans to never be discovered, with no error at all, just a confusing `NoSuchBeanDefinitionException` later when something tries to inject them. The conventional fix is to always place the main application class in the application's **root** package, with every other package nested beneath it.

---

## 3. Auto-Configuration — How the "Magic" Actually Works

Auto-configuration is Spring Boot's mechanism for automatically registering beans your application probably needs, based purely on **what's present on the classpath** and **what you haven't already configured yourself**.

### The mechanism, step by step

1. At startup, `@EnableAutoConfiguration` triggers Spring Boot to look for a file on the classpath named `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` (in older Boot versions, `META-INF/spring.factories`), which lists the fully-qualified class names of every available **auto-configuration class** across every JAR on the classpath.
2. Each listed auto-configuration class is itself a normal `@Configuration` class, but annotated with **conditional annotations** that determine whether it should actually activate for *this specific application*.
3. Spring evaluates each of these conditions and only actually applies the auto-configuration classes whose conditions are satisfied.

### The conditional annotations that make this possible

```java
@Configuration
@ConditionalOnClass(DataSource.class)              // only activate if a DataSource class is on the classpath
@ConditionalOnMissingBean(DataSource.class)         // only activate if the developer hasn't already defined one
@EnableConfigurationProperties(DataSourceProperties.class)
public class DataSourceAutoConfiguration {
    @Bean
    public DataSource dataSource(DataSourceProperties properties) {
        return properties.initializeDataSourceBuilder().build();
    }
}
```

| Conditional annotation | Activates when |
|---|---|
| `@ConditionalOnClass` | A specific class is present on the classpath (e.g., only configure a `DataSource` if a JDBC driver is actually present) |
| `@ConditionalOnMissingBean` | No bean of the given type has already been defined by the application — this is precisely what allows you to **override** any auto-configured bean simply by defining your own |
| `@ConditionalOnProperty` | A specific configuration property is set (and optionally, set to a specific value) |
| `@ConditionalOnWebApplication` | The application is a web application (as opposed to a plain batch/CLI application) |
| `@ConditionalOnMissingClass` | A specific class is **absent** from the classpath |

> 💡 **Key insight — this is why "just add the dependency" works:** Adding `spring-boot-starter-data-jpa` to your build file pulls in Hibernate and Spring Data JPA onto the classpath. The moment those classes are present, `@ConditionalOnClass`-guarded auto-configuration classes for JPA/Hibernate automatically activate and configure an `EntityManagerFactory`, a `TransactionManager`, and related beans — all without you writing a single line of explicit configuration. And critically, `@ConditionalOnMissingBean` means if you **do** define your own `DataSource` bean explicitly, Spring Boot's auto-configuration politely steps aside and uses yours instead — auto-configuration is designed to be a sensible **default**, never a rigid override you're stuck with.

---

## 4. Starters — Curated, Version-Aligned Dependency Bundles

A **starter** (e.g., `spring-boot-starter-web`, `spring-boot-starter-data-jpa`, `spring-boot-starter-security`) is a single dependency declaration that transitively pulls in a **curated, mutually-compatible set** of libraries for a given kind of functionality.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-web</artifactId>
</dependency>
```

Declaring `spring-boot-starter-web` alone transitively brings in Spring MVC, an embedded Tomcat server, Jackson for JSON serialization, and Spring's core validation support — all at versions that the Spring Boot team has already tested together and verified to work correctly as a set.

### How version compatibility is actually enforced — the Spring Boot BOM

Underlying every starter is Spring Boot's **Bill of Materials (BOM)** — `spring-boot-dependencies` — a centralized list of exact, tested version numbers for hundreds of common libraries. When your project inherits from `spring-boot-starter-parent` (Maven) or applies the Spring Boot Gradle plugin, you generally **never need to specify a version number** for any Spring-Boot-managed dependency yourself; the BOM supplies it, and Spring Boot's own release testing has already verified that this specific combination of versions works correctly together.

> 💡 **Why this matters practically:** Before this, a developer manually adding Hibernate, Jackson, and a connection pool to a project had to research and manually keep in sync which versions of each were actually compatible with each other — a real, recurring source of "dependency hell" bugs. The BOM outsources that version-compatibility research entirely to the Spring Boot release team, who test the whole combination as a unit before every release.

---

## 5. The Executable "Fat JAR" and Embedded Servers

### The old deployment model

Traditionally, a Java web application was packaged as a **WAR** file — containing only the application's own code and dependencies, deliberately **excluding** the servlet container itself, since the WAR was meant to be deployed *into* a separately-installed application server (Tomcat, JBoss) already running on the target machine.

### The Spring Boot model — the application IS the server

```bash
java -jar myapp.jar
```

Spring Boot flips this: the servlet container (Tomcat, by default, though Jetty and Undertow are swappable alternatives) is **embedded directly inside your application's own JAR**, alongside your code and every other dependency, producing a single, self-contained, directly-executable **"fat JAR"** that requires nothing pre-installed on the target machine beyond a JVM itself.

### How a fat JAR actually works internally

A naive attempt to just `zip` all your dependency JARs together into one big JAR wouldn't actually work correctly — standard JAR/ZIP class loading doesn't support **JARs nested inside other JARs** cleanly, and simply merging every dependency's files together risks file-name collisions between different libraries.

Spring Boot solves this with its own **`Launcher`** classes (`JarLauncher`, `WarLauncher`) and a specific internal JAR layout:

```
myapp.jar
├── META-INF/MANIFEST.MF          ← specifies org.springframework.boot.loader.JarLauncher as Main-Class
├── org/springframework/boot/loader/   ← Spring Boot's own bootstrapping classes, embedded directly
├── BOOT-INF/
│   ├── classes/                  ← your own application's compiled .class files
│   └── lib/                      ← every dependency, kept as SEPARATE, individual, nested .jar files
```

When you run `java -jar myapp.jar`, the JVM's own classloader first loads only `JarLauncher` (as declared in the manifest). `JarLauncher` then constructs a **custom classloader** (`LaunchedURLClassLoader`) capable of reading classes directly out of the nested JARs under `BOOT-INF/lib/` **without extracting them to disk first**, and finally invokes your actual `public static void main()` method through that custom classloader — giving your application a classpath assembled from dozens of individually-preserved dependency JARs, all bundled inside one outer, directly-executable file.

> 💡 **Why nested JARs, rather than merging everything into one flat set of `.class` files (a "shaded" JAR):** Keeping each dependency as its own distinct, untouched JAR avoids the file-collision and resource-merging problems that flattening everything together can cause (e.g., two different libraries both shipping a `META-INF/services/...` file at the same path, where naive merging would silently let one overwrite the other). It also makes the resulting JAR easy to reason about, inspect, and generate an accurate dependency/vulnerability report from.

---

## 6. Externalized Configuration

Spring Boot strongly favors keeping configuration **outside** your compiled code, in `application.properties` or `application.yml`, so the exact same JAR/image can be deployed unmodified across development, staging, and production, differing only in configuration.

```yaml
# application.yml
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/mydb
    username: appuser

myapp:
  payment-gateway:
    api-key: sk_test_...
    timeout-seconds: 5
```

### `@Value` vs `@ConfigurationProperties`

```java
// @Value — simple, single-property injection
@Component
public class PaymentGatewayClient {
    @Value("${myapp.payment-gateway.api-key}")
    private String apiKey;
}

// @ConfigurationProperties — type-safe binding of an entire configuration section to one object
@ConfigurationProperties(prefix = "myapp.payment-gateway")
public class PaymentGatewayProperties {
    private String apiKey;
    private int timeoutSeconds;
    // getters and setters
}
```

`@ConfigurationProperties` is generally preferred for anything beyond a single, standalone value — it groups related settings into one strongly-typed, IDE-autocompletable object (rather than scattering individual `@Value("${...}")` annotations across many classes), supports validation via Bean Validation annotations directly on the properties class, and fails fast at startup with a clear error if a required property is missing, rather than injecting `null` silently.

### The externalized configuration precedence order

Spring Boot allows the **same** logical property to be set in multiple places simultaneously, resolved according to a well-defined precedence order (highest to lowest, abbreviated to the most commonly relevant sources):

```
1. Command-line arguments               (--server.port=9090)
2. JVM system properties                (-Dserver.port=9090)
3. OS environment variables             (SERVER_PORT=9090)
4. Profile-specific application-{profile}.yml/properties
5. Application's own application.yml/properties
6. Defaults built into auto-configuration classes
```

> 💡 **Why this matters practically:** This precedence order is precisely what allows the same packaged JAR/container image to be deployed unmodified across every environment, with environment-specific values (a database URL, a secret API key) supplied purely via environment variables or command-line flags at deploy time — a foundational practice for cloud-native, container-based deployment (following the widely-cited "twelve-factor app" configuration principle) where you never want environment-specific secrets baked directly into a build artifact.

---

## 7. Profiles in Spring Boot

Building directly on the `@Profile` mechanism from the Spring Core notes, Spring Boot extends this to entire **configuration files**:

```
application.yml               ← always loaded, shared baseline configuration
application-dev.yml            ← loaded only when "dev" profile is active
application-production.yml     ← loaded only when "production" profile is active
```

```bash
java -jar myapp.jar --spring.profiles.active=production
```

Profile-specific files are layered **on top of** the base `application.yml`, overriding just the specific keys they redefine — letting most configuration live in one shared baseline file, with only genuinely environment-specific differences duplicated across profile-specific files.

---

## 8. Spring Boot Actuator — Production-Ready Observability Out of the Box

**Actuator** is a Spring Boot starter that exposes a set of ready-made HTTP endpoints for monitoring and managing a running application in production, without you needing to build any of this yourself.

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-actuator</artifactId>
</dependency>
```

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,info,metrics,loggers
```

| Endpoint | Purpose |
|---|---|
| `/actuator/health` | Reports whether the application (and its key dependencies — database, message broker, disk space) is up and healthy — the standard endpoint load balancers and container orchestrators (Kubernetes liveness/readiness probes) poll |
| `/actuator/metrics` | Exposes detailed runtime metrics (JVM memory, garbage collection activity, HTTP request counts/latencies, thread pool stats — recall the JFR discussion from the Java 25 notes; Actuator's metrics work alongside, not instead of, JFR-based profiling) |
| `/actuator/info` | Arbitrary, application-supplied build/version metadata |
| `/actuator/loggers` | Lets an operator view and **dynamically change** log levels at runtime — the exact mechanism referenced back in the Logging Frameworks notes' "dynamic log level changes without redeployment" scenario |
| `/actuator/env` | Shows the fully resolved configuration properties currently in effect, from every source in the precedence chain above — invaluable for debugging "why is this property not the value I expect" issues |

> ⚠️ **Security consideration:** Actuator endpoints can expose sensitive operational details (environment variables, configuration values, internal application structure) — production deployments should carefully restrict which endpoints are exposed (`management.endpoints.web.exposure.include`) and secure access to them (typically via Spring Security), rather than exposing everything publicly by default.

---

## 9. Runners — Executing Code at Startup

```java
@Component
public class DataSeeder implements CommandLineRunner {
    @Override
    public void run(String... args) {
        if (userRepository.count() == 0) {
            userRepository.save(new User("admin", "admin@example.com"));
        }
    }
}
```

`CommandLineRunner` (and its sibling, `ApplicationRunner`, which provides parsed `ApplicationArguments` instead of a raw `String[]`) beans have their `run()` method invoked automatically, exactly once, immediately after the `ApplicationContext` has been fully started — a clean, idiomatic hook for startup tasks like seeding reference data, warming a cache, or validating that required external dependencies are reachable before the application starts actually serving traffic.

---

## 10. Testing Support

```java
@SpringBootTest
class OrderServiceIntegrationTest {
    @Autowired
    private OrderService orderService;

    @Test
    void createsOrderSuccessfully() {
        Order order = orderService.create(new CreateOrderRequest(...));
        assertThat(order.getId()).isNotNull();
    }
}
```

`@SpringBootTest` boots up a **real, full `ApplicationContext`** for the test (optionally including a real embedded web server via `webEnvironment = WebEnvironment.RANDOM_PORT`), suitable for genuine integration tests that exercise real bean wiring, real auto-configuration, and (often paired with Testcontainers) a real database.

For faster, more focused tests, Spring Boot also provides narrower "slice" test annotations that load only the beans relevant to one architectural layer:

| Annotation | Loads only |
|---|---|
| `@WebMvcTest` | The Spring MVC layer (controllers, `@ControllerAdvice`, converters) — mocks out the service layer beneath it |
| `@DataJpaTest` | The JPA/Hibernate layer, typically against an in-memory test database |
| `@JsonTest` | Just the Jackson JSON serialization configuration |

> 💡 **Why slice tests matter:** A full `@SpringBootTest` boots the entire application context, which can be genuinely slow once an application has grown to have dozens of beans, database connections, and auto-configured infrastructure. `@WebMvcTest`, by loading only the web layer and mocking out everything beneath it, lets you test a controller's routing, validation, and exception-handling behavior in isolation, quickly, without needing a real database or a real service layer running at all.

---

## 11. Real-World Scenarios

### Cloud-native deployment — One artifact, many environments via externalized config
A team builds a single Docker image containing their Spring Boot fat JAR, then deploys the **exact same, unmodified image** to development, staging, and production Kubernetes clusters — with each environment supplying its own database URL, credentials, and feature flags purely via environment variables mapped into the container, following the precedence order from Section 6. No environment-specific rebuild is ever needed.

### Startup validation — Failing fast if a required dependency is unreachable
```java
@Component
public class DependencyCheckRunner implements ApplicationRunner {
    @Override
    public void run(ApplicationArguments args) {
        if (!paymentGatewayClient.isReachable()) {
            throw new IllegalStateException("Payment gateway is unreachable at startup");
        }
    }
}
```
Rather than starting successfully and only failing later, mysteriously, on the first real request, this runner makes the application refuse to start at all if a critical external dependency isn't reachable — surfacing a real, deployment-blocking problem immediately and loudly, in line with the "fail fast" philosophy already seen in the Spring Core notes' discussion of circular dependency detection.

### Kubernetes — Actuator health checks driving liveness/readiness probes
```yaml
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
```
Kubernetes uses these two distinct Actuator health groups to decide, respectively, whether to **restart** a container that's become unresponsive (liveness) versus whether to **route traffic** to a container that's temporarily busy but not actually broken (readiness) — a direct, practical example of Actuator's endpoints being consumed by infrastructure, not just human operators.

### Incident response — Changing a log level in production without a redeployment
```bash
curl -X POST http://internal-host:8080/actuator/loggers/com.mycompany.payment \
     -H "Content-Type: application/json" \
     -d '{"configuredLevel": "DEBUG"}'
```
An on-call engineer investigating a live payment-processing incident flips a specific package's log level to `DEBUG` via the `/actuator/loggers` endpoint, captures detailed diagnostic output for a few minutes, then flips it back — the exact scenario already described in the Logging Frameworks notes, now shown as an actual Actuator-driven mechanism.

---

## 12. Common Mistakes / Gotchas

> ⚠️ **Placing the `@SpringBootApplication` class outside the application's root package**, causing component scanning to silently miss beans in sibling packages — always keep it at the top of your package hierarchy.

> ⚠️ **Exposing all Actuator endpoints publicly in production** without securing them, potentially leaking sensitive configuration or environment details.

> ⚠️ **Scattering many individual `@Value` annotations** for what's really one cohesive configuration section, instead of a single, type-safe `@ConfigurationProperties` class — harder to validate, harder to discover, and easy to typo a property key with no compile-time check.

> ⚠️ **Using `@SpringBootTest` for every single test**, needlessly slowing down the test suite when a narrower slice test (`@WebMvcTest`, `@DataJpaTest`) would exercise the same logic far faster.

> ⚠️ **Assuming auto-configuration can't be overridden** — defining your own bean of the relevant type (thanks to `@ConditionalOnMissingBean`) is usually all it takes to replace a default Spring Boot auto-configures for you, without needing to disable the auto-configuration class entirely.

> ⚠️ **Baking environment-specific secrets directly into `application.yml`** committed to source control, instead of supplying them via environment variables or a secrets manager at deploy time — a real, recurring security incident pattern.

---

## 13. Comparison: Traditional Spring vs Spring Boot

| Aspect | Traditional Spring (pre-Boot) | Spring Boot |
|---|---|---|
| Bean configuration | Manually written for nearly everything (`DataSource`, `ViewResolver`, etc.) | Auto-configured based on classpath contents, overridable on demand |
| Dependency versions | Manually researched and kept compatible by the developer | Managed centrally via the Spring Boot BOM |
| Deployment artifact | WAR, deployed into a separately-installed application server | Self-contained, directly-executable fat JAR with an embedded server |
| Configuration | Often scattered across XML files | Centralized in `application.yml`/`.properties`, with a well-defined override precedence |
| Production monitoring | Typically hand-built or bolted on via third-party tools | Built in, via Actuator |

---

## Interview Questions

1. What three annotations does `@SpringBootApplication` combine, and what specific responsibility does each one contribute?
2. Explain, step by step, how auto-configuration decides whether to activate a given `@Configuration` class, and name at least two conditional annotations involved.
3. Why does defining your own `DataSource` bean automatically cause Spring Boot's auto-configured `DataSource` to back off, without any explicit configuration to disable it?
4. What problem does the Spring Boot BOM (`spring-boot-dependencies`) solve, and what would go wrong more often without it?
5. Why can't a Spring Boot fat JAR simply be produced by flattening every dependency's `.class` files into one big JAR, and what does Spring Boot's nested-JAR approach do differently?
6. What is the role of `JarLauncher`, and how does it manage to load classes from JARs nested inside the outer executable JAR?
7. List Spring Boot's externalized configuration precedence order from highest to lowest, and explain why command-line arguments outrank `application.yml`.
8. What is the practical difference between `@Value` and `@ConfigurationProperties`, and why is the latter generally preferred for a cohesive group of related settings?
9. Why would placing your `@SpringBootApplication` class in the wrong package silently cause certain beans to never be registered, with no obvious error message?
10. What is the difference between Actuator's liveness and readiness health groups, and why does Kubernetes need both rather than just one combined health check?
11. Why might `@WebMvcTest` be preferred over a full `@SpringBootTest` for testing a single controller's routing and validation behavior?
12. What real, security-relevant risk exists in exposing all Actuator endpoints publicly in a production deployment, and how would you mitigate it?