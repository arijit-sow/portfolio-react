# Map Implementations in Java — Complete Notes

> **Topic:** `Map` Interface & Its Implementations
> **Level:** Beginner → Advanced (Interview Ready)

---

## Where `Map` Fits

```
            Map <K, V>              ← standalone root interface (NOT part of Collection)
                │
        AbstractMap <K, V>          ← abstract skeletal implementation
                │
 ┌──────────────┬────────────────┬─────────────────┬───────────────────┐
 │              │                │                 │                   │
HashMap    LinkedHashMap      TreeMap          Hashtable          ConcurrentHashMap
                │             (SortedMap,      (legacy,          (java.util.concurrent,
                │              NavigableMap)    synchronized)     thread-safe,
                │                                                 high concurrency)
         (extends HashMap)

```

`Map<K, V>` represents an object that maps **unique keys** to **values**. Recall (from the Collections Framework overview) that `Map` is a **separate root interface** — it does **not** extend `Collection`, because it stores key-value **associations**, not standalone elements. It exposes `Collection`-compatible **views** via `keySet()`, `values()`, and `entrySet()` for interoperability.

---

## Why Does `AbstractMap` (The Abstract Layer) Exist?

Just like `AbstractList` and `AbstractSet`, `AbstractMap<K, V>` is a **skeletal implementation** that follows the **Template Method design pattern** — it provides default, generic implementations of most `Map` methods, built on top of a small set of "primitive" operations a concrete subclass must supply.

### The Core Idea

`AbstractMap` implements almost everything (`toString()`, `equals()`, `hashCode()`, `containsKey()`, `containsValue()`, `get()`, `isEmpty()`, `size()`, `putAll()`) **generically in terms of just one thing**: `entrySet()`. As long as a subclass provides a working `entrySet()` (a `Set<Map.Entry<K,V>>` view of its data), `AbstractMap` can derive everything else by iterating that entry set.

```java
// Simplified idea of what AbstractMap gives you for free, using only entrySet():
public V get(Object key) {
    for (Map.Entry<K, V> entry : entrySet()) {
        if (Objects.equals(entry.getKey(), key)) {
            return entry.getValue();
        }
    }
    return null;
}

public boolean containsKey(Object key) {
    return get(key) != null;   // roughly — actual impl also checks null values properly
}
```

### Why & When It's Useful

When building a **custom `Map` implementation** — e.g., a read-only map backed by a config file, or a map backed by two parallel arrays for a memory-constrained embedded system — you typically only need to implement `entrySet()` (and `put()`/`remove()` if mutable), and you inherit **correct, consistent** `get()`, `containsKey()`, `toString()`, `equals()`, and `hashCode()` behavior for free, instead of re-deriving that logic yourself in every implementation.

```java
// A minimal custom read-only Map using AbstractMap
class FixedConfigMap extends AbstractMap<String, String> {
    private final String[] keys = {"env", "region"};
    private final String[] vals = {"production", "ap-south-1"};

    @Override
    public Set<Entry<String, String>> entrySet() {
        Set<Entry<String, String>> set = new LinkedHashSet<>();
        for (int i = 0; i < keys.length; i++) {
            set.add(new SimpleEntry<>(keys[i], vals[i]));
        }
        return set;
    }
}
```

```java
Map<String, String> config = new FixedConfigMap();
System.out.println(config.get("env"));          // "production" — works for free!
System.out.println(config.containsKey("region")); // true — works for free!
```

> **In short:** `AbstractMap` exists for the exact same reason `AbstractList`/`AbstractSet` do — to eliminate boilerplate, centralize shared logic in one place, and guarantee consistent behavior across every `Map` implementation, by deriving everything from a single core primitive (`entrySet()`).

Notably, `HashMap`, `LinkedHashMap`, and `TreeMap` all extend `AbstractMap` — but they **override** most of these generic methods with far more efficient, structure-specific implementations (e.g., `HashMap.get()` doesn't loop through `entrySet()` — it jumps straight to a bucket). `AbstractMap`'s generic versions exist as a _correctness fallback/baseline_, not necessarily what production-grade implementations actually run.

---

## `HashMap` — Internal Working (Deep Dive)

This is the **single most important internal-working topic** in the entire Collections Framework for interviews, so let's go step by step, from the ground up.

### 1. The Core Data Structure

Internally, `HashMap` maintains an array of **buckets**:

```java
transient Node<K,V>[] table;
```

Each `Node<K,V>` holds:

```java
static class Node<K,V> {
    final int hash;
    final K key;
    V value;
    Node<K,V> next;   // for chaining within the same bucket
}
```

The **default initial capacity** is **16** buckets, and it always grows in **powers of 2** (16 → 32 → 64 → 128...) — this is a deliberate design choice that makes bucket-index computation extremely fast (explained below).

### 2. What Happens When You Call `put(key, value)` — Step by Step

**Step 1 — Compute the hash.**
Java first calls `key.hashCode()`, then applies an internal **hash-spreading function** (also called "hash perturbation"):

```java
static final int hash(Object key) {
    int h;
    return (key == null) ? 0 : (h = key.hashCode()) ^ (h >>> 16);
}
```

This XORs the high 16 bits of the hash code into the low 16 bits. **Why?** Because the bucket index is ultimately computed using only the **lower bits** of the hash (see Step 2) — if two keys have hash codes that differ only in their higher bits, they'd collide into the same bucket without this spreading step. This significantly reduces collisions for real-world hash codes that often vary mostly in higher bits.

**Step 2 — Determine the bucket index.**

```java
index = (table.length - 1) & hash;
```

Since `table.length` is always a **power of 2**, `(length - 1)` produces a bitmask of all 1s (e.g., for length 16, `length - 1 = 15 = 0b1111`). ANDing the hash with this mask is **mathematically equivalent to `hash % length`**, but a **bitwise AND is much faster** than a modulo/division operation — this is precisely _why_ capacity is always kept a power of 2.

**Step 3 — Check the bucket.**

- If the bucket is **empty**, the new `Node` is placed there directly.
- If the bucket **already has entries** (a collision), Java walks the chain (linked list, or a tree — see below) and compares `hash` first (a cheap `int` comparison), then `.equals()` (only if hashes match), against each existing entry's key.
  - If a matching key is found → the **value is overwritten**, old value returned.
  - If no match → the new node is **appended to the end** of the chain (Java 8+ appends at the tail, not the head, unlike pre-Java-8 which prepended — this was changed to prevent certain resize-related infinite-loop bugs under concurrent access).

**Step 4 — Treeification (Java 8+ enhancement).**
If a single bucket's chain grows to **8 or more nodes** (`TREEIFY_THRESHOLD = 8`) **and** the table's total capacity is at least **64** (`MIN_TREEIFY_CAPACITY = 64`), that bucket's linked list is converted into a **balanced Red-Black Tree**. This changes worst-case lookup within that bucket from `O(n)` to `O(log n)`.

- If capacity is below 64, instead of treeifying, the table is simply **resized/doubled** first, since a small table with a long chain is more likely just under-sized rather than genuinely collision-heavy.
- If a treeified bucket later shrinks to **6 or fewer nodes** (`UNTREEIFY_THRESHOLD = 6`) — e.g., after removals — it's converted back into a plain linked list, since a tree has more overhead than it's worth for very few entries.

**Step 5 — Check the load factor and resize if needed.**

```java
if (++size > threshold) resize();
// threshold = capacity * loadFactor  (default: 16 * 0.75 = 12)
```

The **default load factor is `0.75`** — a carefully chosen balance:

- A **lower load factor** (e.g., 0.5) means more empty space, fewer collisions, faster lookups — but wastes memory and triggers resizes more often.
- A **higher load factor** (e.g., 0.9) saves memory but leads to more collisions and slower average lookups.
- `0.75` is the empirically-tested sweet spot balancing time and space costs, per the JDK's own documentation.

**Resizing** doubles the table's capacity and **rehashes every existing entry** into the new, larger table (`O(n)` operation) — but because resizes happen exponentially less often as the map grows, `put()` remains **amortized `O(1)`**.

> A clever Java 8 optimization during resize: because capacity always doubles, each old bucket's entries split into **at most two** new buckets (the "low" bucket at the same index, or the "high" bucket at `oldIndex + oldCapacity`) — determined by checking just **one extra bit** of the hash. This avoids recomputing full hashes for every entry during resize.

### 3. What Happens When You Call `get(key)`

1. Compute `hash(key)` the same way as `put()`.
2. Compute `index = (table.length - 1) & hash` to jump **directly** to the correct bucket — `O(1)`.
3. Walk the bucket's chain (or tree), comparing `hash` then `.equals()`, until a matching key is found, or the chain/tree is exhausted (`null` returned).

This is why `get()`/`put()`/`remove()` are described as **average `O(1)`** — in the ideal case (few/no collisions), it's a single hash computation + array index + one comparison. Worst case (Java 8+, heavily collided bucket) degrades gracefully to `O(log n)` instead of the pre-Java-8 worst case of `O(n)`.

### Visual Summary

```
put("apple", 10)
      │
      ▼
hash("apple") = 93029210  →  spread(93029210) = h
      │
      ▼
index = (16 - 1) & h  →  e.g., bucket 7
      │
      ▼
table[7]:  [ "apple"=10 ] → possibly chained → [next entry, same bucket]
                                    │
                        (if chain length ≥ 8 and capacity ≥ 64)
                                    ▼
                          converted to Red-Black Tree
```

### Why `hashCode()` and `equals()` Contract Matters SO Much Here

The **entire correctness** of `HashMap` depends on this contract:

> If two objects are `.equals()`, they **must** produce the same `hashCode()`.

If violated, two "equal" keys could land in **different buckets**, and `get()` would fail to find a value that was legitimately `put()` with an "equal" key — a subtle, painful bug.

```java
class Product {
    String sku;
    Product(String sku) { this.sku = sku; }

    @Override
    public boolean equals(Object o) {
        return o instanceof Product && sku.equals(((Product) o).sku);
    }
    @Override
    public int hashCode() {
        return sku.hashCode();   // MUST be consistent with equals()
    }
}
```

### Advantages

- **`O(1)` average** for `get()`, `put()`, `remove()`, `containsKey()`.
- No ordering overhead — fastest general-purpose key-value store.
- Graceful worst-case degradation (`O(log n)`) since Java 8, instead of `O(n)`.

### Disadvantages

- **No guaranteed iteration order** — can change across insertions, removals, or resizes.
- **Not thread-safe** — concurrent modification can corrupt internal structure or cause silent data loss (or, historically, infamous infinite loops during resize in pre-Java-8 versions under concurrent mutation).
- Allows **one `null` key** and multiple `null` values, which can sometimes hide bugs (`get()` returning `null` is ambiguous between "key absent" and "key present with null value" — must use `containsKey()` to disambiguate).

### Real-World Industry Example

A **caching layer** for frequently-accessed data — e.g., caching computed shipping costs keyed by `(pincode, weight)` combinations in a logistics platform, or caching user session objects keyed by `sessionId` in a web application — `HashMap` (or its thread-safe cousin `ConcurrentHashMap` in production) is the default choice whenever you need **fast key-based lookup** and don't care about order.

```java
Map<String, Session> sessionCache = new HashMap<>();
sessionCache.put(sessionId, session);
Session s = sessionCache.get(sessionId);   // O(1) average lookup
```

---

## `LinkedHashMap` — Insertion/Access-Ordered `HashMap`

### What It Is

`LinkedHashMap` extends `HashMap`, adding a **doubly linked list running through all entries**, preserving either **insertion order** (default) or **access order** (configurable), while retaining `HashMap`'s `O(1)` average lookup performance.

### Internal Working

Each entry, in addition to its normal hash-bucket placement (for `O(1)` lookup), also carries `before`/`after` pointers linking it into a separate ordering list. Iteration walks this **linked list**, not the raw bucket array — giving predictable ordering regardless of how entries are distributed across buckets internally.

```java
Map<String, Integer> insertionOrdered = new LinkedHashMap<>();
insertionOrdered.put("c", 3);
insertionOrdered.put("a", 1);
insertionOrdered.put("b", 2);
System.out.println(insertionOrdered);   // {c=3, a=1, b=2} — insertion order preserved
```

### Access-Order Mode — Building an LRU Cache

Passing `true` as the third constructor argument switches to **access order**: every `get()` (or `put()` on an existing key) moves that entry to the **end** of the iteration order, marking it as "most recently used."

```java
Map<Integer, String> lruCache = new LinkedHashMap<>(16, 0.75f, true) {
    @Override
    protected boolean removeEldestEntry(Map.Entry<Integer, String> eldest) {
        return size() > 3;   // evict oldest entry once capacity exceeds 3
    }
};
lruCache.put(1, "A");
lruCache.put(2, "B");
lruCache.put(3, "C");
lruCache.get(1);              // "A" is now most-recently-used
lruCache.put(4, "D");         // triggers eviction of "B" (least recently used)
System.out.println(lruCache); // {3=C, 1=A, 4=D}
```

This `removeEldestEntry()` hook is a purpose-built extension point specifically designed to make `LinkedHashMap` the **textbook standard way to implement an LRU cache** in Java — a very common system-design interview question.

### Real-World Industry Example

Besides LRU caching, `LinkedHashMap` (insertion-order mode) is used whenever a `Map`'s **display/serialization order must match input order** — e.g., building a JSON response where field order matters for a downstream consumer, or preserving the order in which a user filled out a multi-step form stored as key-value pairs.

---

## `TreeMap` — Sorted Map (Red-Black Tree)

### What It Is

`TreeMap` implements `SortedMap` and `NavigableMap`, maintaining keys in **sorted order** — natural ordering (`Comparable`) or a custom `Comparator`. It's the map that `TreeSet` is internally built on top of.

### Internal Working

`TreeMap` is directly implemented as a **self-balancing Red-Black Tree**, where each tree node stores a key-value pair. Unlike `HashMap`, there's no hashing or bucket array at all — every `put()`, `get()`, and `remove()` involves **comparing keys** (`compareTo()` or `Comparator`) while traversing down the tree, giving `O(log n)` guaranteed time complexity (not just average-case, unlike `HashMap`).

```java
Map<String, Integer> sortedScores = new TreeMap<>();
sortedScores.put("Riya", 90);
sortedScores.put("Aman", 75);
sortedScores.put("Neha", 85);
System.out.println(sortedScores);  // {Aman=75, Neha=85, Riya=90} — sorted by key
```

### `NavigableMap` Power Methods

```java
TreeMap<Integer, String> tm = new TreeMap<>();
tm.put(10, "ten"); tm.put(20, "twenty"); tm.put(30, "thirty");

tm.firstKey();          // 10
tm.lastKey();             // 30
tm.ceilingKey(15);        // 20 — smallest key >= 15
tm.floorKey(15);          // 10 — largest key <= 15
tm.headMap(20);           // {10=ten} — keys strictly less than 20
tm.tailMap(20);           // {20=twenty, 30=thirty} — keys >= 20
```

### Advantages

- Keys always sorted — no manual sorting needed.
- Guaranteed `O(log n)` worst case (more predictable than `HashMap`'s occasional collision-driven slowdowns).
- Rich range-query API (`headMap`, `tailMap`, `subMap`, `ceilingKey`, `floorKey`).

### Disadvantages

- Slower than `HashMap` for basic operations (`O(log n)` vs `O(1)` average).
- Keys must be mutually comparable — `null` keys are **not allowed**.

### Real-World Industry Example

A **time-series/event log store** keyed by timestamp, where you frequently need range queries like "give me all events between 9 AM and 10 AM" (`subMap()`), or an **interest-rate schedule** in a financial system where you look up the applicable rate tier via `floorKey(principalAmount)` — `TreeMap` is purpose-built for exactly these ordered/range-based lookup patterns.

---

## `Hashtable` — Legacy Synchronized Map

### What It Is

A **legacy** (pre-Java-1.2) synchronized key-value store, functionally similar to `HashMap` but with every method `synchronized`.

### Key Differences from `HashMap`

- Does **not allow `null` keys or `null` values** (throws `NullPointerException`).
- Coarse-grained locking — the **entire map is locked** for every operation, even reads, making it a serious bottleneck under concurrent load.

### Why It's Discouraged Today

Same story as `Vector`: superseded by better-designed alternatives. For thread safety, modern code uses `ConcurrentHashMap` (far better concurrency characteristics) or `Collections.synchronizedMap(new HashMap<>())` for simpler needs.

---

## `ConcurrentHashMap` — Modern Thread-Safe Map

### What It Is

Part of `java.util.concurrent`, designed for **high-concurrency** production systems — allows multiple threads to read and write **without locking the entire map**.

### Internal Working (High-Level)

- Unlike `Hashtable`'s single-lock-for-everything approach, `ConcurrentHashMap` (Java 8+) achieves fine-grained concurrency primarily via **CAS (Compare-And-Swap) operations** on individual bins, and **synchronizes only on the specific bucket/node being modified** (not the whole table) when a CAS-based update isn't sufficient (e.g., when appending to a bucket's chain).
- This means two threads writing to **different buckets** can proceed **truly in parallel**, with no blocking between them.
- Reads are largely **lock-free**, using `volatile` reads on the internal table, meaning readers generally never block, even while a write is in progress elsewhere in the table.
- Like `HashMap`, it also treeifies long bucket chains (Java 8+) for the same worst-case protection.

### Advantages

- Excellent read/write throughput under heavy concurrent access — far better than `Hashtable` or a manually-synchronized `HashMap`.
- No `ConcurrentModificationException` during iteration (iterators are weakly consistent — they reflect the state of the map at some point during iteration, not a hard snapshot, but never throw due to concurrent modification).

### Disadvantages

- Slightly more memory/CPU overhead than a plain `HashMap` for single-threaded use cases — don't reach for it unless you actually need concurrency.
- Does **not allow `null` keys or values** (specifically to avoid ambiguity in a concurrent context — a `null` return from `get()` must unambiguously mean "key not present," since another thread could be concurrently inserting).

### Real-World Industry Example

A **shared, in-memory rate-limiter or counter map** in a high-traffic web service — e.g., tracking `Map<String, AtomicInteger> requestCountsByIp`, updated by potentially thousands of concurrent request-handling threads per second — `ConcurrentHashMap` is the standard, production-grade choice here, since `HashMap` would corrupt under concurrent writes and `Hashtable`/`synchronizedMap` would create a severe bottleneck.

```java
Map<String, AtomicInteger> requestCounts = new ConcurrentHashMap<>();
requestCounts.computeIfAbsent(clientIp, k -> new AtomicInteger(0)).incrementAndGet();
```

---

## `Map` Implementations — Side-by-Side Comparison

| Aspect             | `HashMap`                   | `LinkedHashMap`                   | `TreeMap`             | `Hashtable`          | `ConcurrentHashMap`                 |
| ------------------ | --------------------------- | --------------------------------- | --------------------- | -------------------- | ----------------------------------- |
| Order              | None                        | Insertion/access order            | Sorted order          | None                 | None                                |
| `get`/`put`        | `O(1)` average              | `O(1)` average                    | `O(log n)` guaranteed | `O(1)` average       | `O(1)` average                      |
| Thread-safe?       | ❌ No                       | ❌ No                             | ❌ No                 | ✅ Yes (coarse lock) | ✅ Yes (fine-grained)               |
| Allows `null` key? | ✅ One                      | ✅ One                            | ❌ No                 | ❌ No                | ❌ No                               |
| Backed by          | Hash table + tree buckets   | Hash table + linked list          | Red-Black Tree        | Hash table           | Hash table (CAS + segment locks)    |
| Best for           | General-purpose fast lookup | Order-sensitive lookup, LRU cache | Sorted/range queries  | Legacy code only     | Concurrent, high-throughput systems |

---

## How to Iterate a `Map` — All the Ways

```java
Map<String, Integer> inventory = new LinkedHashMap<>();
inventory.put("Pen", 100);
inventory.put("Notebook", 50);
```

### 1. Iterate via `entrySet()` (most efficient — single pass, key+value together)

```java
for (Map.Entry<String, Integer> entry : inventory.entrySet()) {
    System.out.println(entry.getKey() + " -> " + entry.getValue());
}
```

### 2. Iterate via `keySet()` (if you only need keys, or will look up values separately)

```java
for (String key : inventory.keySet()) {
    System.out.println(key);
    // inventory.get(key) here would be a redundant extra lookup — prefer entrySet() if you need values too
}
```

### 3. Iterate via `values()` (if you only need values)

```java
for (int qty : inventory.values()) {
    System.out.println(qty);
}
```

### 4. `forEach()` with a lambda (Java 8+, cleanest for simple cases)

```java
inventory.forEach((key, value) -> System.out.println(key + " -> " + value));
```

### 5. Streams (Java 8+, functional-style processing)

```java
inventory.entrySet().stream()
         .filter(e -> e.getValue() > 60)
         .forEach(e -> System.out.println(e.getKey()));
```

### 6. `Iterator` on `entrySet()` (needed for safe removal during iteration)

```java
Iterator<Map.Entry<String, Integer>> it = inventory.entrySet().iterator();
while (it.hasNext()) {
    Map.Entry<String, Integer> entry = it.next();
    if (entry.getValue() < 60) {
        it.remove();   // ✅ safe removal from the underlying map, via the entrySet view
    }
}
```

> ⚠️ **Performance tip:** always prefer `entrySet()` over `keySet()` + `get(key)` when you need both keys and values — the latter performs a **redundant second lookup** per entry, doubling the hashing/traversal work unnecessarily.

---

## Quick Decision Guide — Which `Map` Should You Use?

| Requirement                                     | Best Choice                         |
| ----------------------------------------------- | ----------------------------------- |
| Fast general-purpose key-value lookup           | `HashMap`                           |
| Need predictable insertion order                | `LinkedHashMap`                     |
| Building an LRU cache                           | `LinkedHashMap` (access-order mode) |
| Need sorted keys / range queries                | `TreeMap`                           |
| Thread-safe, high-concurrency production system | `ConcurrentHashMap`                 |
| Legacy codebase constraint only                 | `Hashtable` (otherwise avoid)       |

---

## Interview Questions

1. Why does `AbstractMap` only require `entrySet()` to be implemented, and how does it derive everything else from it?
2. Walk through, step by step, exactly what happens internally when you call `hashMap.put(key, value)`.
3. Why does `HashMap` apply a hash-spreading function (`h ^ (h >>> 16)`) instead of using `hashCode()` directly?
4. Why is `HashMap`'s capacity always a power of 2, and how does that relate to computing the bucket index?
5. What is the default load factor of `HashMap`, and why is `0.75` chosen instead of `0.5` or `1.0`?
6. What happens internally when a `HashMap` resizes — how are old entries redistributed into the new table?
7. What is treeification, what triggers it, and why does it also require a minimum table capacity of 64?
8. Why did Java 8 change collision-chain insertion from head-insertion to tail-insertion?
9. What could go wrong if two objects are `.equals()` but have different `hashCode()` values, when used as `HashMap` keys?
10. Why does `HashMap.get()` returning `null` create ambiguity, and how do you resolve it correctly?
11. How does `LinkedHashMap` maintain insertion order internally while still offering `O(1)` average lookup?
12. How would you implement an LRU cache using `LinkedHashMap`, and what method makes this possible?
13. Why does `TreeMap` guarantee `O(log n)` in the _worst_ case, while `HashMap` only guarantees `O(1)` on _average_?
14. Why can't `TreeMap` have a `null` key, but `HashMap` can?
15. How does `ConcurrentHashMap` in Java 8+ achieve high concurrency without a single global lock, unlike `Hashtable`?
16. Why does `ConcurrentHashMap` disallow `null` keys and values, when `HashMap` allows them?
17. What is a "weakly consistent" iterator, and how does `ConcurrentHashMap`'s iterator behave differently from `HashMap`'s fail-fast iterator?
18. Why is iterating via `keySet()` + `get(key)` considered less efficient than iterating via `entrySet()`?
19. What's the difference between `HashMap` and `Hashtable` beyond just "one is synchronized"?
20. If you mutate a key object's fields (used in `hashCode()`) after inserting it into a `HashMap`, what breaks, and why?
21. How would you make a `HashMap` thread-safe without switching to `ConcurrentHashMap`, and what's the trade-off?
22. Internally, why is a Red-Black Tree chosen over a plain Binary Search Tree for `TreeMap`'s implementation?
