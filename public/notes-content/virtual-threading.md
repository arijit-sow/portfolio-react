# Multithreading — Virtual Threads

> **Topic:** Virtual Threads (Project Loom, Java 21), Platform vs Virtual Threads, Carrier Threads, Pinning

---

## The Problem Virtual Threads Solve

Recall from the Executors Framework notes: every traditional Java thread — now retroactively called a **platform thread** — is a **thin wrapper around an actual OS-level thread**. This has two structural costs baked in:

1. **Expensive to create** — each platform thread reserves a real OS thread stack, typically **512 KB to 1 MB** by default, plus kernel-level bookkeeping. Creating tens of thousands of them is simply not feasible — you'd exhaust memory long before exhausting CPU.
2. **Expensive to block.** In a typical server application, most threads spend the **overwhelming majority of their time waiting** — waiting on a database query, waiting on a downstream HTTP call, waiting on file I/O. But a **blocked platform thread still fully occupies its OS thread and its memory**, doing nothing productive while it waits. This is why the classic "thread-per-request" model — spinning up one thread per incoming request — **doesn't scale** past a few thousand concurrent requests, even though the actual **CPU work** per request might only take milliseconds.

### The Traditional Workaround — And Its Cost
To work around this, high-throughput systems have historically used **asynchronous, non-blocking, callback/reactive-style programming** (e.g., Netty, reactive streams, `CompletableFuture` chains, WebFlux) — a small, fixed pool of threads handles many concurrent operations by **never blocking**, instead registering callbacks and moving on to other work while I/O completes in the background.

This genuinely solves the scalability problem, but at a **real cost to code readability and maintainability**: logic gets fragmented across chained callbacks/lambdas, stack traces become far less useful for debugging, and the entire mental model of "read code top-to-bottom" breaks down — often described as **"what color is your function"** problem, where async code and sync code can't be mixed naturally.

### Virtual Threads' Promise
**Virtual threads** (finalized as a standard feature in **Java 21** via **JEP 444**, the culmination of **Project Loom**) let you write simple, **synchronous-looking, blocking-style code** — exactly like traditional thread-per-request code — while the JVM transparently achieves the **scalability of the async/reactive model** underneath. You get to keep straightforward, debuggable, top-to-bottom code, but can spin up **millions** of concurrent virtual threads without exhausting system resources.

```java
// Looks exactly like traditional blocking code...
try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (int i = 0; i < 100_000; i++) {
        executor.submit(() -> {
            String result = callSlowDownstreamService();   // blocking call — but cheap now!
            System.out.println(result);
        });
    }
}   // ...but scales like async code, under the hood
```
Spawning 100,000 **platform** threads like this would likely crash most systems. Spawning 100,000 **virtual** threads is entirely reasonable.

---

## What Is a Virtual Thread, Really?

A **virtual thread** is an instance of `java.lang.Thread` (it genuinely **is** a `Thread` — same API, same `Thread` class, not a separate concept bolted on) that is **not directly mapped to a dedicated OS thread**. Instead, the JVM manages a large number of virtual threads on top of a **small pool of ordinary platform threads**, called **carrier threads**.

### Platform Thread vs Virtual Thread — Core Distinction

| Aspect | Platform Thread | Virtual Thread |
|---|---|---|
| Mapped to | One dedicated OS thread (1:1) | Many virtual threads share a small pool of OS threads (M:N) |
| Creation cost | Expensive — real OS thread + large stack | Extremely cheap — just a Java object on the heap |
| Default stack size | ~512 KB – 1 MB, fixed at creation | Starts small (a few hundred bytes), grows/shrinks dynamically on the heap |
| Practical max count | Thousands (limited by OS/memory) | Millions |
| Blocking cost | Ties up the underlying OS thread entirely while blocked | The carrier thread is **freed up** to run other virtual threads while this one is blocked |
| Scheduled by | The OS kernel scheduler | The JVM's own scheduler (built on `ForkJoinPool`) |
| Managed by a pool? | Explicitly, via `ExecutorService` (`ThreadPoolExecutor`) | No pooling needed/recommended — create a fresh one per task, they're cheap |

---

## Internal Working — Carrier Threads, Mounting, and Continuations (In Depth)

### The M:N Threading Model
The JVM maintains a **small pool of platform threads** — by default, sized to `Runtime.getRuntime().availableProcessors()` — called **carrier threads**. These carrier threads are the ones that actually get scheduled by the OS and genuinely execute instructions on a CPU core. Virtual threads don't run "on their own" — they run by being temporarily **mounted** onto an available carrier thread.

```
                 Small pool of Carrier Threads (= CPU core count)
                          │              │              │
                    ┌─────┴─────┐  ┌─────┴─────┐  ┌─────┴─────┐
                    │  Carrier 1 │  │  Carrier 2 │  │  Carrier 3 │
                    └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
                          │              │              │
      Thousands of Virtual Threads take turns being MOUNTED onto carriers
      (VT #1042 mounted on Carrier 1 right now; VT #77, #203, #9981... waiting)
```

### Mounting and Unmounting — The Core Mechanism
1. A virtual thread starts executing by being **mounted** onto a free carrier thread — the carrier thread now actively executes the virtual thread's code, just like normal.
2. **The critical moment:** when the virtual thread's code hits a **blocking operation** — e.g., a blocking I/O call, `Thread.sleep()`, blocking on a `synchronized`/`Lock` acquisition, or waiting on a `Future.get()` — instead of the underlying **carrier thread** actually blocking (as it would for a plain platform thread), the JVM **unmounts** the virtual thread from its carrier thread, and the carrier thread becomes **free to mount and run a different virtual thread** in the meantime.
3. When the blocking operation completes (e.g., I/O data arrives), the virtual thread is **re-mounted** onto **some** available carrier thread (not necessarily the same one it started on) and continues executing from **exactly where it left off**.

This unmount/remount mechanism is what makes blocking-style code scale: from the **virtual thread's perspective**, it just made a simple blocking call — but from the **carrier thread's and JVM's perspective**, that "block" was actually a cheap handoff, freeing the real OS thread to go do other useful work rather than sitting idle.

### The Technical Foundation: Continuations
Under the hood, this mount/unmount capability is built on a JVM-internal concept called a **continuation** — essentially, the ability to **capture the exact execution state of a computation** (its stack frames, local variables, the point it paused at) and **resume it later, potentially on a different underlying thread**. This is what allows a virtual thread's "stack" to **live on the Java heap** (as a data structure that can be saved, moved, and restored) rather than requiring a fixed, dedicated OS thread stack, which is precisely why virtual thread stacks can be so cheap and elastic — growing and shrinking dynamically as needed, unlike a platform thread's fixed-size stack reserved upfront.

### The Scheduler
Virtual threads are scheduled using a **`ForkJoinPool`** operating in **FIFO mode** (a specialized configuration distinct from the work-stealing `ForkJoinPool` used for typical fork/join computational tasks) — this pool **is** the set of carrier threads. This is a cooperative, JVM-level scheduler, entirely separate from — and unaware of, in terms of direct OS coordination — the operating system's own thread scheduler, which only ever sees and schedules the small, fixed set of carrier threads.

---

## Creating Virtual Threads

### 1. Directly via `Thread.ofVirtual()`
```java
Thread vt = Thread.ofVirtual().start(() -> {
    System.out.println("Running on: " + Thread.currentThread());
});
vt.join();
```

### 2. Via `Thread.startVirtualThread()` (Convenience Shortcut)
```java
Thread vt = Thread.startVirtualThread(() -> {
    System.out.println("Quick virtual thread");
});
```

### 3. Via `ExecutorService` — The Recommended, Idiomatic Approach
```java
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    Future<String> future = executor.submit(() -> {
        return callDownstreamService();
    });
    System.out.println(future.get());
}   // try-with-resources automatically calls close(), which shuts down and awaits termination
```
This is the **strongly preferred, idiomatic way** to use virtual threads in real applications — it integrates cleanly with the **existing** `ExecutorService`/`Future` API you already know from the Executors Framework notes, meaning **existing code written against `ExecutorService` can often switch to virtual threads with a minimal, localized change** — swapping out the executor implementation, without rewriting business logic.

> 💡 **Key philosophical shift:** with platform threads, you **pool and reuse** threads because creating them is expensive. With virtual threads, this logic **inverts** — since creation is so cheap, you should generally create a **brand-new virtual thread per task**, and **never** try to pool/reuse virtual threads the way you would platform threads. `newVirtualThreadPerTaskExecutor()`'s very name reflects this — one fresh virtual thread per submitted task, always.

---

## Why You Should NOT Pool Virtual Threads

This is a critical, frequently-tested conceptual point. Traditional thread pools exist to solve **two** problems simultaneously: (1) avoid the cost of repeated thread creation, and (2) **limit concurrency** to a safe, bounded number.

- Virtual threads solve problem (1) entirely — creation is nearly free, so there's no benefit to reusing them.
- But problem (2) — **limiting concurrency** — is often **not even desirable** with virtual threads in the first place. If you have 100,000 independent I/O-bound tasks, you generally **want** all 100,000 to proceed concurrently (each cheaply parking while waiting on I/O) rather than being artificially bottlenecked by a small fixed pool size, which was only ever necessary because **platform** threads were expensive.

> If you genuinely need to **cap concurrency** (e.g., to avoid overwhelming a downstream service with too many simultaneous requests, regardless of how cheap your own threads are), the correct tool is **not** a virtual thread pool — it's a `Semaphore` (from the Locks & Latches notes) used explicitly to bound how many virtual threads are allowed to perform the sensitive operation at once.

```java
Semaphore downstreamLimiter = new Semaphore(50);   // never more than 50 concurrent calls to the downstream API

try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
    for (Task task : tasks) {
        executor.submit(() -> {
            downstreamLimiter.acquire();
            try {
                callDownstreamApi(task);
            } finally {
                downstreamLimiter.release();
            }
        });
    }
}
```

---

## Pinning — The Most Important Gotcha

### What Pinning Is
**Pinning** occurs when a virtual thread, despite being blocked, **cannot be unmounted** from its carrier thread — meaning the carrier thread stays **stuck**, unable to run any other virtual thread, for the entire duration of the block. This defeats the entire scalability benefit of virtual threads for that operation, effectively degrading back to platform-thread-like behavior for that blocked span.

### The Two Main Causes of Pinning

#### 1. Blocking Inside a `synchronized` Block/Method
```java
synchronized (lock) {
    someBlockingIoCall();   // ⚠️ PINS the carrier thread for the duration of the blocking call
}
```
As of Java 21/most current versions, when a virtual thread executes a blocking operation **while holding a monitor lock acquired via `synchronized`**, the JVM **cannot safely unmount** it (this is a genuine, documented current limitation, tied to how `synchronized`'s native monitor implementation interacts with the underlying carrier thread) — the carrier thread remains occupied for the full blocking duration.

**The fix:** replace `synchronized` with `java.util.concurrent.locks.ReentrantLock` (from the Locks & Latches notes) for code paths that virtual threads will run through and that also perform blocking calls while holding the lock — `ReentrantLock` does **not** cause pinning, since it's a pure Java-level construct, not tied to the JVM's native monitor mechanism.

```java
private final ReentrantLock lock = new ReentrantLock();
lock.lock();
try {
    someBlockingIoCall();   // ✅ does NOT pin — carrier thread can be freed normally
} finally {
    lock.unlock();
}
```

> Note: `synchronized` blocks that **don't** perform any blocking operation inside them are perfectly fine and don't need to be changed — pinning is only a concern when a genuinely blocking call happens **while the monitor is held**.

#### 2. Native Code / Foreign Function Calls
Executing **native methods** (via JNI) or calling into foreign functions currently also pins the carrier thread, since the JVM has no visibility or control over what a native call is doing internally, or whether/how it might block.

### Why Pinning Matters in Practice
A small number of occasional pinned virtual threads is generally not catastrophic, but **widespread pinning** (e.g., a commonly-used piece of legacy code that wraps every database call in an old-style `synchronized` block) can silently **negate most of the scalability benefit** virtual threads were adopted for — the carrier thread pool (sized to CPU core count, typically small) gets exhausted by pinned threads, and everything else backs up waiting for a free carrier.

You can detect pinning by enabling a JFR (Java Flight Recorder) event (`jdk.VirtualThreadPinned`), or by running with `-Djdk.tracePinnedThreads=full`, which logs a stack trace whenever pinning occurs — a genuinely useful diagnostic tool when migrating an existing codebase to virtual threads.

---

## `ThreadLocal` and Virtual Threads

`ThreadLocal` still **works correctly** with virtual threads (each virtual thread gets its own independent copy, exactly as expected) — but it's **discouraged** as a heavy-use pattern in virtual-thread-heavy code for a practical reason: since you might have **millions** of virtual threads (versus a small, fixed platform-thread pool), and each `ThreadLocal` value consumes some memory, widespread `ThreadLocal` usage that was perfectly reasonable with a small pool of a few hundred platform threads can become a **real memory concern** at virtual-thread scale.

Java 21 introduces **`ScopedValue`** (a preview feature at introduction, evolving in later releases) as a lighter-weight, immutable alternative designed specifically to be more efficient and safer in high-thread-count scenarios — sharing a value down a call chain within a well-defined dynamic scope, without the per-thread mutable-map overhead that `ThreadLocal` carries.

---

## Structured Concurrency (Related, Complementary Feature)

Introduced alongside virtual threads (as an incubating/preview API evolving across recent JDK releases), **structured concurrency** addresses a related problem: when you spawn multiple concurrent subtasks (e.g., several virtual threads to fetch data from different services in parallel), it's easy to end up with **"leaked" threads** — subtasks that outlive the logical operation that spawned them, especially if one subtask fails and you forget to explicitly cancel the others.

```java
try (var scope = new StructuredTaskScope.ShutdownOnFailure()) {
    Supplier<String> user = scope.fork(() -> fetchUser());
    Supplier<String> order = scope.fork(() -> fetchOrder());

    scope.join();            // wait for both subtasks (or a failure)
    scope.throwIfFailed();   // propagate any exception from either subtask

    String result = user.get() + order.get();
}   // scope.close() ensures NO subtask can outlive this block — automatic cleanup, always
```
The core idea: treat a group of related concurrent subtasks as a **single unit of work** with a clear lifetime, so that errors in one subtask automatically cancel the others, and the "parent" block can never exit while orphaned child threads are still running — bringing the same discipline that structured control flow (`if`/`for`/`try`) gives single-threaded code, to concurrent code as well. (This API's exact shape has evolved across JDK preview releases — always check current JDK documentation for the finalized method names in the version you're targeting.)

---

## When to Use Virtual Threads — And When Not To

### Great Fit
- **I/O-bound, high-concurrency workloads** — web servers/backends handling many simultaneous requests that spend most of their time waiting on databases, downstream APIs, or file systems. This is the **primary, intended use case**.
- Simplifying/replacing complex reactive or async-callback code with straightforward, readable, blocking-style code, **without** sacrificing scalability.
- Any "thread-per-task" or "thread-per-request" architecture that was previously constrained by platform-thread costs.

### Poor Fit / No Benefit
- **CPU-bound workloads** (heavy computation, little/no waiting) — virtual threads provide **zero benefit** here, since the bottleneck is genuine CPU work, not blocking/waiting. The number of carrier threads (≈ CPU core count) still caps how much **actual parallel computation** can happen at once, exactly the same as with platform threads. Use a correctly-sized platform-thread pool for CPU-bound work instead.
- Code that spends significant time in `synchronized` blocks around blocking calls, **without** first being refactored to use `ReentrantLock` — pinning will silence most of the benefit.
- Heavy legacy use of native/JNI calls that can't be easily changed.

### Real-World Industry Example
A typical **Spring Boot REST API backend** handling requests that each call a database and one or two downstream microservices: converting the request-handling thread model from a traditional platform-thread pool (limited to a few hundred concurrent requests, tuned carefully to avoid resource exhaustion) to virtual threads (via `Executors.newVirtualThreadPerTaskExecutor()`, which frameworks like Spring 6+/Tomcat can be configured to use as the request-handling executor) allows the **same server hardware** to comfortably handle **orders of magnitude more concurrent requests**, since each request's thread spends most of its lifetime blocked/waiting rather than actually computing — exactly the workload profile virtual threads are built for.

---

## Quick Comparison Summary

| Aspect | Platform Thread | Virtual Thread |
|---|---|---|
| Best for | CPU-bound work, low/moderate concurrency | I/O-bound work, massive concurrency |
| Should you pool them? | ✅ Yes, always | ❌ No — create fresh per task |
| Cost of blocking | High — ties up a real OS thread | Low — carrier thread freed for other work |
| `synchronized` + blocking call | Fine | ⚠️ Causes pinning — prefer `ReentrantLock` |
| Max practical count | Thousands | Millions |
| API | `Thread`, `ExecutorService` (unchanged) | Same `Thread`/`ExecutorService` API — new factory methods |

---

## Interview Questions

1. What fundamental limitation of platform threads motivated the creation of virtual threads?
2. What is the M:N threading model, and how does it differ from the traditional 1:1 platform-thread-to-OS-thread mapping?
3. What is a carrier thread, and how many are typically active in a JVM using virtual threads?
4. What does it mean for a virtual thread to be "mounted" and "unmounted," and what specifically triggers an unmount?
5. What is a continuation, and how does it enable a virtual thread's stack to live on the heap instead of requiring a fixed-size OS thread stack?
6. What scheduler is actually responsible for running virtual threads, and how is it different from the OS's thread scheduler?
7. Why is it considered an anti-pattern to pool/reuse virtual threads, unlike platform threads?
8. If you need to limit the concurrency of a virtual-thread-based operation (e.g., to protect a downstream service), what should you use instead of a bounded thread pool?
9. What is pinning, and why does it defeat the scalability benefit of virtual threads?
10. Why does using `synchronized` around a blocking call cause pinning, while `ReentrantLock` does not?
11. How would you detect pinning occurring in a running application?
12. Why is `ThreadLocal` discouraged (though still functionally correct) in heavily virtual-thread-based code?
13. What is `ScopedValue`, and how does it address the concern that makes `ThreadLocal` less ideal at virtual-thread scale?
14. Why do virtual threads provide no meaningful benefit for CPU-bound workloads?
15. What problem does structured concurrency solve that plain virtual threads + `ExecutorService` alone do not?
16. If you migrate an existing `ExecutorService`-based codebase to use virtual threads, what is the most likely category of bug you'd need to watch for?
17. Why can a JVM support millions of virtual threads but only thousands of platform threads, in terms of underlying resource cost?
18. Is `Thread.currentThread().isVirtual()` a real, meaningful check — what would you use it for in practice?
19. Does a virtual thread always resume on the same carrier thread it was originally mounted on after being unmounted? What does your answer imply about relying on carrier-thread identity in application code?
20. Why is `Executors.newVirtualThreadPerTaskExecutor()` designed to not have a configurable max pool size, unlike `ThreadPoolExecutor`?