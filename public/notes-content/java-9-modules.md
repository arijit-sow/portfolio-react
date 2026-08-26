# Java 9 Modules

> **Topic:** The Java Platform Module System (Project Jigsaw), JShell, collection factories, and other Java 9 additions

---

## 1. Why Java 9 Matters — The Bigger Picture

Released in September 2017 (after several delays), Java 9's headline feature — and the reason this release is remembered primarily by its codename **Project Jigsaw** — is the **Java Platform Module System (JPMS)**, defined by JSR 376. It was, at the time, the largest structural change to the Java platform since generics arrived in Java 5.

### The problem JPMS was built to solve

Before Java 9, Java had exactly two units of code organization: the **package** (a namespace) and the **JAR file** (a packaging/distribution format). Neither provided real encapsulation at a larger scale, and this caused two chronic, well-known problems:

1. **The monolithic JDK.** The JDK itself was one enormous `rt.jar` containing everything — desktop UI toolkits, CORBA support, scripting engines, XML parsers — regardless of whether your application (or even a small embedded device) needed any of it. You couldn't ship a slim runtime containing only the pieces your application used; the whole `rt.jar` came along for the ride.

2. **"JAR hell" and weak encapsulation.** Marking a class `public` made it accessible to **any** other code on the classpath, forever, whether or not that was the intended API surface. JDK internals like `sun.misc.Unsafe` or `com.sun.*` packages were never meant to be public API, but because the classpath had no concept of "this package is internal, don't touch it," countless libraries (and applications) came to depend on them directly — making it nearly impossible for the JDK team to refactor or remove that internal code without breaking the ecosystem.

> 💡 **Key insight:** JPMS introduces a new, coarser-grained unit above the package: the **module**. A module explicitly declares what it *requires* from other modules and what it *exports* for others to use — everything else stays genuinely encapsulated, enforced by the JVM itself, not just by convention or documentation.

---

## 2. What Is a Module?

A module is a named, self-describing collection of packages (and, optionally, other resources), declared via a single file: **`module-info.java`**, placed at the root of the module's source tree.

```
com.mycompany.orderservice/
├── module-info.java
└── com/
    └── mycompany/
        └── orderservice/
            ├── api/
            │   └── OrderService.java
            └── internal/
                └── OrderRepository.java
```

```java
// module-info.java
module com.mycompany.orderservice {
    requires java.sql;
    requires com.mycompany.payment;

    exports com.mycompany.orderservice.api;
    // com.mycompany.orderservice.internal is NOT exported — invisible to other modules
}
```

This single declaration answers two questions the classpath never could:
- **What do I depend on?** (`requires`)
- **What am I willing to expose to the outside world?** (`exports`)

Any package **not** listed in an `exports` clause is **strongly encapsulated** — genuinely inaccessible from outside the module, even via reflection, unless explicitly opened (see `opens` below). This is enforced by the module system at both compile time and runtime, not just a documentation convention.

---

## 3. Core `module-info.java` Directives

| Directive | Meaning |
|---|---|
| `requires <module>` | This module depends on another module at compile time and runtime |
| `requires transitive <module>` | Dependency is also visible to anyone who depends on *this* module (re-exports the dependency) |
| `requires static <module>` | Compile-time-only dependency, not required at runtime (for optional/annotation-only dependencies) |
| `exports <package>` | Makes a package's public types accessible to any module that `requires` this module |
| `exports <package> to <module>` | Qualified export — visible only to specifically named modules |
| `opens <package>` | Allows deep reflection into a package's private members at runtime (but not compile-time access) |
| `opens <package> to <module>` | Qualified open — reflective access granted only to named modules |
| `uses <service interface>` | Declares that this module consumes a service via `ServiceLoader` |
| `provides <interface> with <impl>` | Declares that this module supplies an implementation of a service |

### `requires transitive` — solving implied readability

```java
module com.mycompany.orderservice {
    requires transitive com.mycompany.commonmodels; // e.g., contains the Order class itself
}
```
If `OrderService.someMethod()` returns a type from `commonmodels` (like `Order`), any caller module needs access to `commonmodels` too — otherwise they can receive an `Order` object but be unable to even declare a variable of that type. `requires transitive` solves this by automatically granting readability to `commonmodels` to any module that requires `orderservice`, without every consumer needing to add a redundant `requires com.mycompany.commonmodels` of their own.

### `opens` — reflection vs strong encapsulation

Compile-time access (`exports`) and reflective runtime access (`opens`) are **deliberately separate concerns**. This exists specifically because of frameworks like Hibernate and Spring, which use deep reflection to inspect and set an object's **private fields** (e.g., for ORM entity mapping) — something that has nothing to do with a normal compile-time API contract.

```java
module com.mycompany.orderservice {
    opens com.mycompany.orderservice.entities to org.hibernate.orm.core;
}
```
This says: "Hibernate specifically may reflectively access private fields in my `entities` package, but no other module may — and no module (including Hibernate) may **compile against** these classes directly unless they're also `exports`ed."

---

## 4. Module Types

| Type | Description |
|---|---|
| **Named module** | Has an explicit `module-info.java`; fully participates in strong encapsulation and readability rules |
| **Automatic module** | A plain JAR placed on the **module path** (not the classpath) without a `module-info.java`. The module system derives a module name automatically (from the JAR's filename, or an `Automatic-Module-Name` manifest entry) and grants it access to read every other module, and exports all its packages — a compatibility bridge for pre-Java-9 libraries |
| **Unnamed module** | Anything still placed on the traditional **classpath** (not the module path). It can read every other module, and every named module can read it — essentially "the old world," preserved for full backward compatibility |

> 💡 **Key insight — migration strategy:** This three-tier design (named / automatic / unnamed) exists specifically so that **the entire pre-existing Java ecosystem did not break overnight**. You can mix old classpath-based JARs, new automatic modules, and fully modularized code in the same application while migrating incrementally, rather than needing to modularize your entire dependency tree before upgrading to Java 9+.

---

## 5. How JPMS Enforces Encapsulation — Internals

Unlike access modifiers (`public`, `private`, `protected`), which are purely compile-time/bytecode-verifier concepts scoped to a single class or package, module boundaries are enforced by the **module system at both compile time and class-loading time**.

At startup, the JVM builds a **module graph** — a directed graph where each module node has `requires` edges to the modules it depends on. Before running any code, the JVM resolves this entire graph, verifying every `requires` can be satisfied, and computes **readability**: module A can only access module B's exported types if there's an edge (direct or transitive-implied) from A to B in this graph.

This is fundamentally different from the classpath's flat, unordered bag of JARs: with JPMS, if module A never declared `requires B`, its code **cannot** access B's classes even if B is present at runtime and even via reflection into a non-`opens`ed package — `IllegalAccessError` or `InaccessibleObjectException` is thrown, enforced by the class loader itself, not just a compiler warning.

### `jlink` — custom runtime images

Because the JDK itself is now modularized (`java.base`, `java.sql`, `java.xml`, etc. — over 90 distinct platform modules replacing the old monolithic `rt.jar`), the `jlink` tool can assemble a **custom, minimal JRE** containing only the modules your application actually needs.

```bash
jlink --module-path $JAVA_HOME/jmods:mymodules \
      --add-modules com.mycompany.orderservice \
      --output myapp-runtime
```

This directly enables the original motivating use case for Jigsaw: shipping a container image or embedded-device runtime containing, say, 40MB of just the necessary modules instead of a 200+MB full JDK — a meaningful, real-world benefit for containerized microservice deployments where image size and startup time matter.

---

## 6. Services and `ServiceLoader` in the Module System

Java's `ServiceLoader` mechanism (a plugin/service-provider pattern) predates modules, but JPMS gives it first-class, compile-time-checked syntax via `uses` and `provides`.

```java
// api module
module com.mycompany.paymentapi {
    exports com.mycompany.paymentapi;
}

public interface PaymentGateway {
    void charge(double amount);
}
```

```java
// implementation module
module com.mycompany.stripegateway {
    requires com.mycompany.paymentapi;
    provides com.mycompany.paymentapi.PaymentGateway
            with com.mycompany.stripegateway.StripePaymentGateway;
}
```

```java
// consumer module
module com.mycompany.checkout {
    requires com.mycompany.paymentapi;
    uses com.mycompany.paymentapi.PaymentGateway;
}

ServiceLoader<PaymentGateway> loader = ServiceLoader.load(PaymentGateway.class);
for (PaymentGateway gateway : loader) {
    gateway.charge(100.0);
}
```

This is the module-system-native equivalent of dependency injection at the platform level, without the consumer module ever needing a compile-time `requires` on the concrete `stripegateway` implementation module — only on the shared API module. It's the same principle behind how JDBC drivers, logging bindings (`SLF4J`), and many plugin-based frameworks discover implementations at runtime.

---

## 7. Migrating Existing Applications

Real-world migration to JPMS is widely regarded as one of the most disruptive parts of adopting Java 9+, and this is precisely why most application codebases (as opposed to library/JDK code) still choose to run on the **classpath as an unnamed module** rather than fully modularizing, even years later.

Common real-world obstacles:
- **Split packages** — the same package name spread across multiple JARs (common in older multi-module Maven builds) is **illegal** under JPMS; two named modules cannot both export the same package name.
- **Reflection-heavy frameworks** (Spring, Hibernate, JAXB) needed explicit `opens` directives added to countless libraries before they worked cleanly under the module system — this took years across the ecosystem.
- **`sun.misc.Unsafe` and other JDK-internal APIs** — code relying on these (once ubiquitous in high-performance libraries) had to migrate to supported alternatives, since JPMS strongly encapsulates JDK internals by default.

> ⚠️ **Common mistake:** Assuming "upgrading to Java 9+" means you must immediately write `module-info.java` for your whole application. In practice, the vast majority of applications run for years on newer JDKs entirely on the classpath (as the unnamed module) with zero required changes — JPMS adoption for application code (as opposed to JDK-internal code) has remained largely optional and gradual in the real world.

---

## 8. Other Major Java 9 Features

### JShell — the Read-Eval-Print Loop (REPL)

Java 9 introduced an interactive REPL for the first time in the language's history, letting developers evaluate expressions and try out APIs without writing a full class + `main` method + compile step.

```
$ jshell
jshell> int x = 5
x ==> 5
jshell> x * 2
$2 ==> 10
jshell> List.of(1, 2, 3).stream().map(i -> i * i).forEach(System.out::println)
1
4
9
```
This is primarily an exploration/teaching/prototyping tool — quickly testing how an API behaves without the overhead of a full project — and has no direct bearing on how compiled Java applications run.

### Collection Factory Methods

```java
List<String> list = List.of("a", "b", "c");
Set<Integer> set = Set.of(1, 2, 3);
Map<String, Integer> map = Map.of("a", 1, "b", 2);
Map<String, Integer> bigMap = Map.ofEntries(
        Map.entry("a", 1),
        Map.entry("b", 2)
);
```

These factory methods produce genuinely **immutable** collections (not just "unmodifiable views" like the older `Collections.unmodifiableList()`, which could still change if the underlying backing collection changed). Any mutation attempt (`add`, `remove`, `set`) throws `UnsupportedOperationException`. They also reject `null` elements outright (throwing `NullPointerException` at creation time), which is a deliberate, stricter design choice compared to `ArrayList`/`HashMap`, catching a common source of bugs immediately rather than letting a `null` silently propagate deep into a collection pipeline.

### Stream API Enhancements

```java
Stream.iterate(1, x -> x < 100, x -> x * 2)       // bounded iterate — new 3-arg overload
      .forEach(System.out::println);

Stream.of(1, 2, 3, 4, 5)
      .takeWhile(x -> x < 4)                       // [1, 2, 3] — stops at first failure
      .forEach(System.out::println);

Stream.of(1, 2, 3, 4, 5)
      .dropWhile(x -> x < 4)                       // [4, 5] — drops until first failure, keeps rest
      .forEach(System.out::println);

Stream<String> maybeStream = Stream.ofNullable(getValueOrNull()); // 0-or-1-element stream
```

`takeWhile`/`dropWhile` differ subtly but importantly from `filter`: `filter` evaluates every element against the predicate regardless of position, while `takeWhile` **short-circuits** at the first element that fails the predicate (useful on sorted or naturally-ordered data, and critical for correctness/performance on infinite streams).

### Private Methods in Interfaces

Java 8 allowed `default` and `static` interface methods, but they couldn't share common code without duplicating it or exposing a helper as another `default`/`static` method (polluting the public API). Java 9 closes this gap:

```java
interface Validator {
    default boolean validateUser(User user) {
        return checkNotNull(user) && checkAge(user);
    }

    default boolean validateAdmin(Admin admin) {
        return checkNotNull(admin) && admin.hasElevatedPrivileges();
    }

    private boolean checkNotNull(Object o) { // shared helper, not part of the public contract
        return o != null;
    }

    private boolean checkAge(User user) {
        return user.getAge() >= 18;
    }
}
```

### `Optional` Enhancements

```java
optional.ifPresentOrElse(
        value -> System.out.println("Found: " + value),
        () -> System.out.println("Not found")
);

Optional<String> result = primary.or(() -> Optional.of("fallback"));

long count = optional.stream().count(); // treats Optional as a 0-or-1-element Stream
```

### Try-With-Resources Improvements

Java 9 allows using an **already effectively-final variable** directly in try-with-resources without re-declaring it:

```java
BufferedReader reader = new BufferedReader(new FileReader("data.txt"));
try (reader) { // Java 9+ — no need to redeclare "BufferedReader r = reader"
    System.out.println(reader.readLine());
}
```

### Other Smaller Changes

| Feature | Summary |
|---|---|
| **G1 becomes the default GC** | Replacing Parallel GC as the JVM's default garbage collector, favoring more predictable pause times over raw throughput for typical modern server workloads |
| **Multi-release JARs** | A single JAR can contain version-specific `.class` files for different Java versions (`META-INF/versions/9/...`), letting a library take advantage of newer APIs while remaining compatible with older JVMs |
| **Diamond operator with anonymous classes** | `new ArrayList<>() { ... }` (an anonymous subclass) can now use `<>` type inference, previously disallowed |
| **`Process` API improvements** | New methods like `ProcessHandle` for inspecting and managing OS processes (PID, parent/children, `isAlive()`) without native code |
| **Deprecation of `Applet` API** | Formal recognition that browser applets were obsolete, foreshadowing full removal in later versions |

---

## 9. Real-World Scenarios

### Microservices — Shrinking container images with `jlink`
A payment microservice only uses `java.base`, `java.sql`, and `java.logging` from the JDK. Instead of shipping a full JDK base image, the team builds a custom runtime image with `jlink` containing only those modules, cutting the container image size significantly and reducing both deployment time and the attack surface exposed by unused JDK modules (like AWT, which a headless backend service never needs).

### Enterprise Java — Encapsulating internal persistence details
An `orderservice` module exposes a clean `OrderService` interface via `exports com.mycompany.orderservice.api`, while keeping `com.mycompany.orderservice.internal.OrderRepositoryImpl` and its raw JDBC/SQL logic completely inaccessible to any other module — not just "discouraged by convention," but genuinely uncompilable and unreachable via reflection from outside, unless explicitly `opens`ed for a specific framework.

### Plugin architecture — Payment gateway abstraction via `ServiceLoader`
A checkout module depends only on a `paymentapi` module (`uses PaymentGateway`), while separate deployable modules provide Stripe, PayPal, or a mock test implementation (`provides PaymentGateway with ...`), selected at runtime based on which implementation module is present on the module path — enabling gateway swaps or A/B testing without recompiling the checkout module itself.

### Legacy migration — Coexisting classpath and module path
A large enterprise application with hundreds of internal libraries upgrades its JDK version but keeps the entire application on the classpath (unnamed module) for years, gradually converting only a handful of newly-written internal libraries into proper named modules, rather than attempting a disruptive big-bang modularization of the whole codebase at once.

---

## 10. Comparison: Classpath vs Module Path

| Aspect | Classpath (pre-Java 9 style) | Module Path (JPMS) |
|---|---|---|
| Encapsulation | Convention only (`public` means "accessible to everyone") | Enforced by the JVM (`exports`/`opens` required for access) |
| Duplicate packages across JARs | Silently allowed (whichever JAR loads first "wins," unpredictably) | Illegal — "split package" fails to compile/launch |
| Dependency declaration | Implicit — inferred from what happens to be present at runtime | Explicit — `requires` in `module-info.java`, verified at startup |
| Reflection into private fields | Always allowed (pre-Java 9 default) | Requires an explicit `opens` directive |
| Custom minimal runtime | Not possible — full JRE/JDK required | Possible via `jlink`, including only needed modules |

---

## Interview Questions

1. What specific real-world problems (beyond "the JDK was big") was the Java Platform Module System designed to solve, and why couldn't packages and JARs solve them on their own?
2. What is the difference between `exports` and `opens` in a `module-info.java`, and why does Hibernate/Spring-style reflection specifically require the latter?
3. Explain the three types of modules (named, automatic, unnamed) and why this three-tier design was necessary for real-world adoption of JPMS.
4. What is a "split package," and why is it illegal under the module system when it was tolerated (if messy) on the classpath?
5. What does `requires transitive` do, and what compile error would you expect to see in a downstream module if it were omitted where needed?
6. How does the JVM enforce module boundaries at the class-loading level, and how is this fundamentally different from how `public`/`private` access modifiers are enforced?
7. What is `jlink`, and what specific deployment problem does it solve that was previously impossible with a monolithic JDK?
8. How does `ServiceLoader` combined with `uses`/`provides` allow a consumer module to use a plugin implementation without ever declaring a compile-time dependency on the concrete implementation module?
9. Why do the immutable collections created by `List.of()`/`Set.of()`/`Map.of()` reject `null` elements, unlike `ArrayList` or `HashMap`?
10. What is the behavioral difference between `Stream.filter()` and the Java 9 `Stream.takeWhile()`, and why does that difference matter specifically for infinite streams?
11. Why were private interface methods added in Java 9, given that Java 8 already allowed `default` and `static` interface methods?
12. Why has full application-level modularization (writing `module-info.java` for your own business logic) remained comparatively rare in practice years after Java 9's release, even though most applications now run on Java versions well past 9?