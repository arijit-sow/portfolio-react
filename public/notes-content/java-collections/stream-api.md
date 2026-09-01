# Java Stream API

> **Topic:** `java.util.stream` — Functional-Style Data Processing

---

## Why Do We Need the Stream API?

### Life Before Streams (Imperative Style)
Before Java 8, processing a collection meant writing explicit, manual **imperative** loops — you had to describe **exactly how** to iterate, filter, transform, and accumulate results, step by step.

```java
List<Employee> employees = getEmployees();
List<String> highEarnerNames = new ArrayList<>();

for (Employee e : employees) {
    if (e.getSalary() > 80000) {
        highEarnerNames.add(e.getName().toUpperCase());
    }
}
Collections.sort(highEarnerNames);
```

This works, but has real drawbacks at scale:
1. **Verbose boilerplate** — the actual *intent* ("give me the uppercase names of high earners, sorted") is buried inside loop mechanics, a temporary mutable list, and manual condition checks.
2. **Mutable intermediate state** — `highEarnerNames` is a mutable accumulator that every iteration touches, which is exactly the kind of shared mutable state that becomes dangerous the moment you try to parallelize it across threads.
3. **Hard to parallelize** — turning this loop into multi-threaded code safely would require manually introducing synchronization, thread pools, and result-merging logic — a significant, error-prone rewrite.
4. **Not declarative** — the code describes *how* to do the work, not *what* result is wanted, making intent harder to read at a glance, especially as pipelines get more complex (multiple filters, transformations, groupings).

### The Solution: The Stream API (Java 8+)
The **Stream API** lets you express data-processing pipelines **declaratively** — you describe **what** transformation you want (filter, map, sort, collect), and the API handles the **how** (iteration mechanics) internally.

```java
List<String> highEarnerNames = employees.stream()
        .filter(e -> e.getSalary() > 80000)
        .map(e -> e.getName().toUpperCase())
        .sorted()
        .collect(Collectors.toList());
```

### Why This Matters — The Core Motivation
1. **Readability & expressiveness** — the pipeline reads almost like a sentence describing the intent: "filter high earners, map to uppercase names, sort, collect into a list."
2. **No mutable intermediate state** — each stage produces a **new** stream; nothing is mutated in place, which aligns naturally with functional programming principles and eliminates a whole class of concurrency bugs.
3. **Effortless parallelism** — the exact same pipeline can run in parallel by simply calling `.parallelStream()` instead of `.stream()` — the complex work of splitting data and merging results across threads is handled internally, without you writing any thread-management code yourself.
4. **Composability** — operations chain together fluently, and the same small set of building-block operations (`filter`, `map`, `reduce`, etc.) recombine to express a huge variety of data-processing tasks, rather than needing a bespoke loop written from scratch every time.
5. **Built on functional interfaces & lambdas** — Streams are the primary real-world showcase of Java 8's lambda expressions and functional interfaces (`Predicate`, `Function`, `Consumer`, `Supplier`), making the whole feature set (lambdas + streams + `Optional`) work together as a cohesive, modern programming style.

---

## What a Stream Actually Is (And Isn't)

> A **Stream is not a data structure.** It doesn't store elements at all — it's a **pipeline of computations** that pulls elements from a **source** (a collection, an array, a generator function, an I/O channel) and processes them **on demand**, one at a time, only when a terminal operation actually requests results.

Key characteristics:
- **Not reusable** — once a stream has been consumed by a terminal operation, it's **done**; attempting to reuse it throws `IllegalStateException`.
- **Doesn't modify the source** — `filter()`/`map()` never mutate the original collection; they produce a **new stream** representing the transformed sequence.
- **Lazy** — intermediate operations don't actually run any code until a terminal operation is invoked (explored in depth below).
- **Can be infinite** — since elements are pulled on demand, streams can represent conceptually infinite sequences (e.g., `Stream.iterate()`), as long as a terminal operation eventually limits how much gets consumed.

```java
List<String> names = List.of("Riya", "Aman");
Stream<String> stream = names.stream();
stream.forEach(System.out::println);
stream.forEach(System.out::println);   // ❌ IllegalStateException — stream already consumed
```

---

## The Three-Part Anatomy of Every Stream Pipeline

```
   SOURCE            INTERMEDIATE OPERATIONS (0 or more)          TERMINAL OPERATION (exactly 1)
      │                          │                                         │
      ▼                          ▼                                         ▼
list.stream()  →  .filter(...)  →  .map(...)  →  .sorted(...)  →  .collect(...)
                  (lazy, returns a Stream)                       (eager, triggers execution, produces a result)
```

1. **Source** — where elements come from: `collection.stream()`, `Arrays.stream(array)`, `Stream.of(...)`, `Stream.generate(...)`, `Stream.iterate(...)`, `IntStream.range(...)`.
2. **Intermediate Operations** — transform one stream into another stream; **lazy** (don't execute immediately); can be chained any number of times: `filter()`, `map()`, `sorted()`, `distinct()`, `limit()`, `skip()`, `peek()`, `flatMap()`.
3. **Terminal Operation** — triggers actual processing and produces a final, non-stream result (a value, a collection, a side effect, or nothing/`void`): `collect()`, `forEach()`, `reduce()`, `count()`, `anyMatch()`, `findFirst()`, `toArray()`. A stream pipeline is **inert** until exactly one terminal operation is called — without one, nothing happens at all.

---

## Laziness — In Depth (An Important Interview Topic)

### What Laziness Actually Means
Intermediate operations don't process the **entire** collection stage-by-stage the way you might intuitively expect from imperative code. Instead, the JVM builds an internal pipeline of operations, and when the terminal operation runs, it pulls elements **one at a time** from the source, pushing each single element through the **entire chain** of intermediate operations before moving on to the next element — this is called **vertical (element-by-element) execution**, as opposed to **horizontal (stage-by-stage) execution**.

```java
List<String> names = List.of("Riya", "Aman", "Neha", "Karan");

Optional<String> result = names.stream()
        .filter(n -> {
            System.out.println("filtering: " + n);
            return n.length() == 4;
        })
        .map(n -> {
            System.out.println("mapping: " + n);
            return n.toUpperCase();
        })
        .findFirst();

// Output:
// filtering: Riya
// mapping: Riya      ← "Aman", "Neha", "Karan" are NEVER EVEN TOUCHED!
```
Because `findFirst()` only needs **one** matching result, the pipeline **short-circuits** the instant it finds one — it never even calls `filter()` or `map()` on the remaining elements. This is only possible **because** of laziness: if `filter()` eagerly processed the entire list first (producing a complete intermediate list), then `map()` processed *that* entire list, there would be no way to "stop early" once a satisfying result was found.

### Why Laziness Matters
1. **Performance** — avoids unnecessary work, especially valuable with short-circuiting terminal operations (`findFirst()`, `anyMatch()`, `limit()`).
2. **Enables infinite streams** — `Stream.iterate(1, n -> n + 1)` represents an infinite sequence; this is only usable at all because nothing is actually computed until you `limit()` it and pull a terminal result — an eager implementation would hang forever trying to process "all" elements upfront.
```java
Stream.iterate(1, n -> n + 1)
      .filter(n -> n % 2 == 0)
      .limit(5)
      .forEach(System.out::println);   // 2, 4, 6, 8, 10 — works fine, despite an infinite source
```
3. **Single-pass efficiency** — the source collection is only ever traversed **once**, regardless of how many intermediate operations are chained, since everything happens per-element in a single combined pass, rather than one pass per operation.

---

## Common Intermediate Operations

```java
List<String> names = List.of("Riya", "Aman", "Neha", "Riya", "Karan");
```

### `filter(Predicate<T>)`
Keeps only elements matching a condition.
```java
names.stream().filter(n -> n.length() == 4).forEach(System.out::println);   // Riya, Neha, Riya
```

### `map(Function<T,R>)`
Transforms each element into another form (a 1-to-1 transformation).
```java
names.stream().map(String::toUpperCase).forEach(System.out::println);
```

### `flatMap(Function<T, Stream<R>>)`
Transforms each element into a **stream**, then **flattens** all those resulting streams into a single, combined stream — essential for handling **nested structures**.
```java
List<List<String>> nested = List.of(List.of("A", "B"), List.of("C", "D"));

// map() alone would give you a Stream<List<String>> — still nested!
List<String> flat = nested.stream()
        .flatMap(List::stream)   // flattens each inner List<String> into the outer stream
        .collect(Collectors.toList());
// [A, B, C, D]
```

### `sorted()` / `sorted(Comparator)`
```java
names.stream().sorted().forEach(System.out::println);                       // natural order
names.stream().sorted(Comparator.reverseOrder()).forEach(System.out::println);
```

### `distinct()`
Removes duplicates, using `equals()` to determine uniqueness.
```java
names.stream().distinct().forEach(System.out::println);   // Riya, Aman, Neha, Karan
```

### `limit(n)` / `skip(n)`
```java
names.stream().limit(2).forEach(System.out::println);   // first 2
names.stream().skip(2).forEach(System.out::println);    // all except first 2
```

### `peek(Consumer)`
Performs a side-effect action on each element **without** altering the stream — mainly intended for **debugging** pipelines, not for actual business logic (relying on `peek()` for real side effects is considered poor practice, since its execution isn't guaranteed if the stream is short-circuited).
```java
names.stream()
     .peek(n -> System.out.println("Before filter: " + n))
     .filter(n -> n.length() == 4)
     .forEach(System.out::println);
```

---

## Common Terminal Operations

### `collect(Collector)`
The most versatile terminal operation — gathers stream elements into a collection or other summary result. Covered in depth below (Collectors section).

### `forEach(Consumer)`
Performs an action on each element; returns `void`. Note: **iteration order is not guaranteed** for parallel streams, or for unordered sources.

### `reduce()`
Combines all elements into a **single** result, by repeatedly applying a combining function.
```java
List<Integer> numbers = List.of(1, 2, 3, 4, 5);

Optional<Integer> sum = numbers.stream().reduce((a, b) -> a + b);   // Optional[15]
int sumWithIdentity = numbers.stream().reduce(0, (a, b) -> a + b);   // 15, no Optional needed
int product = numbers.stream().reduce(1, (a, b) -> a * b);           // 120
```
The **identity** value (the second form's first argument) is both the starting accumulator value **and** the result returned if the stream is empty — this is why supplying an identity avoids the `Optional` wrapper: there's always a guaranteed, sensible fallback result.

### `count()`
```java
long total = names.stream().distinct().count();   // 4
```

### `anyMatch()` / `allMatch()` / `noneMatch()` — Short-Circuiting
```java
boolean hasLongName = names.stream().anyMatch(n -> n.length() > 4);   // stops at FIRST match found
boolean allShort = names.stream().allMatch(n -> n.length() <= 5);      // stops at FIRST failure found
boolean noneEmpty = names.stream().noneMatch(String::isEmpty);
```

### `findFirst()` / `findAny()`
```java
Optional<String> first = names.stream().filter(n -> n.startsWith("K")).findFirst();
```
`findAny()` is similar but, notably, in a **parallel** stream, it may return **whichever** matching element is found first by **any** thread (not necessarily the first in encounter order) — making it potentially faster than `findFirst()` in parallel contexts, at the cost of losing a strict ordering guarantee.

### `toArray()`
```java
String[] arr = names.stream().toArray(String[]::new);
```

---

## `Collectors` — The Workhorse of `collect()`

```java
List<Employee> employees = getEmployees();
```

### Basic Collection
```java
List<String> nameList = employees.stream().map(Employee::getName).collect(Collectors.toList());
Set<String> nameSet = employees.stream().map(Employee::getName).collect(Collectors.toSet());
```

### `joining()` — Building a String
```java
String allNames = employees.stream()
        .map(Employee::getName)
        .collect(Collectors.joining(", ", "[", "]"));
// "[Riya, Aman, Neha]"
```

### `groupingBy()` — The Most Powerful Collector
Groups elements by a **classification function**, producing a `Map<K, List<T>>` by default.
```java
Map<String, List<Employee>> byDepartment = employees.stream()
        .collect(Collectors.groupingBy(Employee::getDepartment));
// {"Engineering": [emp1, emp3], "Sales": [emp2]}
```

**Downstream collectors** — combined with a second collector to further process each group:
```java
Map<String, Long> countByDept = employees.stream()
        .collect(Collectors.groupingBy(Employee::getDepartment, Collectors.counting()));

Map<String, Double> avgSalaryByDept = employees.stream()
        .collect(Collectors.groupingBy(Employee::getDepartment, Collectors.averagingDouble(Employee::getSalary)));

Map<String, List<String>> namesByDept = employees.stream()
        .collect(Collectors.groupingBy(Employee::getDepartment,
                 Collectors.mapping(Employee::getName, Collectors.toList())));
```

### `partitioningBy()` — Splitting Into Exactly Two Groups
Splits elements into a `Map<Boolean, List<T>>` based on a predicate — essentially a specialized `groupingBy()` for boolean conditions, guaranteed to always produce exactly two keys (`true`/`false`), even if one group is empty.
```java
Map<Boolean, List<Employee>> partitioned = employees.stream()
        .collect(Collectors.partitioningBy(e -> e.getSalary() > 80000));
List<Employee> highEarners = partitioned.get(true);
```

### `toMap()`
```java
Map<String, Double> nameToSalary = employees.stream()
        .collect(Collectors.toMap(Employee::getName, Employee::getSalary));
```
⚠️ Throws `IllegalStateException` if **duplicate keys** are encountered — you must supply a **merge function** as a third argument to resolve collisions if duplicates are possible:
```java
Collectors.toMap(Employee::getDepartment, Employee::getName, (existing, replacement) -> existing + ", " + replacement)
```

### Summary Statistics
```java
DoubleSummaryStatistics stats = employees.stream()
        .collect(Collectors.summarizingDouble(Employee::getSalary));
stats.getAverage(); stats.getMax(); stats.getMin(); stats.getSum(); stats.getCount();
```

---

## Primitive Streams — `IntStream`, `LongStream`, `DoubleStream`

### Why They Exist
A `Stream<Integer>` stores each element as a **boxed** `Integer` object — every single value incurs **autoboxing overhead** (a real object allocation on the heap for what could otherwise be a raw `int`). For numeric-heavy processing, this adds up to genuinely significant, avoidable performance overhead. The primitive stream specializations (`IntStream`, `LongStream`, `DoubleStream`) work directly with **unboxed primitives**, avoiding this cost entirely, and also provide numeric-specific terminal operations that wouldn't make sense on a generic `Stream<T>`.

```java
int sum = IntStream.rangeClosed(1, 100).sum();          // built-in, avoids manual reduce()
OptionalDouble avg = IntStream.of(4, 8, 15, 16).average();
IntSummaryStatistics stats = IntStream.of(4, 8, 15, 16).summaryStatistics();
```

### Converting Between `Stream<T>` and Primitive Streams
```java
List<Employee> employees = getEmployees();

// Stream<Employee> → IntStream (via mapToInt), avoiding boxed Integers
int totalSalary = employees.stream()
        .mapToInt(e -> (int) e.getSalary())
        .sum();

// IntStream → Stream<Integer> (via boxed()), when you need a generic Stream API
List<Integer> boxedList = IntStream.range(0, 5).boxed().collect(Collectors.toList());
```

---

## Sequential vs Parallel Streams

```java
list.stream()          // sequential — single thread processes elements in order
list.parallelStream()  // parallel — work is split across multiple threads
```

### How Parallel Streams Work Internally
Parallel streams are built on the **Fork/Join framework** (`ForkJoinPool.commonPool()` by default) — the source is recursively **split** into smaller chunks (using the source's `Spliterator`, which knows how to divide that particular data structure efficiently), each chunk is processed **independently and concurrently** on separate threads, and the partial results are then **combined/merged** back together.

### When Parallel Streams Actually Help
- Genuinely **large** datasets (parallelism overhead — thread coordination, splitting, merging — only pays off once there's enough actual work to justify it; for small collections, sequential is often **faster** due to this overhead).
- **CPU-intensive** per-element operations (heavy computation per element benefits from spreading across cores).
- A data source that **splits efficiently** — `ArrayList`/arrays split very well (contiguous, indexable); `LinkedList` splits poorly (must traverse to find split points), limiting parallel speedup.

### The Gotchas of Parallel Streams
1. **Shared mutable state is dangerous** — using `forEach()` with a parallel stream to mutate an external, non-thread-safe collection (e.g., a plain `ArrayList`) from multiple threads leads to race conditions and corrupted data, exactly the class of bug the whole Concurrent Collections/Synchronization sections exist to address.
```java
List<String> results = new ArrayList<>();
names.parallelStream().forEach(results::add);   // ❌ RACE CONDITION — ArrayList isn't thread-safe
```
2. **Order is not guaranteed** unless you explicitly use `forEachOrdered()` instead of `forEach()` — parallel execution processes elements out of encounter order by design.
3. **Not always faster** — for small datasets, or poorly-splitting sources, or I/O-bound work (not CPU-bound), the overhead of managing parallelism can make `.parallelStream()` **slower** than plain `.stream()`. It should be measured, not assumed.
4. **Shares the common `ForkJoinPool`** — by default, *all* parallel streams application-wide share one JVM-global pool, so blocking or long-running operations inside a parallel stream (e.g., an I/O call) can starve **other, unrelated** parallel stream operations happening elsewhere in the same application at the same time — a subtle, real production gotcha.

### Real-World Industry Example
An **analytics batch job** that processes millions of transaction records overnight to compute aggregated summaries (total revenue per region, average order value) is a strong parallel-stream candidate — large dataset, CPU-bound aggregation work, and an `ArrayList`-backed source that splits efficiently:
```java
Map<String, Double> revenueByRegion = transactions.parallelStream()
        .collect(Collectors.groupingBy(Transaction::getRegion,
                 Collectors.summingDouble(Transaction::getAmount)));
```
By contrast, a typical **web request handler** processing a small list of a dozen items from a single HTTP request should almost always stick with `.stream()` — the dataset is far too small for parallelism overhead to ever pay off, and it needlessly consumes threads from the shared `ForkJoinPool`.

---

## `Optional` — Streams' Companion for Avoiding `null`

Many terminal operations (`findFirst()`, `reduce()` without identity, `min()`, `max()`) return `Optional<T>` instead of a potentially-`null` value, forcing the caller to **explicitly handle the "no result" case** rather than risking a silent `NullPointerException` later.

```java
Optional<Employee> highestPaid = employees.stream()
        .max(Comparator.comparingDouble(Employee::getSalary));

highestPaid.ifPresent(e -> System.out.println("Top earner: " + e.getName()));
String name = highestPaid.map(Employee::getName).orElse("No employees found");
```

---

## Common Mistakes & Gotchas

- ❌ Reusing a consumed stream — throws `IllegalStateException`; a new stream must be created from the source for each pipeline run.
- ❌ Using `map()` where `flatMap()` is needed — leaves a nested `Stream<Stream<T>>`/`Stream<List<T>>` instead of a properly flattened result.
- ❌ Relying on `peek()` for actual business logic side-effects — its execution can be skipped entirely if the pipeline short-circuits.
- ❌ Mutating shared external state inside `parallelStream().forEach()` — a classic, hard-to-debug race condition.
- ❌ Assuming `.parallelStream()` is always faster — genuinely needs to be measured for the specific dataset size and operation.
- ❌ Overusing streams for simple logic where a plain for-loop would be clearer — streams aren't always more readable, especially for beginners on a team, or for operations with complex, stateful logic that doesn't map cleanly to filter/map/reduce.
- ❌ Forgetting `Collectors.toMap()` throws on duplicate keys — always supply a merge function when duplicates are plausible.

---

## Interview Questions

1. What is the fundamental difference between a Stream and a Collection?
2. Why can a stream only be consumed once, and what exception is thrown if you try to reuse one?
3. What is the difference between an intermediate and a terminal operation, and why does a pipeline do nothing at all without a terminal operation?
4. What does it mean for stream operations to be "lazy," and how does this enable short-circuiting with operations like `findFirst()`?
5. Explain vertical (element-by-element) execution versus horizontal (stage-by-stage) execution in a stream pipeline, and why laziness makes this possible.
6. Why is `Stream.iterate(1, n -> n + 1)` usable at all, despite representing an infinite sequence?
7. What is the difference between `map()` and `flatMap()`, and when would using `map()` leave you with an awkwardly nested structure?
8. Why does `Collectors.toMap()` throw an exception on duplicate keys, and how do you resolve that?
9. What is the difference between `groupingBy()` and `partitioningBy()`, and why does `partitioningBy()` always produce exactly two groups?
10. Why do primitive streams (`IntStream`, `LongStream`, `DoubleStream`) exist, given that `Stream<Integer>` already works?
11. What is autoboxing overhead, and how does `IntStream` avoid it compared to `Stream<Integer>`?
12. How does a parallel stream actually split and process work internally?
13. Why might a parallel stream be slower than a sequential stream for a small dataset?
14. Why is using `parallelStream().forEach(list::add)` on a plain `ArrayList` dangerous?
15. What is the difference between `forEach()` and `forEachOrdered()` on a parallel stream?
16. Why do all parallel streams in a JVM application share the same `ForkJoinPool` by default, and what production problem can this cause?
17. Why does `reduce()` with an identity value return a plain value, while `reduce()` without one returns an `Optional`?
18. What is the difference between `findFirst()` and `findAny()`, and in what context might `findAny()` actually be preferable?
19. Why is relying on `peek()` for real application side effects considered bad practice?
20. Why does a data source's ability to split efficiently (e.g., `ArrayList` vs `LinkedList`) matter specifically for parallel stream performance?