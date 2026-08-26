# Java 8 Features

> **Topic:** Lambdas, functional interfaces, method references, default/static interface methods, Streams (intro), Optional, the new Date/Time API, and CompletableFuture

---

## 1. Why Java 8 Matters — The Bigger Picture

Released in March 2014, Java 8 is widely considered the most significant release in the language's history — more transformative than any version before or since (until arguably Java 21's virtual threads). Every release since has built on the functional-programming foundation laid here.

### Why did Java need this shift?

By the early 2010s, multi-core hardware had become the norm, but Java's collections and iteration model (`for` loops, external iteration) made it awkward to write code that could be parallelized without manually managing threads. At the same time, languages like Scala, C#, and JavaScript had popularized **lambda expressions** and functional-style APIs, and Java's verbosity (especially anonymous inner classes) was becoming a real productivity and readability liability.

Java 8's core goals:
1. Make it natural to pass **behavior** (not just data) as a method argument — without the ceremony of anonymous classes.
2. Provide a new, declarative way to process collections (**Streams**) that could optionally run in parallel with minimal code changes.
3. Fix long-standing pain points: the old `Date`/`Calendar` API's mutability and thread-unsafety, `null`-related `NullPointerException`s, and interface evolution without breaking existing implementations.

> 💡 **Key insight:** Java 8's features aren't a random grab-bag — they're all in service of one philosophy: **treat behavior as a first-class value**, so APIs can accept "what to do" as naturally as they accept "what data" — enabling more declarative, composable code.

---

## 2. Lambda Expressions

A **lambda expression** is a concise, anonymous representation of a function — essentially a block of code you can pass around like a value, without needing to write a full class.

### The problem it solves

Before Java 8, passing behavior meant an anonymous inner class:

```java
// Pre-Java 8
Runnable r = new Runnable() {
    @Override
    public void run() {
        System.out.println("Running");
    }
};

Collections.sort(names, new Comparator<String>() {
    @Override
    public int compare(String a, String b) {
        return a.length() - b.length();
    }
});
```

This is extremely verbose for what is conceptually a single line of actual logic — most of the code is boilerplate the compiler could infer.

### The Java 8 way

```java
Runnable r = () -> System.out.println("Running");

Collections.sort(names, (a, b) -> a.length() - b.length());
```

### Syntax forms

```java
() -> 42                                  // no parameters
x -> x * x                                // single parameter, type inferred
(x, y) -> x + y                           // multiple parameters
(int x, int y) -> x + y                   // explicit types
(x, y) -> { int sum = x + y; return sum; } // block body with explicit return
```

### How lambdas work internally — `invokedynamic`, not anonymous classes

A common misconception is that the compiler simply desugars a lambda into an anonymous inner class under the hood, the way it looks at the source level. It does **not**. Instead:

1. The compiler generates a **private synthetic method** in the enclosing class containing the lambda's body.
2. At the call site, the compiler emits an `invokedynamic` bytecode instruction (introduced in Java 7 for exactly this kind of use case) rather than a direct `new AnonymousClass()` call.
3. At **first execution** of that `invokedynamic` instruction, the JVM calls a **bootstrap method** (`LambdaMetafactory.metafactory`), which dynamically generates the actual implementing class **at runtime**, using the low-level `MethodHandle` API, and links it.
4. Subsequent calls reuse the already-linked call site — no repeated class generation cost.

> 💡 **Why this matters:** Because class generation is deferred to runtime and only happens **once per lambda call site** (not once per class file), lambdas avoid bloating the compiled `.class` file with dozens of tiny anonymous-class files, and they can be more JIT-friendly than traditional anonymous classes in many scenarios.

### Effectively final variable capture

A lambda can reference local variables from its enclosing scope, but only if they are **effectively final** (never reassigned after initialization):

```java
int factor = 2;
Function<Integer, Integer> multiplier = x -> x * factor; // OK — factor never reassigned

int counter = 0;
Runnable bad = () -> counter++; // COMPILE ERROR — counter is mutated, not effectively final
```

> ⚠️ **Why this restriction exists:** Lambdas may outlive the method call that created them (e.g., stored and invoked later, or run on another thread). The captured variable is copied into the generated lambda instance at creation time. If the original variable could still change afterward, the lambda's copy and the original would silently diverge — a subtle concurrency and correctness hazard. Requiring effective finality makes this class of bug impossible at compile time.

---

## 3. Functional Interfaces

A **functional interface** is any interface with exactly **one abstract method** (it may have any number of `default` or `static` methods). This single abstract method is the "target" that a lambda expression implements.

```java
@FunctionalInterface
interface Calculator {
    int calculate(int a, int b);
}

Calculator add = (a, b) -> a + b;
```

`@FunctionalInterface` is optional but recommended — it's a compile-time check that fails the build if a second abstract method is accidentally added, protecting the interface's contract as a lambda target.

### The core functional interfaces in `java.util.function`

| Interface | Signature | Purpose |
|---|---|---|
| `Function<T, R>` | `R apply(T t)` | Transforms a `T` into an `R` |
| `Predicate<T>` | `boolean test(T t)` | A boolean-valued check |
| `Consumer<T>` | `void accept(T t)` | Consumes a value, returns nothing |
| `Supplier<T>` | `T get()` | Produces a value, takes no input |
| `BiFunction<T, U, R>` | `R apply(T t, U u)` | Two-argument transformation |
| `UnaryOperator<T>` | `T apply(T t)` | `Function<T, T>` — input and output same type |
| `BinaryOperator<T>` | `T apply(T t1, T t2)` | `BiFunction<T, T, T>` — used in reduction |

```java
Predicate<String> isEmpty = String::isEmpty;
Function<String, Integer> length = String::length;
Consumer<String> printer = System.out::println;
Supplier<List<String>> newList = ArrayList::new;
```

These generic interfaces exist so that library and application code don't need to invent a new single-method interface for every use case — `Function<T, R>`, `Predicate<T>`, etc. cover the vast majority of behavioral parameterization needs across the entire JDK (Streams, `Optional`, `Map` methods like `computeIfAbsent`, and countless third-party libraries all build on these same shapes).

### Composing functional interfaces

Several come with `default` methods for composition:

```java
Function<Integer, Integer> timesTwo = x -> x * 2;
Function<Integer, Integer> plusThree = x -> x + 3;

Function<Integer, Integer> combined = timesTwo.andThen(plusThree); // (x*2)+3
Function<Integer, Integer> combined2 = timesTwo.compose(plusThree); // (x+3)*2

Predicate<String> isLong = s -> s.length() > 10;
Predicate<String> startsWithA = s -> s.startsWith("A");
Predicate<String> both = isLong.and(startsWithA);
Predicate<String> either = isLong.or(startsWithA);
Predicate<String> negated = isLong.negate();
```

---

## 4. Method References

A **method reference** is shorthand for a lambda that does nothing but call an existing method. There are four forms:

```java
// 1. Static method reference
Function<String, Integer> parse = Integer::parseInt;          // s -> Integer.parseInt(s)

// 2. Instance method reference on a particular object
String prefix = "Mr. ";
Function<String, String> greet = prefix::concat;               // s -> prefix.concat(s)

// 3. Instance method reference on an arbitrary object of a type (very common with Streams)
Function<String, Integer> length = String::length;              // s -> s.length()

// 4. Constructor reference
Supplier<ArrayList<String>> factory = ArrayList::new;            // () -> new ArrayList<>()
```

Method references are purely **syntactic sugar** over lambdas — the compiler resolves them to the same `invokedynamic`-based mechanism described above. They're preferred stylistically when a lambda would do nothing but forward its arguments to an existing method, since `String::length` is more directly readable than `s -> s.length()`.

---

## 5. Default and Static Methods in Interfaces

Before Java 8, interfaces could only declare abstract methods. Adding a new method to a widely-implemented interface would **break every existing implementation**, since they'd all fail to compile until they added the new method.

### The problem this solved — retrofitting the Collections API

Java 8 needed to add stream-related methods (like `forEach`, `stream()`) to `Collection` and `List` **without breaking the entire Java ecosystem's existing implementations** written before Java 8 existed. The solution: **default methods** — interface methods with a body, which implementing classes inherit automatically unless they choose to override.

```java
interface Vehicle {
    void drive();

    default void honk() {
        System.out.println("Beep!");
    }

    static Vehicle createDefault() {
        return () -> System.out.println("Driving default vehicle");
    }
}
```

```java
// List<E> gained this in Java 8 without breaking any existing implementation:
default void forEach(Consumer<? super T> action) {
    for (T t : this) {
        action.accept(t);
    }
}
```

### The diamond problem, revisited

Because a class can implement multiple interfaces, two default methods with the same signature from different interfaces can conflict:

```java
interface A { default void hello() { System.out.println("A"); } }
interface B { default void hello() { System.out.println("B"); } }

class C implements A, B {
    // COMPILE ERROR unless explicitly resolved:
    @Override
    public void hello() {
        A.super.hello(); // must explicitly choose (or provide new implementation)
    }
}
```

Java's resolution rules: a **class** method always wins over any default method (classes take priority over interfaces), and if two interfaces provide conflicting defaults, the implementing class **must** override and explicitly disambiguate — Java refuses to guess.

### Static interface methods

`static` methods on interfaces (like `Comparator.comparing(...)` or `List.of(...)`) provide utility/factory functionality logically associated with the interface, without needing a separate helper class (like the old `Collections` / `Arrays` utility-class pattern) and without being inherited by implementing classes.

---

## 6. Streams — Introduction 

The **Stream API** (`java.util.stream`) is Java 8's declarative approach to processing sequences of data. Rather than writing imperative loops that describe *how* to iterate, you describe *what* transformation you want, and the API handles the iteration internally.

```java
List<String> names = List.of("Alice", "Bob", "Charlie", "Dave", "Eve");

List<String> result = names.stream()
        .filter(name -> name.length() > 3)
        .map(String::toUpperCase)
        .sorted()
        .collect(Collectors.toList());
// [ALICE, CHARLIE, DAVE]
```

Compare to the pre-Java-8 imperative equivalent:

```java
List<String> result = new ArrayList<>();
for (String name : names) {
    if (name.length() > 3) {
        result.add(name.toUpperCase());
    }
}
Collections.sort(result);
```

At a high level, a Stream pipeline is built from three kinds of operations:
- **Source** — where the data comes from (`collection.stream()`, `Stream.of(...)`, `IntStream.range(...)`, a file, etc.)
- **Intermediate operations** — lazy, return a new Stream (`filter`, `map`, `sorted`, `distinct`) — nothing actually runs yet.
- **Terminal operation** — triggers actual execution and produces a result (`collect`, `forEach`, `reduce`, `count`) — only at this point does the entire pipeline run, element by element.

Streams also unlock effortless parallelism:
```java
long count = names.parallelStream().filter(n -> n.length() > 3).count();
```

> 💡 This introduction only scratches the surface. The full internals — laziness, the Spliterator abstraction, how parallel streams actually split and fork/join work under the hood, `Collectors` in depth, stateful vs stateless intermediate operations, and common performance pitfalls — are covered in the dedicated **Streams** notes section.

---

## 7. Optional

`Optional<T>` is a container object that may or may not hold a non-null value, designed to make the **possibility of absence explicit** in a method's return type, rather than relying on `null` (and the ever-present risk of a `NullPointerException`).

### The problem it solves

```java
// Before Optional — caller has no compile-time signal that null is possible
public User findUserById(String id) {
    return database.get(id); // could return null — nothing in the signature warns you
}

User user = findUserById("123");
user.getName(); // NPE if not found — a runtime surprise
```

```java
// With Optional — the signature itself documents that absence is possible
public Optional<User> findUserById(String id) {
    return Optional.ofNullable(database.get(id));
}

Optional<User> maybeUser = findUserById("123");
String name = maybeUser.map(User::getName).orElse("Unknown");
```

### Core API

```java
Optional<String> present = Optional.of("hello");     // throws NPE if argument is null
Optional<String> maybeNull = Optional.ofNullable(getValueOrNull());
Optional<String> empty = Optional.empty();

present.isPresent();                 // true
present.isEmpty();                   // false (Java 11+)
present.get();                       // "hello" — throws NoSuchElementException if empty
present.orElse("default");           // returns value, or "default" if empty
present.orElseGet(() -> compute());  // lazy default — only computed if empty
present.orElseThrow(() -> new IllegalStateException("missing"));
present.ifPresent(System.out::println);
present.map(String::toUpperCase);    // Optional<String> containing "HELLO"
present.filter(s -> s.length() > 3);
```

> ⚠️ **Common mistake:** Calling `.get()` without checking `.isPresent()` first defeats the entire purpose of `Optional` — it just moves the `NullPointerException`-style crash risk into a `NoSuchElementException`-style crash risk. Prefer `.map()`, `.orElse()`, `.orElseGet()`, or `.ifPresent()` to work with the contained value safely.

> ⚠️ **Common mistake:** Using `Optional` as a **field type** or **method parameter type**. `Optional` was designed specifically as a **return type** to signal "this method might not have an answer." Effective Java and most style guides strongly discourage `Optional` fields (they add serialization complexity and memory overhead with no real benefit over just checking for `null` internally) and `Optional` parameters (callers can just pass `null` or use overloading instead).

---

## 8. The New Date and Time API — `java.time`

The old `java.util.Date` and `java.util.Calendar` classes (dating back to Java 1.0/1.1) had deep, well-known design flaws:
- `Date` is **mutable** — a `Date` object handed to another piece of code could be silently changed underneath you.
- Both classes are **not thread-safe**, yet were commonly (incorrectly) shared across threads.
- Confusing APIs — months are zero-indexed (`Calendar.JANUARY == 0`), years are offset from 1900 in some constructors, and formatting (`SimpleDateFormat`) is itself not thread-safe.

Java 8 introduced `java.time`, heavily inspired by the popular third-party **Joda-Time** library (whose creator, Stephen Colebourne, was a key contributor to the JSR-310 spec that became `java.time`).

### Core classes

| Class | Represents |
|---|---|
| `LocalDate` | A date without time or timezone (`2026-08-27`) |
| `LocalTime` | A time without date or timezone (`14:30:00`) |
| `LocalDateTime` | Date + time, no timezone |
| `ZonedDateTime` | Date + time + timezone |
| `Instant` | A point on the timeline, in UTC (machine-readable timestamp) |
| `Duration` | A time-based amount (hours, minutes, seconds) |
| `Period` | A date-based amount (years, months, days) |
| `DateTimeFormatter` | Thread-safe date/time formatting and parsing |

```java
LocalDate today = LocalDate.now();
LocalDate birthday = LocalDate.of(1995, Month.JULY, 20);

Period age = Period.between(birthday, today);
System.out.println(age.getYears() + " years old");

LocalDateTime meeting = LocalDateTime.of(2026, 9, 1, 14, 30);
LocalDateTime later = meeting.plusHours(2).plusDays(1);

ZonedDateTime nyTime = ZonedDateTime.now(ZoneId.of("America/New_York"));

DateTimeFormatter formatter = DateTimeFormatter.ofPattern("dd-MM-yyyy");
String formatted = today.format(formatter);
```

### Immutability as the core design principle

Every class in `java.time` is **immutable** — every "mutating" method (`plusDays`, `withYear`, etc.) actually returns a **new** instance, leaving the original untouched. This eliminates the entire category of bugs where a shared `Date` object is unexpectedly modified by unrelated code, and makes every `java.time` object automatically thread-safe with no synchronization needed.

```java
LocalDate date = LocalDate.of(2026, 1, 1);
LocalDate nextWeek = date.plusWeeks(1);
// date is STILL 2026-01-01 — plusWeeks() did not mutate it
```

---

## 9. CompletableFuture

`CompletableFuture<T>` (in `java.util.concurrent`) is Java 8's answer to composable, non-blocking asynchronous programming — a major upgrade over the plain `Future` interface introduced in Java 5, which only supported blocking `.get()` with no way to chain follow-up actions or combine multiple futures.

```java
CompletableFuture<String> future = CompletableFuture
        .supplyAsync(() -> fetchUserFromDatabase(userId))
        .thenApply(user -> user.getName())
        .thenApply(String::toUpperCase);

future.thenAccept(System.out::println);

// Combining two independent async operations
CompletableFuture<Order> orderFuture = CompletableFuture.supplyAsync(() -> fetchOrder(orderId));
CompletableFuture<User> userFuture = CompletableFuture.supplyAsync(() -> fetchUser(userId));

CompletableFuture<Receipt> receipt = orderFuture.thenCombine(userFuture, Receipt::new);

// Exception handling
future.exceptionally(ex -> {
    log.error("Failed", ex);
    return "fallback";
});
```

This deserves its own deep dive in the **Executors Framework** notes (already covered), but is worth remembering as a Java 8 headline feature — before it, composing multiple asynchronous operations (e.g., "fetch user, then fetch their orders, then combine with a third independent async call") required manually managing callbacks or blocking `Future.get()` calls, both of which were awkward and error-prone.

---

## 10. Other Notable Java 8 Additions (Briefly)

| Feature | What it does |
|---|---|
| **Nashorn JavaScript engine** | A JVM-based JavaScript engine (replacing the older Rhino), allowing JS execution from Java. (Deprecated in Java 11, removed in Java 15 — later replaced conceptually by GraalVM's polyglot capabilities.) |
| **Repeating annotations** | Allows the same annotation type to be applied multiple times to a single element (`@Schedule(...) @Schedule(...)`), via a `@Repeatable` container annotation. |
| **Type annotations** | Annotations can now target type usages, not just declarations (e.g., `List<@NonNull String>`), enabling deeper static analysis tools like Checker Framework. |
| **Parameter name reflection** | Compiling with `-parameters` preserves actual parameter names in bytecode, retrievable via reflection (`Parameter.getName()`) — useful for frameworks like Spring that bind HTTP request parameters to method arguments by name. |
| **`StringJoiner` / `String.join()`** | Simple utilities for joining strings with delimiters, prefixes, and suffixes without manual `StringBuilder` loops. |
| **`Collectors` utility class** | Rich set of reduction operations for Streams (`toList()`, `groupingBy()`, `joining()`, `summarizingInt()`, etc.) — covered fully in the Streams notes. |
| **Base64 encoding/decoding** | `java.util.Base64` finally added a standard, dependency-free Base64 implementation to the JDK (previously required `sun.misc.BASE64Encoder` or third-party libraries). |
| **Metaspace replacing PermGen** | The JVM's class-metadata storage moved from a fixed-size heap region (`PermGen`, a notorious source of `OutOfMemoryError: PermGen space`) to native memory (`Metaspace`), which grows dynamically by default. |

---

## 11. Real-World Scenarios

### E-commerce — Declarative order filtering with Streams and lambdas
```java
List<Order> highValueOrders = orders.stream()
        .filter(order -> order.getStatus() == OrderStatus.COMPLETED)
        .filter(order -> order.getTotal() > 500)
        .sorted(Comparator.comparing(Order::getTotal).reversed())
        .collect(Collectors.toList());
```
What used to be a nested `for` loop with multiple `if` conditions and a manual sort call is now a single, readable, declarative pipeline — and can be parallelized by simply swapping `.stream()` for `.parallelStream()` if the dataset is large enough to benefit.

### Banking — Safe null handling for optional account fields with `Optional`
```java
public String getNomineeNameOrDefault(Account account) {
    return Optional.ofNullable(account.getNominee())
            .map(Nominee::getName)
            .orElse("No nominee registered");
}
```
This replaces a chain of manual null checks (`if (account.getNominee() != null && account.getNominee().getName() != null) ...`) with a single, self-documenting expression.

### Ride-sharing — Scheduling with the new Date/Time API across timezones
```java
ZonedDateTime pickupTimeSF = ZonedDateTime.of(2026, 9, 1, 9, 0, 0, 0, ZoneId.of("America/Los_Angeles"));
ZonedDateTime pickupTimeUTC = pickupTimeSF.withZoneSameInstant(ZoneOffset.UTC);
// stored in UTC in the database — converted back to local time per-driver/rider for display
```
Correct timezone handling is critical for a ride-sharing platform operating across regions — `java.time`'s explicit `ZonedDateTime`/`Instant` distinction (local wall-clock time vs. an absolute point on the timeline) prevents an entire class of bugs the old `Date`/`Calendar` API made easy to introduce.

### Microservices — Async composition with CompletableFuture
```java
CompletableFuture<PricingInfo> pricing = CompletableFuture.supplyAsync(() -> pricingService.getPricing(itemId));
CompletableFuture<InventoryInfo> inventory = CompletableFuture.supplyAsync(() -> inventoryService.getStock(itemId));

CompletableFuture<ProductDetails> combined = pricing.thenCombine(inventory, ProductDetails::new);
ProductDetails details = combined.join();
```
Two independent downstream microservice calls run **concurrently** rather than sequentially, cutting the overall response latency roughly in half compared to calling them one after another — a very common real pattern in service-aggregation ("backend for frontend") layers.

---

## 12. Comparison: Anonymous Class vs Lambda

| Aspect | Anonymous Inner Class | Lambda Expression |
|---|---|---|
| `this` keyword | Refers to the anonymous class instance | Refers to the **enclosing** instance (lexical scoping) |
| Compiles to | A separate `.class` file at compile time | `invokedynamic`, class generated at runtime on first use |
| Verbosity | High | Low |
| Can implement multi-method interfaces | Yes | No — only functional interfaces (single abstract method) |
| Can have its own instance state/fields | Yes | No — stateless, captures only enclosing variables |

---

## Interview Questions

1. Why does the compiler forbid a lambda from capturing a local variable that isn't effectively final? What specific bug does this restriction prevent?
2. Explain what `invokedynamic` is and why lambdas are implemented using it rather than being desugared into anonymous inner classes at compile time.
3. What is a functional interface, and why does `@FunctionalInterface` exist even though it's not strictly required for a lambda to work?
4. What is the difference between `this` inside a lambda versus `this` inside an anonymous inner class implementing the same interface?
5. Why were default methods added to interfaces in Java 8, and what specific backward-compatibility problem were they designed to solve?
6. If a class implements two interfaces that each declare a conflicting `default` method with the same signature, what happens, and how must the conflict be resolved?
7. Why is `Optional` generally discouraged as a field type or a method parameter type, even though nothing technically prevents you from using it that way?
8. What specific design flaws in the old `java.util.Date`/`Calendar` API did `java.time` set out to fix, and how does immutability address the thread-safety problem specifically?
9. What is the practical difference between `LocalDateTime` and `ZonedDateTime`, and why does mixing them up cause real bugs in systems operating across multiple timezones?
10. How does `CompletableFuture.thenCombine()` differ from calling `.get()` on two separate `Future` objects sequentially, in terms of both code structure and actual runtime behavior?
11. Method references like `String::length` are described as "syntactic sugar" — sugar over what, exactly, at the bytecode level?
12. Why did Java replace PermGen with Metaspace, and what specific category of production issue was PermGen notorious for causing?