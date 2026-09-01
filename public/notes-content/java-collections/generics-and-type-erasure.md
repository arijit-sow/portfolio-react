# Generics & Type Erasure in Java

> **Topic:** Generics, Bounded Types, Wildcards, Type Erasure
---

## Why Do We Need Generics?

### Life Before Generics (Pre-Java 5)
Before Java 5, collections stored everything as raw `Object` references:

```java
List list = new ArrayList();
list.add("Hello");
list.add(42);      // no compile-time complaint — a String list can hold an Integer!

String s = (String) list.get(1);   // compiles fine...
// java.lang.ClassCastException: Integer cannot be cast to String — BOOM, at RUNTIME
```

This created two serious, related problems:

1. **No compile-time type safety.** You could put *anything* into a collection, and the compiler had no way to stop you from mixing incompatible types — bugs that should have been caught in seconds during compilation instead surfaced as `ClassCastException` at **runtime**, often far away from where the actual mistake was made (e.g., in a completely different part of the codebase that later reads the list).
2. **Constant, ugly explicit casting.** Every single time you retrieved an element from a collection, you had to manually cast it back to the type you *believed* it should be — verbose, error-prone, and a strong "code smell" repeated throughout any codebase using collections.

### The Solution: Generics (Java 5+)
**Generics** let you **parameterize types** — write a class, interface, or method that operates on a **type you specify at the point of use**, rather than hardcoding `Object` and relying on programmer discipline and manual casting.

```java
List<String> list = new ArrayList<>();
list.add("Hello");
list.add(42);            // ❌ COMPILE-TIME ERROR — caught immediately, not at runtime

String s = list.get(1);  // no cast needed at all — compiler already knows it's a String
```

### Why This Matters — The Core Motivation
> **Generics move a whole category of bugs from runtime to compile time.** This is arguably one of the single biggest reliability improvements ever added to the Java language — the compiler becomes your first line of defense, catching type-mismatch mistakes the instant you write them, rather than leaving them to surface unpredictably in production, potentially only under specific data conditions that your tests never happened to hit.

---

## Generic Classes — Writing Your Own

```java
class Box<T> {
    private T content;

    void set(T content) { this.content = content; }
    T get() { return content; }
}
```

```java
Box<String> stringBox = new Box<>();
stringBox.set("A message");
String value = stringBox.get();     // no cast needed

Box<Integer> intBox = new Box<>();
intBox.set(100);
// intBox.set("oops");              // ❌ compile-time error
```

`T` is a **type parameter** — a placeholder for whatever concrete type is supplied when the class is actually used (`String`, `Integer`, `Employee`, etc.). Common naming conventions: `T` (Type), `E` (Element, common in collections), `K`/`V` (Key/Value, common in maps), `R` (Return type).

### Multiple Type Parameters
```java
class Pair<K, V> {
    private K key;
    private V value;

    Pair(K key, V value) { this.key = key; this.value = value; }
    K getKey() { return key; }
    V getValue() { return value; }
}
```
```java
Pair<String, Integer> employeeAge = new Pair<>("Riya", 28);
```

### Generic Methods
A method can introduce its **own** type parameter, independent of the class it's in — useful for static utility methods:

```java
class Utils {
    static <T> T firstElement(List<T> list) {
        return list.get(0);
    }
}
```
```java
String first = Utils.firstElement(List.of("A", "B", "C"));   // T inferred as String
```

---

## Bounded Type Parameters — Restricting What `T` Can Be

Sometimes you need `T` to be restricted to a specific family of types — e.g., you want to call `.compareTo()` on elements, which only makes sense if `T` implements `Comparable`.

```java
class NumberBox<T extends Number> {
    T value;
    NumberBox(T value) { this.value = value; }

    double doubled() {
        return value.doubleValue() * 2; // only possible because Number 
                                           guarantees doubleValue()
    }
}
```
```java
NumberBox<Integer> intBox = new NumberBox<>(10);
// NumberBox<String> strBox = new NumberBox<>("hi");   // ❌ compile-time error 
                                                            — String is not a Number
```

`extends` here is used for **both classes and interfaces** in a type bound (there's no separate `implements` keyword in this context) — and you can even specify **multiple bounds**:
```java
<T extends Comparable<T> & Serializable> void process(T item) { ... }
```

---

## Wildcards — `?`, `? extends`, `? super` (And PECS)

Wildcards come into play when you're writing a method that needs to **accept** a generic type parameterized in different ways, without needing to be generic over the whole method itself.

### The Problem Wildcards Solve
```java
void printAll(List<Object> list) {
    for (Object o : list) System.out.println(o);
}

List<String> names = List.of("A", "B");
printAll(names);   // ❌ compile-time error!
```
This fails because **`List<String>` is NOT a subtype of `List<Object>`**, even though `String` **is** a subtype of `Object` — generics are famously **invariant** by default (explained in depth below). Wildcards exist specifically to let you write flexible methods that work around this.

### `? extends T` — Upper Bounded Wildcard ("Producer")
```java
void printAll(List<? extends Object> list) {
    for (Object o : list) System.out.println(o);   // safe to READ as Object
}
printAll(List.of("A", "B"));    // ✅ works — List<String> IS a List<? extends Object>
printAll(List.of(1, 2, 3));     // ✅ works too
```
`List<? extends Number>` means "a list of **some unknown specific subtype** of `Number` — could be `List<Integer>`, `List<Double>`, etc., I just don't know which." You can safely **read** elements out (they're guaranteed to be at least a `Number`), but you **cannot add** anything to the list (except `null`) — the compiler has no way to guarantee what specific subtype is actually expected, since it could be any one of them.

```java
List<? extends Number> nums = List.of(1, 2, 3);
Number n = nums.get(0);      // ✅ safe — reading is fine
// nums.add(5);               // ❌ compile-time error — writing is NOT safe
```

### `? super T` — Lower Bounded Wildcard ("Consumer")
```java
void addIntegers(List<? super Integer> list) {
    list.add(1);              // ✅ safe to WRITE Integers (or subtypes of Integer)
    list.add(2);
}
addIntegers(new ArrayList<Number>());    // ✅ works
addIntegers(new ArrayList<Object>());    // ✅ works
```
`List<? super Integer>` means "a list of `Integer`, or any **supertype** of `Integer`" (`Number`, `Object`). You can safely **add** `Integer`s into it (any of those supertypes can legitimately hold an `Integer`), but if you **read** from it, all you can safely assume is that you'll get an `Object` back — you don't know the list's actual, specific type.

### The **PECS** Mnemonic — "Producer Extends, Consumer Super"
This is the single most important, most frequently interview-tested rule about wildcards, coined by Joshua Bloch in *Effective Java*:
- If a generic parameter is a **source you only read from** (it **produces** values for you) → use `? extends T`.
- If a generic parameter is a **destination you only write to** (it **consumes** values from you) → use `? super T`.
- If you need to **both** read and write → don't use a wildcard at all; use the exact type `T`.

```java
// A real JDK example: Collections.copy()
static <T> void copy(List<? super T> dest, List<? extends T> src) {
    for (int i = 0; i < src.size(); i++) {
        dest.set(i, src.get(i));
    }
}
```
Here, `src` is read from (**producer** → `extends`), `dest` is written to (**consumer** → `super`) — a textbook PECS application straight from `java.util.Collections`.

### The Unbounded Wildcard `?`
```java
void printSize(List<?> list) {
    System.out.println(list.size());   // fine — size() doesn't depend on the element type at all
}
```
Used when the method genuinely doesn't care what the element type is at all — only useful for operations that don't depend on `T` in any way (`size()`, `clear()`, `isEmpty()`).

---

## Why Are Generics Invariant? (`List<String>` is not a `List<Object>`)

This confuses many developers initially, but the reasoning is about **type safety**:

```java
List<String> strings = new ArrayList<>();
List<Object> objects = strings;    // ❌ if this were allowed...
objects.add(42);            // ...this would silently corrupt a "List<String>" with an Integer!
String s = strings.get(0); // ClassCastException at runtime — exactly what generics exist to prevent
```
If Java allowed `List<String>` to be treated as `List<Object>`, you could insert **any object** into what's supposed to be a `String`-only list through the `List<Object>` reference — completely defeating the entire purpose of generics. This is precisely **why** generics are invariant by default, and precisely **why** wildcards (`? extends`/`? super`) exist as a controlled, safe way to introduce flexibility without reopening this hole — each wildcard form only permits the *specific* operations (read-only, or write-only) that remain provably safe.

---

## Type Erasure — The Core Internal Mechanism

### What It Is
**Type erasure** is the process by which the Java **compiler removes all generic type information** after compilation is complete — generic type parameters exist **only at compile time**, for type-checking purposes, and **do not exist at all in the compiled `.class` bytecode / at runtime**.

```java
List<String> stringList = new ArrayList<>();
List<Integer> intList = new ArrayList<>();

System.out.println(stringList.getClass() == intList.getClass());   // true!!
// Both are just plain "ArrayList" at runtime — the <String> and <Integer> are GONE
```

### Why Java Chose Erasure (Historical & Design Rationale)
This is a genuinely important "why" for interviews. When generics were introduced in **Java 5**, Sun's engineers faced a critical constraint: **backward compatibility**. Millions of lines of existing Java code (and, crucially, already-compiled `.class` files and third-party libraries) used raw types (`List`, not `List<String>`). Java needed a way to introduce generics **without breaking**:
1. **Existing source code** that hadn't been updated to use generics.
2. **Existing compiled bytecode** — old `.class` files needed to remain loadable and usable by new, generics-aware code, and vice versa.
3. **The JVM itself** — ideally, without requiring changes to the bytecode format or the JVM's internal instruction set at all.

**Type erasure achieves all three.** By making generics a purely **compile-time, source-level** feature — the compiler checks your generic code for type correctness, then **strips out** the generic type information and inserts the necessary casts automatically, producing ordinary bytecode that looks exactly like what pre-generics Java would have produced. This is precisely why old, raw-typed code and new, generic code can interoperate seamlessly, and why the JVM itself needed **zero changes** to support generics.

### How Erasure Actually Transforms Your Code — Step by Step

**Your code:**
```java
class Box<T> {
    private T value;
    void set(T value) { this.value = value; }
    T get() { return value; }
}
```

**What the compiler actually produces (conceptually — this is what the bytecode reflects):**
```java
class Box {
    private Object value;    // T erased to its bound (Object, since unbounded)
    void set(Object value) { this.value = value; }
    Object get() { return value; }
}
```

**At the call site**, the compiler inserts an **implicit cast**:
```java
Box<String> box = new Box<>();
box.set("hello");
String s = box.get();
```
**Compiles to (conceptually):**
```java
Box box = new Box();
box.set("hello");
String s = (String) box.get();   // compiler auto-inserts this cast for you
```
This is why the classic "no cast needed" experience of generics is actually a **compile-time illusion** — the cast is still happening, just **automatically, invisibly, and safely** inserted by the compiler, instead of you having to write it manually and hope you got the type right.

### Erasure With Bounded Types
```java
class NumberBox<T extends Number> {
    T value;
}
```
Erases to:
```java
class NumberBox {
    Number value;   // erased to the BOUND (Number), not Object, since the bound was explicit
}
```
This is the general rule: an **unbounded** type parameter (`<T>`) erases to `Object`; a **bounded** type parameter (`<T extends SomeType>`) erases to `SomeType` (its leftmost bound, if multiple bounds are specified).

---

## Consequences & Restrictions Caused By Type Erasure

Because generic type information genuinely doesn't exist at runtime, several intuitive-seeming things are **not allowed**, and these restrictions are among the most commonly asked "gotcha" interview questions.

### 1. You Cannot Create an Instance of a Type Parameter
```java
class Box<T> {
    T create() {
        return new T();   // ❌ compile-time error — the JVM has no idea what T actually is at runtime
    }
}
```
There's no way to call `new T()` because, after erasure, the JVM simply doesn't know what concrete class `T` was meant to represent — it was already erased away by the time the bytecode runs.

### 2. You Cannot Create a Generic Array Directly
```java
T[] array = new T[10];              // ❌ compile-time error
List<String>[] lists = new List<String>[10];   // ❌ compile-time error
```
Arrays in Java are **reified** (they retain their component type at runtime, and enforce it via `ArrayStoreException` checks) — but generics are erased. Allowing `new T[10]` would create an array whose actual runtime type couldn't be properly established or checked, breaking arrays' own runtime type-safety guarantees. (The common workaround is `Object[] array = new Object[10];` combined with unchecked casting, or simply using a `List<T>` instead of an array.)

### 3. `instanceof` Cannot Check Against a Parameterized Type
```java
List<String> list = new ArrayList<>();
if (list instanceof List<String>) { ... }   // ❌ compile-time error
if (list instanceof List<?>) { ... }         // ✅ fine — unbounded wildcard is allowed
```
Since `List<String>` and `List<Integer>` are **indistinguishable at runtime** (both are just `List`), asking "is this instance specifically a `List<String>`" is a question the JVM has **no way** to answer — the information needed to answer it was erased.

### 4. Cannot Overload Methods That Would Erase to the Same Signature
```java
void process(List<String> list) { ... }
void process(List<Integer> list) { ... }   // ❌ compile-time error — "erasure of method is the same"
```
Both methods erase to `void process(List list)` — **identical** signatures after erasure — so the compiler rejects this as a duplicate method definition, even though it looks perfectly valid before erasure is considered.

### 5. Static Members Cannot Use a Class's Type Parameter
```java
class Box<T> {
    static T defaultValue;   // ❌ compile-time error
}
```
`static` members belong to the **class itself**, shared across **all** parameterizations of it (`Box<String>`, `Box<Integer>`, etc. are all, at runtime, just the one erased `Box` class) — but `T` is meant to represent a **specific, per-instance** type choice, which makes no coherent sense to share at the static/class level.

### 6. `getClass()` Loses Generic Type Information
```java
List<String> list = new ArrayList<>();
System.out.println(list.getClass());   // prints "class java.util.ArrayList" — no <String> anywhere
```
This is the most directly observable, everyday proof of erasure in action — reflection at runtime simply has no way to recover what generic type argument was originally used.

### 7. The Unchecked Warning
```java
List<String> list = new ArrayList();   // raw type on the right — compiles with an "unchecked" warning
```
Mixing generic and raw types (often when interfacing with old, pre-generics code/libraries) produces **"unchecked" compiler warnings** rather than hard errors — a deliberate design choice acknowledging that full type safety **cannot** always be guaranteed at these interoperability boundaries, but allowing the code to still compile and run for backward-compatibility purposes.

---

## Advantages of Generics — Summarized

1. **Compile-time type safety** — the single biggest win; a whole category of `ClassCastException` bugs is caught at compile time instead of runtime.
2. **Eliminates explicit casting** — cleaner, more readable code; the compiler inserts necessary casts automatically and safely.
3. **Enables generic algorithms** — a single method (e.g., `Collections.sort()`, `Collections.max()`) can operate correctly across **any** type that satisfies its bounds, without needing a separate overload per type.
4. **Better API expressiveness / self-documentation** — `Map<String, List<Order>>` immediately communicates intent far better than a raw `Map`, both to the compiler and to a human reading the code.
5. **Reusable, type-safe abstractions** — data structures like custom stacks, trees, or pairs can be written **once** and safely reused for any type, without sacrificing type safety per use.

---

## Disadvantages / Limitations of Generics (Due to Type Erasure)

1. **No runtime type information** — you can't reflect on, branch on, or instantiate the generic type parameter at runtime (as detailed in the restrictions above), which occasionally forces awkward workarounds (e.g., passing an explicit `Class<T>` object alongside a generic method, precisely so the method has *some* runtime handle on the actual type).
2. **No generic arrays** — a genuine, recurring inconvenience that forces developers toward `List<T>` or unchecked-cast workarounds instead of simple, natural array usage.
3. **Cannot overload on erased-identical generic signatures** — as shown above, a real constraint on API design.
4. **Unchecked warnings at interoperability boundaries** — mixing generic code with legacy raw-typed code (common when using older third-party libraries) sacrifices some of generics' safety guarantees, producing warnings that must be consciously reviewed rather than fully eliminated by the compiler.
5. **Primitives aren't directly supported** — you cannot write `List<int>`; you must use the boxed wrapper `List<Integer>`, which introduces **autoboxing/unboxing overhead** (extra object allocation, minor performance cost) that a genuinely primitive-specialized collection wouldn't incur. (This is a real, ongoing area of JVM evolution — Project Valhalla aims to eventually address this with true generic specialization over primitives.)
6. **Complexity for API designers** — correctly applying bounded types and PECS-based wildcards to design a flexible-yet-safe generic API is a genuinely non-trivial skill, and poorly designed generic APIs can become confusing to consumers (deeply nested wildcard signatures are a common complaint in code reviews).

---

## Real-World Industry Example

Generics are the backbone of essentially **every modern Java API**, but a clear, concrete illustration: a **repository pattern** in a typical enterprise/Spring-style application.

```java
interface Repository<T, ID> {
    T findById(ID id);
    List<T> findAll();
    T save(T entity);
    void deleteById(ID id);
}

class UserRepository implements Repository<User, Long> {
    public User findById(Long id) { /* query DB */ return null; }
    public List<User> findAll() { /* query DB */ return List.of(); }
    public User save(User entity) { /* persist */ return entity; }
    public void deleteById(Long id) { /* delete */ }
}

class ProductRepository implements Repository<Product, String> {
    public Product findById(String sku) { /* query DB */ return null; }
    // ...
}
```
A **single, generic `Repository<T, ID>` interface** defines the common CRUD contract once, and every concrete entity type (`User`, `Product`, `Order`) gets a **fully type-safe** implementation — `userRepository.findById(someLong)` won't even compile if you accidentally pass a `String`, and `findAll()` returns a properly-typed `List<User>` with zero casting needed anywhere in the calling code. This exact pattern (a generic base repository/DAO interface) is genuinely how most production Java data-access layers (Spring Data JPA, Hibernate-based DAOs, etc.) are structured.

---

## Interview Questions

1. What specific problem did generics solve that existed with raw-typed collections before Java 5?
2. What is type erasure, and why did Java's designers choose this approach instead of reifying generics at the JVM level (like C#'s generics)?
3. What does `List<String>.class == List<Integer>.class` (conceptually — via `getClass()`) evaluate to, and why?
4. Why can't you write `new T()` inside a generic class?
5. Why can't you create a generic array like `new T[10]` or `new List<String>[10]`?
6. Why does `list instanceof List<String>` fail to compile, while `list instanceof List<?>` compiles fine?
7. Why are these two method signatures considered duplicate declarations by the compiler: `void process(List<String> l)` and `void process(List<Integer> l)`?
8. Why can't a class's static field use that class's own type parameter `T`?
9. What does it mean for generics to be "invariant," and why is `List<String>` not a subtype of `List<Object>`?
10. What is the PECS mnemonic, and how does it help decide between `? extends T` and `? super T`?
11. In `Collections.copy(List<? super T> dest, List<? extends T> src)`, why is `dest` using `super` and `src` using `extends`?
12. What is the difference between an unbounded wildcard `<?>` and a raw type (no generics at all)?
13. What happens internally when you write `Box<String> box = new Box<>(); String s = box.get();` — what cast, if any, does the compiler actually insert?
14. Why does mixing raw types and generic types produce "unchecked" warnings instead of compile errors?
15. Why can't Java have a true `List<int>` — what workaround does the language use instead, and what performance cost does it introduce?
16. If type erasure removes all generic information at runtime, how does `ArrayList<String>` still enforce that only `String`s can be added, when accessed reflectively without generics (e.g., via raw types or reflection)?
17. What technique would you use to obtain the actual runtime `Class<T>` of a generic type parameter, given that erasure removes this information by default?
18. Why does bounded type erasure (`<T extends Number>`) erase to `Number`, while unbounded erasure (`<T>`) erases to `Object`?
19. What backward-compatibility problem would Java have faced in 2004 if it had chosen reified generics instead of type erasure?
20. Can you give an example where type erasure causes a genuine, unavoidable design limitation in a real API you might build?