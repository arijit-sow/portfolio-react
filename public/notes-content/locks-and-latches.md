# Multithreading — Locks & Latches

> **Topic:** `Lock`, `ReentrantLock`, `ReadWriteLock`, `StampedLock`, `Condition`, `AQS`, `CountDownLatch`, `CyclicBarrier`, `Semaphore`, `Phaser`

---

## Why Go Beyond `synchronized`?

`synchronized` (covered in the Synchronization notes) is simple and effective, but it has real limitations in production systems:

1. **No way to attempt a lock without blocking forever** — a thread calling into a `synchronized` block **must wait indefinitely** until the lock becomes available; there's no built-in way to "try for a bit, then give up and do something else."
2. **No timeout support** — you can't say "wait up to 2 seconds for this lock, then move on."
3. **No interruptibility while waiting** — a thread blocked trying to enter a `synchronized` block **cannot be interrupted** out of that wait; it just sits there until the lock is free.
4. **Strict block-scoped acquisition/release** — a `synchronized` lock **must** be acquired and released within the same block's lexical scope (via entering/exiting the block) — you can't acquire a lock in one method and release it in a completely different one.
5. **Only one condition per monitor** — every object has exactly one implicit wait-set (`wait()`/`notify()`), which becomes limiting when you need to model multiple distinct waiting conditions on the same shared state (e.g., "buffer full" vs "buffer empty" ideally deserve separate wait-queues for efficiency).
6. **No visibility into lock state** — no way to programmatically check if a lock is currently held, or by how many threads are waiting for it.

The `java.util.concurrent.locks` package (Java 5+) introduces the `Lock` interface and its implementations to address every one of these gaps, giving developers **far more explicit, flexible control** over locking — at the cost of needing to manage acquisition/release manually (`synchronized` does this automatically; `Lock` does not).

---

## The `Lock` Interface

```java
public interface Lock {
    void lock();
    void lockInterruptibly() throws InterruptedException;
    boolean tryLock();
    boolean tryLock(long time, TimeUnit unit) throws InterruptedException;
    void unlock();
    Condition newCondition();
}
```

### The Golden Rule: Always Unlock in a `finally` Block
Unlike `synchronized`, a `Lock` is **never automatically released** — if you forget to call `unlock()`, or an exception occurs before you reach it, the lock is held **forever**, permanently starving every other thread that needs it. This makes the following pattern **mandatory**, not optional:

```java
Lock lock = new ReentrantLock();
lock.lock();
try {
    // critical section
} finally {
    lock.unlock();   // MUST be in finally — guarantees release even if an exception is thrown
}
```

---

## `ReentrantLock` — The Core Implementation

### What It Is
`ReentrantLock` is the primary, general-purpose implementation of `Lock`. As the name suggests, it's **reentrant**, just like intrinsic (`synchronized`) locks — a thread already holding the lock can re-acquire it without blocking on itself, and the JVM tracks a **hold count**, only fully releasing the lock once `unlock()` has been called a matching number of times.

```java
class Counter {
    private int count = 0;
    private final ReentrantLock lock = new ReentrantLock();

    void increment() {
        lock.lock();
        try {
            count++;
        } finally {
            lock.unlock();
        }
    }
}
```

### What `ReentrantLock` Offers Beyond `synchronized`

#### 1. `tryLock()` — Non-Blocking Attempt
```java
if (lock.tryLock()) {
    try {
        // got the lock — proceed
    } finally {
        lock.unlock();
    }
} else {
    // couldn't get the lock immediately — do something else instead of blocking
    System.out.println("Lock busy, skipping this round");
}
```
This is **impossible** to express with `synchronized` — you either get the lock (eventually) or your thread is stuck waiting. `tryLock()` enables patterns like "skip this task if the resource is currently busy" rather than piling up blocked threads.

#### 2. `tryLock(timeout, unit)` — Bounded Waiting
```java
if (lock.tryLock(2, TimeUnit.SECONDS)) {
    try {
        // proceed
    } finally {
        lock.unlock();
    }
} else {
    System.out.println("Gave up waiting after 2 seconds");
}
```
Useful for avoiding indefinite blocking in systems with strict latency requirements — e.g., a request-handling thread that shouldn't wait forever for a shared resource.

#### 3. `lockInterruptibly()` — Interruptible Waiting
```java
try {
    lock.lockInterruptibly();
    try {
        // proceed
    } finally {
        lock.unlock();
    }
} catch (InterruptedException e) {
    System.out.println("Interrupted while waiting for the lock — aborting");
}
```
A thread blocked on a regular `lock.lock()` call **ignores interrupts** entirely while waiting. `lockInterruptibly()` allows a waiting thread to be **woken up and abort** if it's interrupted — critical for building **responsive, cancellable** systems (e.g., a task framework where users can cancel a queued operation, even while it's still waiting for a lock).

#### 4. Fairness Policy
```java
Lock fairLock = new ReentrantLock(true);   // fairness enabled
```
By default (`false`), `ReentrantLock` is **unfair** — when the lock becomes free, **any** waiting thread might acquire it next, including one that just arrived, potentially "cutting in line" ahead of threads that have been waiting much longer. This is actually the default because it generally offers **significantly higher throughput** (avoiding the overhead of strict queue management and reducing context-switching).

Passing `true` enables **fair mode** — threads acquire the lock strictly in the **order they requested it** (FIFO), preventing thread starvation, but at a **real, measurable performance cost**, since it requires more bookkeeping and typically means more context switches. Use fairness only when starvation is a genuine, demonstrated concern for your system.

#### 5. Introspection Methods
```java
lock.isLocked();          // is the lock currently held by any thread?
lock.isHeldByCurrentThread();
lock.getHoldCount();      // how many times has the current thread re-entered?
lock.getQueueLength();    // estimate of threads waiting to acquire this lock
```
None of this is possible with `synchronized` — useful for monitoring, debugging, and building adaptive concurrency-control logic.

### `ReentrantLock` vs `synchronized` — Side by Side

| Aspect | `synchronized` | `ReentrantLock` |
|---|---|---|
| Acquisition/release | Automatic (block-scoped) | Manual — **must** unlock in `finally` |
| Blocking behavior | Always blocks indefinitely | Supports `tryLock()`, timed waits |
| Interruptible while waiting? | ❌ No | ✅ Yes, via `lockInterruptibly()` |
| Fairness control | ❌ Not configurable | ✅ Optional fair mode |
| Multiple wait conditions | ❌ One implicit wait-set per object | ✅ Multiple, via `newCondition()` |
| Performance (uncontended case) | Excellent (JVM-optimized, see lock escalation) | Excellent, comparable in modern JVMs |
| Risk of forgetting to release | None (automatic) | Real risk if `finally` is omitted |
| Ease of use / boilerplate | Simple, less error-prone | More verbose, more powerful |

> 💡 **Rule of thumb:** default to `synchronized` for simple cases — it's less error-prone since release is automatic. Reach for `ReentrantLock` specifically when you need one of its extra capabilities: `tryLock`, timeouts, interruptibility, fairness, or multiple `Condition`s.

---

## `Condition` — Replacing `wait()`/`notify()`

### The Limitation It Solves
Recall from the Synchronization notes: every object has exactly **one** implicit wait-set tied to `wait()`/`notify()`. In a producer-consumer buffer, both "buffer full" (producers waiting) and "buffer empty" (consumers waiting) threads pile into the **same** wait-set — calling `notifyAll()` wakes **everyone**, including threads waiting on a condition that hasn't actually changed, wasting CPU cycles on threads that just re-check and go back to sleep.

`Lock.newCondition()` lets you create **multiple, independent condition queues** tied to the same lock — so you can notify **only** the specific group of threads that actually care about what just changed.

```java
class BoundedBuffer {
    private final Queue<Integer> buffer = new LinkedList<>();
    private final int CAPACITY = 5;
    private final ReentrantLock lock = new ReentrantLock();
    private final Condition notFull = lock.newCondition();    // separate condition for producers
    private final Condition notEmpty = lock.newCondition();   // separate condition for consumers

    void produce(int value) throws InterruptedException {
        lock.lock();
        try {
            while (buffer.size() == CAPACITY) {
                notFull.await();          // ONLY producers wait here
            }
            buffer.add(value);
            notEmpty.signal();            // wakes ONLY a waiting consumer, not other producers
        } finally {
            lock.unlock();
        }
    }

    int consume() throws InterruptedException {
        lock.lock();
        try {
            while (buffer.isEmpty()) {
                notEmpty.await();         // ONLY consumers wait here
            }
            int value = buffer.poll();
            notFull.signal();             // wakes ONLY a waiting producer
            return value;
        } finally {
            lock.unlock();
        }
    }
}
```
`await()`/`signal()`/`signalAll()` are the `Condition` equivalents of `wait()`/`notify()`/`notifyAll()`, with the same core rules (must hold the lock, must re-check the condition in a `while` loop due to spurious wakeup risk) — but scoped to a specific condition queue rather than the whole object's monitor.

---

## `ReadWriteLock` / `ReentrantReadWriteLock`

### The Problem It Solves
A plain `ReentrantLock` (or `synchronized`) allows **only one thread at a time**, period — even for two threads that both just want to **read** shared data without modifying it. For **read-heavy** workloads (a very common real-world pattern — data is read far more often than it's written), this is unnecessarily restrictive: multiple readers could safely proceed in parallel, since none of them are mutating anything.

### How It Works
`ReadWriteLock` maintains **two separate locks** that cooperate: a **read lock** and a **write lock**, following these rules:
- **Multiple threads can hold the read lock simultaneously** — readers never block other readers.
- **Only one thread can hold the write lock at a time**, and while it's held, **no readers** can proceed either.
- **Readers and writers are mutually exclusive** — if a writer holds the lock, all readers must wait, and vice versa.

```java
class SharedCache {
    private final Map<String, String> cache = new HashMap<>();
    private final ReadWriteLock rwLock = new ReentrantReadWriteLock();
    private final Lock readLock = rwLock.readLock();
    private final Lock writeLock = rwLock.writeLock();

    String get(String key) {
        readLock.lock();
        try {
            return cache.get(key);    // multiple threads can execute this concurrently
        } finally {
            readLock.unlock();
        }
    }

    void put(String key, String value) {
        writeLock.lock();
        try {
            cache.put(key, value);    // exclusive access — no readers or other writers allowed
        } finally {
            writeLock.unlock();
        }
    }
}
```

### Real-World Industry Example
A **configuration cache** shared across many request-handling threads in a web server — configuration is **read constantly** (on nearly every request) but **updated rarely** (only when an admin changes a setting). `ReentrantReadWriteLock` allows the overwhelming majority of read traffic to proceed in full parallel, only briefly blocking everyone during the rare write.

---

## `StampedLock` — An Even Faster Alternative (Java 8+)

### What It Adds
`StampedLock` improves on `ReentrantReadWriteLock` by introducing a third mode: **optimistic reading** — a lock-free read attempt that doesn't block writers at all, dramatically improving throughput for read-heavy workloads where writes are rare and reads are extremely frequent.

```java
class Point {
    private double x, y;
    private final StampedLock lock = new StampedLock();

    void move(double deltaX, double deltaY) {
        long stamp = lock.writeLock();
        try {
            x += deltaX;
            y += deltaY;
        } finally {
            lock.unlockWrite(stamp);
        }
    }

    double distanceFromOrigin() {
        long stamp = lock.tryOptimisticRead();   // doesn't block ANY writer, just takes a "stamp"
        double currentX = x, currentY = y;
        if (!lock.validate(stamp)) {              // did a writer sneak in while we were reading?
            stamp = lock.readLock();               // fall back to a real, pessimistic read lock
            try {
                currentX = x;
                currentY = y;
            } finally {
                lock.unlockRead(stamp);
            }
        }
        return Math.sqrt(currentX * currentX + currentY * currentY);
    }
}
```
Optimistic reads work by taking a lightweight **stamp**, reading the data **without acquiring any actual lock**, and then **validating** afterward that no writer modified the data during the read — if validation fails, it falls back to a normal blocking read lock. This trades a small chance of "wasted work" (having to retry) for **zero blocking overhead** in the common case. `StampedLock` is **not reentrant**, unlike `ReentrantLock`/`ReentrantReadWriteLock` — re-acquiring it from the same thread can deadlock, so it must be used carefully.

---

## `AbstractQueuedSynchronizer` (AQS) — The Engine Underneath

### Why This Matters
`ReentrantLock`, `ReentrantReadWriteLock`, `CountDownLatch`, and `Semaphore` (all covered below) are **not independently reimplementing** locking logic from scratch — they're all built on top of a single, shared internal framework: **`AbstractQueuedSynchronizer` (AQS)**. Understanding AQS at a high level explains *why* all these tools share similar performance characteristics and behavior patterns.

### The Core Mechanism
AQS maintains a single `volatile int state` field, plus an internal **FIFO queue of waiting threads** (implemented as a doubly linked list of `Node`s — the **CLH lock queue** variant). Different tools interpret `state` differently:
- In `ReentrantLock`, `state` represents the **hold count** (0 = unlocked, 1+ = locked, with reentrancy count).
- In `Semaphore`, `state` represents the **number of available permits**.
- In `CountDownLatch`, `state` represents the **remaining count** to reach zero.

### How Acquisition Works (Conceptually)
1. A thread attempts to change `state` using a **CAS (Compare-And-Swap)** operation — e.g., "set state from 0 to 1" for a lock, or "decrement state by 1" for a semaphore permit.
2. If the CAS **succeeds**, the thread has successfully acquired the resource and proceeds immediately — no blocking, no OS involvement, extremely fast.
3. If the CAS **fails** (another thread got there first, or the resource is unavailable — e.g., `state` is already non-zero for an exclusive lock), the thread is wrapped in a `Node` and appended to the **internal FIFO wait queue**, then effectively parked (via `LockSupport.park()`, which suspends the thread efficiently at the OS level).
4. When the resource is released (`unlock()`, a permit returned, `countDown()` reaching zero), AQS updates `state` and **wakes up (`unpark`s)** the appropriate waiting thread(s) from the front of the queue.

This design is precisely why building `ReentrantLock`, `Semaphore`, and `CountDownLatch` all "feel" similar under the hood, and why they all share strong, predictable performance — they're all thin, purpose-specific wrappers around the same battle-tested, highly optimized queuing and CAS-based state-management engine.

---

## `CountDownLatch` — One-Time Synchronization Barrier

### What It Is
A `CountDownLatch` lets one or more threads **wait until a set of operations being performed by other threads completes**. It's initialized with a fixed count, and **cannot be reset or reused** once it reaches zero — it's a genuinely **one-shot** tool.

```java
CountDownLatch latch = new CountDownLatch(3);   // wait for 3 tasks to finish

for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        doWork();
        latch.countDown();   // decrement the count
    }).start();
}

latch.await();   // main thread blocks here until count reaches 0
System.out.println("All 3 tasks finished — proceeding");
```
Any thread calling `countDown()` decrements the internal count by one (an `unpark`-triggering CAS operation, per the AQS mechanism above); once it hits zero, **every thread** waiting on `await()` is released simultaneously.

### Real-World Industry Example
A **microservice startup sequence** where the main application thread must wait for several independent initialization tasks to complete in parallel — connecting to a database, warming up a cache, establishing a message-queue connection — before the service can start accepting traffic:

```java
CountDownLatch startupLatch = new CountDownLatch(3);
new Thread(() -> { connectToDatabase(); startupLatch.countDown(); }).start();
new Thread(() -> { warmUpCache(); startupLatch.countDown(); }).start();
new Thread(() -> { connectToMessageQueue(); startupLatch.countDown(); }).start();

startupLatch.await();
System.out.println("All systems ready — starting to accept traffic");
```

---

## `CyclicBarrier` — Reusable Rendezvous Point

### What It Is
Similar in spirit to `CountDownLatch`, but with two key differences: `CyclicBarrier` waits for a fixed number of **threads** (not "events") to **each individually arrive** at a common barrier point, and — crucially — it's **reusable/cyclic**: once all threads pass through, the barrier **automatically resets** and can be used again for the next round.

```java
CyclicBarrier barrier = new CyclicBarrier(3, () -> {
    System.out.println("All 3 threads reached the barrier — proceeding together");
});

for (int i = 0; i < 3; i++) {
    new Thread(() -> {
        doPhaseOneWork();
        try {
            barrier.await();   // wait here until all 3 threads arrive
        } catch (Exception e) { /* handle */ }
        doPhaseTwoWork();      // all threads proceed together, only after everyone arrived
    }).start();
}
```
The optional constructor argument (a `Runnable`) runs **once**, automatically, right when the last thread arrives — useful for aggregating/resetting shared state between rounds.

### `CountDownLatch` vs `CyclicBarrier`
| Aspect | `CountDownLatch` | `CyclicBarrier` |
|---|---|---|
| Reusable? | ❌ One-time only | ✅ Automatically resets after each round |
| Who decrements the count? | Any thread, any number of times (`countDown()` can be called by threads unrelated to the waiters) | Only the fixed set of participating threads, by calling `await()` themselves |
| Typical use case | "Wait for N independent events to happen" | "Wait for N threads to all reach a common checkpoint, repeatedly" |

### Real-World Industry Example
A **multi-phase simulation or batch-processing system** (e.g., a parallel data-processing pipeline that runs in synchronized rounds — all worker threads must finish "Phase 1" of processing a data chunk before any of them can begin "Phase 2") uses `CyclicBarrier` to keep every worker thread in lockstep across repeated phases.

---

## `Semaphore` — Controlling Access to a Limited Resource Pool

### What It Is
A `Semaphore` maintains a set number of **permits**. Threads call `acquire()` to take a permit (blocking if none are available) and `release()` to return one — this generalizes mutual exclusion (`ReentrantLock` is essentially a semaphore with exactly **1** permit) to scenarios where **N threads** should be allowed to proceed concurrently, but no more.

```java
Semaphore semaphore = new Semaphore(3);   // only 3 threads allowed to access the resource at once

void accessLimitedResource() {
    try {
        semaphore.acquire();
        try {
            // only up to 3 threads can be inside here simultaneously
            useResource();
        } finally {
            semaphore.release();
        }
    } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
    }
}
```

### Real-World Industry Example
Limiting **concurrent connections to an external API or database connection pool** — e.g., a third-party payment gateway that only allows 10 simultaneous connections from your service; a `Semaphore(10)` ensures your application never exceeds that limit, gracefully making excess requests wait their turn rather than overwhelming or getting rate-limited/rejected by the external system.

```java
Semaphore apiRateLimiter = new Semaphore(10);
// every outgoing call to the external API acquires a permit first, releases it when done
```

---

## `Phaser` — A Flexible, Advanced Barrier (Java 7+)

### What It Is
`Phaser` is a more flexible, dynamic alternative to `CyclicBarrier`, primarily useful when the **number of participating threads can change** across phases (parties can dynamically `register()` and `arriveAndDeregister()`), unlike `CyclicBarrier`'s fixed party count. It's considerably more complex and used far less often in typical application code — mentioned here mainly for completeness, since it's a legitimate, occasionally-asked interview topic, but `CyclicBarrier`/`CountDownLatch` cover the vast majority of real-world synchronization-barrier needs.

---

## Quick Decision Guide

| Requirement | Best Choice |
|---|---|
| Simple mutual exclusion, don't need extra features | `synchronized` |
| Need `tryLock`, timeouts, interruptibility, or fairness | `ReentrantLock` |
| Need multiple independent wait-conditions on one lock | `ReentrantLock` + multiple `Condition`s |
| Read-heavy shared data, occasional writes | `ReentrantReadWriteLock` |
| Extremely read-heavy, want to avoid blocking readers almost entirely | `StampedLock` (optimistic read) |
| Wait for N one-time events/tasks to complete | `CountDownLatch` |
| Repeatedly synchronize a fixed group of threads across phases | `CyclicBarrier` |
| Limit concurrent access to a resource pool to N threads | `Semaphore` |
| Dynamic, variable number of participants across phases | `Phaser` |

---

## Interview Questions

1. What are the concrete limitations of `synchronized` that motivated the creation of the `Lock` interface?
2. Why must `unlock()` always be called inside a `finally` block, and what happens in practice if a developer forgets?
3. What is the difference between `tryLock()` and `tryLock(timeout, unit)`, and when would you choose each?
4. Why can a thread blocked on `synchronized` not be interrupted, while a thread blocked on `lockInterruptibly()` can be?
5. What is the difference between fair and unfair mode in `ReentrantLock`, and why is unfair the default?
6. Why would you use a `Condition` object instead of the intrinsic `wait()`/`notify()` on a shared object?
7. In a producer-consumer scenario, why is having two separate `Condition`s (`notFull`, `notEmpty`) more efficient than one shared wait-set?
8. How does `ReentrantReadWriteLock` allow multiple readers to proceed simultaneously while still guaranteeing exclusive writer access?
9. What is "optimistic reading" in `StampedLock`, and how is `validate()` used to detect if a concurrent write occurred?
10. Why is `StampedLock` not reentrant, and what risk does that introduce compared to `ReentrantLock`?
11. What internal `volatile` field does AQS rely on, and how do different synchronizers (lock, semaphore, latch) interpret it differently?
12. How does AQS avoid the overhead of an OS-level block/wake cycle in the uncontended case?
13. What is the fundamental difference between `CountDownLatch` and `CyclicBarrier` in terms of reusability?
14. In `CountDownLatch`, can a thread that isn't one of the "awaiting" threads call `countDown()`? What does that imply about its flexibility?
15. What happens if you call `await()` on a `CyclicBarrier` and one of the expected threads never arrives?
16. How does a `Semaphore` generalize the concept of a mutual exclusion lock?
17. What's a real-world scenario where you'd use a `Semaphore` instead of a `ReentrantLock`?
18. Why might you choose `Phaser` over `CyclicBarrier` in a specific concurrent design?
19. Between `ReentrantReadWriteLock` and `StampedLock`, which would you choose for an extremely read-heavy, rarely-written shared data structure, and why?
20. If two threads acquire `ReentrantLock`s on two different objects in inconsistent order across different code paths, what classic concurrency problem could result, and how would you prevent it?