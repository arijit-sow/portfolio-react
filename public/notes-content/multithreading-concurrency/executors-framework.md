# Multithreading — Executors Framework

> **Topic:** `Executor`, `ExecutorService`, `ThreadPoolExecutor`, `Future`, `CompletableFuture`

---

## Why Do We Need the Executors Framework?

From the Threading Basics notes, creating a thread manually looks like this:
```java
Thread t = new Thread(() -> doWork());
t.start();
```

This approach has serious problems at production scale:
1. **Thread creation is expensive.** Every `new Thread()` allocates real OS resources (a native thread, its own stack memory — often 512KB–1MB by default). Creating a new thread for **every single task** in a high-throughput system (e.g., a web server handling thousands of requests per second) would exhaust memory and CPU scheduling overhead almost immediately.
2. **No control over the number of concurrent threads.** Nothing stops a naive implementation from spawning **unbounded** threads, one per incoming task — under load, this leads to resource exhaustion and can crash the JVM entirely.
3. **No reuse.** A thread is created, does its one task, and dies — there's no mechanism to **reuse** existing threads for the next task, which is wasteful given how expensive thread creation is.
4. **No lifecycle management.** Manually tracking, joining, and cleanly shutting down a large number of ad-hoc threads is error-prone and hard to reason about.
5. **No structured way to get results back.** A raw `Runnable` has a `void run()` — there's no clean, built-in way to retrieve a **return value** or catch an **exception** from work done on another thread.

The **Executors Framework** (`java.util.concurrent`, Java 5+) solves all of this by introducing the concept of a **thread pool** — a managed, reusable group of worker threads that pulls tasks from a queue and executes them, decoupling **task submission** from **thread management** entirely.

---

## The Core Abstraction: `Executor` → `ExecutorService`

### `Executor` — The Simplest Interface
```java
public interface Executor {
    void execute(Runnable command);
}
```
Just one method — "run this task, somehow, at some point." It intentionally says nothing about *how* (new thread? pooled thread? synchronously?) — that's left entirely to the implementation.

### `ExecutorService` — The Interface You Actually Use
`ExecutorService` extends `Executor` and adds the practical lifecycle and task-submission methods used in real code:

```java
public interface ExecutorService extends Executor {
    <T> Future<T> submit(Callable<T> task);
    Future<?> submit(Runnable task);
    <T> List<Future<T>> invokeAll(Collection<? extends Callable<T>> tasks) throws InterruptedException;
    void shutdown();
    List<Runnable> shutdownNow();
    boolean awaitTermination(long timeout, TimeUnit unit) throws InterruptedException;
    boolean isShutdown();
    boolean isTerminated();
}
```

```java
ExecutorService executor = Executors.newFixedThreadPool(4);
executor.submit(() -> System.out.println("Task running on: " + Thread.currentThread().getName()));
executor.shutdown();
```

---

## `Runnable` vs `Callable` — Getting Results Back

### `Runnable` — No Return Value, No Checked Exceptions
```java
Runnable task = () -> System.out.println("Just runs, returns nothing");
```

### `Callable<V>` — Returns a Value, Can Throw Checked Exceptions
```java
Callable<Integer> task = () -> {
    Thread.sleep(1000);
    return 42;   // can return a value
};
```
`Callable` was introduced **specifically to work with the Executors Framework**, addressing `Runnable`'s two biggest limitations: it can **return a result**, and its single method `call()` is allowed to **throw checked exceptions**, unlike `Runnable.run()`.

---

## `Future` — Representing a Result That Doesn't Exist Yet

### What It Is
When you `submit()` a task to an `ExecutorService`, it returns **immediately** with a `Future<V>` — a **placeholder/handle** representing a result that will become available **at some point in the future**, once the task actually finishes executing on some worker thread.

```java
ExecutorService executor = Executors.newFixedThreadPool(2);
Future<Integer> future = executor.submit(() -> {
    Thread.sleep(2000);
    return 100;
});

System.out.println("Task submitted, doing other work meanwhile...");
Integer result = future.get();   // BLOCKS here until the task completes, then returns 100
System.out.println("Result: " + result);
executor.shutdown();
```

### Key `Future` Methods
```java
future.get();                          // blocks indefinitely until result is ready (or throws)
future.get(2, TimeUnit.SECONDS);       // blocks up to 2 seconds, then throws TimeoutException
future.isDone();                        // has the task finished (successfully, exceptionally, or cancelled)?
future.cancel(true);                    // attempt to cancel; true = interrupt if already running
future.isCancelled();
```

### Exception Handling with `Future`
If the task itself throws an exception, `get()` **re-throws it wrapped** in an `ExecutionException` — the original exception is accessible via `.getCause()`. This is the primary mechanism by which exceptions from a background thread are **not silently swallowed**, unlike a raw `Runnable` running on a manually-created `Thread` (where an uncaught exception just terminates that thread silently, unless you've set an `UncaughtExceptionHandler`).

```java
Future<Integer> future = executor.submit(() -> {
    throw new RuntimeException("Something broke");
});
try {
    future.get();
} catch (ExecutionException e) {
    System.out.println("Task failed: " + e.getCause().getMessage());
}
```

### The Limitation of `Future`
`Future.get()` is **blocking** — there's no clean, built-in way to say "run this callback automatically when the result is ready" or to **chain/combine** multiple asynchronous computations together. This exact gap is what `CompletableFuture` (covered later) was introduced to solve.

---

## `ThreadPoolExecutor` — Internal Working (In Depth)

`ThreadPoolExecutor` is the actual, concrete class powering almost every `ExecutorService` you'll use (including the ones returned by the `Executors` factory methods, under the hood). Understanding its constructor parameters is essential — this is one of the most frequently asked deep-dive topics in Java interviews.

```java
public ThreadPoolExecutor(
    int corePoolSize,
    int maximumPoolSize,
    long keepAliveTime,
    TimeUnit unit,
    BlockingQueue<Runnable> workQueue,
    ThreadFactory threadFactory,
    RejectedExecutionHandler handler
)
```

### The Parameters, Explained

- **`corePoolSize`** — the number of threads to **keep alive at all times**, even if they're idle (unless `allowCoreThreadTimeOut(true)` is explicitly set). These are the pool's "baseline" workers.
- **`maximumPoolSize`** — the **absolute upper limit** on the number of threads the pool will ever create, even under heavy load.
- **`keepAliveTime`** / **`unit`** — how long an **extra** thread (beyond `corePoolSize`) is allowed to sit **idle** before being terminated and reclaimed, to avoid holding onto resources unnecessarily once the load subsides.
- **`workQueue`** — a `BlockingQueue<Runnable>` holding tasks that are waiting for a free thread. The **choice of queue fundamentally changes pool behavior** (detailed below).
- **`threadFactory`** — lets you customize how new threads are created (e.g., custom thread names for easier debugging/logging, setting them as daemon threads, custom priority).
- **`handler`** (`RejectedExecutionHandler`) — what to do when a new task arrives but the pool is **completely saturated** (max threads busy, and the queue is full too).

### The Task Submission Algorithm — Step by Step
This exact sequence is a classic, high-value interview answer:

1. **If fewer than `corePoolSize` threads exist**, create a **new thread** to run the incoming task immediately — even if other core threads are currently idle. (This is a deliberate design choice: eagerly build up to `corePoolSize` first.)
2. **If `corePoolSize` threads already exist**, attempt to **enqueue** the task into the `workQueue`, rather than creating a new thread.
3. **If the queue is full** (rejects the offer — only possible with a **bounded** queue), **and** the current pool size is **below `maximumPoolSize`**, create a **new (non-core) thread** to handle the task immediately.
4. **If the queue is full AND the pool is already at `maximumPoolSize`**, the task is **rejected**, and the configured `RejectedExecutionHandler` is invoked.

```
New task arrives
      │
      ▼
threads < corePoolSize? ──YES──► create new core thread, run task
      │NO
      ▼
queue has room? ──YES──► enqueue task, wait for a free thread
      │NO
      ▼
threads < maximumPoolSize? ──YES──► create new (temporary) thread, run task
      │NO
      ▼
REJECT — invoke RejectedExecutionHandler
```

> ⚠️ **Common misconception:** many developers assume the pool grows toward `maximumPoolSize` **before** the queue fills up. That's **backwards** — the queue is consulted first (step 2), and extra threads (beyond `corePoolSize`) are only created once the queue itself is **full and rejecting**. This has real practical consequences: with an **unbounded** queue (like the default in `Executors.newFixedThreadPool()`), the pool will **never** grow beyond `corePoolSize`, no matter how many tasks pile up — because the queue never actually "fills" — see the discouraged-factory-methods section below.

### Queue Choice — Fundamentally Changes Behavior
| Queue Type | Behavior |
|---|---|
| **Unbounded** (e.g., `LinkedBlockingQueue` with no capacity limit) | Pool **never grows past `corePoolSize`** — tasks just queue up indefinitely instead. Risk: unbounded memory growth under sustained overload, since nothing ever triggers extra-thread creation or rejection. |
| **Bounded** (e.g., `ArrayBlockingQueue`, or `LinkedBlockingQueue` with a fixed capacity) | Pool can grow up to `maximumPoolSize` once the queue fills — gives real backpressure and a genuine ceiling on total resource usage. |
| **`SynchronousQueue`** (effectively zero capacity) | Every task **must** immediately hand off to a waiting thread, or a new thread is created on the spot (up to `maximumPoolSize`) — no queuing at all. This is what powers `Executors.newCachedThreadPool()`. |

### The Four Built-in `RejectedExecutionHandler` Policies
- **`AbortPolicy`** (default) — throws `RejectedExecutionException` immediately.
- **`CallerRunsPolicy`** — the task is executed **synchronously on the calling thread itself**, providing natural backpressure (the submitting thread is temporarily "borrowed" to do the work, slowing down whoever's submitting tasks too fast).
- **`DiscardPolicy`** — silently drops the rejected task, no exception, no execution. Rarely appropriate — usually hides real problems.
- **`DiscardOldestPolicy`** — drops the **oldest** task currently sitting in the queue, then retries submitting the new one.

---

## `Executors` Factory Methods — And Why They're Now Discouraged

`Executors` (the utility class, not `ExecutorService` itself) provides convenient static factory methods — but modern Java guidance (and increasingly, static analysis tools) **recommends against most of them** in production code, in favor of constructing `ThreadPoolExecutor` explicitly.

### `Executors.newFixedThreadPool(n)`
```java
ExecutorService pool = Executors.newFixedThreadPool(4);
// Internally: corePoolSize = maximumPoolSize = 4, unbounded LinkedBlockingQueue
```
**The hidden danger:** because the queue is **unbounded**, if tasks arrive faster than the 4 threads can process them, they simply **queue up forever**, consuming increasing amounts of memory — with no backpressure and no visible error, until the JVM eventually runs out of memory (`OutOfMemoryError`) under sustained, genuine overload.

### `Executors.newCachedThreadPool()`
```java
ExecutorService pool = Executors.newCachedThreadPool();
// Internally: corePoolSize = 0, maximumPoolSize = Integer.MAX_VALUE, SynchronousQueue, 60s keepAlive
```
**The hidden danger:** since `maximumPoolSize` is effectively **unbounded**, a burst of many tasks arriving at once can create an **enormous** number of threads in a very short time — each consuming real OS memory for its stack — potentially exhausting system resources and crashing the application under unexpected load spikes.

### `Executors.newSingleThreadExecutor()`
```java
ExecutorService pool = Executors.newSingleThreadExecutor();
// Internally: corePoolSize = maximumPoolSize = 1, unbounded queue
```
Guarantees tasks execute **sequentially, one at a time, in submission order** — useful when you specifically need serialized execution (e.g., a single writer thread for a log file) — but carries the same unbounded-queue risk as `newFixedThreadPool`.

### `Executors.newScheduledThreadPool(n)`
Covered in the Scheduled Tasks section below — used for delayed/periodic task execution.

### Why These Are Discouraged (Official Guidance)
Since **Java 9's `Executors` Javadoc update**, and reinforced strongly by tools like SonarQube/ErrorProne and Effective Java, the guidance is to **construct `ThreadPoolExecutor` directly**, so you're forced to **explicitly and consciously choose** a bounded queue size and a `maximumPoolSize`, rather than inheriting the hidden unbounded-resource-growth traps baked into the convenience methods.

```java
ExecutorService pool = new ThreadPoolExecutor(
    4,                                   // corePoolSize
    8,                                   // maximumPoolSize
    60L, TimeUnit.SECONDS,               // keepAliveTime
    new ArrayBlockingQueue<>(100),       // BOUNDED queue — explicit backpressure
    new ThreadPoolExecutor.CallerRunsPolicy()   // explicit, deliberate rejection strategy
);
```

---

## Choosing Pool Size — A Practical Formula

The right pool size depends heavily on whether your tasks are **CPU-bound** or **I/O-bound**:

- **CPU-bound tasks** (heavy computation, no waiting) — the optimal thread count is roughly **`Number of CPU cores`** (or `cores + 1`), since more threads than cores just adds context-switching overhead without more actual parallel computation capacity.
  ```java
  int cores = Runtime.getRuntime().availableProcessors();
  ExecutorService pool = Executors.newFixedThreadPool(cores);
  ```
- **I/O-bound tasks** (network calls, database queries, file I/O — lots of **waiting**, little actual CPU use) — you can profitably use **far more threads than cores**, since most threads are blocked waiting rather than actively computing. A commonly cited estimation formula:
  ```
  optimal threads ≈ cores × (1 + waitTime / computeTime)
  ```
  E.g., if a task spends 90% of its time waiting on I/O and only 10% actually computing, you could support roughly `cores × 10` concurrent threads productively.

### Real-World Industry Example
A **web service backend** typically maintains **separate thread pools for different task types** — a small, `cores`-sized pool for CPU-heavy work (e.g., image processing, data transformation), and a much larger pool for I/O-heavy work (e.g., calling downstream APIs, database queries) — isolating them prevents a slow downstream API from starving CPU-bound request-handling capacity, a real production incident pattern often called **thread pool isolation** or the **bulkhead pattern**.

---

## Graceful Shutdown — `shutdown()` vs `shutdownNow()`

```java
executor.shutdown();
// Stops accepting NEW tasks. Already-submitted tasks (queued or running) continue to completion.
```
```java
List<Runnable> notStarted = executor.shutdownNow();
// Attempts to STOP all actively executing tasks (via interrupt() — cooperative, not forced),
// halts processing of queued tasks, and returns the list of tasks that never started.
```

### The Recommended Shutdown Pattern
```java
executor.shutdown();
try {
    if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
        executor.shutdownNow();   // force-attempt cancellation if graceful shutdown times out
        if (!executor.awaitTermination(60, TimeUnit.SECONDS)) {
            System.err.println("Pool did not terminate");
        }
    }
} catch (InterruptedException e) {
    executor.shutdownNow();
    Thread.currentThread().interrupt();
}
```
This is the JDK's own documented best-practice pattern: try a graceful shutdown first, escalate to a forceful one only if it doesn't complete in a reasonable time.

> ⚠️ **Common bug:** forgetting to call `shutdown()` at all — a `ThreadPoolExecutor`'s core threads, by default, **never** die on their own, which means an application that creates an executor and never shuts it down will **never exit cleanly** (the JVM stays alive waiting for these non-daemon threads), a classic resource leak.

---

## `ScheduledExecutorService` — Delayed & Periodic Tasks

```java
ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(2);

scheduler.schedule(() -> System.out.println("Runs once, after a delay"), 5, TimeUnit.SECONDS);

scheduler.scheduleAtFixedRate(
    () -> System.out.println("Runs every 10s, starting after an initial 2s delay"),
    2, 10, TimeUnit.SECONDS
);

scheduler.scheduleWithFixedDelay(
    () -> System.out.println("Next run starts 10s AFTER the previous run finishes"),
    2, 10, TimeUnit.SECONDS
);
```

### `scheduleAtFixedRate` vs `scheduleWithFixedDelay` — The Key Difference
- **`scheduleAtFixedRate`** — attempts to start a new execution every `period`, **measured from the start of the previous execution** — if a task run takes **longer** than the period, the next execution starts **immediately** after the slow one finishes (it doesn't run concurrently, but it also doesn't wait out the rest of the original period).
- **`scheduleWithFixedDelay`** — waits `delay` time **after the previous execution finishes** before starting the next one — the interval between runs is always consistent, regardless of how long each execution takes.

### Real-World Industry Example
A **health-check monitor** that pings a downstream service every 30 seconds (`scheduleAtFixedRate`), or a **retry-with-backoff** mechanism where each retry attempt must wait a fixed cooldown period **after the previous attempt actually completed** (`scheduleWithFixedDelay`) — the choice between the two directly reflects whether "elapsed wall-clock time" or "time since last completion" is the semantically correct interval to model.

---

## `CompletableFuture` — Asynchronous Pipelines (Java 8+)

### What It Solves
Recall `Future`'s core limitation: `get()` blocks, and there's no way to **chain** or **combine** async operations without writing awkward blocking code. `CompletableFuture` (implements both `Future` and `CompletionStage`) solves this by supporting **non-blocking, composable, callback-driven** asynchronous pipelines.

### Basic Usage
```java
CompletableFuture<Integer> future = CompletableFuture.supplyAsync(() -> {
    // runs on the common ForkJoinPool by default (or a custom executor if provided)
    return 10;
});

future.thenApply(result -> result * 2)          // transform the result — returns 20
      .thenAccept(result -> System.out.println("Final: " + result))   // consume it, no return
      .exceptionally(ex -> {                     // handle any exception in the chain
          System.out.println("Failed: " + ex.getMessage());
          return null;
      });
```

### Combining Multiple Async Operations
```java
CompletableFuture<Integer> priceFuture = CompletableFuture.supplyAsync(() -> fetchPrice());
CompletableFuture<Double> taxRateFuture = CompletableFuture.supplyAsync(() -> fetchTaxRate());

CompletableFuture<Double> totalFuture = priceFuture.thenCombine(
    taxRateFuture,
    (price, taxRate) -> price * (1 + taxRate)   // runs once BOTH futures complete
);
```

### Key Methods at a Glance
| Method | Purpose |
|---|---|
| `supplyAsync(Supplier)` | Start an async computation that returns a value |
| `runAsync(Runnable)` | Start an async task with no return value |
| `thenApply(Function)` | Transform the result (like `map`) |
| `thenAccept(Consumer)` | Consume the result, no further chaining value |
| `thenCompose(Function)` | Chain another **async** operation that itself returns a `CompletableFuture` (like `flatMap` — avoids nested futures) |
| `thenCombine(other, BiFunction)` | Combine results of two **independent** futures once both complete |
| `exceptionally(Function)` | Recover from an exception anywhere earlier in the chain |
| `allOf(futures...)` | Wait for **all** given futures to complete |
| `anyOf(futures...)` | Wait for **any one** of the given futures to complete first |

### Real-World Industry Example
An **e-commerce product page** that needs to fetch data from **three independent microservices** — product details, current pricing, and customer reviews — and combine them into a single response, without blocking a thread on each sequential call:

```java
CompletableFuture<Product> productFuture = CompletableFuture.supplyAsync(() -> productService.fetch(id));
CompletableFuture<Price> priceFuture = CompletableFuture.supplyAsync(() -> pricingService.fetch(id));
CompletableFuture<List<Review>> reviewsFuture = CompletableFuture.supplyAsync(() -> reviewService.fetch(id));

CompletableFuture<ProductPageDto> pageFuture = CompletableFuture.allOf(productFuture, priceFuture, reviewsFuture)
    .thenApply(v -> new ProductPageDto(productFuture.join(), priceFuture.join(), reviewsFuture.join()));
```
All three network calls happen **concurrently** rather than one after another, dramatically reducing total response latency — a very common real-world pattern in modern microservice-backed applications.

---

## Quick Decision Guide

| Requirement | Best Choice |
|---|---|
| Simple fixed-size worker pool for general tasks | Explicitly-configured `ThreadPoolExecutor` (not `Executors.newFixedThreadPool`) |
| CPU-bound parallel computation | Pool sized ≈ `availableProcessors()` |
| I/O-bound concurrent calls (DB, network) | Larger pool, sized using the wait-time-ratio formula |
| Need a return value / exception propagation from a task | `Callable` + `Future`, or `CompletableFuture` |
| Need to chain/combine multiple async operations | `CompletableFuture` |
| Recurring/delayed task execution | `ScheduledExecutorService` |
| Consistent gap between runs regardless of duration | `scheduleWithFixedDelay` |
| Consistent start-to-start interval, tolerant of overlap-adjacent runs | `scheduleAtFixedRate` |

---

## Interview Questions

1. Why is creating a new `Thread` for every incoming task considered a bad practice in production systems?
2. What is the actual difference between the `Executor` and `ExecutorService` interfaces?
3. Why was `Callable` introduced when `Runnable` already existed?
4. What does `Future.get()` actually do if the task hasn't completed yet, and how is a task's exception propagated through it?
5. Walk through, step by step, the exact algorithm `ThreadPoolExecutor` follows when a new task is submitted.
6. Why does a `ThreadPoolExecutor` prefer queuing a task over immediately growing the pool toward `maximumPoolSize`?
7. What real-world problem can occur if you use `Executors.newFixedThreadPool()` under sustained heavy load, and why?
8. What real-world problem can occur if you use `Executors.newCachedThreadPool()` under a sudden burst of tasks?
9. Why does modern guidance recommend constructing `ThreadPoolExecutor` directly instead of using the `Executors` factory methods?
10. What are the four built-in `RejectedExecutionHandler` policies, and what does each actually do?
11. What's the difference between `shutdown()` and `shutdownNow()`, and what does `shutdownNow()` actually guarantee (or not guarantee)?
12. What happens to a Java application if you forget to call `shutdown()` on an `ExecutorService` you created?
13. How would you determine an appropriate thread pool size for a CPU-bound workload versus an I/O-bound workload?
14. What is the difference between `scheduleAtFixedRate` and `scheduleWithFixedDelay`, and can you give a real scenario where the distinction actually matters?
15. Why is `CompletableFuture` considered an improvement over a plain `Future`?
16. What is the difference between `thenApply()` and `thenCompose()`, and why does using `thenApply()` where `thenCompose()` is needed lead to nested futures?
17. How does `thenCombine()` differ from chaining two `thenApply()` calls sequentially?
18. What thread pool does `CompletableFuture.supplyAsync()` use by default if you don't provide one, and why might that be a problem in some applications?
19. How would you handle an exception that occurs partway through a `CompletableFuture` chain, without letting it silently propagate?
20. Why is "thread pool isolation" (using separate pools for different task types) considered a good practice in a production backend?