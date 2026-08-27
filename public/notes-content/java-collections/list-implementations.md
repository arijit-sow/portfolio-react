# List Implementations in Java — Complete Notes

> **Topic:** `List` Interface & Its Implementations

---

## Where `List` Fits

```
            Iterable<E>
                │
            Collection<E>
                │
            List<E>             ← interface: ordered, allows duplicates, index-based
                │
            AbstractList<E>     ← abstract skeletal implementation
                │
 ┌──────────────┬────────────────┬────────────────┐
 │              │                │                │
ArrayList   LinkedList         Vector          CopyOnWriteArrayList
            (also Deque)         │             (java.util.concurrent)
                               Stack

```

`List<E>` is a **sub-interface of `Collection<E>`** that represents an **ordered collection** (a sequence) which:
- Maintains **insertion order**.
- Allows **duplicate elements**.
- Provides **positional (index-based) access** — `get(int index)`, `set(int index, E element)`, `add(int index, E element)`.
- Allows searching by position — `indexOf()`, `lastIndexOf()`.

---

## Why Does `AbstractList` (The Abstract Layer) Exist?

This is a design-pattern-level question, and it's important to understand **why** Java doesn't just let every class directly implement `List`.

### The Problem Without an Abstract Layer
`List<E>` declares **dozens of methods** — `add()`, `remove()`, `get()`, `set()`, `indexOf()`, `contains()`, `subList()`, `iterator()`, `listIterator()`, and more. If every new `List` implementation had to implement **all of these from scratch**, it would mean:
- Massive **boilerplate duplication** across `ArrayList`, `LinkedList`, custom lists, etc.
- Many of these methods (like `contains()`, `indexOf()`, `toString()`) can actually be written **generically** in terms of just a few "primitive" operations (`get(index)` and `size()`), so writing them repeatedly is wasteful and error-prone.

### The Solution: `AbstractList` (Skeletal Implementation / Template Method Pattern)
`AbstractList<E>` provides a **default, generic implementation** of most `List` methods, built on top of just a **small set of core abstract methods** that a concrete subclass must supply (mainly `get(int index)` and `size()`, and `set()`/`add()`/`remove()` if the list is meant to be modifiable).

```java
// Simplified idea of what AbstractList gives you for free:
public boolean contains(Object o) {
    return indexOf(o) >= 0;          // built generically using indexOf()
}
public int indexOf(Object o) {
    // built generically by looping with get(i) and size()
    for (int i = 0; i < size(); i++) {
        if (o.equals(get(i))) return i;
    }
    return -1;
}
```

This is a textbook example of the **Template Method design pattern** — the abstract class defines the *algorithm skeleton*, and concrete subclasses fill in only the *specific* pieces that genuinely differ.

### Why & When It's Actually Useful
- **When building a custom `List` implementation** (e.g., a specialized read-only list backed by a database cursor, or a fixed-size array-backed list), you don't need to reimplement all ~25 methods of the `List` interface — you extend `AbstractList` and typically only override `get(int index)` and `size()` for a read-only list, and it inherits fully working `iterator()`, `contains()`, `indexOf()`, `toString()`, `equals()`, etc. for free.
- It **reduces the effort to implement `List`** dramatically and ensures **consistent behavior** across implementations, since shared logic lives in one place instead of being reimplemented (and potentially bugged) in every subclass.

```java
// A minimal custom immutable List using AbstractList
class FixedRangeList extends AbstractList<Integer> {
    private final int start, end;
    FixedRangeList(int start, int end) { this.start = start; this.end = end; }

    @Override
    public Integer get(int index) {
        if (index < 0 || index >= size()) throw new IndexOutOfBoundsException();
        return start + index;
    }

    @Override
    public int size() { return end - start; }
}
```
```java
List<Integer> range = new FixedRangeList(1, 5);   // represents [1, 2, 3, 4]
System.out.println(range.contains(3));             // true — works for free, via AbstractList!
System.out.println(range.indexOf(4));               // 3 — works for free too!
for (int n : range) System.out.println(n);          // iteration also works for free!
```

> **In short:** `AbstractList` exists to **eliminate boilerplate** and give a consistent, correct default behavior to anyone building a new `List` implementation, following the classic *"provide the skeleton, let subclasses fill in the specifics"* design.

---

## `ArrayList` — Dynamic, Resizable Array

### What It Is
`ArrayList` is backed by a **dynamically resizable array**. It's the **most commonly used** `List` implementation because it offers fast random access and good general-purpose performance.

### Internal Working
- Internally, `ArrayList` maintains an `Object[] elementData` array.
- When you create `new ArrayList<>()` with no arguments, an **empty array** is allocated initially (actual allocation is deferred/lazy until the first element is added — it starts with a shared empty array instance and grows to a default capacity, historically 10, on first insertion).
- **Adding an element** (`add()`): if there's spare capacity, it's placed directly at `elementData[size++]` — an `O(1)` operation.
- **When the array is full** and a new element is added, `ArrayList` **grows**:
  1. A **new, larger array** is allocated — typically **1.5× the current capacity** (`newCapacity = oldCapacity + (oldCapacity >> 1)`).
  2. All existing elements are **copied** into the new array using `System.arraycopy()` (a fast, native bulk-copy operation).
  3. The old array becomes eligible for garbage collection.
  - This resize operation is `O(n)`, but because it happens **infrequently** (capacity grows geometrically, not by 1 each time), the **amortized cost of `add()` is O(1)**.
- **Insertion/removal at a specific index** (not at the end) requires **shifting all subsequent elements** by one position (`System.arraycopy` internally) — this is `O(n)`.
- **`get(index)` / `set(index, val)`** are direct array-index accesses — `O(1)`, since arrays support constant-time random access.

```java
List<String> list = new ArrayList<>();   // capacity 0 initially, grows to 10 on first add
list.add("A");   // O(1) amortized
list.add(0, "Z"); // O(n) — shifts "A" one position to the right
```

### Advantages
- **Fast random access** — `get()`/`set()` are `O(1)`.
- **Memory efficient** relative to linked structures (no per-element pointer overhead).
- **Cache-friendly** — contiguous memory layout means better CPU cache locality, making iteration fast in practice.
- Good default choice for **read-heavy** workloads.

### Disadvantages
- **Slow insertions/deletions in the middle or beginning** — `O(n)` due to shifting.
- **Resizing overhead** — occasional `O(n)` cost when capacity is exceeded (though amortized `O(1)`).
- **Not synchronized** — not thread-safe by default; needs external synchronization (`Collections.synchronizedList()`) or a concurrent alternative in multi-threaded contexts.

### Real-World Industry Example
A **product listing page** in an e-commerce app: products are fetched from an API and displayed in a scrollable list on the UI. The app mostly **reads/displays** items by index and rarely inserts in the middle — `ArrayList` (or its Android equivalent) is the natural fit due to fast indexed access and iteration performance.

```java
List<Product> products = productService.fetchAllProducts();
for (Product p : products) {
    render(p);   // fast sequential access
}
Product firstItem = products.get(0);   // O(1) direct access
```

---

## `LinkedList` — Doubly Linked List

### What It Is
`LinkedList` implements both `List` and `Deque`. It's backed by a **doubly linked list** of nodes rather than a contiguous array.

### Internal Working
- Each element is wrapped in an internal `Node<E>` object with three fields:
  ```java
  private static class Node<E> {
      E item;
      Node<E> next;
      Node<E> prev;
  }
  ```
- The `LinkedList` object itself only keeps references to the **`first`** (head) and **`last`** (tail) nodes.
- **Adding to the front or back** (`addFirst()`/`addLast()`): just create a new node and re-link a couple of pointers — `O(1)`, no shifting needed, no resizing needed.
- **Adding/removing at an arbitrary index**: the list must first be **traversed** from either the head or tail (whichever is closer) to reach that index — `O(n)` traversal, but the actual insertion/removal itself, once there, is `O(1)` pointer re-linking.
- **`get(index)`**: also requires traversal from the nearest end — `O(n)`. There is **no direct random access**, unlike arrays.
- No resizing/copying ever happens — memory grows/shrinks one node at a time.

```java
LinkedList<String> list = new LinkedList<>();
list.addFirst("B");     // O(1) — just pointer updates
list.addFirst("A");     // O(1)
list.addLast("C");      // O(1)
// A <-> B <-> C  (doubly linked)
```

### Advantages
- **Fast insertions/deletions at both ends** — `O(1)` for `addFirst()`, `addLast()`, `removeFirst()`, `removeLast()`.
- No resizing/copying cost — grows one node at a time.
- Naturally supports use as a **Queue, Deque, or Stack** (via `offer()`, `poll()`, `push()`, `pop()`).

### Disadvantages
- **Slow random access** — `get(index)` is `O(n)` since it must traverse from an end.
- **Higher memory overhead per element** — each node stores two extra object references (`next`, `prev`) in addition to the actual data, unlike a compact array.
- **Poor cache locality** — nodes are scattered across heap memory (not contiguous), which is slower in practice for iteration compared to `ArrayList`, despite both being "theoretically O(n)."

### Real-World Industry Example
A **"recently viewed items" / browser history-like feature**, or a **music playlist with next/previous navigation**: items are frequently added/removed from the front or back (most recent item pushed to front, oldest dropped from back), and you frequently need `addFirst()`/`removeLast()`-style operations rather than random indexed access — `LinkedList` (used as a `Deque`) is a strong natural fit.

```java
Deque<String> recentlyViewed = new LinkedList<>();
recentlyViewed.addFirst("Product_101");   // most recent goes to front
if (recentlyViewed.size() > 10) {
    recentlyViewed.removeLast();          // evict oldest — O(1)
}
```

### `ArrayList` vs `LinkedList` — Side by Side

| Operation | `ArrayList` | `LinkedList` |
|---|---|---|
| Get by index | `O(1)` | `O(n)` |
| Add/remove at end | `O(1)` amortized | `O(1)` |
| Add/remove at beginning | `O(n)` | `O(1)` |
| Add/remove in middle | `O(n)` (shift) | `O(n)` (traverse) + `O(1)` (relink) |
| Memory overhead | Low (just data) | Higher (data + 2 pointers/node) |
| Cache locality | Good (contiguous) | Poor (scattered nodes) |
| Best for | Frequent reads/random access | Frequent insert/delete at ends, queue/stack behavior |

---

## `Vector` — Legacy Synchronized List

### What It Is
`Vector` is functionally almost identical to `ArrayList` (dynamic resizable array, `O(1)` random access) but every method is **`synchronized`**, making it **thread-safe** — at the cost of performance.

### Internal Working
Same array-based mechanism as `ArrayList`, except growth is typically **2× the current capacity** by default (unless a custom growth increment is specified) rather than `ArrayList`'s 1.5×.

### Advantages
- Thread-safe out of the box (every method synchronized).

### Disadvantages
- **Synchronization overhead** even in single-threaded contexts — you pay a locking cost on every operation whether you need it or not.
- Coarse-grained locking (whole-method synchronization) is inefficient compared to modern concurrent alternatives.
- Considered **legacy** — Oracle's own docs recommend `ArrayList` (with external synchronization if needed) or `CopyOnWriteArrayList` / `Collections.synchronizedList()` instead.

### Real-World Note
You'll rarely see `Vector` chosen in new code today — it mostly survives in **legacy codebases** predating Java 5's `java.util.concurrent` package. Modern concurrent applications reach for `CopyOnWriteArrayList` (read-heavy, low-mutation concurrent scenarios) instead.

---

## `Stack` — Legacy LIFO Structure

### What It Is
`Stack` extends `Vector` and adds LIFO (Last-In-First-Out) operations: `push()`, `pop()`, `peek()`.

```java
Stack<Integer> stack = new Stack<>();
stack.push(1);
stack.push(2);
System.out.println(stack.pop());   // 2 — last one in, first one out
```

### Why It's Considered Legacy
Since `Stack` extends `Vector`, it inherits **all** of `Vector`'s index-based, synchronized-array behavior — semantically messy for a "stack," which shouldn't really expose `get(index)` or `insertElementAt()`. The Java documentation itself recommends using **`ArrayDeque`** instead for stack behavior in modern code — it's faster (no synchronization overhead) and has a cleaner, purpose-built API (`push()`, `pop()`, `peek()`).

```java
Deque<Integer> modernStack = new ArrayDeque<>();
modernStack.push(1);
modernStack.push(2);
System.out.println(modernStack.pop());   // 2 — preferred modern approach
```

### Real-World Industry Example
**Undo/redo functionality** in an editor (text editor, design tool): every action pushed onto a stack; "undo" pops the most recent action off. Modern implementations use `ArrayDeque` rather than the legacy `Stack` class.

---

## `CopyOnWriteArrayList` — Concurrent-Safe List

### What It Is
Part of `java.util.concurrent`. On **every write operation** (`add`, `remove`, `set`), it creates a **fresh copy of the entire underlying array**, applies the change to the copy, and then atomically swaps the internal reference to point to the new array.

### Why It Exists
- Designed for scenarios with **many concurrent reads and rare writes**.
- **Reads never block** and never throw `ConcurrentModificationException`, because iterators operate on a **snapshot** of the array at the time the iterator was created — even if another thread modifies the list concurrently.

### Advantages
- Thread-safe without needing explicit locking for reads.
- No `ConcurrentModificationException` during iteration, even under concurrent mutation.

### Disadvantages
- **Expensive writes** — every single write copies the entire array (`O(n)`), making it a poor fit for write-heavy workloads.
- Higher memory churn due to repeated full-array copying.

### Real-World Industry Example
A **list of event listeners/observers** in an application (e.g., subscribers to a notification event) — listeners are registered rarely (writes are infrequent) but the list is **iterated very frequently** (every time an event fires, on potentially many threads) — `CopyOnWriteArrayList` is the standard, idiomatic choice here.

---

## How to Iterate a `List` — All the Ways

```java
List<String> items = new ArrayList<>(List.of("Pen", "Book", "Bag"));
```

### 1. Classic `for` loop (index-based — only ideal for `ArrayList`-like structures)
```java
for (int i = 0; i < items.size(); i++) {
    System.out.println(items.get(i));
}
```
⚠️ Avoid this on `LinkedList` — `get(i)` is `O(n)` per call, making the whole loop `O(n²)`.

### 2. Enhanced for-each loop (uses `Iterator` internally)
```java
for (String item : items) {
    System.out.println(item);
}
```
Works efficiently for **both** `ArrayList` and `LinkedList`, since it uses the list's own `Iterator` under the hood (sequential traversal, not indexed access).

### 3. `Iterator` (explicit — allows safe removal during iteration)
```java
Iterator<String> it = items.iterator();
while (it.hasNext()) {
    String val = it.next();
    if (val.equals("Book")) {
        it.remove();   // ✅ safe removal — avoids ConcurrentModificationException
    }
}
```

### 4. `ListIterator` (bidirectional — can traverse forward and backward, and modify)
```java
ListIterator<String> lit = items.listIterator();
while (lit.hasNext()) {
    String val = lit.next();
    lit.set(val.toUpperCase());   // in-place modification during iteration
}
while (lit.hasPrevious()) {
    System.out.println(lit.previous());   // traverse backward
}
```

### 5. `forEach()` with a lambda (Java 8+)
```java
items.forEach(item -> System.out.println(item));
// or method reference:
items.forEach(System.out::println);
```

### 6. Streams (Java 8+, functional-style processing)
```java
items.stream()
     .filter(item -> item.startsWith("B"))
     .forEach(System.out::println);
```

> ⚠️ **Important gotcha:** Never use a for-each loop or `forEach()` to *remove* elements directly from the list mid-iteration — both throw `ConcurrentModificationException`. Use `Iterator.remove()` or `list.removeIf(condition)` instead.

```java
items.removeIf(item -> item.equals("Bag"));   // safe, modern, idiomatic removal
```

---

## Quick Decision Guide — Which List Should You Use?

| Requirement | Best Choice |
|---|---|
| Frequent random access / indexed reads | `ArrayList` |
| Frequent insert/delete at head or tail | `LinkedList` (as `Deque`) |
| Stack/Queue behavior | `ArrayDeque` |
| Thread-safety, write-heavy | `Collections.synchronizedList(new ArrayList<>())` |
| Thread-safety, read-heavy, rare writes | `CopyOnWriteArrayList` |
| Sorted, unique elements needed instead | Consider `TreeSet`, not a `List` at all |

---

## Interview Questions

1. Why does `AbstractList` exist, and what design pattern does it demonstrate?
2. How does `ArrayList` grow internally when its capacity is exceeded, and what is the growth factor?
3. Why is the amortized time complexity of `ArrayList.add()` considered `O(1)` even though resizing is `O(n)`?
4. Why is `get(index)` `O(1)` for `ArrayList` but `O(n)` for `LinkedList`?
5. Internally, how does `LinkedList` decide whether to traverse from the head or the tail when accessing an index?
6. What extra memory overhead does each node in a `LinkedList` carry compared to a plain array element in `ArrayList`?
7. Why does `LinkedList` generally perform worse than `ArrayList` in real-world benchmarks, even for operations that are theoretically the same Big-O complexity?
8. Why is `Vector` considered legacy, and what should replace it in modern code?
9. Why does the JDK documentation recommend `ArrayDeque` over `Stack` for stack-based operations?
10. How does `CopyOnWriteArrayList` avoid `ConcurrentModificationException` during iteration?
11. Why is `CopyOnWriteArrayList` a poor choice for write-heavy workloads?
12. What is the difference between `Iterator` and `ListIterator`?
13. Why does removing an element with a for-each loop throw `ConcurrentModificationException`, but `Iterator.remove()` doesn't?
14. How does `removeIf()` avoid the pitfalls of manual iteration-based removal?
15. What happens internally when you call `new ArrayList<>(20)` versus `new ArrayList<>()`?
16. Is `ArrayList` thread-safe? What happens if two threads call `add()` concurrently without synchronization?
17. How would you convert an `ArrayList` to a thread-safe list without switching to `Vector`?
18. Between `ArrayList` and `LinkedList`, which would you choose for implementing a browser's back/forward navigation, and why?
19. What is the time complexity of `contains()` on an `ArrayList` versus a `HashSet`, and why does this matter when choosing a data structure?
20. Can you explain how `System.arraycopy()` improves performance during `ArrayList` resizing compared to a manual element-by-element copy loop?