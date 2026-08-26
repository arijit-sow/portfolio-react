# Concurrent Collections in Java — Complete Notes

> **Topic:** `java.util.concurrent` Collections, Fail-Fast vs Fail-Safe Iterators

---

## Why Do We Need Concurrent Collections At All?

The standard collections (`ArrayList`, `HashMap`, `HashSet`, etc.) are **not thread-safe**. If multiple threads read and write to them concurrently without external synchronization, you risk:
- **Data corruption** — internal structures (array indices, bucket links) can end up in an inconsistent state.
- **`ConcurrentModificationException`** — thrown when a collection is structurally modified while being iterated.
- **Lost updates** — two threads writing "at the same time" can silently overwrite each other's changes.
- **Infinite loops / crashes** — infamous in pre-Java-8 `HashMap`, where concurrent resizing by multiple threads could corrupt the internal linked-list structure into a cycle, hanging the JVM.

Wrapping a collection with `Collections.synchronizedMap(new HashMap<>())` "solves" thread-safety but does so with a **single coarse-grained lock** around every method call — meaning only **one thread at a time** can touch the map at all, even for simple reads. Under high concurrency, this becomes a severe bottleneck.

The `java.util.concurrent` package (introduced in Java 5, significantly enhanced in Java 8) provides **purpose-built concurrent collections** designed to allow **multiple threads to operate safely and efficiently**, often without any explicit locking on the caller's part, and frequently with far better throughput than a synchronized wrapper.

---

## Fail-Fast vs Fail-Safe Iterators (In Depth)

This is one of the most important concepts underlying *why* concurrent collections behave the way they do, and it's a favorite interview topic.

### Fail-Fast Iterators
The **standard collections** (`ArrayList`, `HashMap`, `HashSet`, `LinkedList`, etc.) use **fail-fast iterators**. "Fail-fast" means the iterator **immediately throws an exception** the moment it detects the underlying collection has been **structurally modified** during iteration, by any thread — including the same thread doing the iterating.

#### How It Works Internally
Fail-fast collections maintain an internal counter called `modCount` (modification count), incremented every time the collection is **structurally modified** — meaning an operation that changes its size (`add()`, `remove()`) — but notably **not** `set()`, which only replaces an existing element's value without changing structure.

When you create an iterator (`list.iterator()`), it captures a **snapshot of `modCount`** at that moment as `expectedModCount`. Every time you call `next()` on that iterator, it checks:
```java
final void checkForComodification() {
    if (modCount != expectedModCount)
        throw new ConcurrentModificationException();
}
```
If the live `modCount` no longer matches the `expectedModCount` the iterator captured, it means **something structurally changed the collection** since the iterator was created — so the iterator immediately throws `ConcurrentModificationException` (**CME**) rather than risk continuing to operate on a collection whose internal state it can no longer trust.

```java
List<String> list = new ArrayList<>(List.of("A", "B", "C"));
for (String item : list) {
    if (item.equals("B")) {
        list.remove(item);   // structural modification DURING iteration
    }
}
// Throws: ConcurrentModificationException
```

#### Why Does This Exception Exist? (The "Why," Not Just the "What")
It's crucial to understand: **CME is not primarily a thread-safety mechanism** — it's a **best-effort bug-detection mechanism**, even in **single-threaded** code, as shown above. Its purpose is to catch a genuinely dangerous programming mistake early and loudly, rather than let the program silently corrupt data or produce unpredictable, hard-to-debug behavior (like skipping elements, revisiting elements, or throwing `IndexOutOfBoundsException` somewhere unrelated later). The JDK documentation explicitly states fail-fast behavior is a **"best effort"** guarantee — it's not guaranteed to trigger in every corruption scenario, and code should **never rely on CME for correctness**; it exists purely to help developers catch bugs during development.

In a genuinely multi-threaded scenario, fail-fast iterators are **even more dangerous** to rely on — if Thread A is iterating a `HashMap` while Thread B concurrently inserts into it, the result could range from a clean CME, to silently missing/duplicating elements, to (in the worst pre-Java-8 case) actual internal corruption — CME is not a reliable safety net for concurrent access at all, which is exactly why dedicated **fail-safe** structures exist for concurrent use cases.

#### The Correct Way to Modify While Iterating
```java
Iterator<String> it = list.iterator();
while (it.hasNext()) {
    String item = it.next();
    if (item.equals("B")) {
        it.remove();   // ✅ safe — Iterator.remove() updates expectedModCount too
    }
}
```
`Iterator.remove()` is special-cased: it updates `expectedModCount` to match the new `modCount` right after performing the removal, so the **very next** `checkForComodification()` call passes — this is the one sanctioned way to structurally modify a fail-fast collection mid-iteration.

### Fail-Safe Iterators
**Concurrent collections** (`ConcurrentHashMap`, `CopyOnWriteArrayList`, `ConcurrentLinkedQueue`, etc.) generally use **fail-safe** (also called **"weakly consistent"**) iterators. These **never throw `ConcurrentModificationException`**, because they don't operate directly on the live, mutable internal structure the way fail-fast iterators do.

Instead, depending on the specific collection:
- `CopyOnWriteArrayList`'s iterator operates on an **immutable snapshot** of the array taken at iterator-creation time — later modifications by other threads create an entirely new array, which the existing iterator simply never sees.
- `ConcurrentHashMap`'s iterator doesn't take a full snapshot, but is **"weakly consistent"** — it's guaranteed to traverse elements that existed at iterator creation time, **may or may not** reflect concurrent modifications made during the iteration (it might see some but not all recent updates), but will **never** throw CME and will never revisit an element or crash — a deliberate, well-documented trade-off between strict consistency and high concurrency throughput.

```java
Map<String, Integer> concurrentMap = new ConcurrentHashMap<>();
concurrentMap.put("a", 1);
concurrentMap.put("b", 2);

for (String key : concurrentMap.keySet()) {
    concurrentMap.put("c", 3);   // no exception — fail-safe iterator tolerates this
}
```

### Fail-Fast vs Fail-Safe — Side by Side

| Aspect | Fail-Fast | Fail-Safe |
|---|---|---|
| Example collections | `ArrayList`, `HashMap`, `HashSet`, `LinkedList` | `ConcurrentHashMap`, `CopyOnWriteArrayList`, `ConcurrentLinkedQueue` |
| Operates on | The live, actual internal structure | A snapshot, or a weakly consistent live view |
| Throws `ConcurrentModificationException`? | ✅ Yes, on detected structural modification | ❌ No |
| Memory overhead | None extra | Can be higher (snapshot copies, or extra bookkeeping) |
| Guarantees during concurrent mutation | None — behavior undefined/exception-prone | Well-defined, documented weak-consistency guarantee |
| Primary purpose | Bug detection (even single-threaded) | Safe, non-blocking concurrent iteration |

---

## The Concurrent Collections Landscape

```
java.util.concurrent
    │
    ├── ConcurrentMap<K,V> (interface)
    │        └── ConcurrentHashMap
    │
    ├── CopyOnWriteArrayList
    ├── CopyOnWriteArraySet
    │
    ├── BlockingQueue<E> (interface)
    │        ├── LinkedBlockingQueue
    │        ├── ArrayBlockingQueue
    │        ├── PriorityBlockingQueue
    │        ├── SynchronousQueue
    │        └── DelayQueue
    │
    ├── BlockingDeque<E> (interface)
    │        └── LinkedBlockingDeque
    │
    ├── ConcurrentLinkedQueue
    ├── ConcurrentLinkedDeque
    │
    └── ConcurrentSkipListMap / ConcurrentSkipListSet   (concurrent, sorted equivalents of TreeMap/TreeSet)
```

---

## `ConcurrentHashMap` — Internal Working (Deep Dive)

### What It Is
`ConcurrentHashMap` is the concurrent, thread-safe counterpart to `HashMap`, designed to support **high-throughput concurrent reads and writes** without the severe bottleneck of a single global lock (as `Hashtable`/`synchronizedMap` would impose).

### Historical Context — Java 7 vs Java 8 (Important for Interviews)
The internal design changed **significantly** between Java 7 and Java 8, and interviewers often probe whether you know both, or at least the modern (Java 8+) design.

#### Java 7 Approach — Segment-Based Locking
- The map was divided into a fixed number of **segments** (default: 16), each segment being an **independent mini hash table** with its **own lock**.
- A thread writing to a key in Segment 3 only needed to lock Segment 3 — threads writing to Segments 1, 2, 4, etc. could proceed **fully in parallel**.
- This allowed up to **16 threads** (the default concurrency level) to write **truly concurrently** without blocking each other, a massive improvement over `Hashtable`'s single lock.
- Limitation: concurrency was capped at the number of segments, and segment boundaries added structural complexity and memory overhead.

#### Java 8+ Approach — Bucket-Level (Node-Level) Synchronization + CAS
Java 8 **removed the segment concept entirely** and redesigned `ConcurrentHashMap` to look structurally more like a regular `HashMap` (array of bins/buckets containing `Node` linked lists or trees), but with much finer-grained concurrency control:

1. **Reads are (almost) entirely lock-free.** The `table` array and each `Node`'s critical fields are declared `volatile`, ensuring that once a thread writes a new node, other threads immediately see the up-to-date reference — without needing any lock to read. `get()` typically doesn't acquire any lock at all.

2. **Writes use CAS (Compare-And-Swap) for the common case.** When inserting into an **empty bucket**, `ConcurrentHashMap` uses `Unsafe`/`VarHandle`-based **CAS operations** to atomically place the new node — no lock required at all if the CAS succeeds. CAS is a low-level atomic hardware instruction: "update this memory location to a new value, but only if it still holds the value I last saw" — if another thread beat you to it, the CAS fails and the operation retries.

3. **Writes fall back to a per-bin lock only when necessary.** If the target bucket is **not empty** (a collision, meaning there's already a chain or tree there), the thread synchronizes on just **that bucket's first node** (`synchronized(node)`) — locking only that one bucket, not the whole table, not even a whole "segment." This means two threads writing to two different buckets **never block each other at all**, achieving concurrency proportional to the table size itself, not a fixed segment count.

4. **Resizing is cooperative and can be multi-threaded.** When the table needs to grow, Java 8+ `ConcurrentHashMap` allows **multiple threads to help perform the resize concurrently** — each thread can claim and transfer a chunk of the old table into the new table, using a `transferIndex` and CAS-based claiming, rather than one thread doing all the rehashing alone while others block. Threads that call `put()` during an in-progress resize can even detect this and pitch in to help move nodes, speeding up the transition.

5. **Treeification** — same Java 8+ enhancement as `HashMap`: if a bin's chain grows to 8+ nodes and the table has at least 64 buckets, it's converted to a Red-Black Tree for that bucket, bounding worst-case lookup to `O(log n)` instead of `O(n)`, even under concurrent access (tree operations here use a more intricate locking scheme to stay safe under concurrent readers/writers).

6. **Size tracking without a global counter.** Rather than maintaining one shared `size` variable (which would itself become a contention hotspot under heavy concurrent writes from many threads), `ConcurrentHashMap` uses an array of **striped counters** (`CounterCell[]`, conceptually similar to `LongAdder`) — different threads increment different counter cells, and `size()` sums them up on demand. This avoids a single point of write-contention for something as simple as tracking count.

### Visual Summary — Java 8+ `ConcurrentHashMap.put()`

```
put(key, value)
      │
      ▼
compute hash, find bucket index
      │
      ▼
Is the bucket empty?
   │YES                              │NO
   ▼                                  ▼
CAS insert new node             synchronized(firstNodeInBucket) {
(lock-free, retry on failure)      walk chain/tree, insert or update
                                  }  ← only THIS bucket is locked
```

### Why It Doesn't Allow `null` Keys or Values
In a **single-threaded** `HashMap`, `map.get(key) == null` is ambiguous between "key absent" and "key present with a `null` value" — but you can always disambiguate with `containsKey()` right after, since nothing else is changing the map concurrently. In `ConcurrentHashMap`, another thread could **insert or remove the key between your `get()` and your follow-up `containsKey()` check**, making that disambiguation fundamentally unreliable in a concurrent context. To eliminate this entire class of race condition, the designers simply **disallowed `null` outright** for both keys and values.

### Advantages
- Excellent throughput under heavy concurrent reads and writes — no single global lock.
- Lock-free reads via `volatile` — readers never block on writers.
- Fail-safe (weakly consistent) iterators — no `ConcurrentModificationException`.
- Atomic compound operations available: `putIfAbsent()`, `computeIfAbsent()`, `compute()`, `merge()` — each performed atomically, useful for race-condition-free "check-then-act" logic.

### Disadvantages
- Slightly higher memory/CPU overhead than a plain `HashMap` for single-threaded use — not worth using unless you actually need concurrency.
- Iteration is only **weakly consistent** — not a strict, frozen snapshot, so you might observe some but not all concurrent modifications during a single iteration pass; not suitable when you need a perfectly consistent view.
- `size()` is an approximation under heavy concurrent modification — technically eventually consistent, not an instantaneous exact count during heavy concurrent churn.

### Real-World Industry Example
A **shared in-memory cache or counter map** in a high-traffic web service — e.g., `Map<String, AtomicInteger>` tracking API request counts per client key across thousands of concurrent request-handler threads, or a **session store** shared across worker threads in an application server. `computeIfAbsent()` is especially popular for atomic "get-or-create" cache population:

```java
Map<String, ExpensiveResource> cache = new ConcurrentHashMap<>();
ExpensiveResource resource = cache.computeIfAbsent(key, k -> loadExpensiveResource(k));
// Atomically ensures loadExpensiveResource() runs at most once per key, even under concurrent access
```

---

## `CopyOnWriteArrayList` — Internal Working (Deep Dive)

### What It Is
`CopyOnWriteArrayList` is the concurrent, thread-safe counterpart to `ArrayList`, built around a simple but powerful idea: **every mutating operation creates an entirely new copy of the underlying array**, rather than modifying the existing one in place.

### Internal Working — Step by Step

```java
private transient volatile Object[] array;
```
The core state is just a **single `volatile` array reference**.

#### What Happens on `add(e)`
1. Acquire an internal `ReentrantLock` (used only to serialize **writers** against each other — readers never touch this lock at all).
2. Read the **current** array reference.
3. Allocate a **brand-new array**, one element larger than the current one.
4. **Copy** all existing elements from the old array into the new array (`Arrays.copyOf()`).
5. Place the new element at the end of the new array.
6. **Atomically reassign** the `volatile array` field to point to this new array.
7. Release the lock.

```java
public boolean add(E e) {
    final ReentrantLock lock = this.lock;
    lock.lock();
    try {
        Object[] elements = getArray();
        int len = elements.length;
        Object[] newElements = Arrays.copyOf(elements, len + 1);
        newElements[len] = e;
        setArray(newElements);   // volatile write — instantly visible to all threads
        return true;
    } finally {
        lock.unlock();
    }
}
```

#### What Happens on `remove()` / `set()`
Same pattern: **copy the entire array**, apply the change (skip the removed index, or overwrite the set index) in the copy, then atomically swap the `volatile` reference. Every single mutation, regardless of type or position, involves a **full `O(n)` array copy**.

#### Why Reads Never Block
Because `array` is `volatile`, any thread calling `get(index)` simply reads the **current** array reference directly — no lock needed at all, since reads never modify shared state, and the `volatile` guarantee ensures the reader always sees a fully-formed, consistent array (never a partially-updated one, since a new array is only made visible **after** it's completely built).

### Why Iterators Never Throw `ConcurrentModificationException`
When you call `list.iterator()`, the iterator captures the **current array reference at that exact moment** and iterates over **that specific array object only** — it never looks at the `list`'s `array` field again, even if it changes underneath it. If another thread calls `add()` concurrently, that thread builds and swaps in a **completely separate, new array object** — the existing iterator's captured reference still points to the **old, untouched array**, which remains perfectly intact and immutable for as long as any iterator holds a reference to it (garbage collected only once no iterator/reference needs it anymore). This is precisely why iteration is **fail-safe**: the iterator is, in effect, walking a permanent, frozen snapshot.

```java
List<String> cowList = new CopyOnWriteArrayList<>(List.of("A", "B", "C"));

for (String item : cowList) {
    cowList.add("D");   // creates a NEW array — this iterator still sees only [A, B, C]
    System.out.println(item);
}
System.out.println(cowList);   // now contains the D's added during each iteration step
```

### Advantages
- **Reads are extremely fast and never block** — no locking at all for `get()`/iteration.
- **Never throws `ConcurrentModificationException`** — safe, predictable iteration even under heavy concurrent mutation.
- Simple, easy-to-reason-about consistency model — an iterator always sees a coherent, unchanging snapshot.

### Disadvantages
- **Very expensive writes** — every single `add()`, `remove()`, or `set()` copies the **entire underlying array**, an `O(n)` operation, making it a poor choice for write-heavy workloads (imagine adding 10,000 elements one at a time — that's roughly 10,000 full-array copies).
- **Higher memory churn/pressure** — frequent full-array allocation and garbage collection of old arrays.
- Iterators can serve **stale data** — if you're iterating while another thread mutates, you simply won't see those changes in your current iteration pass, which may or may not be acceptable depending on the use case.
- The `Iterator` returned does **not support `remove()`, `set()`, or `add()`** — it's genuinely a **read-only, immutable snapshot view**, so calling `iterator.remove()` throws `UnsupportedOperationException`.

### Real-World Industry Example
A classic, textbook use case: a **list of event listeners/observers** registered to a publish-subscribe system (e.g., listeners for application lifecycle events, or subscribers to a UI event bus). Listeners are **registered/unregistered rarely** (infrequent writes) but the list is **iterated very frequently** — every time an event fires, potentially from multiple threads simultaneously — making the expensive-write, cheap-read trade-off of `CopyOnWriteArrayList` exactly the right fit.

```java
List<EventListener> listeners = new CopyOnWriteArrayList<>();
listeners.add(new AuditLogListener());
listeners.add(new NotificationListener());

// Fired frequently, potentially from many threads — reads/iteration are cheap and lock-free
void publishEvent(Event event) {
    for (EventListener listener : listeners) {
        listener.onEvent(event);
    }
}
```

---

## All Major Concurrent Collections — Uses, Advantages, Disadvantages

### `ConcurrentHashMap`
- **Use case:** General-purpose, high-throughput concurrent key-value store; caches, counters, shared lookup tables.
- **Advantages:** Excellent read/write concurrency, lock-free reads, atomic compound operations, weakly consistent iteration.
- **Disadvantages:** No `null` keys/values, `size()` is approximate under heavy churn, more overhead than `HashMap` for single-threaded use.

### `CopyOnWriteArrayList`
- **Use case:** Read-heavy, write-rare lists — listener/observer registries, configuration snapshots read by many threads.
- **Advantages:** Extremely fast, lock-free reads/iteration; never throws CME.
- **Disadvantages:** Very expensive writes (`O(n)` full copy per mutation); unsuitable for write-heavy workloads.

### `CopyOnWriteArraySet`
- **Use case:** The `Set` counterpart — internally backed by a `CopyOnWriteArrayList`, ensuring uniqueness via linear `equals()` scans on write.
- **Advantages:** Same fail-safe, lock-free read benefits as `CopyOnWriteArrayList`.
- **Disadvantages:** Same expensive-write drawback, **plus** `add()` is `O(n)` even before the copy (must linearly scan to check for duplicates) — so writes are doubly costly compared to the List version.

### `ConcurrentLinkedQueue`
- **Use case:** Unbounded, non-blocking FIFO queue for high-concurrency producer-consumer scenarios where you don't want threads to block if the queue is empty/full.
- **Internal working:** A **lock-free linked-node queue** using CAS operations on node links (based on the well-known Michael-Scott non-blocking queue algorithm) rather than any locking.
- **Advantages:** Very high throughput for concurrent `offer()`/`poll()`, no blocking, no locking.
- **Disadvantages:** `size()` is `O(n)` (must traverse the whole queue — deliberately not tracked eagerly, since maintaining an exact concurrent counter would itself become a contention point) and is only a weakly consistent approximation; not a **blocking** queue, so consumers must poll/spin or use their own wait strategy if they want to wait for new elements.

### `ConcurrentLinkedDeque`
- **Use case:** Same lock-free, non-blocking philosophy as `ConcurrentLinkedQueue`, but double-ended — useful for work-stealing algorithms where threads push/pop from opposite ends to reduce contention.
- **Advantages / Disadvantages:** Same profile as `ConcurrentLinkedQueue`, extended to both ends.

### `BlockingQueue` Family (`LinkedBlockingQueue`, `ArrayBlockingQueue`, `PriorityBlockingQueue`, `SynchronousQueue`, `DelayQueue`)
- **Use case:** The backbone of the classic **producer-consumer pattern** and Java's `ExecutorService` thread pools internally. Unlike `ConcurrentLinkedQueue`, these support **blocking** operations: `put()` blocks if the queue is full (for bounded variants), and `take()` blocks if the queue is empty, until an element becomes available — eliminating manual wait/notify boilerplate.
- **`LinkedBlockingQueue`** — optionally bounded, linked-node based; commonly used as the work queue inside `ThreadPoolExecutor`.
- **`ArrayBlockingQueue`** — fixed-capacity, array-based; must specify a bound at creation; generally has more predictable, lower memory overhead than `LinkedBlockingQueue` for a truly fixed-size scenario.
- **`PriorityBlockingQueue`** — unbounded, heap-based, blocking version of `PriorityQueue`; `take()` blocks until an element is available, then returns the highest-priority one.
- **`SynchronousQueue`** — a queue with **zero internal capacity**; every `put()` must wait for a matching `take()` from another thread and vice versa — effectively a direct thread-to-thread handoff point, used heavily inside `Executors.newCachedThreadPool()`.
- **`DelayQueue`** — elements become available for `take()` only after their individual delay has expired; useful for scheduling tasks to run after a certain time (e.g., a cache-expiry queue, or a retry-after-backoff mechanism).
- **Advantages:** Purpose-built blocking semantics remove the need for manual `wait()`/`notify()`; thread-safe by design.
- **Disadvantages:** Blocking calls can tie up threads if not managed carefully (thread pool sizing matters); `ArrayBlockingQueue`'s fixed capacity must be chosen carefully upfront.

### `ConcurrentSkipListMap` / `ConcurrentSkipListSet`
- **Use case:** The concurrent, thread-safe equivalents of `TreeMap`/`TreeSet` — a **sorted**, concurrent key-value store or set.
- **Internal working:** Backed by a **skip list** (a probabilistic, multi-level linked-list structure) rather than a Red-Black tree — skip lists are chosen specifically because they support **efficient lock-free concurrent operations** far more naturally than a balanced tree does (rebalancing a tree concurrently is notoriously hard to do without heavy locking; skip lists avoid this problem by design).
- **Advantages:** Sorted order maintained under full concurrent access, with `O(log n)` expected time for `get`/`put`/`remove`, no global lock needed.
- **Disadvantages:** Slightly more overhead than `ConcurrentHashMap` for pure key-value lookup where sorting isn't needed; skip list performance is probabilistic (expected `O(log n)`, not a hard worst-case guarantee like a balanced tree).

---

## Quick Comparison Table

| Collection | Backing Structure | Read Cost | Write Cost | Blocking? | Null Allowed? | Best For |
|---|---|---|---|---|---|---|
| `ConcurrentHashMap` | Hash table, CAS + per-bin locks | Lock-free, `O(1)` avg | `O(1)` avg (CAS or bucket lock) | No | ❌ | General concurrent key-value store |
| `CopyOnWriteArrayList` | Array, copy-on-write | Lock-free, `O(1)` | `O(n)` (full copy) | No | ✅ | Read-heavy, rare-write lists |
| `ConcurrentLinkedQueue` | Lock-free linked nodes (CAS) | `O(1)` | `O(1)` | No | ❌ | High-throughput non-blocking FIFO |
| `LinkedBlockingQueue` | Linked nodes, 2 locks (head/tail) | `O(1)` | `O(1)` | ✅ Yes | ❌ | Producer-consumer, thread pools |
| `ConcurrentSkipListMap` | Skip list | `O(log n)` expected | `O(log n)` expected | No | ❌ | Concurrent sorted map |

---

## Quick Decision Guide

| Requirement | Best Choice |
|---|---|
| General-purpose thread-safe map | `ConcurrentHashMap` |
| Read-heavy list, rare mutation (listeners, config) | `CopyOnWriteArrayList` |
| Producer-consumer with blocking semantics | `LinkedBlockingQueue` / `ArrayBlockingQueue` |
| Non-blocking, lock-free FIFO under heavy load | `ConcurrentLinkedQueue` |
| Need sorted order + full concurrency | `ConcurrentSkipListMap` / `ConcurrentSkipListSet` |
| Thread handoff, zero buffering | `SynchronousQueue` |
| Delayed/scheduled task availability | `DelayQueue` |

---

## Interview Questions

1. What is the fundamental difference between a fail-fast and a fail-safe iterator?
2. Why does `ConcurrentModificationException` exist even in single-threaded code?
3. How does a fail-fast iterator detect that a collection has been structurally modified?
4. Why does `Iterator.remove()` not trigger a `ConcurrentModificationException`, while `list.remove()` during a for-each loop does?
5. Is `ConcurrentModificationException` a reliable thread-safety mechanism? Why or why not?
6. How did `ConcurrentHashMap`'s internal locking strategy change between Java 7 and Java 8?
7. What is CAS (Compare-And-Swap), and how does `ConcurrentHashMap` use it to avoid locking on every write?
8. Under what condition does `ConcurrentHashMap` fall back to using a lock, and what exactly does it lock?
9. Why can multiple threads help resize a `ConcurrentHashMap` concurrently in Java 8+?
10. Why does `ConcurrentHashMap` avoid a single global `size` counter, and what does it use instead?
11. Why does `ConcurrentHashMap` disallow `null` keys and values, unlike `HashMap`?
12. What does "weakly consistent" mean in the context of `ConcurrentHashMap`'s iterator?
13. Walk through exactly what happens internally when `add()` is called on a `CopyOnWriteArrayList`.
14. Why does `CopyOnWriteArrayList` never throw `ConcurrentModificationException`, even under heavy concurrent mutation?
15. Why is `CopyOnWriteArrayList` a poor choice for write-heavy workloads, in concrete terms of what happens internally?
16. Why does the `Iterator` returned by `CopyOnWriteArrayList` not support `remove()` or `set()`?
17. What is the difference between `ConcurrentLinkedQueue` and `LinkedBlockingQueue` in terms of blocking behavior?
18. Why is `size()` an expensive, approximate operation on `ConcurrentLinkedQueue`?
19. What is a `SynchronousQueue`, and why does it have zero capacity?
20. Why is a skip list used internally for `ConcurrentSkipListMap` instead of a Red-Black tree like `TreeMap` uses?
21. How would you choose between `ConcurrentHashMap` and `Collections.synchronizedMap(new HashMap<>())` for a given use case?
22. Can two threads writing to two different buckets of a `ConcurrentHashMap` ever block each other in Java 8+? Why or why not?
23. Why is `computeIfAbsent()` on `ConcurrentHashMap` considered safer than a manual `containsKey()` + `put()` sequence in a concurrent context?
24. What real-world symptom would you expect if you used a plain `HashMap` (instead of `ConcurrentHashMap`) under heavy concurrent writes, especially on a pre-Java-8 JVM?