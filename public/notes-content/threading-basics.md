# Multithreading — Threading Basics

> **Topic:** Threads, Thread Creation, Lifecycle & Core Thread Methods

---

## What is a Process?

A **process** is an independent, self-contained execution environment — an instance of a running program. Each process has its **own memory space** (heap, stack, etc.), its own set of system resources, and is completely isolated from other processes by the operating system. Two processes cannot directly access each other's memory; they must communicate through OS-level mechanisms (pipes, sockets, shared files) — collectively called **Inter-Process Communication (IPC)**.

When you double-click a Java application (or run `java MyApp`), the OS spins up a **new process** for it, complete with its own JVM instance.

## What is a Thread?

A **thread** is the smallest unit of execution **within** a process — often called a "lightweight process." A single process can contain **multiple threads**, and all threads within the same process **share the same memory space** (heap, static variables, open file handles) but each thread maintains its **own stack**, **own program counter**, and **own local variables**.

```
Process (JVM instance)
   ├── Heap (shared by ALL threads)
   ├── Method Area / Metaspace (shared)
   │
   ├── Thread 1 → own stack, own PC register
   ├── Thread 2 → own stack, own PC register
   └── Thread 3 → own stack, own PC register
```

### Why Threads Share Memory — And Why That's a Double-Edged Sword
Because threads share heap memory, they can communicate and collaborate **extremely cheaply** — no IPC needed, just direct access to shared objects. But this same sharing is **exactly why multithreading is dangerous** without proper coordination: two threads can read/write the same object concurrently, leading to race conditions, visibility issues, and data corruption — the entire motivation behind the **Synchronization** and **Locks** sections that follow this one.

---

## Why Do We Use Multithreading?

1. **Better CPU Utilization** — Modern CPUs have multiple cores. A single-threaded program can only ever use **one core** at a time, leaving the rest idle. Multithreading lets a program perform genuinely parallel work across cores.
2. **Responsiveness** — In GUI or server applications, long-running tasks (file I/O, network calls, heavy computation) can run on a **background thread**, keeping the main/UI thread free and responsive.
3. **Throughput in Server Applications** — A web server handling thousands of simultaneous requests uses a thread (or a pool of threads) per request, allowing many clients to be served concurrently instead of one at a time.
4. **Resource Sharing Efficiency** — Threads within a process share memory, making collaborative work (e.g., producer-consumer pipelines) far cheaper than spinning up separate processes.

### Real-World Industry Example
A **food delivery app's backend** handling an incoming order: one thread validates the payment, while (concurrently) another thread notifies the restaurant, and another updates the delivery-partner matching service — instead of doing these sequentially and making the customer wait for each step to finish one after another.

---

## Concurrency vs Parallelism (A Frequently Confused Pair)

| Aspect | Concurrency | Parallelism |
|---|---|---|
| Meaning | Multiple tasks **make progress** over overlapping time periods — not necessarily simultaneously | Multiple tasks execute **at the literal same instant** |
| Requires multiple CPU cores? | ❌ No — achievable via time-slicing on a single core | ✅ Yes — genuinely needs multiple cores |
| Analogy | One chef juggling three dishes, switching between them | Three chefs, each cooking one dish, at the same time |

A single-core machine can still run a multithreaded program **concurrently** (via rapid context switching, giving the *illusion* of simultaneity), but true **parallelism** requires multiple cores actually executing instructions at the same instant.

---

## Ways to Create a Thread in Java

### 1. Extending the `Thread` Class
```java
class DownloadTask extends Thread {
    @Override
    public void run() {
        System.out.println("Downloading file on: " + Thread.currentThread().getName());
    }
}
```
```java
DownloadTask task = new DownloadTask();
task.start();   // starts a NEW thread, which then calls run()
```

### 2. Implementing the `Runnable` Interface (Preferred)
```java
class DownloadTask implements Runnable {
    @Override
    public void run() {
        System.out.println("Downloading file on: " + Thread.currentThread().getName());
    }
}
```
```java
Thread thread = new Thread(new DownloadTask());
thread.start();
```

### 3. Using a Lambda Expression (Java 8+, since `Runnable` is a functional interface)
```java
Thread thread = new Thread(() -> {
    System.out.println("Downloading file on: " + Thread.currentThread().getName());
});
thread.start();
```

### Why `Runnable` is Generally Preferred Over Extending `Thread`
1. **Java doesn't support multiple inheritance of classes.** If your class already extends `Thread`, it can never extend anything else. Implementing `Runnable` keeps that door open, since a class can implement multiple interfaces.
2. **Separation of concerns.** `Runnable` represents "a task to be done," while `Thread` represents "the mechanism that executes it." Mixing both into one class (by extending `Thread`) conflates *what* to do with *how* it gets run — bad design in most cases.
3. **Reusability with the Executors Framework.** Modern Java code almost never manually creates raw `Thread` objects in production — instead, `Runnable`/`Callable` tasks are submitted to a thread pool (`ExecutorService`), which manages threads for you. Designing your task as a `Runnable` from the start makes this transition seamless (covered in depth in the Executors Framework notes).

### `start()` vs `run()` — A Critical, Frequently-Tested Distinction
```java
Thread t = new Thread(() -> System.out.println("Running on: " + Thread.currentThread().getName()));

t.run();     // ❌ Does NOT create a new thread — just calls run() like a normal method, on the CALLING thread
t.start();   // ✅ Creates a genuinely NEW thread, which then internally invokes run() on that new thread
```
- `start()` asks the **JVM and OS** to allocate a new thread of execution, which will eventually call your `run()` method on that new thread — this is asynchronous and non-deterministic in timing.
- `run()` called directly is just an **ordinary method call** — it executes on the **current thread**, synchronously, exactly like calling any other method. No new thread is ever created.
- Calling `start()` **twice** on the same `Thread` object throws `IllegalThreadStateException` — a thread, once started (and especially once terminated), cannot be restarted.

---

## The Thread Lifecycle (Thread States)

Java models a thread's life through the `Thread.State` enum, with six possible states:

```
                        NEW
                        │  start()
                        ▼
                    RUNNABLE   ◄──────────────┐
                    (ready or                 │
                    actually running)         │  lock acquired / wait time elapsed /
                        │                     │  notify() received
                        │  waiting for lock ──┤
                        │  wait()/join()/sleep()
                        ▼                     │
                BLOCKED / WAITING /    ───────┘
                TIMED_WAITING
                        │
                        │  run() completes, or exception thrown
                        ▼
                    TERMINATED
```

| State | Meaning |
|---|---|
| **NEW** | A `Thread` object has been created, but `start()` hasn't been called yet. |
| **RUNNABLE** | The thread is eligible to run — it might be actually executing on a CPU core right now, or just waiting for the OS scheduler to give it CPU time. Java doesn't distinguish "running" from "ready to run" as separate states — both fall under `RUNNABLE`. |
| **BLOCKED** | The thread is waiting to acquire a **monitor lock** (e.g., trying to enter a `synchronized` block/method that another thread currently holds). |
| **WAITING** | The thread is waiting **indefinitely** for another thread to perform a specific action — e.g., it called `Object.wait()` (no timeout), `Thread.join()` (no timeout), or `LockSupport.park()`. It stays here until explicitly notified/interrupted. |
| **TIMED_WAITING** | Same as `WAITING`, but with a **specified time limit** — e.g., `Thread.sleep(ms)`, `Object.wait(ms)`, `Thread.join(ms)`. Automatically returns to `RUNNABLE` after the timeout, even without external notification. |
| **TERMINATED** | The thread has finished executing — either `run()` completed normally, or an uncaught exception propagated out of it. A terminated thread **cannot be restarted**. |

```java
Thread t = new Thread(() -> {
    try { Thread.sleep(1000); } catch (InterruptedException e) {}
});
System.out.println(t.getState());   // NEW
t.start();
System.out.println(t.getState());   // RUNNABLE (or TIMED_WAITING, depending on timing)
t.join();
System.out.println(t.getState());   // TERMINATED
```

---

## Core Thread Methods — In Depth

### `start()`
Begins a new thread of execution; internally calls `run()` on the new thread. Covered above.

### `run()`
Contains the actual code the thread will execute. If called directly (not via `start()`), it's just a normal synchronous method call — no new thread involved.

### `sleep(long millis)`
Pauses the **currently executing thread** for at least the specified duration, **without releasing any locks it holds**. It's a `static` method — it always affects the thread calling it, never another thread.

```java
try {
    Thread.sleep(2000);   // pause current thread for 2 seconds
} catch (InterruptedException e) {
    Thread.currentThread().interrupt();   // best practice: restore interrupt status
}
```
`sleep()` throws the **checked** exception `InterruptedException` if another thread interrupts this thread while it's sleeping — this must be handled or declared.

### `join()`
Makes the **calling thread wait** until the thread on which `join()` was called **finishes execution** (or the optional timeout elapses).

```java
Thread worker = new Thread(() -> {
    System.out.println("Worker doing heavy computation...");
});
worker.start();
worker.join();   // main thread blocks here until 'worker' finishes
System.out.println("Worker is done — main thread continues now");
```
Without `join()`, the main thread might print "continues" **before** the worker thread has actually finished — `join()` establishes an explicit **happens-before** ordering guarantee between the two threads.

### `interrupt()`
Sends an **interrupt signal** to a thread — it does **not** forcibly stop the thread (Java deliberately provides no safe way to force-kill a thread, since abruptly stopping a thread mid-operation could leave shared objects in a corrupted, inconsistent state). Instead:
- If the target thread is currently blocked in `sleep()`, `wait()`, or `join()`, it **immediately wakes up** and throws `InterruptedException`.
- If the thread is doing ordinary CPU-bound work (not blocked), interruption merely sets an internal **"interrupted status" flag** — the thread's own code must **periodically check** this flag (via `Thread.interrupted()` or `isInterrupted()`) and voluntarily decide to stop what it's doing.

```java
Thread worker = new Thread(() -> {
    while (!Thread.currentThread().isInterrupted()) {
        // do work, checking the flag periodically
    }
    System.out.println("Worker noticed interruption and is stopping gracefully");
});
worker.start();
worker.interrupt();   // politely asks the thread to stop — cooperative, not forced
```

> 💡 This cooperative design is why "graceful shutdown" logic in real applications always involves the task itself checking `isInterrupted()` periodically — a thread that never checks simply ignores interruption requests forever.

### `yield()`
A **hint** to the thread scheduler that the current thread is willing to pause and let other threads of the **same priority** have a chance to run. It's purely advisory — the JVM/OS scheduler is free to **completely ignore** this hint, so `yield()` provides **no guarantees** and is rarely used in real production code.

### `setPriority(int)` / `getPriority()`
Threads can be assigned a priority from `Thread.MIN_PRIORITY` (1) to `Thread.MAX_PRIORITY` (10), with `Thread.NORM_PRIORITY` (5) as default. This is only a **hint** to the OS scheduler about relative importance — actual scheduling behavior is highly **platform-dependent** and not guaranteed, so priority should never be relied upon for program correctness.

### Daemon Threads — `setDaemon(true)`
A **daemon thread** is a background, low-priority "helper" thread that the JVM does **not wait for** before exiting. As soon as **all non-daemon (user) threads finish**, the JVM shuts down immediately — **terminating any still-running daemon threads abruptly**, regardless of what they were doing.

```java
Thread backgroundLogger = new Thread(() -> {
    while (true) {
        // continuously flush logs in the background
    }
});
backgroundLogger.setDaemon(true);   // must be called BEFORE start()
backgroundLogger.start();
```
Common real-world examples of daemon threads: the JVM's own **Garbage Collector thread**, background auto-save/logging threads. `main()` itself always runs as a **non-daemon (user) thread**.

> ⚠️ `setDaemon()` must be called **before** `start()` — calling it on an already-started thread throws `IllegalThreadStateException`.

---

## `Thread` vs `Runnable` — Quick Recap Table

| Aspect | Extending `Thread` | Implementing `Runnable` |
|---|---|---|
| Inheritance flexibility | Uses up your one class-extension slot | Keeps class free to extend something else |
| Separation of task vs execution mechanism | Mixed together | Cleanly separated |
| Reusable across multiple threads? | Less natural | ✅ Same `Runnable` instance can be passed to multiple `Thread`s |
| Works with `ExecutorService`? | Awkward | ✅ Designed for this |
| Industry recommendation | Avoid in modern code | ✅ Preferred |

---

## The Main Thread

Every standalone Java application starts with a single thread, automatically created by the JVM, called the **main thread** — it's the one that invokes your `main()` method.

```java
public class App {
    public static void main(String[] args) {
        System.out.println("Running on: " + Thread.currentThread().getName());  // "main"
    }
}
```
Any additional threads you create are **child threads** of this initial thread setup — though note that a child thread's lifetime isn't tied to its "parent" the way a daemon thread is tied to the presence of user threads; a non-daemon child thread can keep the JVM alive even after `main()` itself has returned.

---

## Race Condition — A First Look (Preview)

Even at this "basics" stage, it's worth seeing **why** all of this careful thread management matters. When two or more threads **access and modify shared data concurrently**, and the final result depends on the **unpredictable timing/interleaving** of their operations, you have a **race condition**.

```java
class Counter {
    int count = 0;
    void increment() { count++; }   // NOT atomic! Looks like one operation, is actually 3: read, add, write
}
```
If two threads call `increment()` "simultaneously," both might **read** `count` as `5` before either has a chance to **write back** `6` — resulting in a final value of `6` instead of the correct `7`, silently losing an update. This exact problem — and how to prevent it using `synchronized`, locks, and atomic classes — is the subject of the **Synchronization** and **Locks & Latches** notes that follow.

---

## Interview Questions

1. What is the fundamental difference between a process and a thread, particularly regarding memory?
2. Why is it dangerous that threads within the same process share heap memory, and why is it also beneficial?
3. What is the actual difference between calling `thread.start()` and `thread.run()` directly?
4. What exception is thrown if you call `start()` twice on the same `Thread` object, and why is that restriction in place?
5. Why is implementing `Runnable` generally preferred over extending the `Thread` class?
6. Walk through all six states in the `Thread.State` lifecycle, and what specific actions cause a thread to move between them.
7. What's the difference between `WAITING` and `TIMED_WAITING`, and can you give an example of a method call that leads to each?
8. Does `Thread.sleep()` release any locks the thread currently holds? Why does this matter?
9. What does `thread.join()` actually guarantee, and what would happen in a program if you forgot to call it?
10. Why doesn't Java provide a way to forcibly kill a thread, and how does `interrupt()` work instead?
11. If a thread is doing CPU-bound work in a loop and you call `interrupt()` on it, does it stop immediately? Why or why not?
12. What does `Thread.yield()` actually guarantee, and why is it rarely relied upon in real code?
13. What happens to a running daemon thread the moment all non-daemon threads finish?
14. Why must `setDaemon(true)` be called before `start()`, and what happens if you call it afterward?
15. What is the difference between concurrency and parallelism, and can a single-core CPU achieve true parallelism?
16. What is a race condition, and why does `count++` not being atomic matter in a multithreaded context?
17. Is thread priority in Java a guarantee or a hint? What does that imply about relying on it for program correctness?
18. Can the `main` thread finish executing while other non-daemon threads it created are still running? What happens to the JVM in that case?
19. What checked exception does `Thread.sleep()` throw, and what is considered best practice when catching it?
20. If a `Runnable` instance is passed to multiple different `Thread` objects, do they share the same task state? What does this imply about thread safety of that shared `Runnable`?