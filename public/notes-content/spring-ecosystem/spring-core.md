# Spring Core & IoC

> **Topic:** Inversion of Control, Dependency Injection, the ApplicationContext, bean lifecycle, scopes, and how Spring wires everything together

---

## 1. Why Spring Exists — The Problem It Solved

Spring emerged in the early 2000s as a direct reaction against the **heaviness and complexity of Enterprise JavaBeans (EJB) 2.x**, the dominant enterprise Java model of the time. Writing a simple business component under EJB 2.x required implementing multiple mandatory interfaces, writing verbose deployment descriptors (XML), and running inside a full, heavyweight application server just to test a single class — even when that class had no real need for the distributed, transactional, remote-invocation machinery EJB assumed by default.

### The core problem: tight coupling

Beyond the EJB-specific pain, there was a more fundamental, timeless problem Spring's designers wanted to solve: **objects that create their own dependencies are tightly coupled to specific implementations**, making code hard to test, hard to reconfigure, and hard to reuse.

```java
// Tightly coupled — OrderService is permanently welded to a specific PaymentGateway implementation
public class OrderService {
    private PaymentGateway paymentGateway = new StripePaymentGateway(); // hard-coded

    public void placeOrder(Order order) {
        paymentGateway.charge(order.getTotal());
    }
}
```

This design has real, practical consequences: you cannot substitute a mock `PaymentGateway` for unit testing `OrderService` without touching its source code, you cannot swap to a different payment provider without modifying `OrderService` directly, and `OrderService` is responsible for both its own business logic **and** the unrelated concern of knowing how to construct a `StripePaymentGateway`.

---

## 2. Inversion of Control (IoC) — The Core Principle

**Inversion of Control** is the general design principle behind Spring's entire architecture: instead of a class creating (or looking up) the objects it depends on, those dependencies are **handed to it from the outside** by some external coordinating entity — traditionally, "control" over object creation and wiring is *inverted*, moving from the class itself to a container.

```java
// Inverted — OrderService no longer creates its own dependency; it receives it
public class OrderService {
    private final PaymentGateway paymentGateway;

    public OrderService(PaymentGateway paymentGateway) { // handed in from outside
        this.paymentGateway = paymentGateway;
    }

    public void placeOrder(Order order) {
        paymentGateway.charge(order.getTotal());
    }
}
```

`OrderService` now depends only on the `PaymentGateway` **interface**, with zero knowledge of which concrete implementation it's actually working with — that decision has moved entirely outside the class.

> 💡 **Key insight:** IoC is the general principle ("don't call us, we'll call you" — a class doesn't fetch its own collaborators). **Dependency Injection (DI)** is the specific, most common technique used to achieve IoC in Spring: a container constructs objects and *injects* their required collaborators into them, rather than the objects looking their collaborators up themselves (which would be a different IoC technique — the Service Locator pattern, which Spring generally discourages in favor of DI).

---

## 3. Dependency Injection — The Three Forms

### Constructor injection (the generally recommended default)

```java
@Service
public class OrderService {
    private final PaymentGateway paymentGateway;
    private final InventoryService inventoryService;

    public OrderService(PaymentGateway paymentGateway, InventoryService inventoryService) {
        this.paymentGateway = paymentGateway;
        this.inventoryService = inventoryService;
    }
}
```

Since Spring 4.3, if a class has **exactly one constructor**, `@Autowired` on it is optional — Spring will use it automatically for injection.

### Setter injection

```java
@Service
public class OrderService {
    private PaymentGateway paymentGateway;

    @Autowired
    public void setPaymentGateway(PaymentGateway paymentGateway) {
        this.paymentGateway = paymentGateway;
    }
}
```

### Field injection (widely discouraged today)

```java
@Service
public class OrderService {
    @Autowired
    private PaymentGateway paymentGateway; // injected via reflection, bypassing any constructor/setter
}
```

### Why constructor injection is preferred

| Concern | Constructor Injection | Field Injection |
|---|---|---|
| Can the field be `final`? | Yes — enforces immutability once constructed | No — reflection-based injection requires a mutable, non-final field |
| Can you create the object without Spring (e.g., in a plain unit test)? | Yes — `new OrderService(mockGateway, mockInventory)` works directly | No — reflection is needed to populate `@Autowired` fields, typically requiring a Spring test context |
| Are missing/circular dependencies caught early? | Yes — object construction fails immediately if a required dependency can't be satisfied | Often caught later, since the object appears to construct successfully before injection happens |
| Makes a class's true dependencies visible? | Yes — the constructor signature **is** the complete list of dependencies, an explicit, honest contract | No — dependencies are hidden as private fields scattered throughout the class body, discoverable only by reading the whole class |

> 💡 **Key insight:** Constructor injection makes "this class has too many dependencies" visibly and immediately obvious — a constructor with eight parameters is an unmistakable, in-your-face code smell pointing at a class doing too much, whereas the same eight dependencies as `@Autowired` fields are much easier to accumulate unnoticed over time, since nothing about the class's outward signature reveals how many collaborators it actually has.

---

## 4. The `ApplicationContext` — Spring's IoC Container

The **`ApplicationContext`** is the central object responsible for actually implementing IoC: it reads bean definitions (from annotations, Java `@Configuration` classes, or historically, XML), instantiates the objects they describe (called **beans**), resolves and injects their dependencies, and manages their entire lifecycle.

```java
@Configuration
@ComponentScan(basePackages = "com.mycompany.app")
public class AppConfig { }

public class Main {
    public static void main(String[] args) {
        ApplicationContext context = new AnnotationConfigApplicationContext(AppConfig.class);
        OrderService orderService = context.getBean(OrderService.class);
    }
}
```

In a Spring Boot application, you almost never interact with `ApplicationContext` this directly — `@SpringBootApplication` bootstraps and manages an `ApplicationContext` for you automatically behind the scenes, but the underlying mechanism is identical.

### `BeanFactory` vs `ApplicationContext`

`ApplicationContext` extends the more basic `BeanFactory` interface, adding enterprise-oriented features on top: event publication (`ApplicationEvent`), internationalization message resolution, easier integration with Spring's AOP features, and (critically) **eager singleton instantiation by default** (`BeanFactory` alone is lazier, only creating beans when first requested). In virtually all modern Spring applications, you work exclusively with `ApplicationContext` — `BeanFactory` is mostly of historical/academic interest at this point.

---

## 5. Declaring Beans — Stereotype Annotations and `@Bean`

### Stereotype annotations — component scanning

```java
@Component      // generic stereotype — "this class is a Spring-managed bean"
public class Utility { }

@Service        // semantically: business/service-layer logic
public class OrderService { }

@Repository     // semantically: data-access layer; ALSO enables automatic exception translation (see below)
public class OrderRepository { }

@Controller     // semantically: web layer (Spring MVC)
public class OrderController { }
```

`@Service`, `@Repository`, and `@Controller` are all **meta-annotated** with `@Component` — meaning they're functionally identical to `@Component` for the purposes of component scanning, but carry additional semantic meaning for readability, tooling, and (in `@Repository`'s specific case) actual extra behavior.

> 💡 **`@Repository`'s hidden extra behavior:** Beyond marking a class as a component, `@Repository` also enables Spring's **exception translation** — a `PersistenceExceptionTranslationPostProcessor` wraps the bean so that vendor-specific, checked persistence exceptions (like a raw JDBC `SQLException` or a Hibernate-specific exception) are automatically translated into Spring's own consistent, unchecked `DataAccessException` hierarchy. This means calling code can catch a single, well-known exception type regardless of which specific persistence technology sits underneath — the exact same "swap the implementation without touching calling code" benefit the JDBC and JPA notes discussed for their respective abstraction layers.

### How component scanning actually works

`@ComponentScan` (implicitly included in Spring Boot's `@SpringBootApplication`) tells Spring to scan the specified base package (and its sub-packages) at startup, examining every class for the presence of `@Component` (or a meta-annotation built on it), and automatically registering each one it finds as a bean definition — without you needing to explicitly declare each bean one by one.

### `@Configuration` and `@Bean` — explicit, programmatic bean declaration

```java
@Configuration
public class AppConfig {
    @Bean
    public PaymentGateway paymentGateway() {
        return new StripePaymentGateway(apiKey());
    }

    @Bean
    public String apiKey() {
        return "sk_live_...";
    }
}
```

`@Bean` methods are used specifically when you need to register a bean you **don't control the source code of** (a third-party library class you can't annotate with `@Component`), or when bean creation genuinely requires custom logic beyond what a no-arg constructor and field injection can express.

> 💡 **Why `@Configuration` classes are special — CGLIB proxying:** A class annotated `@Configuration` is itself proxied by Spring at startup (using CGLIB, discussed further in Section 8) specifically so that calling one `@Bean` method from another `@Bean` method **within the same configuration class** correctly returns the same, already-created singleton instance, rather than naively creating a second, separate instance:

```java
@Configuration
public class AppConfig {
    @Bean
    public PaymentGateway paymentGateway() {
        return new StripePaymentGateway(apiKey()); // calls apiKey() directly — looks like a plain method call
    }

    @Bean
    public ApiKeyValidator apiKeyValidator() {
        return new ApiKeyValidator(apiKey()); // ALSO calls apiKey() — should get the SAME instance
    }

    @Bean
    public String apiKey() {
        return "sk_live_...";
    }
}
```
Without CGLIB proxying, both calls to `apiKey()` above would be plain Java method invocations, each returning a **new** `String` (or, more critically, if `apiKey()` returned a stateful object rather than an immutable `String`, two genuinely different instances) — silently violating the singleton scope both beans are supposed to share. The generated proxy intercepts these internal calls and redirects them through the `ApplicationContext`'s actual bean cache, ensuring the second call returns the already-created singleton instead of invoking the method body again.

---

## 6. Dependency Resolution — By Type, By Name, and Disambiguation

When Spring encounters an `@Autowired` dependency, it resolves which bean to inject following a specific, well-defined order:

```java
public interface PaymentGateway { }

@Component
public class StripePaymentGateway implements PaymentGateway { }

@Component
public class PayPalPaymentGateway implements PaymentGateway { }

@Service
public class OrderService {
    // AMBIGUOUS — two beans implement PaymentGateway; Spring cannot pick automatically
    @Autowired
    private PaymentGateway paymentGateway; // throws NoUniqueBeanDefinitionException at startup
}
```

### Resolving ambiguity: `@Qualifier` and `@Primary`

```java
@Component
@Primary // this bean wins whenever there's no more specific instruction
public class StripePaymentGateway implements PaymentGateway { }

@Component
public class PayPalPaymentGateway implements PaymentGateway { }

@Service
public class OrderService {
    public OrderService(@Qualifier("payPalPaymentGateway") PaymentGateway paymentGateway) {
        // explicitly requests the PayPal bean, overriding whatever @Primary says
    }
}
```

`@Primary` designates a default "winner" among multiple candidates at the bean's own declaration site, while `@Qualifier` lets a specific **injection point** override that default and request a particular bean by name — `@Qualifier` always takes precedence over `@Primary` when both are present, since it represents a more specific, deliberate choice made at the point of use.

---

## 7. Bean Scopes

| Scope | Lifetime |
|---|---|
| `singleton` (default) | **Exactly one instance** per `ApplicationContext`, shared by every injection point |
| `prototype` | A **new instance** created every time the bean is requested/injected |
| `request` | One instance per HTTP request (web-aware contexts only) |
| `session` | One instance per HTTP session (web-aware contexts only) |
| `application` | One instance per `ServletContext` (distinct from `singleton`, which is scoped to the Spring container itself, not the servlet context) |

```java
@Component
@Scope("prototype")
public class ShoppingCart { }
```

### The singleton-injecting-prototype problem

> ⚠️ **A very common, subtle real-world gotcha:** If a `singleton`-scoped bean has a `prototype`-scoped bean injected into it via a normal field/constructor injection, the prototype bean is only actually instantiated **once** — at the moment the singleton itself is created — and that same single instance is then reused for the singleton's entire lifetime, completely defeating the purpose of `prototype` scope.

```java
@Component // singleton by default
public class OrderProcessor {
    @Autowired
    private ShoppingCart cart; // prototype-scoped, but injected only ONCE, at OrderProcessor's creation
    // every call using "cart" reuses the exact same instance — not a fresh one per logical use
}
```

The fix requires either injecting an `ObjectProvider<ShoppingCart>`/`Provider<ShoppingCart>` (fetching a fresh instance explicitly, on demand, each time it's needed) or using a scoped proxy (`proxyMode = ScopedProxyMode.TARGET_CLASS`) that transparently fetches a new instance from the container on every method call:

```java
@Component
public class OrderProcessor {
    private final ObjectProvider<ShoppingCart> cartProvider;

    public OrderProcessor(ObjectProvider<ShoppingCart> cartProvider) {
        this.cartProvider = cartProvider;
    }

    public void process() {
        ShoppingCart cart = cartProvider.getObject(); // genuinely fresh instance every call
    }
}
```

---

## 8. Bean Lifecycle

```
Bean instantiated (constructor called)
      │
      ▼
Dependencies injected (constructor/setter/field injection)
      │
      ▼
Aware interfaces invoked (BeanNameAware, ApplicationContextAware, etc., if implemented)
      │
      ▼
BeanPostProcessor.postProcessBeforeInitialization()
      │
      ▼
@PostConstruct method invoked
      │
      ▼
InitializingBean.afterPropertiesSet() (if implemented)
      │
      ▼
Custom init-method (if configured via @Bean(initMethod = "..."))
      │
      ▼
BeanPostProcessor.postProcessAfterInitialization()  ← THIS is where AOP proxies get created!
      │
      ▼
   Bean is fully initialized and ready to use
      │
      ▼
  ... (application runs) ...
      │
      ▼
@PreDestroy method invoked (on container shutdown, singleton beans only)
      │
      ▼
DisposableBean.destroy() (if implemented)
      │
      ▼
Custom destroy-method (if configured)
```

### `@PostConstruct` and `@PreDestroy`

```java
@Component
public class ConnectionPoolManager {
    private DataSource dataSource;

    @PostConstruct
    public void initialize() {
        dataSource = createConnectionPool(); // one-time setup, dependencies already injected by this point
    }

    @PreDestroy
    public void cleanup() {
        dataSource.close(); // one-time cleanup as the container shuts down
    }
}
```

This is the modern, standard (JSR-250, not Spring-proprietary) equivalent of the `InitializingBean`/`DisposableBean` interfaces from earlier Spring versions — preferred today because it doesn't couple your class to a Spring-specific interface at all.

### `BeanPostProcessor` — the mechanism behind Spring's own "magic"

A `BeanPostProcessor` is a special kind of bean that hooks into **every other bean's** initialization, given the chance to inspect or even wrap (replace with a proxy) each bean immediately before and after its own initialization callbacks run. This is not just an obscure extension point — it is the actual mechanism by which several of Spring's headline features work internally:

- `@Autowired` field/setter resolution is itself implemented via a `BeanPostProcessor` (`AutowiredAnnotationBeanPostProcessor`).
- `@Transactional`, `@Async`, `@Cacheable`, and Spring AOP proxies in general are all created by a `BeanPostProcessor` that detects the relevant annotation and **wraps the original bean in a dynamically-generated proxy object**, substituting the proxy into the `ApplicationContext` in place of the original raw bean.

> 💡 **Key insight:** Understanding `BeanPostProcessor` demystifies a huge amount of "Spring magic" — annotations like `@Transactional` don't change your class's actual bytecode or somehow intercept method calls through compiler trickery; they work because, at startup, a `BeanPostProcessor` notices the annotation and **swaps the bean the container hands out for a proxy** that wraps the real object with the additional behavior (starting a transaction, then delegating to the real method, then committing/rolling back) — invisible to calling code, which just sees what looks like a normal method call.

---

## 9. JDK Dynamic Proxies vs CGLIB — How Spring Actually Builds These Proxies

Spring needs to generate a proxy object at runtime for two broadly different situations, and picks between two different underlying mechanisms depending on the target.

| | JDK Dynamic Proxy | CGLIB Proxy |
|---|---|---|
| Requires | The target bean to implement at least one **interface** | Works on a concrete **class**, interface or not |
| How it works | Generates a class at runtime implementing the same interface(s), delegating each method call through an `InvocationHandler` | Generates a runtime **subclass** of the target class, overriding its methods to insert additional behavior before delegating to `super.method()` |
| Limitation | Can only proxy methods declared on the implemented interface(s) | Cannot proxy `final` classes or `final` methods — there is no way to override a `final` method in a generated subclass |
| Used when | The bean implements at least one interface (Spring's traditional default preference) | The bean has no interface, or `proxyTargetClass = true` is explicitly configured |

```java
public interface PaymentGateway {
    void charge(double amount);
}

@Service
public class StripePaymentGateway implements PaymentGateway {
    @Transactional
    public void charge(double amount) { /* ... */ }
}
```
Because `StripePaymentGateway` implements an interface, Spring can (by default, in older configurations) use a **JDK dynamic proxy** — a runtime-generated class implementing `PaymentGateway`, wrapping calls with transaction-management logic, before delegating to the real `StripePaymentGateway` instance. If `StripePaymentGateway` implemented no interface at all, Spring would instead have to generate a **CGLIB subclass** of `StripePaymentGateway` itself.

> ⚠️ **A famous, real-world consequence:** Because both proxy mechanisms work by wrapping/subclassing, calling an `@Transactional` (or otherwise AOP-advised) method **from another method within the same class** bypasses the proxy entirely — the internal call goes directly through `this.otherMethod()`, never passing through the external proxy object that's actually responsible for adding the transactional behavior. This is the well-known **"self-invocation" pitfall**, and it's one of the most common, most confusing real-world Spring bugs, since the code looks completely correct and compiles fine, yet the expected transactional/caching/async behavior silently doesn't happen.

```java
@Service
public class OrderService {
    public void placeOrder(Order order) {
        // ...
        processPayment(order); // self-invocation — bypasses the proxy, @Transactional below has NO effect
    }

    @Transactional
    public void processPayment(Order order) { /* ... */ }
}
```

---

## 10. Circular Dependencies

```java
@Component
public class A {
    public A(B b) { }
}

@Component
public class B {
    public B(A a) { }
}
```

With **constructor injection**, this is genuinely unresolvable — to construct `A`, Spring needs a fully-constructed `B`, but constructing `B` requires a fully-constructed `A`, and neither can exist first. Spring detects this at startup and fails fast with a clear `BeanCurrentlyInCreationException`.

With **field or setter injection**, Spring can (and historically did, by default) resolve this via a multi-pass creation process: it creates `A` with an incomplete/proxied reference to `B` (via an "early bean reference" mechanism using its internal cache of in-progress bean instances), finishes constructing `B` using that reference, then goes back and completes `A`'s own field injection. This "resolves" the circularity mechanically, but it's widely considered a **design smell** rather than something to rely on — two classes needing each other directly is often a sign that a third, shared abstraction is missing, or that responsibilities are split incorrectly between the two classes.

> ⚠️ **Newer Spring Boot versions (2.6+) disable circular-reference resolution by default**, specifically to surface this design problem loudly at startup rather than silently accommodating it — a deliberate change reflecting the community's broader view that circular dependencies should be refactored away, not worked around.

---

## 11. Profiles and the `Environment` Abstraction

```java
@Configuration
@Profile("production")
public class ProductionConfig {
    @Bean
    public PaymentGateway paymentGateway() {
        return new StripePaymentGateway(); // real gateway
    }
}

@Configuration
@Profile("test")
public class TestConfig {
    @Bean
    public PaymentGateway paymentGateway() {
        return new MockPaymentGateway(); // fake, for testing
    }
}
```

```bash
java -jar app.jar --spring.profiles.active=production
```

Profiles let entirely different sets of beans be activated depending on the environment the application is running in (local development, test, staging, production), without any code changes — just a different active-profile setting at startup. This is a direct, practical application of the IoC principle at an environment-configuration level: application code depends only on the `PaymentGateway` interface, completely unaware of which profile-specific implementation is actually active.

---

## 12. Real-World Scenarios

### E-commerce — Swapping payment providers per environment without touching business logic
```java
@Service
public class CheckoutService {
    private final PaymentGateway paymentGateway; // interface only — never knows which implementation

    public CheckoutService(PaymentGateway paymentGateway) {
        this.paymentGateway = paymentGateway;
    }
}
```
The same `CheckoutService` runs unmodified against a real Stripe integration in production and a mock gateway in automated tests, purely because DI keeps `CheckoutService` decoupled from any specific `PaymentGateway` implementation — precisely the flexibility tightly-coupled, `new`-based construction (Section 1) could never offer.

### Testing — Constructor injection enabling trivial unit tests without a Spring context
```java
@Test
void chargesCorrectAmount() {
    PaymentGateway mockGateway = mock(PaymentGateway.class);
    OrderService service = new OrderService(mockGateway, mock(InventoryService.class));
    service.placeOrder(new Order(100.0));
    verify(mockGateway).charge(100.0);
}
```
Because `OrderService` uses constructor injection, this test constructs it directly with mocks, with **zero** Spring container involved — a fast, simple unit test that would be far more awkward (requiring reflection-based field injection or a full test context) if `OrderService` used field injection instead.

### Enterprise applications — Diagnosing a silently-skipped `@Transactional` due to self-invocation
A team discovers that calling an `@Transactional` method from another method in the same service class doesn't actually roll back on failure as expected. Tracing this to the self-invocation pitfall (Section 9), the fix is either splitting the transactional method into a separate, properly-injected collaborator bean, or (less ideally) injecting a self-reference to call through the proxy — a very commonly cited real-world "gotcha" story in Spring-based teams.

### Multi-tenant SaaS — Profile-based configuration for different deployment tiers
A SaaS platform uses `@Profile("free-tier")` and `@Profile("enterprise-tier")` configurations to wire in different rate-limiting and feature-flagging beans depending on which tier a given deployment is running for, keeping tier-specific configuration cleanly separated from the core application logic that remains identical across tiers.

---

## 13. Comparison: The Three DI Styles

| | Constructor Injection | Setter Injection | Field Injection |
|---|---|---|---|
| Supports immutable (`final`) fields | Yes | No | No |
| Testable without a Spring context | Yes, directly | Yes, with extra setter calls | Requires reflection or a test context |
| Dependencies visible at a glance | Yes — full constructor signature | Partially — spread across setters | No — hidden throughout the class body |
| Good for optional dependencies | Awkward (requires overloaded constructors) | Yes — natural fit | Yes, but hides the optionality |
| General recommendation | **Preferred default** for required dependencies | Reasonable for genuinely optional dependencies | Generally discouraged in modern Spring code |

---

## Interview Questions

1. What is the difference between Inversion of Control as a general principle and Dependency Injection as a specific technique for achieving it?
2. Why is constructor injection generally preferred over field injection, specifically regarding testability and the ability to declare fields `final`?
3. What is the actual difference between `BeanFactory` and `ApplicationContext`, and why do virtually all modern Spring applications use the latter?
4. Beyond marking a class as a Spring-managed bean, what extra behavior does `@Repository` provide that plain `@Component` does not?
5. Why must a `@Configuration` class itself be proxied (via CGLIB) at startup, and what would go wrong if it weren't, when one `@Bean` method calls another `@Bean` method directly?
6. Explain the singleton-injecting-prototype problem: why does injecting a `prototype`-scoped bean into a `singleton`-scoped bean via normal field injection fail to produce a fresh instance on each logical use, and how do you fix it?
7. What is a `BeanPostProcessor`, and how does understanding it explain how annotations like `@Transactional` or `@Autowired` actually work under the hood?
8. What is the key structural difference between a JDK dynamic proxy and a CGLIB proxy, and under what specific circumstance is Spring forced to use CGLIB rather than a JDK dynamic proxy?
9. Explain the "self-invocation" pitfall with `@Transactional` (or other AOP-advised methods) — why does calling such a method from within the same class silently skip the intended behavior?
10. Why can constructor-injection-based circular dependencies never be resolved by Spring, while field/setter-injection-based circular dependencies technically can be (even though doing so is discouraged)?
11. What is the difference between `@Primary` and `@Qualifier`, and which one wins if both are present for the same ambiguous injection point?
12. How do Spring Profiles let you swap entire sets of bean implementations based on the active environment, and what is a real-world scenario where this is more appropriate than an `if`/`else` inside application code?