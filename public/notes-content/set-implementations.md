# Set Implementations in Java — Complete Notes

> **Topic:** `Set` Interface & Its Implementations
> **Level:** Beginner → Advanced (Interview Ready)

---

## Where `Set` Fits

```
Iterable<E>
    │
Collection<E>
    │
  Set<E>                           ← interface: NO duplicates, models a mathematical set
    │
AbstractSet<E>                     ← abstract skeletal implementation
    │
 ┌──────────────┬───────────────────┬─────────────────┐
 │              │                    │                 │
HashSet     LinkedHashSet         TreeSet           EnumSet
 (extends AbstractSet)                │        (implements SortedSet, NavigableSet)
                                                (abstract, specialized for enums)

```

`Set<E>` is a sub-interface of `Collection<E>` that **models the mathematical concept of a set**:

- **No duplicate elements** — adding an element that's already present is silently ignored (`add()` returns `false`).
- **At most one `null` element** is allowed (implementation-dependent — `TreeSet` doesn't allow `null` at all unless a custom comparator handles it).
- Does **not guarantee positional/index-based access** — there's no `get(index)` method, unlike `List`.

---

## Why Does `AbstractSet` Exist?

Just like `AbstractList` for `List`, `AbstractSet<E>` is a **skeletal implementation** that provides default logic for methods that can be derived generically — most notably `equals()` and `hashCode()` for the _set itself_ (two sets are equal if they have the same size and the same elements, regardless of order), plus `removeAll()`.

`AbstractSet` itself actually extends `AbstractCollection`, inheriting most of the heavy lifting (`iterator()`, `contains()`, `toString()`, bulk operations) from there, and only **overrides `equals()`/`hashCode()`** to reflect proper _set semantics_ (order-independent equality) instead of `Collection`'s generic behavior.

### Why & When It Matters

If you ever build a **custom `Set` implementation** — say, a specialized set backed by a bitmask for a fixed small universe of values (common in performance-critical systems, e.g., representing a set of feature flags as bits) — extending `AbstractSet` means you only need to implement `iterator()`, `size()`, and `contains()`, and you get **correct, consistent `equals()`/`hashCode()` behavior for free**, without duplicating that logic.

```java
class BitFlagSet extends AbstractSet<Integer> {
    private int bits = 0;

    @Override
    public boolean add(Integer e) {
        int mask = 1 << e;
        boolean changed = (bits & mask) == 0;
        bits |= mask;
        return changed;
    }

    @Override
    public boolean contains(Object o) {
        return (bits & (1 << (Integer) o)) != 0;
    }

    @Override
    public Iterator<Integer> iterator() {
        List<Integer> present = new ArrayList<>();
        for (int i = 0; i < 32; i++) if ((bits & (1 << i)) != 0) present.add(i);
        return present.iterator();
    }

    @Override
    public int size() {
        return Integer.bitCount(bits);
    }
}
```

---

## `HashSet` — Hash-Table Backed, Unordered

### What It Is

`HashSet` is the most commonly used `Set` implementation. It offers **no guarantee of iteration order** and provides **average `O(1)`** performance for `add()`, `remove()`, and `contains()`.

### Internal Working (The Most Important Interview Detail)

> **`HashSet` is internally just a `HashMap<E, Object>`.** Every element you add becomes a **key** in a backing `HashMap`, and every key is mapped to a shared dummy constant value:

```java
// Simplified real JDK source concept:
private transient HashMap<E, Object> map;
private static final Object PRESENT = new Object();

public boolean add(E e) {
    return map.put(e, PRESENT) == null;
}
```

So understanding `HashSet` really means understanding `HashMap`'s internals:

1. **Hashing**: When you call `add(element)`, Java computes `element.hashCode()`, then applies an internal **hash-spreading function** to reduce collisions, and uses the result to determine which **bucket** (index in the internal array) the element goes into.
2. **Bucket storage**: Each bucket is conceptually a **linked list** of entries that hashed to the same index (handling **collisions**). Since **Java 8**, if a single bucket accumulates **too many entries** (default threshold: 8) _and_ the overall table is sufficiently large, that bucket is **treeified** into a **balanced Red-Black Tree** instead of a linked list — turning worst-case `O(n)` lookups within a bad bucket into `O(log n)`.
3. **Equality check**: When adding, Java first finds the correct bucket via `hashCode()`, then **within that bucket**, uses `.equals()` to check if an equivalent element already exists, before deciding to insert or skip.
4. **Load Factor & Resizing**: `HashSet`/`HashMap` maintains a **load factor** (default `0.75`). When `size > capacity × loadFactor`, the internal array is **resized** (typically doubled) and **all existing entries are rehashed** into new bucket positions — an expensive `O(n)` operation, but infrequent, giving amortized `O(1)` inserts.

```java
Set<String> tags = new HashSet<>();
tags.add("Java");     // hashCode computed → bucket assigned
tags.add("Java");     // same hashCode+equals → ignored, size stays 1
```

> ⚠️ **Critical rule:** for `HashSet` (and any hash-based structure) to work correctly, any custom object added **must properly override both `hashCode()` and `equals()`**. If you don't, two "logically equal" objects will be treated as distinct because they hash differently or fail reference-based equality by default.

```java
class User {
    String email;
    User(String email) { this.email = email; }

    @Override
    public boolean equals(Object o) {
        if (!(o instanceof User)) return false;
        return email.equals(((User) o).email);
    }
    @Override
    public int hashCode() {
        return email.hashCode();
    }
}
```

Without this override, `new User("a@x.com")` and another `new User("a@x.com")` would be treated as **two different elements** in a `HashSet`, since default `Object.equals()`/`hashCode()` are based on memory reference, not content.

### Advantages

- **`O(1)` average time** for `add()`, `remove()`, `contains()` — fastest general-purpose `Set`.
- Efficient memory usage relative to tree-based structures.

### Disadvantages

- **No guaranteed order** — iteration order can even change across JVM runs or after rehashing.
- Performance can degrade to `O(n)` (or `O(log n)` post-Java-8 treeification) in the presence of many hash collisions.
- Requires correct `hashCode()`/`equals()` implementation on custom objects — a very common source of subtle bugs.

### Real-World Industry Example

**Deduplicating a list of user IDs** who clicked on an ad, before sending to an analytics/billing service (advertisers are billed per **unique** click, not total clicks):

```java
Set<String> uniqueClickers = new HashSet<>();
for (ClickEvent event : incomingEvents) {
    uniqueClickers.add(event.getUserId());   // duplicates auto-ignored
}
billingService.chargeForUniqueClicks(uniqueClickers.size());
```

---

## `LinkedHashSet` — Insertion-Ordered `HashSet`

### What It Is

`LinkedHashSet` extends `HashSet` and additionally maintains a **doubly linked list running through all entries**, preserving **insertion order** during iteration — while still getting `HashSet`'s `O(1)` average lookup performance.

### Internal Working

Internally backed by a `LinkedHashMap<E, Object>` (same `PRESENT`-dummy-value trick as `HashSet`/`HashMap`). Each entry in the map, beyond its normal hash-bucket placement, **also carries `before`/`after` pointers** linking it into a separate ordering-preserving linked list — so hashing still determines bucket placement (for `O(1)` lookup), but iteration walks the **linked list**, not the bucket array, giving predictable insertion-order traversal.

```java
Set<String> visitedPages = new LinkedHashSet<>();
visitedPages.add("Home");
visitedPages.add("Cart");
visitedPages.add("Home");     // duplicate ignored — order/position unaffected
visitedPages.add("Checkout");

System.out.println(visitedPages);  // [Home, Cart, Checkout] — insertion order preserved
```

### Advantages

- Combines `HashSet`'s speed with **predictable, insertion-order iteration**.
- Slightly more overhead per entry than `HashSet` (due to the extra `before`/`after` pointers), but still `O(1)` average for core operations.

### Disadvantages

- Slightly higher memory footprint than plain `HashSet` (extra linked-list pointers per node).
- Still no _sorted_ order — only _insertion_ order (for sorting, you need `TreeSet`).

### Real-World Industry Example

**Displaying a list of unique tags/categories a user has browsed**, in the exact order they first encountered them (e.g., a "recently explored categories" widget on an e-commerce homepage) — you need uniqueness (no repeated categories) **and** a predictable, meaningful display order, which plain `HashSet` cannot guarantee.

---

## `TreeSet` — Sorted Set (Red-Black Tree)

### What It Is

`TreeSet` implements `SortedSet` and `NavigableSet`, maintaining elements in **sorted order** at all times — either their **natural ordering** (via `Comparable`) or a custom order (via a supplied `Comparator`).

### Internal Working

`TreeSet` is internally backed by a `TreeMap<E, Object>` (again using the same dummy-value trick), which itself is implemented as a **self-balancing binary search tree — specifically a Red-Black Tree**.

- Every `add()`, `remove()`, and `contains()` operation involves **tree traversal/comparison** using `compareTo()` (or the provided `Comparator`) — `O(log n)` time complexity, because the tree self-balances to guarantee logarithmic height regardless of insertion order.
- Elements are always kept in sorted order **as a side effect of tree structure** — an **in-order traversal** of the tree naturally yields elements in sorted sequence, which is exactly how iteration works.
- Because ordering is comparison-based (not hash-based), `TreeSet` **does not allow `null` elements** (comparing `null` throws `NullPointerException`), and any custom object stored must implement `Comparable`, or a `Comparator` must be supplied at construction.

```java
Set<Integer> scores = new TreeSet<>();
scores.add(90);
scores.add(45);
scores.add(70);
System.out.println(scores);   // [45, 70, 90] — always sorted, regardless of insertion order
```

```java
// Custom sorting with a Comparator
Set<String> byLengthThenAlpha = new TreeSet<>(
    Comparator.comparingInt(String::length).thenComparing(Comparator.naturalOrder())
);
byLengthThenAlpha.add("banana");
byLengthThenAlpha.add("fig");
byLengthThenAlpha.add("kiwi");
System.out.println(byLengthThenAlpha);  // [fig, kiwi, banana]
```

### Bonus: `NavigableSet` Methods

`TreeSet` provides powerful navigation methods beyond a plain sorted iteration:

```java
TreeSet<Integer> ts = new TreeSet<>(List.of(10, 20, 30, 40));
ts.first();          // 10 — smallest
ts.last();            // 40 — largest
ts.ceiling(25);       // 30 — smallest element >= 25
ts.floor(25);         // 20 — largest element <= 25
ts.headSet(30);       // [10, 20] — elements strictly less than 30
ts.tailSet(30);       // [30, 40] — elements >= 30
```

### Advantages

- Always maintains **sorted order** automatically — no manual sorting needed.
- Powerful **range-query methods** (`headSet`, `tailSet`, `ceiling`, `floor`, etc.) not available in `HashSet`/`LinkedHashSet`.
- Guaranteed `O(log n)` for core operations — predictable even in worst case (unlike `HashSet`'s potential collision degradation).

### Disadvantages

- **Slower than `HashSet`** for basic add/remove/contains — `O(log n)` vs `O(1)` average.
- Requires elements to be **mutually comparable** (`Comparable` or `Comparator`), adding a design constraint.
- Does **not allow `null`**.

### Real-World Industry Example

A **leaderboard system** in a gaming platform that needs to always display players **sorted by score**, and frequently needs range queries like "show me all players with a score between 8000 and 9000" (`subSet()`) or "who's just above/below this player" (`higher()`/`lower()`) — `TreeSet` is purpose-built for exactly this.

```java
TreeSet<Player> leaderboard = new TreeSet<>(Comparator.comparingInt(Player::getScore).reversed());
leaderboard.add(new Player("Aman", 9500));
leaderboard.add(new Player("Riya", 8700));
Player topPlayer = leaderboard.first();   // O(log n) — always the current leader
```

---

## `EnumSet` — Specialized High-Performance Set for Enums

### What It Is

`EnumSet` is an abstract class (with package-private implementations `RegularEnumSet`/`JumboEnumSet` chosen automatically) designed **exclusively for use with enum types**, offering extremely fast, compact operations.

### Internal Working

Internally represented as a **bit vector** — each enum constant corresponds to a single bit in a `long` (or an array of `long`s for enums with more than 64 constants). Set operations (`add`, `contains`, union, intersection) become simple, extremely fast **bitwise operations**.

```java
enum Day { MON, TUE, WED, THU, FRI, SAT, SUN }

EnumSet<Day> weekdays = EnumSet.range(Day.MON, Day.FRI);
EnumSet<Day> weekend = EnumSet.of(Day.SAT, Day.SUN);
EnumSet<Day> allDays = EnumSet.allOf(Day.class);
```

### Advantages

- **Extremely fast and memory-compact** — far more efficient than `HashSet<EnumType>` for enum-based flag sets.
- Iterates in the enum's **natural declaration order**.

### Real-World Industry Example

Representing a **set of permissions/roles** a user has (`EnumSet<Permission>` — `READ`, `WRITE`, `DELETE`, `ADMIN`), or **feature flags** for a service — enum-based sets are common in access-control and configuration systems where the domain is a small, fixed set of constants.

---

## `Set` Implementations — Side-by-Side Comparison

| Aspect                    | `HashSet`              | `LinkedHashSet`            | `TreeSet`                  | `EnumSet`                          |
| ------------------------- | ---------------------- | -------------------------- | -------------------------- | ---------------------------------- |
| Backed by                 | `HashMap`              | `LinkedHashMap`            | `TreeMap` (Red-Black Tree) | Bit vector                         |
| Order                     | None (unpredictable)   | Insertion order            | Sorted order               | Enum declaration order             |
| `add`/`remove`/`contains` | `O(1)` average         | `O(1)` average             | `O(log n)`                 | `O(1)` (bitwise)                   |
| Allows `null`?            | One `null` allowed     | One `null` allowed         | ❌ No                      | ❌ No (enums can't be null anyway) |
| Requires `Comparable`?    | No                     | No                         | ✅ Yes (or Comparator)     | N/A                                |
| Use case                  | Fast uniqueness checks | Uniqueness + display order | Sorted/range operations    | Enum-based flags/roles             |

---

## How to Iterate a `Set` — All the Ways

```java
Set<String> languages = new LinkedHashSet<>(List.of("Java", "Python", "Go"));
```

### 1. Enhanced for-each (most common — uses `Iterator` internally)

```java
for (String lang : languages) {
    System.out.println(lang);
}
```

### 2. Explicit `Iterator` (needed for safe removal during iteration)

```java
Iterator<String> it = languages.iterator();
while (it.hasNext()) {
    String lang = it.next();
    if (lang.equals("Go")) {
        it.remove();   // ✅ safe — avoids ConcurrentModificationException
    }
}
```

### 3. `forEach()` with lambda (Java 8+)

```java
languages.forEach(lang -> System.out.println(lang));
```

### 4. Streams (Java 8+)

```java
languages.stream()
         .filter(lang -> lang.startsWith("J"))
         .forEach(System.out::println);
```

> ⚠️ There is **no `ListIterator`, and no index-based loop** for `Set` — since `Set` has no positional access (`get(index)` doesn't exist on `Set`). Any attempt to iterate "by index" would require first converting to a `List` (`new ArrayList<>(mySet)`), which forfeits the ordering guarantees of the original set type.

---

## Quick Decision Guide — Which `Set` Should You Use?

| Requirement                                  | Best Choice                                              |
| -------------------------------------------- | -------------------------------------------------------- |
| Fast uniqueness checks, order doesn't matter | `HashSet`                                                |
| Uniqueness + preserve insertion order        | `LinkedHashSet`                                          |
| Uniqueness + always sorted / range queries   | `TreeSet`                                                |
| Small, fixed domain of enum constants        | `EnumSet`                                                |
| Thread-safe uniqueness, read-heavy           | `Collections.synchronizedSet()` or `CopyOnWriteArraySet` |

---

## Interview Questions

1. Why does `HashSet` internally use a `HashMap`, and what value gets stored against each key?
2. What role does `hashCode()` play in determining where an element lands inside a `HashSet`?
3. What happens if you add an object to a `HashSet` without properly overriding `equals()` and `hashCode()`?
4. What is a hash collision, and how does `HashSet` handle it internally, both before and after Java 8?
5. What is "treeification" of a bucket in Java 8+, and what threshold triggers it?
6. What is the default load factor of a `HashSet`, and why was `0.75` chosen as a balance?
7. How does `LinkedHashSet` maintain insertion order while still offering `O(1)` average lookup?
8. Internally, what extra fields does each entry in a `LinkedHashSet` carry compared to a plain `HashSet` entry?
9. Why is `TreeSet`'s time complexity `O(log n)` instead of `O(1)`, and why is that actually a _feature_, not just a limitation?
10. Why does `TreeSet` not allow `null` elements, while `HashSet` allows one?
11. What's the difference between `Comparable` and `Comparator`, and how does `TreeSet` use each?
12. What underlying data structure powers `TreeSet`, and why is a self-balancing tree necessary instead of a plain BST?
13. How would you retrieve the second-largest element from a `TreeSet` efficiently?
14. Why is `EnumSet` implemented as a bit vector, and how does that make its operations so fast?
15. Can two different `HashSet` instances be `.equals()` to each other even if elements were added in a completely different order? Why?
16. What is the time and space complexity trade-off between `HashSet` and `TreeSet`, and how would you decide between them in a system design interview?
17. Why is there no `get(index)` method on `Set`, and what would you do if you needed positional access to set elements?
18. How does `Set.of(...)` (Java 9+ immutable set factory) differ internally from a regular mutable `HashSet`?
19. What happens if you mutate an object's fields (that are used in `hashCode()`) _after_ inserting it into a `HashSet`?
20. How would you efficiently find the intersection, union, and difference of two `HashSet`s using built-in methods?
