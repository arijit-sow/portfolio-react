# Java 25 Features

> **Topic:** Compact source files, flexible constructor bodies, module imports, scoped values, Project Leyden's AOT improvements, compact object headers, generational Shenandoah, and everything else new in the latest LTS

---

## 1. Why Java 25 Matters — The Bigger Picture

Java 25 reached General Availability on **September 16, 2025**, and is the **fourth LTS release** covered in this series (after 8, 11, 17, and 21) — the first LTS since Java 21, two years earlier. It ships with **18 JEPs** in total, split across finalized features, previews, an incubator, and experimental JFR additions — noticeably more than the typical non-LTS release, reflecting how much work accumulates and gets finalized specifically for an LTS milestone.

### The two big themes of this release

Unlike Java 17 (language modernization) or Java 21 (pattern matching + virtual threads), Java 25's story is really **two parallel themes**:

1. **Reducing ceremony for newcomers and simple programs** — Compact Source Files and Instance Main Methods (finally finalized after previewing since Java 21) and Flexible Constructor Bodies both chip away at boilerplate and rigid ordering rules that have existed since Java 1.0.
2. **Startup time, memory footprint, and observability under Project Leyden** — a majority of this release's JEPs (Ahead-of-Time Command-Line Ergonomics, AOT Method Profiling, Compact Object Headers, and several JFR enhancements) are about making the JVM start faster, use less memory per object, and be easier to profile in production — squarely aimed at the reality that a huge share of modern Java workloads are **short-lived cloud functions, containers, and microservices**, not long-running desktop or app-server processes the JVM was originally tuned for.

> 💡 **Key insight:** If you only remember one thing about Java 25's design philosophy, it's this: the JVM has historically been optimized for **long-running processes** that can afford a slow warm-up in exchange for excellent steady-state throughput. Project Leyden's JEPs in this release are a direct, sustained effort to make the JVM competitive for **fast-starting, short-lived, resource-constrained workloads** — the dominant deployment shape in a container/serverless world — without giving up what made the JVM good at the old shape of workload.

### Feature maturity levels — a quick primer

Java 25 leans heavily on all four JEP maturity categories, so it's worth being precise about what each means before diving in:

| Category | Meaning | Requires `--enable-preview`? |
|---|---|---|
| **Final** | Fully finished, permanent, safe for production use immediately | No |
| **Preview** | Design and implementation complete, but intentionally *not yet permanent* — may still change or be withdrawn based on feedback | Yes |
| **Incubator** | An entirely new API being trialed in its own module, further from finalization than a preview | Yes (via incubator module) |
| **Experimental** | Typically a JVM/runtime flag-gated capability (not a language/API preview), off by default, offered for real-world feedback before committing | Special JVM flag |

---

## 2. Compact Source Files and Instance Main Methods (JEP 512 — Final)

This feature **finalizes** an idea that had been previewing since Java 21 (as JEP 445, then refined through JEP 463 and JEP 477) — reducing the ceremony required to write and run the smallest possible Java program.

### The problem it solves

The traditional "Hello, World!" has always required boilerplate that makes no sense to a beginner (or to someone just writing a five-line utility script):

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```
A newcomer has to accept, on faith, the meaning of `public`, `class`, `static`, `void`, and `String[] args` before they can print a single line — none of which is relevant to what the program actually does.

### The Java 25 way

```java
// HelloWorld.java — no class, no public/static, no args needed
void main() {
    System.out.println("Hello, World!");
}
```

Run directly, continuing the single-file source-launch capability introduced back in Java 11:
```bash
java HelloWorld.java
```

### How this actually works

- An **implicit, unnamed class** is generated automatically to hold the top-level `main` method (and any other top-level members you declare) — you never see or name this class yourself.
- `main()` can now be an **instance method** (no `static` required), with no parameters, and doesn't need `public` — the launch protocol was widened to recognize several compatible `main` method signatures, from the full traditional form down to this minimal one.
- You can still declare helper methods and fields alongside `main()` at the top level of the file, all implicitly part of the same unnamed class:

```java
String greeting = "Hello";

void main() {
    System.out.println(greet("World"));
}

String greet(String name) {
    return greeting + ", " + name + "!";
}
```

- Convenience: `java.io` and `java.util` (specifically things like `System.out`, `List`, and a few common utility methods) are **implicitly available** without explicit imports in this compact form, via automatically-imported "IO" helper methods, further reducing what a beginner needs to know upfront.

> 💡 **Why this took four releases to finalize:** Real developer feedback across Java 21, 23, and 24's preview iterations changed meaningful details — for example, earlier previews required `static void main(String[] args)` still, and only later iterations allowed a truly parameterless, non-static `main()`. This is preview-driven design working as intended: ship, gather real usage feedback, adjust, repeat, only finalize once the shape has stabilized.

> ⚠️ **This does not replace the traditional form.** `public class Foo { public static void main(String[] args) { ... } }` remains completely valid and is still what you'll write for any real, multi-file, multi-class application. Compact source files are specifically aimed at scripts, teaching contexts, and quick prototypes — not a new default style for production codebases.

---

## 3. Flexible Constructor Bodies (JEP 513 — Final)

Since Java 1.0, a constructor's call to `super(...)` or `this(...)` had to be the **very first statement**, with zero exceptions — even for simple validation logic that didn't touch the instance being constructed at all.

### The problem it solves

```java
// Before — validation must happen AFTER super(), even though it doesn't need "this"
class PositiveNumber extends Number {
    private final int value;

    PositiveNumber(int value) {
        super(); // must be first, no way to validate value before this point
        if (value <= 0) {
            throw new IllegalArgumentException("must be positive");
        }
        this.value = value;
    }
}
```

Developers wanting to validate constructor arguments *before* calling `super(...)` had to resort to awkward workarounds — static helper methods called as an argument expression to `super(...)`, for instance — purely to satisfy this ordering rule, even when the validation logic had no dependency on the object being constructed.

### The Java 25 way

```java
class PositiveNumber extends Number {
    private final int value;

    PositiveNumber(int value) {
        if (value <= 0) {                     // now allowed BEFORE super()
            throw new IllegalArgumentException("must be positive");
        }
        super();
        this.value = value;
    }
}
```

### The actual rule — what's allowed before `super()`/`this()`

The restriction isn't removed entirely — it's **refined and made precise**: statements are now allowed before the explicit constructor invocation, **as long as they don't reference the instance being constructed** (no `this` field access, no instance method calls, no reference to `this` itself in any form) before the superclass is properly initialized.

```java
class Base {
    Base(int x) { }
}

class Derived extends Base {
    Derived(int x) {
        System.out.println("Constructing with x=" + x); // OK — doesn't touch "this"
        if (x < 0) {
            throw new IllegalArgumentException("x must be non-negative");
        }
        super(x); // now comes after validation logic
    }
}
```

> 💡 **Why this restriction still exists at all:** Java's object initialization model guarantees that a superclass is **always** fully constructed before a subclass's own fields and logic run — this is fundamental to how the JVM guarantees a partially-constructed object is never exposed with an uninitialized superclass state. Flexible constructor bodies relax *where validation and logging can happen*, but never let subclass code touch `this` (fields, methods, or the reference itself) before the superclass constructor has actually completed.

> ⚠️ **Common mistake:** Assuming this feature lets you reorder field initialization relative to `super()` freely. It does not — you still cannot read or write an instance field, or call an instance method, before `super(...)`/`this(...)` executes. The only thing newly permitted is "instance-independent" logic (argument validation, logging, local variable computation) that doesn't touch the object under construction.

---

## 4. Module Import Declarations (JEP 511 — Final)

A small, targeted convenience finalized after previewing since Java 23, aimed at reducing repetitive import boilerplate — especially useful in combination with compact source files (Section 2), where minimizing ceremony is the whole point.

### The problem it solves

```java
// Before — importing several individual classes from the same module
import java.util.List;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.stream.Collectors;
```

### The Java 25 way

```java
import module java.base;

void main() {
    List<String> names = new ArrayList<>();
    Map<String, Integer> counts = new HashMap<>();
    // every exported package's public types across java.base are now available
}
```

`import module <name>` imports **every package exported by that module** (and, if the module has a `requires transitive` dependency on another module, that module's exported packages become available too) in a single line, rather than enumerating individual type imports.

> ⚠️ **This is a convenience for scripts and quick code, not a general recommendation for large codebases.** Wildcard-style, whole-module imports can make it less obvious at a glance exactly where a given type comes from, and can occasionally introduce ambiguous-name conflicts between two different modules exporting a same-named class — most team style guides will continue to prefer explicit, specific imports for production application code, reserving module imports for the same "quick script, teaching, prototype" use cases as compact source files.

---

## 5. Scoped Values (JEP 506 — Final)

Previewed across Java 21, 22, 23, and 24, **Scoped Values** are finalized as a permanent feature in Java 25 — the safer, immutable alternative to `ThreadLocal` first introduced conceptually in the Java 21 notes.

```java
static final ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();

void handleRequest(String requestId) {
    ScopedValue.where(REQUEST_ID, requestId).run(() -> {
        processOrder(); // REQUEST_ID.get() accessible anywhere in this call chain
    });
} // binding automatically and reliably torn down here
```

Recall from the Java 21 notes why this matters specifically for **virtual threads**: `ThreadLocal` is mutable, easy to forget to clean up (leading to the thread-pool context-leakage bug covered in the Logging Frameworks/MDC notes), and doesn't propagate cleanly across the forked subtasks of structured concurrency. `ScopedValue` is immutable for the duration of its binding, automatically cleaned up when the enclosing `run()`/`call()` block exits, and specifically designed to scale efficiently to the millions of virtual threads a modern application might create — this finalization means production code can now depend on `ScopedValue`'s API without the risk of it changing in a future release.

---

## 6. Primitive Types in Patterns, `instanceof`, and `switch` (JEP 507 — Third Preview)

Continuing to preview (started as JEP 455 in Java 23, re-previewed unchanged in Java 24, and again in Java 25 as JEP 507), this extends pattern matching — until now limited to reference types — to also work directly with **primitive types**.

### The problem it solves

Prior to this feature, pattern matching for `switch` (Java 21) could only match reference types, forcing awkward boxing-related workarounds when a value's underlying type was primitive:

```java
// Without primitive type patterns — must work through boxed wrapper types
Object obj = 42;
String result = switch (obj) {
    case Integer i when i > 0 -> "positive int";
    case Integer i -> "non-positive int";
    default -> "not an int";
};
```

### The (preview) way

```java
int value = getValue();
String category = switch (value) {
    case int i when i < 0 -> "negative";
    case 0 -> "zero";
    case int i -> "positive";
};
```

This allows uniform pattern-based data exploration across **all** types, whether primitive or reference, closing a conceptual gap in Java's pattern-matching story: previously, whether a `switch`-based pattern could apply depended on whether you were working with an `int` or an `Integer`, a distinction that shouldn't matter for what is conceptually the same kind of check.

> ⚠️ **Still a preview after three iterations.** This is a good real-world illustration of why "preview" is a genuine, meaningful status rather than a rubber stamp — a feature can preview for multiple LTS-spanning release cycles while the design is refined based on real feedback before Oracle commits to it permanently. Production code should not depend on this feature's exact syntax until it's finalized.

---

## 7. Security: Key Derivation Function API and PEM Encodings

### Key Derivation Function API (JEP 510 — Final)

A standard, provider-based API for **Key Derivation Functions (KDFs)** — cryptographic algorithms (like HKDF) that derive one or more secret keys from a shared secret, salt, and context-specific info. Before this, Java had no unified standard API for KDFs, forcing applications to either implement them manually (a serious security risk if done incorrectly) or depend on non-standard, provider-specific APIs.

```java
KDF hkdf = KDF.getInstance("HKDF-SHA256");
AlgorithmParameterSpec params = HKDFParameterSpec.ofExtract()
        .addIKM(sharedSecret)
        .addSalt(salt)
        .thenExpand(info, 32);
SecretKey derivedKey = hkdf.deriveKey("AES", params);
```

This is part of a broader, ongoing push (visible across several recent releases) to modernize Java's cryptography APIs ahead of the industry-wide shift toward **post-quantum-resistant cryptography**, where standardized, correctly-implemented key derivation becomes even more important.

### PEM Encodings of Cryptographic Objects (JEP 470 — Preview)

PEM (Privacy-Enhanced Mail) is the ubiquitous Base64-based text format used for certificates, keys, and other cryptographic objects (the format behind `.pem` files you'll recognize from TLS/SSL configuration). Despite being everywhere in practice, Java never had a standard, direct API for encoding/decoding it — developers relied on manual string manipulation or third-party libraries (like Bouncy Castle) for something conceptually simple.

```java
PEMEncoder encoder = PEMEncoder.of();
String pem = encoder.encodeToString(publicKey);

PEMDecoder decoder = PEMDecoder.of();
PublicKey key = decoder.decode(pem, PublicKey.class);
```

---

## 8. Project Leyden — Startup, Footprint, and AOT Improvements

**Project Leyden** is Java's umbrella initiative for improving startup time, time-to-peak-performance, and memory footprint — and Java 25 dedicates a substantial share of its JEPs to it, continuing directly from Java 24's first Leyden delivery (Ahead-of-Time Class Loading & Linking, JEP 483).

### Ahead-of-Time Command-Line Ergonomics (JEP 514 — Final)

Simplifies the previously multi-step, multi-flag process of creating and using an **AOT cache** (a serialized snapshot of class metadata and linking information that lets subsequent JVM startups skip repeating that work) down to a much simpler, more ergonomic command-line experience:

```bash
# Simplified single-command AOT cache creation and use
java -XX:AOTCacheOutput=app.aot -XX:+AutoCreateSharedArchive -cp app.jar MainClass
java -XX:AOTCache=app.aot -cp app.jar MainClass
```

The goal is squarely operational: make AOT caching (previously a somewhat expert-only, multi-step workflow) accessible enough that ordinary application deployments — not just specialist performance-tuning teams — can realistically adopt it as a standard part of their build/deploy pipeline.

### Ahead-of-Time Method Profiling (JEP 515 — Final)

Extends AOT caching from just class metadata to **method execution profiles**. The JVM can record which methods are hot (frequently executed) and how they're typically called during a training run, then bake that profiling data into the AOT cache — so that on a subsequent, real production startup, the JIT compiler already knows which methods are worth optimizing aggressively from the very first request, rather than needing to observe and re-learn that information from scratch during a slow warm-up period.

> 💡 **Why this specifically matters for cloud workloads:** A serverless function or a frequently-restarted microservice pod might only run for a few seconds to a few minutes per instance — traditionally, the JIT compiler barely finishes warming up before the process is already torn down and replaced, meaning it spends its *entire* lifetime running relatively unoptimized interpreted or tier-1-compiled code. AOT method profiling directly attacks this by front-loading the warm-up knowledge from a representative training run, giving short-lived processes near-optimized performance from their very first requests — directly improving cold-start latency and making per-invocation billing (as in serverless pricing models) more predictable and cost-effective.

### Compact Object Headers (JEP 519 — Final)

Every Java object has historically carried a **header** (metadata like the object's hash code, GC state, and a pointer to its class) taking up **96 or 128 bits** per object on a typical 64-bit JVM, regardless of how small or simple the object's actual data is. For applications creating enormous numbers of small objects (extremely common in Java generally, and especially in data-heavy or high-throughput services), this per-object overhead adds up to a significant, unavoidable memory tax.

Compact Object Headers reduce this to **64 bits** per object by restructuring how class-pointer and mark-word information is packed together, finalized in Java 25 after experimental availability in Java 24.

> 💡 **Why this matters beyond just "less memory":** Smaller object headers don't just save raw memory — they also improve **CPU cache locality**. More objects fit into each CPU cache line and each page, meaning more of a typical workload's working set fits in fast cache memory rather than requiring slower main-memory access, which directly benefits throughput and latency simultaneously, not memory footprint alone.

### Generational Shenandoah (JEP 521 — Final)

**Shenandoah** is a low-pause-time garbage collector (conceptually similar in goals to ZGC, covered in the Java 21 notes, though built on a different internal algorithm) that performs the bulk of its collection work concurrently with the running application, keeping pause times short and largely independent of heap size.

Like ZGC's own generational upgrade in Java 21, Shenandoah's generational mode — experimental in Java 24 — is **finalized as a stable, production-ready feature** in Java 25: it separates the heap into young and old generations (following the same generational hypothesis discussed in the ZGC section of the Java 21 notes), improving memory efficiency and overall throughput while preserving Shenandoah's core strength of short, consistent pause times.

```bash
java -XX:+UseShenandoahGC -XX:ShenandoahGCMode=generational -jar app.jar
```

> 💡 **Why Java now has two mature generational low-pause collectors:** ZGC and Shenandoah both target the same broad goal (low, consistent pause times regardless of heap size) but were built by different teams with different internal algorithms and trade-offs. Having both mature to stable, generational, production-ready status gives teams real choice based on their specific workload characteristics, rather than a single one-size-fits-all low-latency collector — echoing the same "no single GC is right for every workload" philosophy that has driven the JVM's GC pluggability since G1 first became default.

### Removal of the 32-bit x86 Port (JEP 503)

Continuing a cleanup effort started with the removal of the 32-bit Windows port in Java 24, Java 25 completes the removal of **all remaining 32-bit x86 support**. This reflects the reality that 32-bit operating systems are now overwhelmingly obsolete in any environment that would realistically run a current JDK — maintaining the port had become a pure ongoing cost with vanishingly small real-world benefit.

---

## 9. Observability: JFR Enhancements

Java Flight Recorder (JFR), the low-overhead profiling framework open-sourced back in Java 11, gains three related enhancements in Java 25, all aimed at making production profiling more accurate and more actionable:

| JEP | Feature | What it adds |
|---|---|---|
| **JEP 509** | JFR CPU-Time Profiling (Experimental) | Samples based on actual **CPU time** consumed rather than wall-clock time — meaning a thread that's blocked/waiting (not actually using CPU) doesn't distort the profile the way wall-clock sampling could, giving a more accurate picture of where CPU cycles are genuinely being spent. |
| **JEP 518** | JFR Cooperative Sampling | Improves the stability and accuracy of stack-sampling by walking call stacks only at JVM safepoints, minimizing the sampling bias and occasional crashes that asynchronous stack-walking could previously introduce. |
| **JEP 520** | JFR Method Timing & Tracing | Adds bytecode-instrumentation-based facilities for precise method-level timing and tracing, complementing JFR's existing sampling-based approach with exact, instrumented measurement where that level of precision is worth its slightly higher overhead. |

These three together reflect a broader theme: as more Java workloads run in ephemeral, container-based environments where attaching a traditional debugger or long-running profiler session is impractical, **built-in, low-overhead, always-available observability tooling** (JFR) becomes increasingly central to how production Java issues actually get diagnosed.

---

## 10. Stable Values (JEP 502 — Preview)

A new API for **deferred, immutable computation** — values that are declared once but computed lazily, at most once, the first time they're actually needed, while still being treated by the JVM with the same optimization confidence as a `final` field.

### The problem it solves

The traditional "lazy initialization holder" pattern for a genuinely one-time, deferred computation has always required manual, error-prone boilerplate (often involving `synchronized` blocks or double-checked locking to remain thread-safe):

```java
// Traditional lazy initialization — manual, and easy to get subtly wrong under concurrency
private volatile ExpensiveResource resource;

ExpensiveResource getResource() {
    if (resource == null) {
        synchronized (this) {
            if (resource == null) {
                resource = new ExpensiveResource();
            }
        }
    }
    return resource;
}
```

### The (preview) way

```java
private final StableValue<ExpensiveResource> resource = StableValue.of();

ExpensiveResource getResource() {
    return resource.orElseSet(ExpensiveResource::new);
}
```

`StableValue` guarantees the supplier runs **at most once**, is safe under concurrent access without manual synchronization, and — importantly for Project Leyden's broader goals — gives the JVM a genuine, verifiable guarantee that the value, once set, will never change again, unlocking the same constant-folding-style JIT optimizations normally reserved for `static final` fields, but for values that couldn't previously be computed until some point after class initialization.

---

## 11. Vector API (JEP 508 — Tenth Incubator)

Still incubating after ten consecutive releases, the Vector API lets Java code express data-parallel (SIMD) computations that compile down to optimal vector CPU instructions on supported hardware, rather than relying on the JIT compiler to *maybe* auto-vectorize a scalar loop.

```java
// Conceptual example — element-wise vector addition
var species = FloatVector.SPECIES_PREFERRED;
for (int i = 0; i < a.length; i += species.length()) {
    var va = FloatVector.fromArray(species, a, i);
    var vb = FloatVector.fromArray(species, b, i);
    va.add(vb).intoArray(result, i);
}
```

Its extraordinarily long incubation period (ten releases and counting) reflects the genuine difficulty of designing a portable API that maps efficiently onto very different underlying hardware vector instruction sets (x86 AVX variants, ARM NEON/SVE, etc.) while still feeling like idiomatic Java — a good illustration of how much longer a truly novel, hardware-adjacent API can take to stabilize compared to a "pure language syntax" feature like flexible constructor bodies.

---

## 12. Real-World Scenarios

### Cloud-native microservices — Faster cold starts with AOT profiling and compact headers
A team running a Java-based serverless function (cold-started frequently, living only seconds per invocation) adopts AOT method profiling (JEP 515) combined with an AOT cache (JEP 514), training the cache against representative production traffic during their build pipeline. Combined with compact object headers (JEP 519) reducing per-object memory overhead across the thousands of small request/response objects the function allocates per invocation, the function's cold-start latency and memory footprint both improve measurably — directly translating to lower serverless billing costs and more predictable latency SLAs.

### Teaching and scripting — Lowering the barrier to a first Java program
A university course rewrites its "Introduction to Java" first lesson using compact source files:
```java
void main() {
    System.out.println("Enter your name:");
    String name = readLine();
    System.out.println("Hello, " + name + "!");
}
```
Students write and run their very first program without needing to understand `public static void main(String[] args)`, classes, or access modifiers on day one — those concepts are introduced later, once the student already has a working mental model of "a program is a sequence of statements."

### Financial services — Standardized key derivation for a new encryption pipeline
A payments platform migrating away from a hand-rolled, provider-specific key derivation implementation adopts the new standard KDF API (JEP 510), reducing both the custom cryptographic code surface area the security team needs to audit and the risk of a subtly incorrect home-grown KDF implementation — a category of mistake with serious real-world security consequences.

### High-throughput services — Choosing between ZGC and generational Shenandoah
A team running a large in-memory cache service evaluates both Java 21's generational ZGC and Java 25's newly-finalized generational Shenandoah under their specific allocation and heap-size profile, since both are now mature, production-ready, low-pause-time options rather than one being a stable choice and the other purely experimental — a genuinely new decision point that didn't meaningfully exist before this release.

---

## 13. Comparison: Java 25's JEPs by Category

| Category | JEPs | Examples |
|---|---|---|
| **Final — Language syntax** | 511, 512, 513 | Module Import Declarations, Compact Source Files, Flexible Constructor Bodies |
| **Final — Concurrency** | 506 | Scoped Values |
| **Final — Security** | 510 | Key Derivation Function API |
| **Final — Performance/Leyden** | 514, 515, 519, 521 | AOT Ergonomics, AOT Method Profiling, Compact Object Headers, Generational Shenandoah |
| **Final — Removal** | 503 | Remove the 32-bit x86 Port |
| **Preview** | 470, 502, 505, 507 | PEM Encodings, Stable Values, Structured Concurrency (5th preview), Primitive Type Patterns (3rd preview) |
| **Incubator** | 508 | Vector API (10th incubator) |
| **Experimental** | 509, 518, 520 | JFR CPU-Time Profiling, JFR Cooperative Sampling, JFR Method Timing & Tracing |

---

## 14. Common Mistakes / Gotchas

> ⚠️ **Treating compact source files as a new production coding style.** They're designed for scripts, teaching, and prototyping — real multi-class applications should continue using the traditional, explicit class structure.

> ⚠️ **Assuming Flexible Constructor Bodies let you touch `this` before `super()`.** The rule change permits *instance-independent* statements (validation, logging, local computation) before the explicit constructor call — it does not allow field access, method calls, or any other use of the object under construction before superclass initialization completes.

> ⚠️ **Depending on preview or incubator features (Structured Concurrency, Primitive Type Patterns, Stable Values, PEM Encodings, Vector API) in production code**, given their APIs are explicitly not yet permanent and have, in some cases, already changed across multiple prior preview iterations.

> ⚠️ **Forgetting the JVM flags for experimental/opt-in features** — Generational Shenandoah, Compact Object Headers in earlier experimental form, and JFR CPU-Time Profiling all require explicit flags; none of these are silently on by default purely by upgrading the JDK version.

> ⚠️ **Using `import module java.base;`-style imports throughout a large, multi-developer production codebase**, where explicit imports usually remain more maintainable and less prone to ambiguous-name surprises as the codebase and its dependencies grow.

---

## Interview Questions

1. What are the two broad, parallel themes running through Java 25's feature set, and how do they reflect different real-world Java deployment shapes (long-running servers vs. short-lived cloud functions)?
2. Explain the exact rule change introduced by Flexible Constructor Bodies — what is newly allowed before `super()`/`this()`, and what is still strictly forbidden, and why?
3. Why did Compact Source Files and Instance Main Methods take four release cycles (21, 23, 24, 25) to go from preview to final, and what does that iteration process suggest about how Java evolves major language-ergonomics features?
4. What problem does `import module java.base;` solve, and why do most style guides still recommend explicit imports for large production codebases despite this convenience existing?
5. Why is `ScopedValue` considered a safer replacement for `ThreadLocal` specifically in the context of virtual threads and structured concurrency?
6. What specific gap in Java's pattern-matching capabilities does JEP 507 (Primitive Types in Patterns) aim to close, and why did matching primitives require a separate, multi-release preview effort rather than "just working" once reference-type pattern matching for switch existed?
7. What is a Key Derivation Function, and why did the JDK need a standardized API for this rather than leaving it to third-party cryptography libraries?
8. Explain what Ahead-of-Time Method Profiling actually captures and bakes into an AOT cache, and why this specifically helps short-lived, frequently-restarted processes like serverless functions more than long-running server applications.
9. How does reducing an object's header from 96–128 bits to 64 bits (Compact Object Headers) improve performance in ways that go beyond simply "using less memory"?
10. What is the generational hypothesis in garbage collection, and why did both ZGC (Java 21) and Shenandoah (Java 25) need to add generational modes to remain competitive with G1 on typical workloads?
11. What guarantee does `StableValue` provide that the traditional double-checked-locking lazy-initialization pattern requires manual, error-prone code to achieve, and what additional JIT optimization opportunity does that guarantee unlock?
12. Why has the Vector API remained in incubator status for ten consecutive JDK releases, and what does that unusually long incubation period suggest about the relative difficulty of designing hardware-adjacent APIs compared to pure language syntax features?