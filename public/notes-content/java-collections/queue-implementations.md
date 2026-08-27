# Queue & Deque Implementations in Java — Complete Notes

> **Topic:** `Queue` Interface, `Deque` Interface & Their Implementations

---

## Where `Queue` Fits

```
                            Collection<E>
                                 │
                              Queue<E>             ← FIFO-oriented interface
                                 │
                   ┌─────────────┴───────────────────┐
                   │                                 │
            AbstractQueue<E>                      Deque<E>  ← (double-ended
                   │                                 │        extension of Queue)
                   │                                 │
     ┌─────────────┼───────────┐          ┌──────────┴──────────────┐
     │             │           │          │                         │
PriorityQueue  (blocking      ...      ArrayDeque              LinkedList
               queues, see             (resizable              (also implements
               below)                  circular array)         List AND Deque)

```

`Queue<E>` **does** extend `Collection<E>` (unlike `Map`, which is a separate root interface). It represents a collection designed for holding elements prior to processing, typically in **FIFO (First-In-First-Out)** order — though `PriorityQueue` and `Deque` bend that rule in useful ways, as we'll see.

---

## Why Does `AbstractQueue` (The Abstract Layer) Exist?

Just like `AbstractMap` derives most of its behavior from a single primitive (`entrySet()`), `AbstractQueue<E>` follows the same **Template Method design pattern** — it derives the "convenience" methods of `Queue` from a small set of primitive operations a subclass must implement: `offer()`, `poll()`, and `peek()`.

### The Core Idea

The `Queue` interface actually defines **two parallel sets of methods** for the same operations — one set that **throws an exception** on failure, and one set that **returns a special value** (`null` or `false`) on failure:

| Operation | Throws Exception | Returns Special Value |
| --------- | ---------------- | --------------------- |
| Insert    | `add(e)`         | `offer(e)`            |
| Remove    | `remove()`       | `poll()`              |
| Examine   | `element()`      | `peek()`              |

`AbstractQueue` implements the **exception-throwing trio** (`add()`, `remove()`, `element()`) **generically in terms of** the special-value trio (`offer()`, `poll()`, `peek()`):

```java
// Simplified idea of what AbstractQueue gives you for free:
public boolean add(E e) {
    if (offer(e)) return true;
    else throw new IllegalStateException("Queue full");
}

public E remove() {
    E x = poll();
    if (x != null) return x;
    else throw new NoSuchElementException();
}

public E element() {
    E x = peek();
    if (x != null) return x;
    else throw new NoSuchElementException();
}
```

### Why & When It's Useful

When building a **custom `Queue` implementation** (e.g., a fixed-capacity ring buffer for a network packet handler, or a custom priority-based job queue with special tie-breaking logic), you only need to implement `offer()`, `poll()`, and `peek()` (plus the standard `Collection` methods like `size()` and `iterator()`), and you inherit **correct, consistent** `add()`, `remove()`, and `element()` behavior for free — including proper exception-throwing semantics — instead of re-implementing that logic in every custom queue you write.

> **In short:** `AbstractQueue` exists for the exact same reason `AbstractMap` does — to eliminate boilerplate and guarantee consistent behavior, by deriving the "strict" (exception-throwing) API from the "lenient" (special-value) one.

> **Note:** `PriorityQueue` extends `AbstractQueue` directly. `ArrayDeque` and `LinkedList`, however, implement `Deque` directly with their own highly-optimized versions of every method (since `Deque` needs double-ended variants that `AbstractQueue`'s single-ended model doesn't cover) — so `AbstractQueue`'s generic fallback isn't actually what runs in those two.

---

## `Queue` Interface — Full Method Reference

```java
Queue<String> queue = new LinkedList<>();

queue.offer("A");     // insert - returns false instead of throwing if capacity-bound and full
queue.poll();          // remove & return head - returns null instead of throwing if empty
queue.peek();          // examine head without removing - returns null if empty

queue.add("B");        // insert - throws IllegalStateException if capacity-bound and full
queue.remove();        // remove & return head - throws NoSuchElementException if empty
queue.element();       // examine head - throws NoSuchElementException if empty
```

> **Best practice:** Prefer `offer()` / `poll()` / `peek()` over `add()` / `remove()` / `element()` in production code — the special-value style avoids the overhead and awkwardness of exception-based control flow for what is often a perfectly normal, expected condition (an empty or full queue).

---

## `PriorityQueue` — Internal Working (Deep Dive)

### What It Is

A `Queue` implementation where elements are **not** ordered FIFO — instead, elements are always retrieved in **priority order** (smallest first, by default — a "min-heap"), based on natural ordering (`Comparable`) or a supplied `Comparator`.

### 1. The Core Data Structure

Internally, `PriorityQueue` is **not** a tree of node objects — it's backed by a plain **resizable array**, representing a **binary heap**:

```java
transient Object[] queue;
```

The array implicitly represents a complete binary tree, using simple index arithmetic:

- For a node at index `i`: its **left child** is at `2*i + 1`, its **right child** is at `2*i + 2`, and its **parent** is at `(i - 1) / 2`.

### 2. What Happens When You Call `offer(element)`

1. The new element is placed at the **very end** of the array (the next free slot) — this keeps the tree "complete" (no gaps).
2. **Sift-up (bubble-up):** The new element is repeatedly compared with its **parent**. If it's smaller (higher priority) than its parent, they're swapped, and the process repeats upward until the heap property is restored (`O(log n)`).

### 3. What Happens When You Call `poll()`

1. The **root** (index 0) — always the smallest element — is saved to be returned.
2. The **last** element in the array is moved to the root position (index 0), and the array shrinks by one.
3. **Sift-down (bubble-down):** This relocated element is repeatedly compared with its **smaller child**. If it's larger, they're swapped, and the process repeats downward until the heap property is restored (`O(log n)`).

```
offer(5), offer(2), offer(8), offer(1)

Array view:  [1, 2, 8, 5]
Tree view:
                1
              /   \
             2      8
            /
           5

poll() → returns 1, then rebalances:
Array view:  [2, 5, 8]
Tree view:
                2
              /   \
             5      8
```

### Advantages

- `offer()`/`poll()` are `O(log n)` — efficient for repeatedly extracting the min/max element.
- `peek()` is `O(1)` — the smallest element is always at index 0.
- Backed by a flat array — very memory-efficient, no per-node pointer overhead (unlike a linked structure).

### Disadvantages

- **Not thread-safe** — use `PriorityBlockingQueue` for concurrent access.
- **No `null` elements allowed** (would break comparisons).
- Iterating a `PriorityQueue` (via `iterator()`) does **not** guarantee priority order — only `poll()` guarantees retrieving elements in sorted order, one at a time.
- Unbounded by default, but can be memory-risky if not capacity-managed under heavy load.

### Real-World Industry Example

A **task scheduler** in a job-processing system, where jobs carry different priority levels (e.g., "critical," "high," "normal," "low") and must always be picked up in priority order regardless of arrival time — or a **Dijkstra's shortest path algorithm** implementation (used in real routing/logistics systems like ride-hailing ETA calculations), where the next node to process must always be the one with the smallest known distance.

```java
PriorityQueue<Job> jobQueue = new PriorityQueue<>(Comparator.comparingInt(Job::getPriority));
jobQueue.offer(new Job("Send report", 3));
jobQueue.offer(new Job("Fix outage", 1));   // lower number = higher priority
jobQueue.offer(new Job("Cleanup logs", 5));

Job next = jobQueue.poll();   // always returns "Fix outage" first
```

---

## `Deque` (Double-Ended Queue) — Special Deep Dive

### What is a `Deque`?

- `Deque` (pronounced "deck") stands for **Double-Ended Queue** — a linear collection that supports **insertion and removal at both ends** (head and tail).
- It **extends `Queue`**, so every `Deque` is also a valid `Queue`, but it adds a full parallel set of methods for operating on **both ends explicitly**.
- Crucially, `Deque` can function as **either** a **FIFO Queue** or a **LIFO Stack**, all through one unified interface — this dual nature is exactly why it deserves special attention.

```
        Deque<E>
       /        \
  addFirst()    addLast()
  removeFirst() removeLast()
  peekFirst()   peekLast()
       \        /
     (used as Stack)  (used as Queue)
```

### Full `Deque` Method Reference

| Operation | First (Head) — Throws | First (Head) — Special Value | Last (Tail) — Throws | Last (Tail) — Special Value |
| --------- | --------------------- | ---------------------------- | -------------------- | --------------------------- |
| Insert    | `addFirst(e)`         | `offerFirst(e)`              | `addLast(e)`         | `offerLast(e)`              |
| Remove    | `removeFirst()`       | `pollFirst()`                | `removeLast()`       | `pollLast()`                |
| Examine   | `getFirst()`          | `peekFirst()`                | `getLast()`          | `peekLast()`                |

**Legacy `Queue` methods map onto these directly:** `offer()` = `offerLast()`, `poll()` = `pollFirst()`, `peek()` = `peekFirst()` — meaning by default, a `Deque` used as a plain `Queue` behaves FIFO (insert at tail, remove from head).

**`Deque` as a `Stack`:** `push(e)` = `addFirst(e)`, `pop()` = `removeFirst()`, `peek()` = `peekFirst()` — meaning as a stack, insertions and removals both happen at the **head**, giving classic LIFO behavior.

```java
Deque<Integer> stack = new ArrayDeque<>();
stack.push(1);
stack.push(2);
stack.push(3);
System.out.println(stack.pop());   // 3 - LIFO behavior

Deque<Integer> queue = new ArrayDeque<>();
queue.offer(1);
queue.offer(2);
queue.offer(3);
System.out.println(queue.poll());  // 1 - FIFO behavior
```

> **Why `ArrayDeque` is now preferred over the legacy `Stack` class:** `java.util.Stack` extends `Vector`, inheriting **legacy synchronization overhead** (every method is `synchronized`, even in single-threaded use) and an outdated API. The official Java documentation itself recommends using `ArrayDeque` for stack operations instead — it's faster, unsynchronized (as most stack use cases are single-threaded anyway), and has a cleaner, modern API.

---

### `ArrayDeque` — Internal Working (Deep Dive)

### 1. The Core Data Structure

`ArrayDeque` is backed by a **resizable circular array** (also called a **ring buffer**):

```java
transient Object[] elements;
transient int head;
transient int tail;
```

- `head` points to the index of the **first** (front) element.
- `tail` points to the index **just past** the **last** (back) element.
- The array's capacity is **always kept a power of 2** — exactly like `HashMap` — because this allows wrap-around index calculations to use a fast bitwise AND instead of a modulo operation.

### 2. What Happens When You Call `addFirst(e)` / `addLast(e)`

**`addLast(e)`** (adding at the tail — used by `offer()`):

```java
elements[tail] = e;
tail = (tail + 1) & (elements.length - 1);   // wrap around using bitmask, just like HashMap's bucket index
if (tail == head) doubleCapacity();          // array is full, resize
```

**`addFirst(e)`** (adding at the head — used by `push()`):

```java
head = (head - 1) & (elements.length - 1);   // move head backward, wrapping around if needed
elements[head] = e;
if (head == tail) doubleCapacity();
```

### 3. Why "Circular"?

Because `head` and `tail` **wrap around** to the beginning of the array once they reach the end — so the "logical" front and back of the deque can shift around a **fixed-size backing array** without ever needing to shift all existing elements over, unlike a naive array-based queue.

```
Initial capacity 8, empty:
[ _, _, _, _, _, _, _, _ ]
  head=0, tail=0

After addLast(A), addLast(B), addLast(C):
[ A, B, C, _, _, _, _, _ ]
  head=0          tail=3

After addFirst(X):
[ A, B, C, _, _, _, _, X ]
  head=7          tail=3     ← head wrapped around to the END of the array
```

### 4. Resizing

When the array becomes full (`head == tail` after an insert), `ArrayDeque` **doubles its capacity**, allocates a new array, and copies elements over in the correct logical order (unwrapping the circular layout back into a straightforward linear one in the new array).

### Advantages Over `LinkedList` (as a Queue/Deque/Stack)

- **No per-element node overhead** — `LinkedList` allocates a separate `Node` object (with `prev`/`next` pointers) for every element, while `ArrayDeque` just uses flat array slots — meaning significantly better memory locality and cache performance.
- Generally **faster** in practice for typical queue/stack/deque workloads, which is why the official Java documentation recommends `ArrayDeque` over `LinkedList` for both queue and stack use cases.
- All core operations (`addFirst`, `addLast`, `removeFirst`, `removeLast`) are **amortized `O(1)`**.

### Disadvantages

- **Not thread-safe** — no built-in synchronization (use `ConcurrentLinkedDeque` or `LinkedBlockingDeque` for concurrent scenarios).
- **`null` elements are not permitted** (a `null` return from `peekFirst()`/`peekLast()` must unambiguously mean "empty").
- Unlike `LinkedList`, `ArrayDeque` does **not** implement the `List` interface — so you lose index-based access (`get(index)`) entirely; it's purpose-built only for double-ended operations.

---

### `LinkedList` as a `Deque`

`LinkedList` also implements `Deque` (in addition to `List`), using its underlying **doubly linked list** structure — every node has both `prev` and `next` pointers, so adding/removing at either end is a simple, direct pointer update — no shifting, no resizing ever needed.

```java
Deque<String> deque = new LinkedList<>();
deque.addFirst("B");
deque.addFirst("A");
deque.addLast("C");
System.out.println(deque);   // [A, B, C]
```

**When `LinkedList` might still be preferred over `ArrayDeque`:** if you specifically need `List`-style operations (index-based access, `ListIterator`, or frequent insertions in the **middle** of the sequence) in addition to deque behavior — `ArrayDeque` offers none of that, since it's deque-only.

---

## Blocking Queues — Brief Mention (Concurrency Use Case)

Part of `java.util.concurrent`, these `Queue`/`Deque` implementations add **blocking behavior**: a thread calling `take()` on an empty queue will simply **wait** until an element becomes available, and a thread calling `put()` on a full bounded queue will wait until space frees up — instead of throwing an exception or returning a special value immediately.

| Implementation          | Backed By                          | Notes                                                                     |
| ----------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| `ArrayBlockingQueue`    | Fixed-size circular array          | Bounded, FIFO, fair-locking option available                              |
| `LinkedBlockingQueue`   | Linked nodes                       | Optionally bounded, generally higher throughput than `ArrayBlockingQueue` |
| `PriorityBlockingQueue` | Binary heap (like `PriorityQueue`) | Unbounded, thread-safe priority queue                                     |
| `LinkedBlockingDeque`   | Doubly linked nodes                | Blocking version of `Deque`, double-ended                                 |

### Real-World Industry Example

The **classic Producer-Consumer pattern** underlying most real-world **thread pool implementations** (like Java's own `ThreadPoolExecutor`) — worker threads `take()` tasks from a shared `BlockingQueue`, blocking automatically when no work is available, while producer threads `put()` new tasks onto the queue, blocking automatically if the queue is momentarily full (backpressure) — this is exactly how message queue consumers, background job workers, and request-handling thread pools are built in production Java systems.

```java
BlockingQueue<Runnable> taskQueue = new LinkedBlockingQueue<>(100);
// Producer thread:
taskQueue.put(() -> processOrder(orderId));
// Consumer (worker) thread:
Runnable task = taskQueue.take();   // blocks here if queue is empty
task.run();
```

---

## Real-World Uses of `Deque` Specifically

`Deque`'s dual FIFO/LIFO nature makes it the natural fit for several classic real-world and algorithmic scenarios:

1. **Browser back/forward navigation history** — one `Deque` (or two) tracking visited pages, where "back" pops from one end and "forward" pushes to the other.
2. **Undo/Redo functionality** in editors (text editors, design tools) — each user action is pushed onto a `Deque` acting as a stack; undoing pops the most recent action off.
3. **Sliding Window algorithms** — e.g., finding the maximum element in every window of size `k` in an array (a very common interview/algorithmic problem) uses a `Deque` to maintain indices in a way that lets both ends be trimmed efficiently as the window slides.
4. **Palindrome checking** — compare characters from both ends of a `Deque` simultaneously (`pollFirst()` vs `pollLast()`) until they meet in the middle.
5. **Work-stealing thread pools** — advanced concurrent frameworks (like Java's `ForkJoinPool`) give each worker thread its own double-ended queue of tasks: the worker takes tasks from **one end** (LIFO, for cache locality), while idle threads "steal" tasks from the **other end** (FIFO) of a busy worker's queue, minimizing contention.

```java
// Sliding window maximum - classic use of Deque
Deque<Integer> window = new ArrayDeque<>();   // stores indices
int[] nums = {1, 3, -1, -3, 5, 3, 6, 7};
int k = 3;
for (int i = 0; i < nums.length; i++) {
    if (!window.isEmpty() && window.peekFirst() <= i - k) {
        window.pollFirst();   // remove indices out of this window
    }
    while (!window.isEmpty() && nums[window.peekLast()] < nums[i]) {
        window.pollLast();    // remove smaller elements - they'll never be the max
    }
    window.offerLast(i);
    if (i >= k - 1) {
        System.out.println(nums[window.peekFirst()]);   // current window's max
    }
}
```

---

## `Queue`/`Deque` Implementations — Side-by-Side Comparison

| Aspect                | `LinkedList`                              | `PriorityQueue`                       | `ArrayDeque`                       |
| --------------------- | ----------------------------------------- | ------------------------------------- | ---------------------------------- |
| Backing structure     | Doubly linked list                        | Binary heap (array)                   | Resizable circular array           |
| Ordering              | Insertion order (FIFO)                    | Priority order                        | Insertion order (FIFO or LIFO)     |
| `offer`/`poll`/`peek` | `O(1)`                                    | `O(log n)` insert/remove, `O(1)` peek | `O(1)` amortized                   |
| Implements `Deque`?   | ✅ Yes                                    | ❌ No                                 | ✅ Yes                             |
| Implements `List`?    | ✅ Yes                                    | ❌ No                                 | ❌ No                              |
| Allows `null`?        | ✅ Yes                                    | ❌ No                                 | ❌ No                              |
| Thread-safe?          | ❌ No                                     | ❌ No                                 | ❌ No                              |
| Memory overhead       | Higher (per-node objects)                 | Low (flat array)                      | Low (flat array)                   |
| Best for              | General queue/deque + list needs together | Priority-based processing             | Fast queue AND/OR stack operations |

---

## How to Iterate a `Queue`/`Deque` — All the Ways

```java
Deque<String> tasks = new ArrayDeque<>();
tasks.offer("Email"); tasks.offer("Report"); tasks.offer("Meeting");
```

### 1. Enhanced for-each (iterates head → tail)

```java
for (String task : tasks) {
    System.out.println(task);
}
```

### 2. `Iterator` (head → tail) vs `descendingIterator()` (tail → head, `Deque`-only)

```java
Iterator<String> it = tasks.iterator();
while (it.hasNext()) System.out.println(it.next());

Iterator<String> descIt = tasks.descendingIterator();
while (descIt.hasNext()) System.out.println(descIt.next());   // reverse order
```

### 3. Draining via repeated `poll()` (common, destructive — empties the queue)

```java
while (!tasks.isEmpty()) {
    System.out.println(tasks.poll());
}
```

### 4. `forEach()` with a lambda (Java 8+)

```java
tasks.forEach(System.out::println);
```

> ⚠️ **Note on `PriorityQueue` iteration:** its `iterator()` does **not** return elements in priority order — only sequential `poll()` calls guarantee that. If you need to display elements in priority order without destroying the queue, copy it first (`new PriorityQueue<>(original)`) and drain the copy.

---

## Quick Decision Guide — Which `Queue`/`Deque` Should You Use?

| Requirement                                                  | Best Choice                                  |
| ------------------------------------------------------------ | -------------------------------------------- |
| Simple FIFO queue                                            | `ArrayDeque` (preferred) or `LinkedList`     |
| Stack (LIFO) behavior                                        | `ArrayDeque` (preferred over legacy `Stack`) |
| Need both queue AND list operations (index access)           | `LinkedList`                                 |
| Elements must be processed by priority, not arrival order    | `PriorityQueue`                              |
| Need insertion/removal at both ends                          | `ArrayDeque` or `LinkedList`                 |
| Thread-safe queue with blocking behavior (producer-consumer) | `ArrayBlockingQueue` / `LinkedBlockingQueue` |
| Thread-safe priority queue                                   | `PriorityBlockingQueue`                      |
| Thread-safe double-ended blocking queue                      | `LinkedBlockingDeque`                        |

---

## Interview Questions

1. Why does `AbstractQueue` only require `offer()`, `poll()`, and `peek()` to be implemented, and how does it derive `add()`, `remove()`, and `element()` from them?
2. What is the difference between the `add()`/`remove()`/`element()` method family and the `offer()`/`poll()`/`peek()` family in the `Queue` interface?
3. Why is it generally considered better practice to use `offer()`/`poll()`/`peek()` instead of `add()`/`remove()`/`element()`?
4. How is a `PriorityQueue` internally structured, and why is a binary heap represented using a flat array instead of actual tree nodes?
5. Walk through what happens internally, step by step, when you call `offer()` on a `PriorityQueue`.
6. Walk through what happens internally, step by step, when you call `poll()` on a `PriorityQueue`.
7. Why does iterating a `PriorityQueue` with a regular `iterator()` not return elements in priority order?
8. What is a `Deque`, and how does it differ from a plain `Queue`?
9. How does a `Deque` allow you to use the exact same object as both a FIFO queue and a LIFO stack?
10. Which specific methods does `push()`/`pop()` map to internally in a `Deque`?
11. Why does the official Java documentation recommend `ArrayDeque` over the legacy `Stack` class?
12. Why does the official Java documentation also recommend `ArrayDeque` over `LinkedList` for most queue/stack use cases?
13. How is `ArrayDeque` internally structured, and what does "circular array" actually mean in this context?
14. Why does `ArrayDeque`'s capacity need to always be a power of 2, similar to `HashMap`?
15. What happens internally when `ArrayDeque`'s backing array becomes full and a new element is added?
16. Why can't `ArrayDeque` be used wherever a `List` is required?
17. Why doesn't `ArrayDeque` allow `null` elements?
18. What's the key structural difference between how `LinkedList` and `ArrayDeque` both implement `Deque`?
19. In what scenario would you still prefer `LinkedList` over `ArrayDeque`, despite `ArrayDeque` generally being faster?
20. What is the sliding window maximum problem, and why is `Deque` the ideal data structure to solve it efficiently?
21. How does a work-stealing thread pool (like `ForkJoinPool`) make use of double-ended queues?
22. What is the core difference between a regular `Queue`/`Deque` and a `BlockingQueue`/`BlockingDeque`?
23. In a Producer-Consumer system using `BlockingQueue`, what happens if a consumer calls `take()` on an empty queue?
24. Why is `PriorityBlockingQueue` unbounded by default, unlike `ArrayBlockingQueue`?
25. Why does `descendingIterator()` exist specifically on `Deque` and not on the plain `Queue` interface?
