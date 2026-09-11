# Java Keywords and Modifiers

> **Topic:** Access modifiers, non-access modifiers, reserved words, and contextual keywords — what each one actually does under the hood

---

## 1. What Is a Keyword, and Why Does This Topic Matter?

A **keyword** is a word reserved by the Java language itself, carrying special, fixed meaning that cannot be reused as an identifier (a variable, method, or class name). Java currently defines **67 reserved keywords** (as of recent versions, including additions like `var`, `yield`, and the sealed-classes-related words), plus three **reserved literals** (`true`, `false`, `null`) and a growing set of **contextual keywords** — words that are only special in specific positions, and remain legal as ordinary identifiers everywhere else.

> 💡 **Why this deserves its own dedicated note:** Nearly every other file in this notes series already uses dozens of keywords in passing (`final`, `static`, `synchronized`, `volatile`, `transient` all appear scattered across the OOP, Multithreading, and Collections notes) — but understanding *what each one actually changes at the bytecode/JVM level*, rather than just "what it does on the surface," is what separates a surface-level understanding of Java from a genuinely deep one. This note consolidates that internals-level understanding in one place.

---

## 2. Access Modifiers — Controlling Visibility

Java defines exactly **four** levels of access control, applicable to classes, fields, methods, and constructors (with some restrictions on top-level classes, covered below).

| Modifier | Same class | Same package | Subclass (different package) | Everywhere |
|---|---|---|---|---|
| `private` | ✅ | ❌ | ❌ | ❌ |
| *(no modifier — "default"/package-private)* | ✅ | ✅ | ❌ | ❌ |
| `protected` | ✅ | ✅ | ✅ | ❌ |
| `public` | ✅ | ✅ | ✅ | ✅ |

```java
public class Account {
    private double balance;              // only Account itself can access this directly
    String accountType;                  // package-private — visible to other classes in the same package
    protected String branchCode;         // visible to subclasses, even in other packages
    public String accountNumber;         // visible everywhere
}
```

### `private` — the strongest encapsulation

```java
public class BankAccount {
    private double balance;

    public void deposit(double amount) {
        balance += amount; // only this class can touch "balance" directly
    }
}
```

`private` members are invisible outside the declaring class — **not even subclasses** can access them directly (a subclass must go through a `protected`/`public` accessor instead). This is the foundation of **encapsulation** (recall the OOP Principles notes): forcing all interaction with an object's internal state through a deliberately designed public interface, rather than allowing arbitrary external code to reach in and manipulate raw fields directly.

> 💡 **A subtlety worth knowing:** `private` is enforced by the **compiler and the JVM's bytecode verifier**, not merely a documentation convention — attempting to access a `private` field from outside its declaring class fails to *compile* at all, and even bypassing the compiler (e.g., via raw bytecode manipulation) would still be rejected by the JVM's bytecode verifier at class-loading time, unless reflection is used with an explicit, deliberate `setAccessible(true)` override (itself increasingly restricted by the strong encapsulation changes covered in the Java 17 notes).

### Package-private (the "default" access level)

```java
class InternalHelper { // no modifier at all — package-private
    void doInternalWork() { } // also package-private
}
```

With no access modifier specified at all, a class or member is visible only within its own package — a middle ground between `private` (nobody else) and `protected` (subclasses too, even outside the package). This is commonly used for internal helper classes that an entire package's implementation needs to share, but that should never be part of the package's public-facing API.

### `protected` — visibility for inheritance

`protected` grants access to subclasses even when they live in a different package, plus (per the table above) full access within the same package regardless of inheritance — this is precisely why the Java 9 Modules notes described `protected`/reflection-based access as something the classpath's "everything public is visible to everyone" model couldn't meaningfully restrict, unlike JPMS's `opens` directive.

### `public` — universal visibility

```java
public class Order { } // any code, anywhere, that has access to this class's module/package, can use it
```

> ⚠️ **Top-level class restriction:** A top-level (non-nested) class can only be declared `public` or package-private — never `private` or `protected`. A `.java` source file can contain **at most one** `public` top-level class, and if present, that class's name **must** match the file's name exactly (`Order.java` must contain `public class Order`).

---

## 3. Non-Access Modifiers

### `static` — belonging to the class, not an instance

```java
public class Counter {
    private static int totalInstances = 0; // ONE copy, shared across every instance
    private int id;

    public Counter() {
        id = ++totalInstances;
    }

    public static int getTotalInstances() { // callable without any instance: Counter.getTotalInstances()
        return totalInstances;
    }
}
```

A `static` field lives in the class itself, not in any individual object — there is exactly **one** copy, allocated once when the class is first loaded, shared by every instance (and accessible even with zero instances in existence). A `static` method similarly belongs to the class, cannot access instance (`this`-bound) fields or methods directly, and is resolved at **compile time** based on the reference's declared type — unlike instance methods, which are resolved via dynamic dispatch at runtime (recall polymorphism from the OOP Principles notes). This is precisely why `static` methods **cannot be overridden** in the polymorphic sense — a subclass can declare a `static` method with the same signature, but this is technically **method hiding**, not overriding, and which version runs is determined by the reference's compile-time type, not the object's actual runtime type.

```java
static { // a static initializer block — runs ONCE, when the class is first loaded, before any instance exists
    System.out.println("Counter class loaded");
}
```

### `final` — preventing further change

`final` means something fundamentally different depending on what it's applied to:

| Applied to | Meaning |
|---|---|
| A variable/field | Its reference cannot be reassigned after initial assignment (for an object reference, the object itself can still be mutated internally — `final` doesn't imply deep immutability) |
| A method | Cannot be overridden by any subclass |
| A class | Cannot be extended/subclassed at all (`String`, and every record — recall the Java 17 notes — are implicitly `final` for exactly this reason) |

```java
final int MAX_RETRIES = 3;
// MAX_RETRIES = 5; // COMPILE ERROR — cannot reassign a final variable

final List<String> names = new ArrayList<>();
names.add("Alice"); // fine — the LIST'S CONTENTS are mutable; only the reference "names" is final
// names = new ArrayList<>(); // COMPILE ERROR — cannot reassign the reference itself
```

> 💡 **Performance-relevant internals:** A `final` field that's also a **compile-time constant** (a `static final` primitive or `String` initialized with a literal, known value) is subject to **constant folding** — the compiler substitutes the literal value directly at every usage site, at compile time, rather than generating code that reads the field at runtime. This is exactly the same category of optimization discussed for `StableValue` in the Java 25 notes, just applied to a simpler, purely compile-time-known case. This also explains a genuinely surprising, real-world gotcha: recompiling a library that changes a `public static final` constant's value does **not** automatically update code that was compiled against the *old* value, unless that dependent code is also recompiled — the old literal value may already be baked directly into the calling code's own bytecode.

### `abstract` — deferring implementation to subclasses

```java
public abstract class Shape {
    abstract double area(); // no body — every concrete subclass MUST provide one

    void describe() { // a normal, concrete method — CAN have a body
        System.out.println("Area: " + area());
    }
}
```

An `abstract` class cannot be instantiated directly (`new Shape()` is a compile error), and an `abstract` method has no body at all — it exists purely as a contract that every concrete (non-abstract) subclass is compiler-forced to fulfill. This directly complements the sealed-classes discussion in the Java 17 notes: `abstract` controls *whether a class/method needs an implementation*, while `sealed`/`permits` controls *which specific subclasses are allowed to exist at all* — genuinely orthogonal, and frequently combined together.

### `synchronized` — mutual exclusion via monitor locks

```java
public synchronized void increment() { // acquires "this" object's intrinsic lock for the entire method body
    counter++;
}

public void incrementBlock() {
    synchronized (this) { // equivalent, more explicit form — a synchronized BLOCK rather than method
        counter++;
    }
}
```

Recall the full internals of this from the Synchronization notes: `synchronized` causes the executing thread to acquire the target object's **intrinsic lock (monitor)** before entering, and release it automatically upon exit (even if an exception is thrown) — the JVM enforces mutual exclusion, ensuring only one thread can hold a given object's monitor at any moment, directly preventing the race conditions that arise from unsynchronized concurrent access to shared mutable state.

### `volatile` — visibility without mutual exclusion

```java
private volatile boolean running = true;

public void stop() {
    running = false; // guaranteed to be visible to OTHER THREADS immediately, without needing synchronized
}
```

As covered in depth in the Synchronization notes, `volatile` guarantees **visibility** (a write by one thread is immediately visible to reads by other threads, bypassing per-CPU-core caching that could otherwise leave threads seeing stale values) and **ordering** (preventing certain compiler/CPU reordering optimizations around the volatile variable), but — critically — does **not** provide atomicity for compound operations like `count++` (a read-modify-write sequence), which still requires `synchronized` or an atomic class (`AtomicInteger`) to be genuinely thread-safe.

### `transient` — excluding a field from serialization

```java
public class User implements Serializable {
    private String username;
    private transient String temporarySessionToken; // deliberately excluded from serialization
}
```

When an object is serialized (converted to a byte stream via Java's built-in `Serializable` mechanism), a `transient` field is **skipped entirely** — on deserialization, that field is simply left at its type's default value (`null` for objects, `0`/`false` for primitives), rather than being restored from the serialized data. This is the correct tool for fields that are either genuinely not meaningful to persist (a cached, recomputable value), or that should **never** be written to a potentially-persisted or potentially-transmitted byte stream for security reasons (a decrypted secret, a raw password, a live network socket reference that couldn't meaningfully survive serialization anyway).

### `native` — bridging to platform-specific code

```java
public class NativeMath {
    public native int computeChecksum(byte[] data); // implemented in C/C++, not Java, via JNI
}
```

`native` declares a method whose implementation lives **outside the JVM entirely**, in platform-specific compiled code (traditionally invoked via JNI — the Java Native Interface). This is directly relevant to the Java 17 notes' mention of the Foreign Function & Memory API, which was designed specifically as a safer, more ergonomic modern replacement for exactly this kind of native-code interop.

### `strictfp` — deterministic floating-point across platforms

```java
public strictfp class PrecisionCalculator { }
```

Historically, `strictfp` forced floating-point calculations to strictly follow the IEEE 754 standard, guaranteeing bit-for-bit identical results across every hardware platform — some pre-Java-17 JVMs, on certain platforms, could otherwise use extended-precision intermediate calculations for performance, producing subtly different results than a strict IEEE 754 implementation would. Since Java 17, **all** floating-point calculations are effectively `strictfp` by default, making this keyword's explicit use redundant (though it remains a legal, harmless no-op keyword for backward source compatibility).

---

## 4. Class, Interface, and Inheritance Keywords

| Keyword | Purpose |
|---|---|
| `class` | Declares a class |
| `interface` | Declares an interface |
| `extends` | A class extending another class, or an interface extending one or more other interfaces |
| `implements` | A class providing an implementation of one or more interfaces |
| `enum` | Declares an enumeration — a fixed, named set of constant instances |
| `record` | Declares an immutable data-carrier class (Java 17 notes cover this in depth) |
| `sealed` / `non-sealed` / `permits` | Restrict which classes/interfaces may extend/implement a given type (Java 17 notes) |
| `super` | References the immediate superclass — either to call its constructor (`super(...)`) or access an overridden member (`super.method()`) |
| `this` | References the current instance — used to disambiguate a field from a same-named parameter, or to call another constructor in the same class (`this(...)`) |

```java
public class Manager extends Employee implements Approver {
    public Manager(String name) {
        super(name); // must be the first statement (with the Java 25 Flexible Constructor Bodies caveat)
    }

    @Override
    public void approve(Request request) {
        this.approvalCount++; // "this." here is optional but disambiguating/explicit
    }
}
```

---

## 5. Control Flow Keywords

| Keyword | Purpose |
|---|---|
| `if` / `else` | Conditional branching |
| `switch` / `case` / `default` | Multi-way branching (recall the Java 21 notes' pattern matching enhancements to `switch`) |
| `for` / `while` / `do` | Looping constructs |
| `break` | Exits the enclosing loop or `switch` statement immediately |
| `continue` | Skips to the next iteration of the enclosing loop |
| `return` | Exits a method, optionally producing a value |
| `yield` | Produces a value from a `switch` **expression**'s block body (Java 14+, covered in the Java 17 notes) |

```java
int category = switch (value) {
    case 1, 2, 3 -> 100;
    default -> {
        int computed = value * 2;
        yield computed; // "yield" — NOT "return" — inside a switch expression's block
    }
};
```

> ⚠️ **`yield` vs `return` inside a switch expression:** Using `return` inside a switch expression's block would exit the **entire enclosing method**, not just produce the switch expression's value — `yield` exists specifically to produce a value *from the switch expression itself* without affecting the surrounding method's control flow at all.

---

## 6. Exception-Handling Keywords

Covered in full depth in the Exception Handling notes — summarized here for completeness:

| Keyword | Purpose |
|---|---|
| `try` | Begins a block whose exceptions may be caught or whose resources need cleanup |
| `catch` | Handles a specific exception type thrown within the preceding `try` |
| `finally` | A block that always executes, regardless of whether an exception occurred |
| `throw` | Explicitly raises an exception instance |
| `throws` | Declares, in a method signature, which checked exceptions that method may propagate |

```java
public void readFile(String path) throws IOException { // declares — does NOT throw itself
    if (path == null) {
        throw new IllegalArgumentException("path cannot be null"); // actually raises an exception
    }
}
```

---

## 7. Object and Reference Keywords

| Keyword | Purpose |
|---|---|
| `new` | Allocates a new object instance on the heap, invoking its constructor |
| `instanceof` | Tests whether an object is an instance of a given type (recall the Java 21 notes' pattern-matching enhancements) |
| `null` | The reserved literal representing "no object" — technically a **literal**, not a keyword, but functions identically in practice |
| `void` | Declares that a method returns no value |

```java
Object obj = new Order();
if (obj instanceof Order order) { // Java 16+ pattern matching — combines the check and the cast
    System.out.println(order.getId());
}
```

---

## 8. Primitive Type Keywords

```java
byte b = 127;
short s = 32000;
int i = 2_000_000_000;
long l = 9_000_000_000_000_000_000L;
float f = 3.14f;
double d = 3.14159265358979;
char c = 'A';
boolean flag = true;
```

These eight keywords (`byte`, `short`, `int`, `long`, `float`, `double`, `char`, `boolean`) plus `void` are the only types in Java that are **not** objects — they're stored directly as raw values (on the stack for local variables, or inline within an object's memory layout for fields), rather than as heap-allocated objects with references pointing to them, exactly the distinction already explored in depth in the Arrays notes' discussion of primitive vs. object arrays.

---

## 9. Package and Import Keywords

```java
package com.mycompany.orders; // must be the FIRST non-comment line in the file, if present

import java.util.List;
import java.util.Map;
import module java.base; // Java 25 — see the Java 25 Features notes
```

`package` declares which namespace a class belongs to (directly relevant to the Java 9 Modules notes' discussion of package-based encapsulation and split-package restrictions), and `import` brings a specific type (or, via a module import, an entire module's exported packages) into scope so it can be referenced by its simple name rather than its fully-qualified one.

---

## 10. Reserved but Unused Keywords

```java
// goto and const are RESERVED WORDS in Java, but have NO defined meaning or usage — using them is a compile error
```

| Keyword | Status |
|---|---|
| `goto` | Reserved specifically to prevent anyone from ever using it as an identifier, but the language deliberately has **no** `goto` statement — a direct, deliberate design reaction against unstructured jump-based control flow, which Java's designers considered a mistake in C-family languages |
| `const` | Also reserved but unused — `final` fills the equivalent role in Java instead |

> 💡 **Why reserve a word you'll never implement?** Reserving `goto` and `const` (inherited directly from C/C++ naming conventions) prevents any future ambiguity or backward-compatibility conflict if the language's designers ever *did* decide to add a meaning for them later — and, just as importantly, prevents any Java codebase from ever using either word as a variable/method/class name, avoiding any confusing false expectation that they behave like their C/C++ namesakes.

---

## 11. Contextual Keywords — Special Only in Specific Positions

Unlike the fully reserved keywords above, a growing set of words in modern Java are **contextual keywords** — they carry special meaning only in very specific syntactic positions, and remain completely legal as ordinary identifiers everywhere else. This distinction exists specifically so that adding new language features doesn't retroactively break any existing codebase that happened to already use one of these words as a variable or method name.

```java
var var = 5; // legal! "var" is contextual — usable as BOTH the type-inference keyword AND an identifier here
int yield = 10; // legal! "yield" is only special inside a switch expression's block
```

| Contextual keyword | Special only when |
|---|---|
| `var` | Used as a local variable's declared type, triggering type inference (Java 10+) |
| `yield` | Used inside a `switch` expression's block to produce a value (Java 14+) |
| `record` | Used to declare a record type (Java 16+) |
| `sealed` / `permits` | Used in a class/interface declaration to restrict subtyping (Java 17) |
| `module`, `requires`, `exports`, `opens`, `uses`, `provides`, `with`, `transitive`, `open` | Used specifically within a `module-info.java` file (Java 9 Modules notes) |

> 💡 **Why this design matters:** This is precisely why Java has been able to keep adding significant new syntax (`var`, `record`, `sealed`, module directives) release after release **without ever breaking existing source code** that happened to use one of those words as an ordinary identifier decades ago — a deliberate, careful language-evolution strategy distinct from simply reserving a brand-new fully-reserved keyword every time a new feature is added.

---

## 12. Complete Reserved Keyword Reference

| Category | Keywords |
|---|---|
| Access modifiers | `public`, `protected`, `private` |
| Non-access modifiers | `static`, `final`, `abstract`, `synchronized`, `volatile`, `transient`, `native`, `strictfp`, `default` (interface methods) |
| Class/interface/inheritance | `class`, `interface`, `extends`, `implements`, `enum`, `this`, `super` |
| Primitive types | `byte`, `short`, `int`, `long`, `float`, `double`, `char`, `boolean`, `void` |
| Control flow | `if`, `else`, `switch`, `case`, `default`, `for`, `while`, `do`, `break`, `continue`, `return` |
| Exception handling | `try`, `catch`, `finally`, `throw`, `throws` |
| Object/reference | `new`, `instanceof` |
| Package/import | `package`, `import` |
| Reserved literals | `true`, `false`, `null` |
| Reserved, unused | `goto`, `const` |
| Assertion | `assert` |

---

## 13. Real-World Scenarios

### Banking — Combining modifiers to express a precise, deliberate contract
```java
public final class InterestCalculator {
    private static final double DEFAULT_RATE = 0.05;

    public static synchronized double calculate(double principal, int years) {
        return principal * Math.pow(1 + DEFAULT_RATE, years);
    }
}
```
`final` on the class prevents anyone from subclassing and overriding calculation logic in a way that could subtly alter financial results; `static final` on the rate constant expresses a fixed, shared, compile-time-known value; `synchronized` (in a context where this were genuinely mutating shared state) would protect against concurrent-access races — each modifier here is a deliberate design decision, not a default.

### Serialization — Protecting a sensitive field from ever being persisted
```java
public class UserSession implements Serializable {
    private String userId;
    private transient String rawAuthToken; // NEVER written to disk or sent over the wire via serialization
}
```
Marking the raw token `transient` guarantees it's structurally impossible for Java's built-in serialization mechanism to accidentally leak it into a serialized byte stream (a file, a network payload) — a real, meaningful security boundary enforced by the language itself, not just a coding convention.

### Concurrent systems — `volatile` for a simple shutdown flag
```java
public class Worker implements Runnable {
    private volatile boolean running = true;

    public void run() {
        while (running) { doWork(); }
    }

    public void shutdown() {
        running = false; // guaranteed visible to the worker thread promptly, without full synchronized overhead
    }
}
```
A simple boolean shutdown flag, written by one thread and read by another, is the textbook use case for `volatile` — visibility is all that's needed here, since there's no compound read-modify-write operation involved (recall the precise distinction from the Synchronization notes).

---

## 14. Common Mistakes / Gotchas

> ⚠️ **Assuming `final` on an object reference makes the object itself immutable** — it only prevents *reassigning the reference*, not mutating the referenced object's own internal state.

> ⚠️ **Assuming `volatile` makes a compound operation like `count++` thread-safe** — it only guarantees visibility, not atomicity for multi-step read-modify-write sequences.

> ⚠️ **Confusing `static` method hiding with polymorphic overriding** — a subclass "overriding" a `static` method is actually hiding it, and the version invoked depends on the reference's compile-time type, not the object's actual runtime type.

> ⚠️ **Forgetting that a `.java` file's public top-level class name must exactly match the file name** — a mismatch is a compile error, not a warning.

> ⚠️ **Using `return` instead of `yield` inside a switch expression's block**, accidentally exiting the entire enclosing method rather than just producing the switch expression's value.

> ⚠️ **Not realizing `goto` and `const` are reserved**, and being confused by a compile error when accidentally trying to use either as a variable name.

---

## 15. Comparison: Access Modifiers at a Glance

| | `private` | *(default)* | `protected` | `public` |
|---|---|---|---|---|
| Encapsulation strength | Strongest | Strong | Moderate | None |
| Typical use | Internal implementation details | Package-internal helper classes/logic | Base-class members meant for subclass reuse | The class's actual public API surface |

---

## Interview Questions

1. What is the actual difference between `private` and package-private (no modifier at all) access, and give a scenario where package-private is the more appropriate choice than `private`.
2. Why can a top-level class only be `public` or package-private, never `private` or `protected`?
3. Explain why `final` on a variable holding an object reference does not make that object's internal state immutable, and give an example that demonstrates this.
4. Why is a `static` method that appears to "override" a superclass's `static` method actually an example of method hiding rather than true polymorphic overriding?
5. What specific guarantee does `volatile` provide, and what does it explicitly NOT guarantee — and why does that gap still require `synchronized` or an atomic class for something like a shared counter?
6. What happens to a `transient` field during serialization and deserialization, and give a real, security-relevant reason you might deliberately mark a field `transient`.
7. Why are `goto` and `const` reserved keywords in Java despite having no defined behavior, and what does that design choice tell you about how Java's designers viewed unstructured control flow?
8. What is a contextual keyword, and why does Java use this category (rather than simply adding new fully-reserved keywords) when introducing features like `var`, `yield`, and `record`?
9. Why must `yield` (not `return`) be used to produce a value from a switch expression's block body, and what would happen if you used `return` instead?
10. What does `abstract` control that `sealed`/`permits` does not, and why are the two often used together on the same class hierarchy?
11. Why does calling a `private` method from outside its declaring class fail to compile, and how is this different from the runtime-only enforcement of, say, `ArrayStoreException` covered in the Arrays notes?
12. What is the relationship between `static final` fields and compile-time constant folding, and what real-world versioning problem can arise if a library changes a `public static final` constant's value without every dependent codebase being recompiled?