# Multithreading — Synchronization

> **Topic:** `synchronized`, Intrinsic Locks, `volatile`, `wait()`/`notify()`, Deadlock

---

## Recap: Why Synchronization Is Needed

As introduced in the Threading Basics notes, a **race condition** occurs when multiple threads access and modify **shared mutable state** concurrently, and the final outcome depends on unpredictable timing.

```java
class Counter {
    private int count = 0;
    public void increment() { count++; }
}
```

`count++` looks like a single operation, but the JVM actually breaks it into **three distinct steps** :
1. **Read** the current value of `count` from memory.
2. **Increment** that value by 1 (in a CPU register).
3. **Write** the new value back to memory.

If Thread A and Thread B both read `count = 5` before either writes back, both compute `6` and both write `6` — one increment is **silently lost**, and the final value is `6` instead of the correct `7`. This is a **critical section problem**: `count++` is a **critical section** — a piece of code that accesses shared, mutable state and must not be executed by more than one thread at the same time to guarantee correctness.

**Synchronization** is the general term for the set of mechanisms Java provides to control access to critical sections, ensuring **mutual exclusion** (only one thread in the critical section at a time) and **visibility** (changes made by one thread are correctly seen by others).

----

## The `synchronized` Keyword

`synchronized` is Java's built-in, language-level mechanism for enforcing mutual exclusion around a critical section, using a concept called an **intrinsic lock** (also called a **monitor lock**).

### The Core Rule
> **Every object in Java has an associated intrinsic lock.** A thread must **acquire** that lock before entering a `synchronized` block/method associated with that object, and it **automatically releases** the lock when it exits — whether normally or via an exception. Only **one thread** can hold a given object's lock at any time; any other thread attempting to acquire the same lock is forced to **wait** (enters the `BLOCKED` state) until it becomes available.

### 1. Synchronized Instance Method
```java
class Counter {
    private int count = 0;
    public synchronized void increment() {   // lock acquired on 'this'
        count++;
    }
}
```
Locks on **`this`** — the specific object instance the method is called on. If two threads call `increment()` on the **same** `Counter` object, they're forced to take turns. But if they call it on **two different** `Counter` instances, there's no contention at all — each instance has its own independent lock.

### 2. Synchronized Static Method
```java
class Counter {
    private static int globalCount = 0;
    public static synchronized void incrementGlobal() {   // lock acquired on Counter.class
        globalCount++;
    }
}
```
Locks on the **`Class` object** itself (`Counter.class`), **not** on any instance. This means synchronized static methods across **all instances** of the class share the **same single lock** — even if called from a hundred different `Counter` objects, only one thread can be inside any synchronized static method of `Counter` at a time.

> ⚠️ **Critical gotcha:** a synchronized instance method and a synchronized static method of the same class use **completely different locks** (`this` vs `Counter.class`). A thread inside one does **not** block a thread trying to enter the other — they don't provide mutual exclusion against each other at all.

### 3. Synchronized Block (Finer-Grained Control)
```java
class BankAccount {
    private double balance;
    private final Object lock = new Object();   // dedicated lock object

    void withdraw(double amount) {
        // ... some non-critical setup work, no lock needed here ...
        synchronized (lock) {
            if (balance >= amount) {
                balance -= amount;
            }
        }
        // ... more non-critical work ...
    }
}
```
A synchronized block lets you lock on **any object you choose**, and — critically — lets you keep the **synchronized region as small as possible**, locking only the genuinely shared, mutable part of the method rather than the entire method body. This is a widely followed best practice: **smaller critical sections mean less contention and better throughput**, since threads spend less time waiting.

Using a **dedicated private `lock` object** (rather than `this`) is also a deliberate best practice — it prevents **external code** from accidentally (or maliciously) synchronizing on your object's monitor from outside the class (e.g., `synchronized(myBankAccount) { ... }` called by unrelated code), which could cause unexpected contention or even deadlocks that have nothing to do with your class's actual internal logic.

---

## Intrinsic Locks / Monitors — Internal Working (In Depth)

### What "Every Object Has a Monitor" Actually Means
Every Java object has an associated **monitor** — a conceptual construct (rooted in Hoare's/Brinch Hansen's classic Monitor concept from concurrent programming theory) that combines a **lock** with the ability for threads to **wait** for conditions and be **notified**. In the JVM, information about an object's lock state is stored in the object's **header** (specifically, in a portion called the **mark word**).

### Lock States — HotSpot JVM's Lock Escalation (Performance Optimization)
Modern JVMs (like HotSpot) don't naively use a heavyweight OS-level mutex for every single `synchronized` block — that would be extremely wasteful, since the **overwhelming majority of locks in real programs are never actually contended** by multiple threads at once. Instead, the JVM uses a progressive escalation strategy:

1. **Biased Locking** *(historically default, deprecated/disabled by default since JDK 15)* — if a lock is repeatedly acquired by the **same single thread** with no contention at all, the JVM "biases" the lock toward that thread, allowing it to re-acquire the lock with almost zero overhead (just a quick check, no actual CAS operation) on subsequent entries.
2. **Lightweight Locking** — when a second thread attempts to acquire a lock that isn't held, or under light contention, the JVM uses a **CAS (Compare-And-Swap)**-based approach to acquire the lock without invoking the OS at all — much cheaper than a full OS mutex, appropriate for very brief critical sections.
3. **Heavyweight Locking (Monitor Inflation)** — under genuine, sustained contention (multiple threads actively competing for the same lock), the lock **"inflates"** into a full OS-level mutex, where losing threads are **suspended** by the operating system (not just spinning/retrying) and placed in a wait queue, to be woken up later — this is more expensive per acquisition but avoids wasting CPU cycles on threads that would otherwise spin uselessly for a long time.

> **Why this matters for interviews:** it explains *why* `synchronized` performance improved dramatically in modern JVMs compared to early Java versions, and demonstrates that "acquiring a lock" isn't a single fixed-cost operation — its cost depends dynamically on real contention patterns observed at runtime.

### Reentrancy — A Key Property of Intrinsic Locks
Java's intrinsic locks are **reentrant** — a thread that already holds a lock can **acquire it again** (e.g., by calling another synchronized method on the same object from within a synchronized method) **without blocking on itself**.

```java
class Vault {
    synchronized void openOuter() {
        System.out.println("Outer opened");
        openInner();   // ✅ works fine — same thread re-acquiring the same lock
    }
    synchronized void openInner() {
        System.out.println("Inner opened");
    }
}
```
Internally, the JVM maintains a **hold count** for each lock — incremented each time the owning thread re-acquires it, decremented each time it exits a synchronized region. The lock is only **fully released** (available to other threads) once the hold count returns to **zero**. Without reentrancy, the code above would **deadlock** — `openOuter()` would block forever trying to acquire a lock it itself already holds.

---

## What `synchronized` Actually Guarantees — Two Separate Things

It's a common misconception that `synchronized` is *only* about mutual exclusion. It actually provides **two distinct guarantees**:

1. **Atomicity / Mutual Exclusion** — only one thread executes the synchronized block at a time, preventing interleaved, corrupting operations like the `count++` race condition.
2. **Visibility** — when a thread **exits** a synchronized block, all writes it made to shared variables are **flushed** and become visible to the **next** thread that **enters** a synchronized block on the **same lock**. Without this, due to CPU caching and compiler reordering optimizations, one thread's changes might never become visible to another thread at all — a subtle problem addressed further in `volatile`, below.

---

## `volatile` — Visibility Without Mutual Exclusion

### The Problem It Solves
Modern CPUs and the JVM aggressively **cache values in registers or CPU caches** for performance, and the compiler is allowed to **reorder instructions** as long as the reordering doesn't change the outcome from the perspective of a **single** thread. This means, without any special handling, **one thread's write to a shared variable might never be seen by another thread** — each thread could be working off a stale, cached copy indefinitely.

```java
class Flag {
    private boolean running = true;   // NOT volatile
    void stop() { running = false; }
    void run() {
        while (running) {
            // busy work — might loop FOREVER even after stop() is called by another thread,
            // because this thread may never re-read 'running' from main memory
        }
    }
}
```

### The Fix
```java
class Flag {
    private volatile boolean running = true;
    void stop() { running = false; }
    void run() {
        while (running) {
            // guaranteed to eventually see the updated value
        }
    }
}
```
`volatile` guarantees:
- Every **read** of the variable goes directly to **main memory** (never a stale, thread-local cached copy).
- Every **write** to the variable is **immediately flushed** to main memory, visible to all other threads right away.
- It establishes a **happens-before relationship**: a write to a `volatile` variable happens-before every subsequent read of that same variable by any thread — meaning the compiler/CPU **cannot reorder** instructions across that read/write in a way that would break this guarantee.

### `volatile` vs `synchronized` — The Crucial Difference
| Aspect | `volatile` | `synchronized` |
|---|---|---|
| Guarantees visibility? | ✅ Yes | ✅ Yes |
| Guarantees atomicity (mutual exclusion)? | ❌ **No** | ✅ Yes |
| Can block threads? | ❌ Never blocks | ✅ Can block (waiting for the lock) |
| Performance cost | Lower (no locking) | Higher (locking overhead) |
| Appropriate for | Simple flags, single writer / status variables | Any compound operation on shared state (read-modify-write) |

> ⚠️ **The classic gotcha:** `volatile` does **NOT** make `count++` safe. Even though every read/write of a `volatile int count` is immediately visible, the increment is still three separate steps (read, add, write) — another thread could interleave between them. `volatile` solves **visibility**, not **atomicity**. For atomic compound operations, you need `synchronized` or an **atomic class** (`AtomicInteger`, etc., which use CAS internally).

```java
private volatile int count = 0;
count++;   // ❌ STILL a race condition, despite 'volatile' — this is NOT atomic
```

### Real-World Industry Example
A **shutdown flag** in a background worker thread — the main thread sets `shutdownRequested = true`, and the worker thread's loop condition checks it. This is a textbook, appropriate use of `volatile`: a **single writer**, a simple boolean status flag, no compound read-modify-write logic involved.

```java
class Worker implements Runnable {
    private volatile boolean shutdownRequested = false;
    public void requestShutdown() { shutdownRequested = true; }
    public void run() {
        while (!shutdownRequested) {
            // process work
        }
        System.out.println("Worker shutting down gracefully");
    }
}
```

---

## `wait()`, `notify()`, `notifyAll()` — Inter-Thread Communication

These are **not** `Thread` methods — they're defined on `Object` itself, because they operate on an object's **monitor**, and every object has one. They allow threads to **coordinate**, rather than just mutually exclude each other.

### The Core Idea
`wait()` lets a thread that holds a lock **voluntarily release it** and go to sleep, until another thread **notifies** it that something it was waiting for has changed. This is fundamentally different from simply looping and checking a condition repeatedly (**busy-waiting**), which wastes CPU cycles.

### Critical Rule: Must Be Called Inside a Synchronized Block
```java
synchronized (lock) {
    while (!conditionMet) {
        lock.wait();   // releases 'lock', puts thread to sleep, until notified
    }
    // proceed — condition is now true
}
```
Calling `wait()`/`notify()`/`notifyAll()` **outside** a synchronized block on that same object throws `IllegalMonitorStateException` — it makes no sense to "wait on a lock's condition" if you don't currently hold that lock in the first place.

### Why `wait()` Must Be Called in a Loop, Not an `if`
A notified thread doesn't automatically get to run immediately — it must **re-acquire the lock** first (possibly waiting behind other threads), and by the time it does, the condition it was waiting for might have **changed again** (e.g., another thread got there first and consumed the resource). This is called a **spurious wakeup** risk, and re-checking the condition in a `while` loop (rather than trusting a one-time `if` check) is the only correct, safe pattern.

### Classic Producer-Consumer Example
```java
class SharedBuffer {
    private final Queue<Integer> buffer = new LinkedList<>();
    private final int CAPACITY = 5;

    synchronized void produce(int value) throws InterruptedException {
        while (buffer.size() == CAPACITY) {
            wait();   // buffer full — release lock, wait for consumer to make space
        }
        buffer.add(value);
        System.out.println("Produced: " + value);
        notifyAll();   // wake up any waiting consumers
    }

    synchronized int consume() throws InterruptedException {
        while (buffer.isEmpty()) {
            wait();   // buffer empty — release lock, wait for producer to add something
        }
        int value = buffer.poll();
        System.out.println("Consumed: " + value);
        notifyAll();   // wake up any waiting producers
        return value;
    }
}
```

### `notify()` vs `notifyAll()`
- `notify()` wakes up **only one** arbitrary thread waiting on that object's monitor — faster, but risky if multiple threads are waiting for **different** conditions, since you can't control *which* thread wakes up.
- `notifyAll()` wakes up **every** thread waiting on that monitor — all of them then compete to re-acquire the lock, re-check their condition (in their `while` loop), and either proceed or go back to waiting. Safer default choice in most real code, since it avoids the risk of waking the "wrong" thread and leaving others waiting forever.

### Real-World Industry Example
This is the classical foundation behind almost every **producer-consumer queue** in production systems — e.g., a logging system where multiple application threads **produce** log messages into a shared buffer, and a dedicated background thread **consumes** and writes them to disk. (In modern code, you'd typically reach for `BlockingQueue` from `java.util.concurrent`, covered in the Concurrent Collections notes, which implements exactly this wait/notify pattern internally, correctly and efficiently, so you don't have to hand-roll it yourself.)

---

## Deadlock, Livelock, and Starvation

### Deadlock
A **deadlock** occurs when two or more threads are each waiting for a lock that **another one of them holds**, forming a **cycle** — none of them can ever proceed.

```java
class Account {
    private final Object lock = new Object();
}
```
```java
// Thread 1
synchronized (accountA.lock) {
    synchronized (accountB.lock) {   // waits for B, held by Thread 2
        transfer();
    }
}

// Thread 2 (running concurrently)
synchronized (accountB.lock) {
    synchronized (accountA.lock) {   // waits for A, held by Thread 1
        transfer();
    }
}
```
Thread 1 holds `A`, waiting for `B`. Thread 2 holds `B`, waiting for `A`. Neither can ever proceed — a classic **circular wait**.

### The Four Necessary Conditions for Deadlock (Coffman Conditions)
Deadlock can only occur if **all four** of these hold simultaneously:
1. **Mutual Exclusion** — resources can't be shared (only one thread can hold a given lock at a time).
2. **Hold and Wait** — a thread holds one resource while waiting for another.
3. **No Preemption** — a lock can't be forcibly taken away from a thread; it must be voluntarily released.
4. **Circular Wait** — a cycle of threads exists, each waiting for a resource held by the next.

### How to Prevent Deadlock
The most common, practical technique: **always acquire multiple locks in the same, globally consistent order**, across every thread in the system. If both threads above always locked accounts in, say, **ID order** (lower ID first), the circular wait becomes impossible.

```java
Account first = accountA.id < accountB.id ? accountA : accountB;
Account second = accountA.id < accountB.id ? accountB : accountA;
synchronized (first.lock) {
    synchronized (second.lock) {
        transfer();
    }
}
```
Other strategies: using **timed lock attempts** (`tryLock()` with a timeout, covered in the Locks & Latches notes) instead of blocking indefinitely, and minimizing the scope/duration for which multiple locks are held simultaneously.

### Livelock
Similar to deadlock, but threads **aren't blocked** — they're actively running, repeatedly responding to each other in a way that **prevents any actual progress**. Classic analogy: two people in a hallway both step aside to let the other pass, then both step back at the same time, repeating forever — neither is "stuck," but neither makes progress either.

### Starvation
A thread is perpetually **denied access** to a resource it needs because other threads are continually favored (e.g., due to unfair scheduling, or greedy high-priority threads repeatedly grabbing a lock before a lower-priority thread ever gets a turn). The starved thread isn't deadlocked — it's technically still eligible to run — it just never actually gets its turn in practice.

---

## Thread Safety — Common Strategies

| Strategy | How It Works | When to Use |
|---|---|---|
| **`synchronized`** | Mutual exclusion via intrinsic locks | Compound operations on shared mutable state |
| **`volatile`** | Guarantees visibility only, no atomicity | Simple flags, single-writer status variables |
| **Atomic classes** (`AtomicInteger`, `AtomicLong`, etc.) | Lock-free, CAS-based atomic operations | Simple counters/accumulators needing atomicity without full lock overhead |
| **Immutability** | Objects whose state can never change after construction need **no synchronization at all** — inherently thread-safe | Whenever possible — the simplest, safest strategy |
| **Confinement** | Keep mutable data entirely local to a single thread (e.g., `ThreadLocal`, or simply never sharing an object across threads) | Per-thread caches, per-request context data |
| **Concurrent Collections** | Purpose-built thread-safe collections (`ConcurrentHashMap`, etc.) | Shared collections accessed by multiple threads |

> 💡 **Design principle worth remembering:** the safest way to handle shared mutable state is often to **avoid sharing mutable state in the first place** — favor immutability and thread confinement over defensive locking wherever the design allows it.

---

## Interview Questions

1. What exactly happens internally, step by step, when a thread encounters a `synchronized` block?
2. Why do a synchronized instance method and a synchronized static method of the same class NOT block each other?
3. What is lock escalation in the HotSpot JVM, and why does it exist as a performance optimization?
4. What does it mean for a lock to be reentrant, and what would happen without reentrancy if a synchronized method called another synchronized method on the same object?
5. What two distinct guarantees does `synchronized` provide, beyond just "one thread at a time"?
6. Why does `volatile` not make `count++` thread-safe, even though every read/write is immediately visible?
7. What is a happens-before relationship, and how does `volatile` establish one?
8. Why must `wait()` always be called inside a loop (`while`) rather than a single `if` check?
9. What exception is thrown if you call `wait()` without holding the corresponding object's lock, and why does that restriction exist?
10. What is the difference between `notify()` and `notifyAll()`, and why is `notifyAll()` generally the safer default?
11. Why is busy-waiting (a thread looping and repeatedly checking a condition) considered worse than using `wait()`/`notify()`?
12. What are the four necessary conditions for a deadlock to occur (Coffman conditions), and how does lock-ordering prevent it?
13. What's the practical difference between a deadlock and a livelock?
14. What is thread starvation, and how is it different from both deadlock and livelock?
15. Why is a dedicated private `Object lock` field often preferred over synchronizing on `this`?
16. If a critical section is extremely small, why might using an `AtomicInteger` be preferable to `synchronized`?
17. Why are immutable objects inherently thread-safe, without needing any synchronization at all?
18. What is the difference between mutual exclusion and visibility, and why does a program need both in most real-world concurrent scenarios?
19. Why does `Thread.sleep()` inside a synchronized block NOT release the lock, while `wait()` does?
20. In the producer-consumer pattern using `wait()`/`notify()`, what would go wrong if you used `if (buffer.isEmpty())` instead of `while (buffer.isEmpty())`?