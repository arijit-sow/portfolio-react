# Spring Boot Essentials

Spring Boot simplifies Spring development by offering opinionated convention-over-configuration defaults and production-ready runtime capabilities.

---

## 1. Core Pillars
- **Auto-Configuration (`@EnableAutoConfiguration`):** Scans classpath dependencies and configures appropriate beans automatically (e.g., if `spring-boot-starter-data-jpa` and `postgresql` are on the classpath, it configures a `DataSource` and `EntityManagerFactory`).
- **Starter POMs:** Aggregated dependency descriptors (`spring-boot-starter-web`, `spring-boot-starter-security`) resolving version conflicts.
- **Embedded Web Servers:** Bundles Apache Tomcat, Jetty, or Undertow directly inside the runnable executable `.jar`.
- **Spring Boot Actuator:** Provides production-monitoring endpoints (`/actuator/health`, `/actuator/metrics`, `/actuator/env`).

---

## 2. `@SpringBootApplication` Annotation Composition
Combines three critical annotations into one:
1. `@SpringBootConfiguration`: Marks the class as a primary source of Spring bean definitions.
2. `@EnableAutoConfiguration`: Enables Spring Boot's automatic configuration mechanism.
3. `@ComponentScan`: Automatically scans for components, controllers, and services in the package where the annotated class resides and its sub-packages.