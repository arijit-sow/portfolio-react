# Java 21 Features

> **Topic:** Record patterns, pattern matching for switch, sequenced collections, virtual threads (recap), and the preview features shaping Java's future

---

## 1. Why Java 21 Matters — The Bigger Picture

Released in September 2023, Java 21 is the third major LTS release covered in this series, and it's where several multi-year efforts finally converged into stable, production-ready form: the **pattern matching story** started conceptually back in Java 16/17 (records, sealed classes, `instanceof` patterns) reaches its natural conclusion with **record patterns** and **pattern matching for `switch`**, and **Project Loom's virtual threads** — years in the making — became a finalized, non-preview feature.

> 💡 **Key insight:** If Java 17 was about giving the compiler more *structural* knowledge (records, sealed hierarchies), Java 21 is about giving the compiler the ability to **use** that structural knowledge to its fullest — deconstructing data shapes directly inside control-flow constructs like `switch`, rather than only checking and casting one level at a time.

Java 21 also ships an unusually large number of **preview features** (String Templates, Structured Concurrency, Scoped Values, Unnamed Patterns and Variables) — a deliberate strategy under the "Java is now on a 6-month cadence" model where a feature can be previewed, gather real developer feedback across multiple releases, and be refined before final commitment. This section covers both the finalized headline features and the previews worth knowing about.

---

## 2. Record Patterns

Record patterns extend pattern matching to allow a single pattern to both **check a type and destructure it into its components** in one step — a direct, designed-in payoff for the investment made in records back in Java 17.

### The problem it solves

Without record patterns, working with nested record data required manually calling accessor methods after a type check:

```java
// Before record patterns
if (shape instanceof Circle) {
    Circle c = (Circle) shape;
    double radius = c.radius();
    System.out.println("Radius: " + radius);
}
```

### The record pattern way

```java
record Point(int x, int y) { }
record Circle(Point center, double radius) { }

if (shape instanceof Circle(Point(int x, int y), double radius)) {
    System.out.println("Center: (" + x + ", " + y + "), radius: " + radius);
}
```

A single pattern — `Circle(Point(int x, int y), double radius)` — checks that `shape` is a `Circle`, checks that its `center` is a `Point`, and binds `x`, `y`, and `radius` directly as local variables, all **without a single explicit cast or accessor call**, and arbitrarily nested to match however deeply your record structure goes.

### Type inference with `var` in record patterns

```java
if (shape instanceof Circle(var center, var radius)) {
    System.out.println(center + " " + radius);
}
```
`var` can replace explicit component types inside a record pattern when the type is already unambiguous from the record's declaration, reducing visual noise for deeply nested patterns.

> 💡 **Why this matters:** This is the concrete payoff promised back in the Java 17 records discussion — records were designed as much for their role as pattern-matching targets as for their boilerplate reduction. Record patterns are what makes records feel like true algebraic data types in practice, not just "convenient immutable classes."

---

## 3. Pattern Matching for `switch`

Finalized in Java 21 (after previewing since Java 17), this extends `switch` — already upgraded with arrow-form expressions in Java 14 — to match against **types and record patterns**, not just constant values.

### The problem it solves

Before this feature, branching on an object's runtime type required a chain of `if`/`else if` with `instanceof` checks — verbose, and with no compiler-enforced exhaustiveness:

```java
// Before pattern matching for switch
Object obj = getShape();
String description;
if (obj instanceof Circle c) {
    description = "Circle with radius " + c.radius();
} else if (obj instanceof Square s) {
    description = "Square with side " + s.side();
} else if (obj instanceof Rectangle r) {
    description = "Rectangle " + r.width() + "x" + r.height();
} else {
    throw new IllegalStateException("Unknown shape");
}
```

### The pattern matching switch way

```java
String description = switch (obj) {
    case Circle c -> "Circle with radius " + c.radius();
    case Square s -> "Square with side " + s.side();
    case Rectangle r -> "Rectangle " + r.width() + "x" + r.height();
    default -> throw new IllegalStateException("Unknown shape");
};
```

Combined with record patterns from Section 2, this becomes even more powerful — matching type **and** deconstructing components in a single case label:

```java
String describe(Shape shape) {
    return switch (shape) {
        case Circle(Point(var x, var y), var radius) ->
                "Circle at (" + x + "," + y + ") r=" + radius;
        case Square(var side) -> "Square side " + side;
        case Rectangle(var w, var h) when w == h -> "Actually a square: " + w;
        case Rectangle(var w, var h) -> "Rectangle " + w + "x" + h;
        default -> "Unknown shape";
    };
}
```

### Exhaustiveness with sealed types — no `default` required

Just as with the sealed-type example in the Java 17 notes, if `Shape` is a **sealed** interface `permits Circle, Square, Rectangle`, the compiler can prove this `switch` is exhaustive without any `default` branch at all — and if a new shape is added to the `permits` list later, every such `switch` in the codebase fails to compile until updated.

### `null` handling in switch

Traditionally, `switch (obj)` threw a `NullPointerException` immediately if `obj` was `null`, before any case was even evaluated — a frequent, easy-to-forget footgun. Java 21 lets you handle `null` explicitly as its own case:

```java
String describe(Object obj) {
    return switch (obj) {
        case null -> "It's null";
        case String s -> "String: " + s;
        case Integer i -> "Integer: " + i;
        default -> "Something else";
    };
}
```

### Guarded patterns with `when`

A `when` clause adds an arbitrary boolean condition to a pattern, for cases where the type match alone isn't specific enough:

```java
String classify(Object obj) {
    return switch (obj) {
        case Integer i when i < 0 -> "Negative integer";
        case Integer i when i == 0 -> "Zero";
        case Integer i -> "Positive integer";
        default -> "Not an integer";
    };
}
```

> ⚠️ **Common mistake:** Ordering pattern cases where a more general pattern appears before a more specific one — e.g., placing `case Integer i ->` before `case Integer i when i < 0 ->`. Just like the classic exception-catch-block ordering rule (see the Exception Handling notes), pattern `switch` cases are checked **in order**, and the compiler flags an unreachable later case if an earlier one would always match first.

---

## 4. Virtual Threads (Recap)

Virtual threads (Project Loom) were finalized as a stable feature in Java 21 after previewing in 19 and 20. This topic already has its **own dedicated, in-depth notes file** covering platform vs. virtual threads, carrier threads, mounting/unmounting, continuations, pinning, and structured concurrency in full detail — that remains the canonical reference.

The short version, for continuity with this version-history series: virtual threads are extremely lightweight, JVM-managed threads (millions can run concurrently, unlike platform threads which are limited by OS thread overhead) that let you write simple, blocking, one-thread-per-request style code while still achieving the scalability previously only reachable through complex asynchronous/reactive programming models.

```java
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 100_000; i++) {
        executor.submit(() -> {
            String result = callSlowNetworkService(); // blocking call — perfectly fine on a virtual thread
            process(result);
        });
    }
}
```

> 💡 See the dedicated **Virtual Threads** notes for the full internals: platform vs. virtual thread architecture, carrier thread scheduling, mounting/unmounting mechanics, why pooling virtual threads is an anti-pattern, `ThreadLocal`/`ScopedValue` considerations, and pinning scenarios.

---

## 5. Sequenced Collections

Before Java 21, the Collections Framework had a long-standing, frequently-noted gap: there was no common interface for "a collection with a defined encounter order that lets you access the first and last elements and iterate in reverse" — `List`, `LinkedHashSet`, and `LinkedHashMap` all conceptually had this property, but each exposed it through a different, inconsistent API (or not at all in a uniform way).

### The new interfaces

```java
interface SequencedCollection<E> extends Collection<E> {
    SequencedCollection<E> reversed();
    void addFirst(E e);
    void addLast(E e);
    E getFirst();
    E getLast();
    E removeFirst();
    E removeLast();
}

interface SequencedSet<E> extends Set<E>, SequencedCollection<E> { }

interface SequencedMap<K, V> extends Map<K, V> {
    SequencedMap<K, V> reversed();
    SequencedSet<K> sequencedKeySet();
    SequencedCollection<V> sequencedValues();
    SequencedSet<Map.Entry<K, V>> sequencedEntrySet();
    V putFirst(K k, V v);
    V putLast(K k, V v);
    Map.Entry<K, V> firstEntry();
    Map.Entry<K, V> lastEntry();
    Map.Entry<K, V> pollFirstEntry();
    Map.Entry<K, V> pollLastEntry();
}
```

`List`, `Deque`, `LinkedHashSet`, and `LinkedHashMap` were all retrofitted (via default methods, echoing the Java 8 interface-evolution technique from the earlier notes) to implement these new interfaces without breaking any existing code.

```java
List<String> list = new ArrayList<>(List.of("a", "b", "c"));
list.getFirst();       // "a" — previously required list.get(0)
list.getLast();        // "c" — previously required list.get(list.size() - 1)
list.reversed();       // a view, iterating in reverse order — no manual Collections.reverse() needed

LinkedHashMap<String, Integer> map = new LinkedHashMap<>();
map.put("a", 1);
map.put("b", 2);
map.firstEntry();      // a=1 — previously required manual iteration or entrySet().iterator().next()
map.reversed();        // a reverse-ordered view of the map
```

> ⚠️ **Common mistake:** Assuming `.reversed()` (and other sequenced-collection views) always return a **new, independent copy**. In most implementations, these are **live views** backed by the original collection — mutating the original collection is reflected in the view, and vice versa where the view supports mutation. Treat this the same caution-level as `Map.entrySet()` or `List.subList()` views from earlier in the Collections notes.

### Why this was a genuinely overdue gap

Before Java 21, `getFirst()`/`getLast()`-style access was either verbose (`list.get(0)`, `list.get(list.size() - 1)` — the latter especially easy to get subtly wrong with an off-by-one error), inconsistent across types (`Deque` had `getFirst()`/`getLast()` for years, but plain `List` never did, despite both having a well-defined order), or entirely unavailable (there was no standard way to get a reverse-order **view** of a `LinkedHashMap` without writing custom iteration code). Sequenced Collections closes this consistency gap across the entire framework in one release, rather than continuing to patch individual interfaces piecemeal.

---

## 6. Generational ZGC

ZGC (introduced experimentally in Java 11, discussed in that release's notes) is a low-latency garbage collector aiming for sub-millisecond pause times regardless of heap size. Java 21 introduces a **generational** mode for ZGC.

### Why generational matters

Nearly all modern garbage collectors (including G1, the long-standing default) are built on the **generational hypothesis**: most objects die young (a temporary variable, a short-lived request object), so it's far more efficient to frequently and cheaply collect a small "young generation" region, and only occasionally scan the smaller pool of long-lived "old generation" objects. The original (Java 11-era) ZGC did **not** make this generational distinction — it treated all objects uniformly, which was simpler to implement but left real throughput and efficiency on the table compared to generational collectors like G1.

Generational ZGC keeps ZGC's headline strength (extremely low, consistent pause times, largely independent of heap size) while adding separate young/old generation handling, closing much of the throughput/efficiency gap that had previously made teams choose between "G1 for throughput" and "ZGC for latency" as a hard trade-off. This makes ZGC a realistic **default consideration** for a much wider range of production workloads than before, rather than a specialist choice only for extreme low-latency requirements.

---

## 7. String Templates (Preview)

A **preview** feature in Java 21 (further refined and ultimately withdrawn/reworked in later releases based on developer feedback — a good real example of the preview-feedback process actually changing a feature's direction), String Templates aimed to make embedding expressions directly into string literals safer and more readable than manual concatenation or `String.format()`.

```java
String name = "Alice";
int age = 30;

// Traditional concatenation
String s1 = "Name: " + name + ", Age: " + age;

// String.format
String s2 = String.format("Name: %s, Age: %d", name, age);

// String template (preview, STR template processor)
String s3 = STR."Name: \{name}, Age: \{age}";
```

The key motivating idea was a **pluggable template processor** (`STR`, or a custom one like a hypothetical `JSON` processor) that controls exactly how embedded expressions are validated and interpolated — for example, a SQL-aware template processor could automatically escape embedded values to prevent SQL injection, something plain string concatenation can never enforce at compile time.

> ⚠️ **Note on preview status:** As a preview feature, this required `--enable-preview` to compile and run, and its exact syntax/API was **not guaranteed to remain stable** in subsequent releases — real-world production code generally avoids depending on preview features for exactly this reason, and String Templates specifically underwent further design changes after Java 21, illustrating why "preview" is a meaningful, real warning label rather than a formality.

---

## 8. Structured Concurrency and Scoped Values (Preview)

Both previewed alongside virtual threads, extending the "make concurrent code as easy to reason about as sequential code" theme:

### Structured Concurrency

Treats a group of related concurrent subtasks as a single unit of work — if the parent task is cancelled or fails, all of its child subtasks are automatically cancelled too, and the parent cannot proceed until all children complete, fail, or are cancelled.

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Subtask<User> userTask = scope.fork(() -> fetchUser(userId));
    Subtask<List<Order>> ordersTask = scope.fork(() -> fetchOrders(userId));

    scope.join();           // wait for both subtasks
    scope.throwIfFailed();  // propagate any failure

    return new UserProfile(userTask.get(), ordersTask.get());
}
```

This directly addresses a real, longstanding problem with unstructured concurrency (raw `ExecutorService.submit()` calls scattered through a method): if one of several concurrently-launched tasks fails, ad-hoc code can easily "leak" the other tasks — they keep running in the background, consuming resources, with nothing tracking or cancelling them. Structured concurrency makes the parent-child task relationship an explicit, enforced part of the code's structure (mirroring a `try`-block's own well-defined lexical scope), rather than an informal convention that's easy to violate.

### Scoped Values

A safer, immutable alternative to `ThreadLocal` for sharing context data across a call chain within a single thread (or, importantly, across the virtual threads forked by structured concurrency).

```java
static final ScopedValue<String> REQUEST_ID = ScopedValue.newInstance();

void handleRequest(String requestId) {
    ScopedValue.where(REQUEST_ID, requestId).run(() -> {
        processOrder(); // REQUEST_ID.get() is accessible anywhere in this call chain
    });
}
```

Unlike `ThreadLocal`, a `ScopedValue` is **immutable for the duration of its binding**, automatically and reliably cleaned up when the `run()`/`call()` block exits (no risk of the classic thread-pool `ThreadLocal` leakage bug covered in the Logging Frameworks notes' MDC section), and is specifically designed to be efficient and correctly propagated when used with large numbers of virtual threads and structured concurrency, where a traditional `ThreadLocal.set()`/`remove()` discipline becomes error-prone at scale.

---

## 9. Unnamed Patterns and Variables (Preview)

Addresses a small but common annoyance: being forced to name a variable you have no actual use for, purely to satisfy the compiler's syntax.

```java
// Before — "e" and "ignored" are unused, but must be named
try {
    process();
} catch (Exception e) {
    log.error("Failed");
}

if (obj instanceof Point(int x, int ignored)) {
    System.out.println("x = " + x);
}

for (Order order : orders) {
    count++; // "order" itself is never referenced
}
```

```java
// Java 21 preview — the underscore explicitly marks "I don't need this"
try {
    process();
} catch (Exception _) {
    log.error("Failed");
}

if (obj instanceof Point(int x, int _)) {
    System.out.println("x = " + x);
}

for (Order _ : orders) {
    count++;
}
```

This is a small readability/intent-signaling improvement — `_` makes it immediately clear to a reader that a particular binding is structurally required but deliberately unused, rather than leaving them to wonder whether `ignored` or `e` was meant to be used somewhere and simply forgotten.

---

## 10. Real-World Scenarios

### E-commerce — Deconstructing nested order data with record patterns
```java
record Address(String city, String zip) { }
record Customer(String name, Address address) { }
record Order(String id, Customer customer, double total) { }

String shippingLabel(Object obj) {
    return switch (obj) {
        case Order(var id, Customer(var name, Address(var city, var zip)), var total) ->
                name + ", " + city + " " + zip + " — Order #" + id + " ($" + total + ")";
        default -> "Unknown";
    };
}
```
A three-level-deep nested record structure is destructured into five local variables in a single pattern — the equivalent pre-Java-21 code would require three separate type checks/casts and five separate accessor calls.

### Banking — Exhaustive, null-safe transaction classification
```java
sealed interface TransactionResult permits Success, Declined, Pending { }
record Success(String confirmationCode) implements TransactionResult { }
record Declined(String reason) implements TransactionResult { }
record Pending(Duration estimatedWait) implements TransactionResult { }

String describe(TransactionResult result) {
    return switch (result) {
        case null -> "No result received";
        case Success(var code) -> "Approved: " + code;
        case Declined(var reason) -> "Declined: " + reason;
        case Pending(var wait) -> "Pending, est. " + wait.toMinutes() + " min";
    };
}
```
The compiler proves this handles every possible `TransactionResult` subtype **and** the `null` case, with no `default` branch and no risk of a forgotten case silently falling through to unexpected behavior in a financial-transaction code path.

### Ride-sharing — Structured concurrency for parallel downstream calls
```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    var driverTask = scope.fork(() -> findNearestDriver(request));
    var pricingTask = scope.fork(() -> calculateFare(request));
    var etaTask = scope.fork(() -> estimateArrival(request));

    scope.join().throwIfFailed();
    return new RideQuote(driverTask.get(), pricingTask.get(), etaTask.get());
}
```
If the pricing call fails, structured concurrency automatically cancels the still-running driver-matching and ETA calls rather than letting them continue consuming resources for a request that's already going to fail overall — a correctness and resource-efficiency improvement over manually managing three independent `Future` objects.

### Microservices — Millions of concurrent virtual threads for I/O-bound request handling
Referencing the dedicated Virtual Threads notes: a request-handling service adopts `Executors.newVirtualThreadPerTaskExecutor()` to handle a large number of concurrent, mostly-blocked-on-I/O requests using simple, sequential, one-thread-per-request code, without needing to rewrite the service in a reactive/asynchronous style purely to scale beyond the limits of platform-thread pool sizing.

---

## 11. Comparison: Pattern Matching Evolution Across Versions

| Version | Capability |
|---|---|
| Java 16 | `instanceof` pattern matching — type check + cast in one step |
| Java 17 | Sealed types — closed, compiler-verifiable hierarchies |
| Java 21 | Pattern matching for `switch` — type-based branching with exhaustiveness checking, `null` handling, guarded patterns (`when`) |
| Java 21 | Record patterns — destructure nested record components directly inside `instanceof` and `switch` patterns |

---

## 12. Common Mistakes / Gotchas

> ⚠️ **Relying on preview features in production.** String Templates, Structured Concurrency, Scoped Values, and Unnamed Patterns were all **preview** in Java 21 — their APIs were not finalized and, in String Templates' case, changed significantly afterward. Production code should generally wait for a feature's final, non-preview form.

> ⚠️ **Ordering pattern-matching switch cases incorrectly**, placing a general pattern before a more specific guarded one — the compiler will flag the later case as unreachable.

> ⚠️ **Assuming `SequencedCollection.reversed()` always copies.** It typically returns a live, order-reversed view — mutations to the original are visible through it (and vice versa, where supported).

> ⚠️ **Forgetting `case null`.** If you don't add an explicit `case null`, `switch` still throws `NullPointerException` on a null subject exactly as it always did — pattern matching for switch doesn't change this default; it merely gives you the *option* to handle `null` explicitly when you want to.

---

## Interview Questions

1. How do record patterns build directly on the record feature introduced in Java 17, and why were records specifically designed with this future use case in mind?
2. Write a record pattern that matches a `Rectangle(Point topLeft, Point bottomRight)` and binds all four underlying coordinates in one step. Why is this preferable to manually calling accessors after an `instanceof` check?
3. How does pattern matching for `switch` achieve exhaustiveness checking without a `default` branch, and what specific role does a `sealed` type hierarchy play in making that guarantee possible?
4. What happens by default when a `switch` statement's subject is `null`, and how does Java 21 let you explicitly opt into handling that case instead?
5. What is a guarded pattern (`when` clause), and why must cases be ordered from more specific/restrictive to more general when guards are involved?
6. What specific, longstanding inconsistency in the Collections Framework did `SequencedCollection`, `SequencedSet`, and `SequencedMap` set out to fix?
7. Why is it important to know whether `list.reversed()` returns a live view versus an independent copy, and what real bug could result from assuming the wrong one?
8. What does "generational" mean in the context of garbage collection, and why did adding generational support to ZGC narrow the gap between ZGC and G1 for typical workloads?
9. What specific problem does structured concurrency solve regarding "leaked" background tasks that unstructured, ad-hoc `ExecutorService.submit()` calls can create when one of several concurrent operations fails?
10. How does `ScopedValue` differ from `ThreadLocal` in terms of mutability and cleanup guarantees, and why does this matter specifically in a codebase using virtual threads at scale?
11. What was the motivating idea behind String Templates' pluggable template processors (like `STR`), and how could a custom processor help prevent a category of security vulnerability that plain string concatenation cannot?
12. Why does a feature being labeled "preview" in a given Java release matter for production adoption decisions, and can you give an example from Java 21 itself where a preview feature's design changed significantly afterward?