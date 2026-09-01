# Spring AOP (Aspect-Oriented Programming)

## 1. What is AOP?

AOP is a programming paradigm that lets you separate **cross-cutting concerns** — logic that cuts across multiple parts of an application (logging, security, transactions, caching, error handling) — from your **core business logic**.

Without AOP, this kind of code gets duplicated in every method:

```java
public void placeOrder() {
    log.info("Method started");
    // actual business logic
    log.info("Method ended");
}
```

With AOP, you write this logic **once** as an "aspect" and apply it declaratively to wherever it's needed, without touching the business code.

---

## 2. Core Terminology

| Term | Meaning |
|---|---|
| **Aspect** | A module that encapsulates a cross-cutting concern (e.g. `LoggingAspect`). Implemented as a class annotated with `@Aspect`. |
| **Join Point** | A point during program execution where an aspect *can* be applied — e.g. a method call. Spring AOP only supports **method-execution** join points (unlike full AspectJ). |
| **Advice** | The actual action taken by an aspect at a join point (the code that runs). |
| **Pointcut** | An expression that matches join points, i.e. it decides **where** advice should run. |
| **Target Object** | The original object whose method is being advised. |
| **Weaving** | The process of linking aspects with target objects to create an advised object. Spring does this **at runtime** via proxies. |
| **Proxy** | The object Spring creates that wraps the target object and applies advice around its methods. |
| **Introduction** | Adding new methods/fields to an existing class via an aspect (less commonly used). |

---

## 3. Types of Advice

| Advice | Annotation | Runs |
|---|---|---|
| Before | `@Before` | Before the method executes |
| After (finally) | `@After` | After the method completes, regardless of outcome |
| After Returning | `@AfterReturning` | After the method returns successfully |
| After Throwing | `@AfterThrowing` | If the method throws an exception |
| Around | `@Around` | Wraps the method — runs before **and** after, and controls whether the method even executes |

`@Around` is the most powerful since it gives full control (can modify arguments, skip execution, change return value, catch exceptions).

---

## 4. Basic Setup

**Dependency (Spring Boot):**
```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-aop</artifactId>
</dependency>
```

Spring Boot auto-configures AOP support when this starter is on the classpath (no need for `@EnableAspectJAutoProxy` in most Boot apps — it's added automatically, though you can declare it explicitly in plain Spring).

```java
@Configuration
@EnableAspectJAutoProxy
public class AppConfig { }
```

---

## 5. Writing an Aspect

```java
@Aspect
@Component
public class LoggingAspect {

    @Before("execution(* com.example.service.*.*(..))")
    public void logBefore(JoinPoint jp) {
        System.out.println("Calling: " + jp.getSignature().getName());
    }

    @AfterReturning(pointcut = "execution(* com.example.service.*.*(..))", returning = "result")
    public void logAfterReturning(JoinPoint jp, Object result) {
        System.out.println(jp.getSignature().getName() + " returned: " + result);
    }

    @AfterThrowing(pointcut = "execution(* com.example.service.*.*(..))", throwing = "ex")
    public void logAfterThrowing(JoinPoint jp, Exception ex) {
        System.out.println(jp.getSignature().getName() + " threw: " + ex.getMessage());
    }

    @Around("execution(* com.example.service.*.*(..))")
    public Object logAround(ProceedingJoinPoint pjp) throws Throwable {
        long start = System.currentTimeMillis();
        Object result = pjp.proceed(); // actually invokes the target method
        long end = System.currentTimeMillis();
        System.out.println(pjp.getSignature() + " took " + (end - start) + "ms");
        return result;
    }
}
```

Key API objects:
- **`JoinPoint`** — read-only info about the intercepted method (name, args, target).
- **`ProceedingJoinPoint`** — extends `JoinPoint`, used only in `@Around`; call `.proceed()` to continue execution.

---

## 6. Pointcut Expressions

Pointcuts use **AspectJ expression syntax**. Most common designator: `execution`.

```
execution(modifiers-pattern? return-type-pattern declaring-type-pattern? method-name-pattern(param-pattern) throws-pattern?)
```

Examples:

```java
// Any method in the service package, any return type, any args
execution(* com.example.service.*.*(..))

// Only public methods
execution(public * com.example.service.*.*(..))

// Methods returning String
execution(String com.example.service.*.*(..))

// A specific method
execution(* com.example.service.UserService.getUser(Long))

// All classes in package and sub-packages
execution(* com.example.service..*.*(..))
```

Other designators:
- `within(com.example.service.*)` — matches all join points within given type/package.
- `@annotation(com.example.Loggable)` — matches methods annotated with `@Loggable`.
- `@within(org.springframework.stereotype.Service)` — matches all methods in classes annotated with `@Service`.
- `args(String, ..)` — matches based on argument types.

**Reusable pointcut:**
```java
@Pointcut("execution(* com.example.service.*.*(..))")
public void serviceMethods() {}

@Before("serviceMethods()")
public void logBefore(JoinPoint jp) { ... }
```

Combine pointcuts with `&&`, `||`, `!`.

---

## 7. How Spring AOP Actually Works (Proxies)

Spring AOP is **proxy-based**, not compile-time weaving like full AspectJ. When the container detects a bean matched by a pointcut, it wraps it in a proxy:

- **JDK Dynamic Proxy** — used when the target class implements an interface. The proxy implements the same interface(s).
- **CGLIB Proxy** — used when the target class does **not** implement an interface. CGLIB generates a subclass of the target class at runtime.

Important consequences:
- **Self-invocation doesn't trigger advice.** If method `A()` in a bean calls `this.B()` internally, the call bypasses the proxy, so any advice on `B()` won't run. You must call through the proxy (e.g. inject the bean into itself, or use `AopContext.currentProxy()`).
- Only **public method execution** on **Spring-managed beans** can be advised — you can't advise `private`, `static`, `final` methods this way, and you can't advise plain objects created with `new`.
- CGLIB requires a non-final class and a default/no-arg constructor is generally preferred (Spring can work around this in most modern versions).

---

## 8. Spring AOP vs Full AspectJ

| | Spring AOP | AspectJ |
|---|---|---|
| Weaving time | Runtime (proxy-based) | Compile-time / load-time (bytecode weaving) |
| Join points supported | Method execution only | Method execution, field access, constructor calls, static initializers, etc. |
| Performance | Slight proxy overhead | Faster (no proxy indirection) |
| Setup complexity | Simple, Spring-native | Requires special compiler/agent |
| Use case | Most application-level cross-cutting concerns | Fine-grained, performance-critical, or non-Spring-managed weaving |

Spring AOP reuses AspectJ's **annotation and pointcut expression syntax** but implements the actual mechanism itself (via proxies), so it's not doing true AspectJ weaving unless you explicitly bring in load-time weaving.

---

## 9. Common Real-World Use Cases

- **Logging / auditing** method calls, arguments, execution time.
- **Transaction management** — `@Transactional` itself is implemented as a Spring AOP aspect under the hood.
- **Security** — `@PreAuthorize`/`@Secured` in Spring Security also uses AOP proxies.
- **Caching** — `@Cacheable` works the same way.
- **Exception handling / retry logic** centralized across services.
- **Performance monitoring** (method execution time, metrics).
- **Validation** applied uniformly across a layer.

---

## 10. Quick Gotchas / Interview Points

- Advice order when multiple aspects match the same join point: control with `@Order` on the aspect class.
- `@Around` must either call `pjp.proceed()` or explicitly decide not to — forgetting `proceed()` means the target method never runs.
- Aspects themselves are just Spring beans (`@Component` + `@Aspect`), so they participate in the normal Spring lifecycle and DI.
- AOP proxies only work on **Spring bean-to-bean calls** — calling an advised bean's method from outside the container (or via `new`) bypasses AOP entirely.
- `@EnableAspectJAutoProxy(proxyTargetClass = true)` forces CGLIB proxies even when the class implements an interface.