# Java 17 Features

> **Topic:** Sealed classes, records, pattern matching for `instanceof`, text blocks, switch expressions, and JDK internals encapsulation

---

## 1. Why Java 17 Matters — The Bigger Picture

Released in September 2021, Java 17 is the second major LTS release after Java 11, and it represents the point where Java's **modern syntax overhaul** — a multi-release effort that had been shipping incrementally as preview features since Java 12 — became finalized, stable, and safe to depend on in production. Where Java 11 was mostly about platform/runtime changes (HTTP Client, module cleanup), Java 17 is where the **language itself** visibly modernized: less boilerplate, more expressive data modeling, and safer pattern matching.

> 💡 **Key insight:** Almost every headline feature in this release — records, sealed classes, pattern matching, text blocks — shares one underlying philosophy: **let the compiler know more about your intent, so it can generate correct code for you and catch mistakes it previously couldn't.** This is a very different kind of feature than Java 8's "add functional programming" or Java 9's "add modularity" — it's about closing the gap between what a class *conceptually represents* and how much boilerplate you had to write to express that.

Because many of these features had been available as **preview features** in earlier non-LTS releases (records previewed in 14/15, sealed classes previewed in 15/16, pattern matching for `instanceof` previewed in 14/15), Java 17 is the release most real-world teams associate with "finally getting to use records and sealed classes for real," since production codebases generally avoid depending on preview features that could still change before finalization.

---

## 2. Records

A **record** is a special, compact kind of class specifically designed to model **immutable data carriers** — classes whose entire purpose is to hold a fixed set of values, with little or no additional behavior.

### The problem it solves

Consider a simple immutable data class the "traditional" way:

```java
public final class Point {
    private final int x;
    private final int y;

    public Point(int x, int y) {
        this.x = x;
        this.y = y;
    }

    public int getX() { return x; }
    public int getY() { return y; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Point)) return false;
        Point point = (Point) o;
        return x == point.x && y == point.y;
    }

    @Override
    public int hashCode() {
        return Objects.hash(x, y);
    }

    @Override
    public String toString() {
        return "Point[x=" + x + ", y=" + y + "]";
    }
}
```

Roughly 30 lines of pure, mechanical boilerplate to represent "a pair of two ints." Every field requires a constructor parameter, a getter, and participation in `equals()`, `hashCode()`, and `toString()` — and forgetting to update one of these when adding a field later is a very common, easy-to-miss real bug.

### The record way

```java
public record Point(int x, int y) { }
```

This single line automatically generates:
- A **canonical constructor** taking all components in declared order.
- **Accessor methods** named after each component — `x()` and `y()` (deliberately **not** `getX()`/`getY()`, to distinguish records from JavaBeans-style mutable classes).
- Correct, value-based **`equals()`** and **`hashCode()`** implementations, based on all components.
- A readable **`toString()`** (`Point[x=1, y=2]`).
- All fields are **implicitly `private final`** — records are immutable by construction; there is no way to declare a mutable field directly in a record's header.

```java
Point p1 = new Point(3, 4);
Point p2 = new Point(3, 4);
System.out.println(p1.x());       // 3
System.out.println(p1.equals(p2)); // true — value equality, not reference equality
System.out.println(p1);            // Point[x=3, y=4]
```

### Why immutability is enforced, not optional

Records are designed specifically to model **values**, not entities with identity or mutable state. Enforcing immutability at the language level (no setters generated, no way to declare a non-final instance field in the record body) means a record can be freely shared across threads with no synchronization concerns, safely used as a `Map` key (mutable objects as map keys are a classic, dangerous anti-pattern — see the Collections notes), and reasoned about without worrying whether some other part of the code silently changed its state.

### Customizing records

You can still add validation, additional methods, and a compact constructor:

```java
public record Range(int min, int max) {
    // Compact constructor — runs before field assignment, no need to repeat parameter list
    public Range {
        if (min > max) {
            throw new IllegalArgumentException("min must be <= max");
        }
    }

    public int length() {
        return max - min;
    }

    public static Range of(int min, int max) {
        return new Range(min, max);
    }
}
```

> ⚠️ **Common mistake:** Trying to add an extra instance field directly in a record's body (`private int extra;`). This is **illegal** — a record's state is fully and exclusively defined by its header components. You can add static fields and additional derived (computed) instance methods, but not additional instance state.

### Why Records Were Introduced — The Full Rationale

Records exist because of a very specific, very old complaint about Java: it was **disproportionately verbose for one of the most common things programmers do — model a plain bundle of data.** This complaint predates Java 17 by well over a decade, and a few concrete forces pushed it to finally get solved:

1. **The "POJO tax."** Every data class needed a constructor, getters, and (if used correctly) `equals()`/`hashCode()`/`toString()` — work that is entirely mechanical and derivable from the field list alone, yet had to be typed (or IDE-generated) by hand every single time. This wasn't just tedious; it was a real source of bugs, because IDE-generated `equals()`/`hashCode()` methods silently go stale the moment a field is added and the generation step isn't re-run.
2. **Competitive pressure from other JVM languages.** Kotlin's `data class` and Scala's `case class` had offered this exact capability for years, and were frequently cited as a reason teams chose those languages over Java specifically for data-heavy code — Java's designers were explicit that closing this gap mattered for the platform's competitiveness.
3. **Pattern matching needed a natural partner.** Java's designers were simultaneously working on pattern matching (`instanceof`, and later `switch`), and pattern matching is far more useful when it can **deconstruct** a value into its components in one step. Records were designed hand-in-hand with this goal — see "record patterns" in the later interview questions and the Java 21 notes.
4. **Making immutability the path of least resistance.** Java had always supported writing immutable classes, but it took *more* code than writing a mutable one (final fields, no setters, careful constructor design). Records flip this: the immutable, value-based version is now the version requiring the **least** code, nudging developers toward safer design by default rather than against the grain.

> 💡 **Key insight:** Records are best understood not as "a shortcut for lazy typing" but as Java's answer to the question *"what is the minimal, safest possible way to say I want a class whose only job is to carry named, immutable data?"* Every generated method (constructor, accessors, `equals`, `hashCode`, `toString`) exists because those are precisely the methods a correct implementation of "a transparent carrier for `x` and `y`" needs — nothing more, nothing hidden.

### Advantages of Records

| Advantage | Why it matters |
|---|---|
| **Drastically less boilerplate** | A ~30-line class collapses to one line, with zero risk of a hand-written `equals()`/`hashCode()` going out of sync with the field list. |
| **Correctness by construction** | `equals()`/`hashCode()` are generated *from the same source of truth* (the component list) every time the record is recompiled — there's no separate step to forget. |
| **Immutability enforced by the language** | No setters can be generated, and no additional mutable field can be declared — thread-safety and safe sharing come for free, not from developer discipline. |
| **Natural fit for value semantics** | `equals()` compares by value, not reference, which is what you almost always want for DTOs, coordinates, money amounts, API request/response bodies, and similar data-only concepts. |
| **Works beautifully with pattern matching** | Records can be *deconstructed* directly in `switch`/`instanceof` patterns (record patterns, finalized in Java 21), letting code extract multiple components in a single expression. |
| **Self-documenting API** | `record Point(int x, int y)` tells a reader everything about the shape of the data at a glance — no need to read through a constructor and six getters to understand what the class represents. |
| **Safer as `Map`/`Set` keys** | Because they're immutable and have correct `hashCode()`/`equals()` out of the box, records avoid the classic "mutable object used as a hash key" bug class entirely. |

### Disadvantages and Limitations of Records

| Limitation | Why it matters |
|---|---|
| **No additional instance state allowed** | You cannot add a field beyond what's declared in the header — if your class needs internal, non-component state (e.g., a lazily-computed cache field), a record can't express that directly. |
| **No inheritance from another class** | A record implicitly extends `java.lang.Record` and **cannot extend any other class** (Java has no multiple class inheritance). It can still implement interfaces, but the "extend a base class for shared behavior" pattern is unavailable. |
| **All records are implicitly `final`** | You cannot subclass a record at all, even to add behavior — this is a deliberate restriction (consistent with value-semantics), but it does mean records are a poor fit if your design genuinely needs an extensible class hierarchy of data types (that's what sealed interfaces + multiple records are for instead, not record subclassing). |
| **Poor fit for JPA/Hibernate entities** | ORM frameworks typically expect a mutable, identity-bearing entity with a no-args constructor and mutable setters (for lazy loading, proxying, and dirty-checking) — records' immutability and lack of a no-arg constructor make them awkward as primary `@Entity` classes, though they work well as read-only projection/DTO types. |
| **Compact constructor validation is easy to get subtly wrong** | Forgetting that a compact constructor must assign to the (implicitly final) fields via the normal field-assignment step that follows it — or accidentally reassigning a parameter in a way that doesn't propagate — can cause confusing bugs for developers new to the syntax. |
| **Serialization has its own nuances** | Records support Java serialization, but deserialization always goes through the canonical constructor (unlike ordinary classes, which can bypass constructors during deserialization) — this is actually a safety improvement, but it surprises developers used to older serialization behavior, and any validation logic in the constructor will always run, even during deserialization. |
| **Not a replacement for builders on large data shapes** | A record with a dozen components still requires a dozen-argument constructor call at every use site — records don't provide a builder pattern, so records with many fields (especially many of the same type, like several `String`s or `int`s in a row) can become error-prone to construct correctly by positional argument order alone. |

> ⚠️ **Common misconception:** Records are sometimes mistaken for a full replacement for the "POJO"/"JavaBean" concept in general. They are not — they're specifically for **immutable, transparent data carriers**. Mutable domain entities, framework-managed beans requiring a no-arg constructor, and classes with real behavior/encapsulated internal state beyond their public data are still better served by ordinary classes.

### What Records Are *Not* Good For

Records are a poor fit for entities that have identity independent of their field values (e.g., a JPA/Hibernate database entity, where two rows with identical column values are still logically distinct rows), or classes that need mutable state after construction (e.g., a builder object accumulating values over time). Records complement — they don't replace — regular classes.

---

## 3. Sealed Classes and Interfaces

A **sealed** class or interface restricts which other classes/interfaces are allowed to extend or implement it, giving the compiler complete, exhaustive knowledge of the type hierarchy.

### The problem it solves

Before sealed classes, Java had only two extremes for controlling inheritance:
- `final` — no subclassing allowed **at all**.
- A regular (non-final) `public class`/`interface` — subclassable by **anyone, anywhere**, with zero control.

There was no middle ground for the extremely common real-world need: "I want exactly these three specific subtypes to exist, and no others — ever." Enums solved this for a fixed set of **values**, but not for a fixed set of **types**, each potentially carrying different structured data.

### The sealed way

```java
public sealed interface Shape permits Circle, Square, Rectangle { }

public record Circle(double radius) implements Shape { }
public record Square(double side) implements Shape { }
public record Rectangle(double width, double height) implements Shape { }
```

- `permits` explicitly lists every class allowed to extend/implement the sealed type. Any attempt to create an additional implementing class elsewhere fails to compile.
- Every permitted subclass must itself be declared `final`, `sealed` (further restricting its own subtypes), or `non-sealed` (reopening unrestricted extension from that point downward) — this is mandatory, not optional, forcing every author in the hierarchy to make a deliberate choice.

```java
public sealed class Shape permits Circle, Square, Rectangle { }
public final class Circle extends Shape { }              // closes further extension
public non-sealed class Square extends Shape { }         // reopens — anyone can extend Square now
public sealed class Rectangle extends Shape permits ColoredRectangle { }
```

### Why this matters — exhaustiveness with pattern matching

The real power of sealed types shows up combined with pattern matching (see below): because the compiler knows the **complete, closed set** of possible subtypes, it can verify that a `switch` expression covering all of them is truly exhaustive, with **no `default` branch required**:

```java
double area(Shape shape) {
    return switch (shape) {
        case Circle c -> Math.PI * c.radius() * c.radius();
        case Square s -> s.side() * s.side();
        case Rectangle r -> r.width() * r.height();
        // no default needed — compiler proves all Shape subtypes are covered
    };
}
```

If a new shape type (say, `Triangle`) is later added to the `permits` clause, this `switch` statement **fails to compile** until a `case Triangle` is added — turning what used to be a silent runtime bug (a forgotten `if`/`else` branch, or an `instanceof` chain missing a case) into an immediate, unavoidable compile-time error. This is a direct, practical safety net that plain interfaces and abstract classes could never offer, since anyone could always add a new, unanticipated subclass.

> 💡 **Key insight:** Sealed types + records + pattern matching together give Java something conceptually very close to **algebraic data types** from functional languages (like Haskell's `data` or Kotlin/Scala's `sealed class`/`sealed trait`) — a fixed, exhaustively-checkable set of data shapes, each of which the compiler fully understands.

---

## 4. Pattern Matching for `instanceof`

Before Java 16 finalized this feature, checking a type and then using it required an explicit, redundant cast:

```java
// Before pattern matching
if (obj instanceof String) {
    String s = (String) obj; // manual, redundant cast
    System.out.println(s.length());
}
```

### The pattern matching way

```java
if (obj instanceof String s) {
    System.out.println(s.length()); // s is already a String, no cast needed
}
```

`instanceof String s` does two things atomically: it checks the type, **and** it binds a new, correctly-typed local variable (`s`) if the check succeeds — eliminating the always-redundant, always-error-prone-if-forgotten manual cast.

### Flow-sensitive scoping

The pattern variable's scope is determined by **flow analysis**, not simple lexical block nesting — it's available anywhere the compiler can prove the `instanceof` check must have been true:

```java
if (!(obj instanceof String s)) {
    return; // if we get past this point, obj MUST be a String
}
System.out.println(s.length()); // s is in scope here, even though we're outside the "if" block

// Also valid — short-circuit evaluation guarantees s is bound before the second operand runs
if (obj instanceof String s && s.length() > 5) {
    System.out.println("Long string: " + s);
}
```

This is a genuinely new kind of scoping rule in Java — the compiler tracks "definite assignment" through negation and `&&` short-circuiting, not just simple brace nesting, to determine exactly where a pattern variable is guaranteed to be safely bound.

---

## 5. Switch Expressions

Finalized in Java 14 (and thus stable well before Java 17), switch expressions transform the old, error-prone statement form into a safer, more concise **expression** that produces a value.

### The problem with the old `switch` statement

```java
// Old switch statement — fall-through is the default, easy to forget "break"
String result;
switch (day) {
    case MONDAY:
    case TUESDAY:
    case WEDNESDAY:
    case THURSDAY:
    case FRIDAY:
        result = "Weekday";
        break;
    case SATURDAY:
    case SUNDAY:
        result = "Weekend";
        break;
    default:
        throw new IllegalStateException("Unexpected value: " + day);
}
```

Forgetting a `break` silently falls through to the next case — one of the most infamous, longest-standing footguns in the entire language.

### The switch expression way

```java
String result = switch (day) {
    case MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY -> "Weekday";
    case SATURDAY, SUNDAY -> "Weekend";
};
```

- The **arrow (`->`) form** has **no fall-through at all** — each case is independently scoped, and multiple labels can be comma-separated on one line.
- Combined with an **exhaustive `enum`** (or, from Java 17+ preview, a sealed type), the compiler can verify every possible value is handled, making the `default` branch unnecessary and giving a compile error if a new enum constant is added later without updating the switch.
- For more complex logic, a `yield` statement produces the block's value:

```java
int numLetters = switch (day) {
    case MONDAY, FRIDAY, SUNDAY -> 6;
    case TUESDAY -> 7;
    default -> {
        int len = day.toString().length();
        yield len;
    }
};
```

---

## 6. Text Blocks

Finalized in Java 15, text blocks solve the long-standing pain of embedding multi-line text (JSON, SQL, HTML) inside Java string literals.

### The problem it solves

```java
// Before text blocks
String json = "{\n" +
        "  \"name\": \"Alice\",\n" +
        "  \"age\": 30\n" +
        "}\n";
```

Escaping every quote and manually concatenating newlines made embedded multi-line content nearly unreadable and error-prone to edit.

### The text block way

```java
String json = """
        {
          "name": "Alice",
          "age": 30
        }
        """;
```

Enclosed in triple double-quotes (`"""`), a text block preserves formatting naturally, with **no escaping needed** for embedded double quotes, and the compiler automatically strips a computed amount of common leading whitespace ("incidental indentation") based on the closing delimiter's position — letting you indent the text block to match your code's structure without that indentation becoming part of the actual string content.

```java
String sql = """
        SELECT id, name, email
        FROM users
        WHERE status = 'ACTIVE'
        ORDER BY name
        """;
```

> 💡 **Key insight — incidental vs essential whitespace:** The compiler determines the "minimal indentation" across all non-blank lines (including the closing `"""`) and strips exactly that much from every line — this is what lets your Java source code stay properly indented within its enclosing method/class while the resulting string content itself has no unwanted leading whitespace.

---

## 7. Strong Encapsulation of JDK Internals by Default

This is one of the most operationally significant — if less flashy — changes in Java 17, and a direct continuation of the JPMS story from Java 9.

### Background

Since Java 9, internal JDK packages (like `sun.misc.Unsafe`, `com.sun.org.apache.xml.internal.*`) had been strongly encapsulated by JPMS in principle, but Java 9–16 provided an **escape hatch**: passing `--illegal-access=permit` (the default through Java 16) allowed reflective access to these internals anyway, with only a warning printed — specifically to avoid breaking the huge existing ecosystem of libraries (older versions of frameworks, testing tools, and application servers) that reached into JDK internals via reflection.

### What changed in Java 17

The default flipped: `--illegal-access` is **removed entirely**, and illegal reflective access to JDK internals now **fails outright** (`InaccessibleObjectException`) unless the calling code is explicitly granted access via `--add-opens` on the command line.

```bash
# Required if a library still needs deep reflective access to a specific internal package
java --add-opens java.base/java.lang=ALL-UNNAMED -jar legacy-app.jar
```

> ⚠️ **Real-world migration impact:** This is a very commonly hit, very real upgrade issue — older versions of popular libraries (certain versions of Mockito, older Java agents, some legacy application server internals) that relied on reflective access into `java.base` internals would suddenly throw `InaccessibleObjectException` on Java 17 where they had merely printed a warning on Java 11. The fix is either upgrading to a newer library version that no longer needs the internal access, or explicitly adding the relevant `--add-opens` flags — a very similar category of pain to the Java EE module removal covered in the Java 11 notes, but one release later and specifically about reflective access rather than missing classes.

---

## 8. Other Notable Java 17 Additions

| Feature | Summary |
|---|---|
| **Enhanced pseudo-random number generators** | A new `RandomGenerator` interface unifies `Random`, `ThreadLocalRandom`, and `SplittableRandom` under a common, more extensible API, and adds new, higher-quality algorithms (e.g., `Xoshiro256PlusPlus`) selectable by name via `RandomGeneratorFactory`. |
| **Deprecation of the Security Manager for removal** | The `SecurityManager` API (used for fine-grained, code-level permission sandboxing since Java 1.0) was marked for future removal — it saw very little real-world production use outside of applets/Java Web Start (both already removed) and was considered a maintenance burden relative to its actual adoption. |
| **Foreign Function & Memory API (incubator)** | An early, incubating version of a safer, more performant replacement for JNI (Java Native Interface) and for direct off-heap memory access — allowing Java code to call native (C) libraries and manipulate native memory without the notorious unsafety and complexity of traditional JNI. Fully finalized in later releases. |
| **Vector API (incubator)** | An API for expressing vector (SIMD) computations that compile down to optimal hardware CPU vector instructions where available, aimed at high-performance numerical/data-processing workloads. |
| **New macOS/AArch64 port** | Official JDK support for Apple Silicon (M1/M2) Macs, reflecting the industry's broader shift toward ARM-based hardware. |
| **Removal of the RMI Activation mechanism** | A long-obsolete, rarely-used part of Java RMI (Remote Method Invocation) was removed outright, continuing the platform's ongoing cleanup of legacy, low-usage subsystems. |
| **Context-specific deserialization filters** | New APIs (`ObjectInputFilter.Config.createFilter`) to let applications more precisely control which classes are permitted to be deserialized via Java's built-in serialization — a security hardening measure against a well-known class of deserialization-based remote code execution vulnerabilities. |

---

## 9. Real-World Scenarios

### E-commerce — Modeling payment methods with sealed interfaces and records
```java
public sealed interface PaymentMethod permits CreditCard, PayPal, StoreCredit { }

public record CreditCard(String last4, String expiryMonth, String expiryYear) implements PaymentMethod { }
public record PayPal(String email) implements PaymentMethod { }
public record StoreCredit(double balance) implements PaymentMethod { }

String describe(PaymentMethod method) {
    return switch (method) {
        case CreditCard cc -> "Card ending in " + cc.last4();
        case PayPal pp -> "PayPal (" + pp.email() + ")";
        case StoreCredit sc -> "Store credit: $" + sc.balance();
    };
}
```
If a new payment method (say, `BankTransfer`) is added to the `permits` clause months later, every `switch` in the codebase handling `PaymentMethod` immediately fails to compile until updated — preventing the classic "we added a new payment type but forgot to handle it in the refund logic" production bug before it ever ships.

### Banking — Immutable transaction records
```java
public record Transaction(String id, BigDecimal amount, Instant timestamp, TransactionType type) {
    public Transaction {
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("Amount must be positive");
        }
    }
}
```
A financial transaction, once created, should never be silently mutated by some other part of the system — records make this a language-enforced guarantee rather than a team convention that could accidentally be violated.

### Microservices — Parsing configuration with text blocks and pattern matching
```java
String template = """
        {
          "service": "%s",
          "replicas": %d
        }
        """.formatted(serviceName, replicaCount);

Object config = parseConfig(json);
if (config instanceof Map<?, ?> map && map.get("replicas") instanceof Integer replicas) {
    scaleService(replicas);
}
```
Text blocks make embedded JSON/YAML templates readable directly in Java source, and pattern matching for `instanceof` lets a chained type-check-and-extract read almost like a single logical condition.

### Legacy migration — Fixing `InaccessibleObjectException` after upgrading to 17
A team upgrading a legacy Spring application from Java 11 to 17 hits `InaccessibleObjectException: Unable to make field private final byte[] java.lang.String.value accessible` coming from an old JSON serialization library using reflection to read `String`'s private internals directly (a fragile, JDK-internals-dependent optimization some older libraries used). The fix is upgrading the library to a version using the public, supported API instead of deep reflection — illustrating the same category of migration effort the Java 9/11 notes described, now hitting the "default flipped to deny" enforcement point.

---

## 10. Comparison: The "Old Way" vs Java 17

| Concern | Pre-modern Java | Java 17 |
|---|---|---|
| Immutable data carrier | ~30 lines: constructor, getters, `equals`/`hashCode`/`toString` | `record Point(int x, int y) {}` — 1 line |
| Fixed, closed type hierarchy | Impossible to enforce — anyone could subclass a public class | `sealed interface ... permits ...` — compiler-enforced |
| Type check + cast | `instanceof` then manual cast | `instanceof String s` — combined, flow-scoped |
| Multi-line embedded text | String concatenation with `\n` and escaped quotes | Text blocks (`"""`) |
| Switch fall-through bugs | Default behavior, `break` easy to forget | Arrow-form switch expressions — no fall-through, exhaustiveness-checkable |
| JDK internals reflective access | Warning only (Java 9–16) | Denied by default, requires explicit `--add-opens` |

---

## Interview Questions

1. What specific pieces of boilerplate does a `record` eliminate compared to a hand-written immutable class, and why are accessor methods named `x()` rather than `getX()`?
2. Why is it illegal to declare an additional mutable instance field directly in a record's body, and what category of class should you reach for instead when you need mutable state?
3. What does the `permits` clause of a sealed interface actually enforce at compile time, and why must every permitted subtype declare itself as `final`, `sealed`, or `non-sealed`?
4. How does combining sealed types with switch expressions let the compiler verify exhaustiveness without a `default` branch, and what compile-time safety benefit does this provide when a new subtype is added later?
5. Explain the flow-sensitive scoping rules for a pattern variable introduced by `instanceof` — specifically, why is `s` still in scope after `if (!(obj instanceof String s)) { return; }`?
6. What specific, longstanding bug class do arrow-form (`->`) switch expressions eliminate compared to the traditional colon-form `switch` statement?
7. How does the compiler determine how much "incidental indentation" to strip from a text block, and why does this matter for keeping Java source code properly indented?
8. What changed by default regarding illegal reflective access to JDK internals between Java 11 and Java 17, and what exception would a library relying on that access now throw?
9. Why were sealed classes, records, and pattern matching often described together as bringing Java closer to "algebraic data types"? What capability do all three need to combine for that comparison to hold?
10. Why was the Security Manager deprecated for removal in Java 17 despite having existed since Java 1.0?
11. What is the Foreign Function & Memory API intended to eventually replace, and what specific problems with that older technology motivated a full replacement rather than an incremental fix?
12. If a record needs to validate its constructor arguments, what mechanism allows this without repeating the full parameter list, and where in the generated constructor does that validation logic run relative to field assignment?
13. Why can't a record extend another class, and what does a record implicitly extend instead?
14. Why are records generally considered a poor fit as primary JPA/Hibernate `@Entity` classes, even though they can work well as read-only query projection types?
15. What forces (competitive, technical, and language-design) actually drove Java's designers to add records, given that developers had been writing equivalent boilerplate manually for two decades without them?
16. During Java deserialization, how does a record's handling of the canonical constructor differ from an ordinary class, and why is this considered a safety improvement?
