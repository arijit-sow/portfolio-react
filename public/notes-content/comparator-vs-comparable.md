# Comparable vs Comparator in Java — Complete Notes

> **Topic:** Object Ordering — `Comparable` & `Comparator`

---

## Why Do We Need a Way to "Compare" Objects At All?

Primitives (`int`, `double`) have a natural, built-in notion of ordering — `5 < 10` is unambiguous. But for **objects** — a `Student`, an `Employee`, a `Product` — the JVM has **no idea** what "greater than" or "less than" should mean. Is one `Student` "greater" than another based on age? GPA? Name alphabetically? The JVM can't guess, so Java provides **two contracts** that let *you* define ordering: `Comparable` and `Comparator`.

Any time you call `Collections.sort(list)`, use a `TreeSet`/`TreeMap`, or call `list.sort(...)`, Java needs to know **how to order your objects** — and it gets that answer from one of these two interfaces.

---

## `Comparable` — Natural, Intrinsic Ordering

### What It Is
`Comparable<T>` is an interface a class implements **on itself** to define its own **natural ordering** — a single, default way that objects of that class should be compared. It lives in `java.lang` and declares exactly **one method**:

```java
public interface Comparable<T> {
    int compareTo(T other);
}
```

### The Contract of `compareTo()`
`compareTo()` must return:
- A **negative integer** if `this` object is **less than** `other`.
- **Zero** if `this` object is **equal to** `other`.
- A **positive integer** if `this` object is **greater than** `other`.

> Note: it's a common misconception that it must return exactly `-1`, `0`, or `1` — any negative or positive int is valid (e.g., `this.age - other.age` is a common shorthand, though it can silently overflow for extreme values, so `Integer.compare()` is safer).

### How to Implement It

```java
class Employee implements Comparable<Employee> {
    String name;
    int salary;

    Employee(String name, int salary) {
        this.name = name;
        this.salary = salary;
    }

    @Override
    public int compareTo(Employee other) {
        return Integer.compare(this.salary, other.salary);   // natural order: by salary, ascending
    }

    @Override
    public String toString() {
        return name + ":" + salary;
    }
}
```

```java
List<Employee> employees = new ArrayList<>(List.of(
    new Employee("Riya", 75000),
    new Employee("Aman", 60000),
    new Employee("Neha", 90000)
));

Collections.sort(employees);   // uses compareTo() automatically — natural ordering
System.out.println(employees);  // [Aman:60000, Riya:75000, Neha:90000]
```

Because `Employee` implements `Comparable`, it can also be safely used directly in a `TreeSet`/`TreeMap`:
```java
Set<Employee> sortedBySalary = new TreeSet<>(employees);
```

### Where It's Used Internally in the JDK
Many built-in classes already implement `Comparable` with a sensible default ordering: `String` (lexicographic/dictionary order), `Integer`/`Double`/all wrapper classes (numeric order), `LocalDate`/`LocalDateTime` (chronological order). This is *why* `Collections.sort(listOfStrings)` or `Collections.sort(listOfIntegers)` just works without you writing any comparison logic — the JDK classes already define their own natural ordering.

### Key Characteristics
| Aspect | Detail |
|---|---|
| Package | `java.lang` |
| Method | `int compareTo(T o)` — single method |
| Where implemented | Inside the class being compared itself |
| Number of orderings per class | Exactly **one** — the "natural" order |
| Affects | The class's own source code (must modify the class) |
| Used automatically by | `Collections.sort()`, `Arrays.sort()`, `TreeSet`, `TreeMap` (when no `Comparator` is supplied) |

---

## `Comparator` — External, Custom, Multiple Orderings

### What It Is
`Comparator<T>` is a **separate, standalone interface** (in `java.util`, not `java.lang`) used to define **custom ordering logic externally** — completely independent of the class being compared. Unlike `Comparable`, you can define **as many `Comparator`s as you want** for the same class, each representing a different way to sort it.

```java
public interface Comparator<T> {
    int compare(T o1, T o2);
}
```

### The Contract of `compare()`
Same contract as `compareTo()`:
- Negative if `o1` should come **before** `o2`.
- Zero if they're considered **equal** for sorting purposes.
- Positive if `o1` should come **after** `o2`.

### How to Implement It

```java
class Employee {
    String name;
    int salary;
    int age;
    // constructor, toString omitted for brevity
}

// A separate Comparator class/object, defined OUTSIDE Employee
Comparator<Employee> byName = new Comparator<Employee>() {
    @Override
    public int compare(Employee e1, Employee e2) {
        return e1.name.compareTo(e2.name);
    }
};
```

Since Java 8, this is almost always written far more concisely as a **lambda expression**, or via the elegant `Comparator.comparing()` static factory methods:

```java
Comparator<Employee> byName = Comparator.comparing(e -> e.name);
Comparator<Employee> byAge = Comparator.comparingInt(e -> e.age);
Comparator<Employee> bySalaryDesc = Comparator.comparingInt((Employee e) -> e.salary).reversed();
```

```java
List<Employee> employees = getEmployees();

employees.sort(byName);                          // sort by name
employees.sort(byAge);                            // sort by age
Collections.sort(employees, bySalaryDesc);        // sort by salary, descending
```

### Chaining Multiple Sort Criteria — `thenComparing()`
A powerful, commonly-used real-world feature: sort primarily by one field, and **break ties** using a secondary field.

```java
Comparator<Employee> byDeptThenSalaryDesc = Comparator
        .comparing((Employee e) -> e.department)
        .thenComparing(Comparator.comparingInt((Employee e) -> e.salary).reversed());

employees.sort(byDeptThenSalaryDesc);
// Groups employees by department (alphabetically), and within each department,
// sorts by salary from highest to lowest.
```

### Key Characteristics
| Aspect | Detail |
|---|---|
| Package | `java.util` |
| Method | `int compare(T o1, T o2)` — two-argument method |
| Where implemented | A separate class/lambda, external to the object being compared |
| Number of orderings per class | **Unlimited** — as many `Comparator`s as needed |
| Affects | Doesn't touch the original class at all |
| Used explicitly via | `list.sort(comparator)`, `Collections.sort(list, comparator)`, `new TreeSet<>(comparator)`, `stream().sorted(comparator)` |

---

## `Comparable` vs `Comparator` — Side-by-Side Comparison

| Aspect | `Comparable` | `Comparator` |
|---|---|---|
| Package | `java.lang` | `java.util` |
| Method | `compareTo(T o)` — 1 parameter | `compare(T o1, T o2)` — 2 parameters |
| Sorting logic location | Inside the class itself | External, separate class/lambda |
| Number of sort sequences | Only one (natural order) | Multiple, unlimited |
| Requires modifying source class? | ✅ Yes | ❌ No |
| Can sort classes you don't own (e.g., third-party/JDK classes)? | ❌ No | ✅ Yes |
| Invocation | `Collections.sort(list)` | `Collections.sort(list, comparator)` |
| Used by `TreeSet`/`TreeMap` when | No comparator supplied at construction | A comparator is supplied at construction |

---

## Why Have Both? (The Real Design Rationale)

This is the crux of the interview-favorite question — "why does Java need two interfaces for the same conceptual job?"

1. **A class can only have ONE natural ordering** — but real-world sorting needs are rarely singular. A `List<Employee>` might need to be sorted by **name** on one screen, by **salary** on another, and by **hire date** in a report. `Comparable` alone can't provide this flexibility — it locks in exactly one ordering baked into the class. `Comparator` solves this by letting you define as many independent orderings as you need, chosen at the **call site**, not baked into the class.

2. **You can't always modify the class you want to sort.** If you're sorting a `String`, a `LocalDate`, or a `Product` class from a third-party library, you **cannot** add a `compareTo()` method to it — you don't own that source code. `Comparator` lets you impose custom ordering on **any class**, including ones you have zero control over, without touching their source.

3. **Separation of concerns.** `Comparable` bakes ordering logic into the class's core identity/behavior — appropriate when there truly is one "obvious" natural order (e.g., numbers sort numerically, dates sort chronologically). `Comparator` keeps sorting logic as a separate, pluggable concern — appropriate when sorting is a **context-dependent, UI/use-case-driven** decision, which is extremely common in real applications.

### Real-World Industry Example
In an **e-commerce product listing page**, a `Product` class might implement `Comparable` for a sensible default ordering (say, by `productId`, since that's a stable, unambiguous natural key). But the actual UI needs to support **multiple sort dropdowns** the user can pick from — "Price: Low to High," "Price: High to Low," "Customer Rating," "Newest Arrivals" — each of these is a **separate `Comparator`**, selected dynamically based on the user's dropdown choice, without ever touching the `Product` class itself:

```java
class Product implements Comparable<Product> {
    String id;
    double price;
    double rating;
    LocalDate launchDate;

    @Override
    public int compareTo(Product other) {
        return this.id.compareTo(other.id);   // natural order: by product ID
    }
}

// UI-driven sort options — all separate from the class definition
Comparator<Product> priceLowToHigh = Comparator.comparingDouble(p -> p.price);
Comparator<Product> priceHighToLow = priceLowToHigh.reversed();
Comparator<Product> byRatingDesc = Comparator.comparingDouble((Product p) -> p.rating).reversed();
Comparator<Product> newestFirst = Comparator.comparing((Product p) -> p.launchDate).reversed();

products.sort(priceLowToHigh);   // dynamically applied based on what the user selected on screen
```

Another very common real-world case: **sorting a `List<Employee>` by their manager's name for an org chart report**, or **sorting log entries by severity level then by timestamp** — both scenarios need multiple, situational sort orders that have nothing to do with the "identity" of the object itself, making `Comparator` the natural tool.

---

## Using Both Together with Streams (Modern Java)

```java
List<Employee> sorted = employees.stream()
        .sorted()                                  // uses Comparable's natural order
        .collect(Collectors.toList());

List<Employee> sortedByAgeThenName = employees.stream()
        .sorted(Comparator.comparingInt((Employee e) -> e.age).thenComparing(e -> e.name))
        .collect(Collectors.toList());
```

---

## Common Mistakes & Gotchas

- ❌ Forgetting that `compareTo()` returning `0` means "equal for sorting purposes" — but this is **not automatically synced** with `equals()`. If `compareTo()` returns `0` for two objects that `.equals()` considers unequal, this breaks the contract for sorted collections like `TreeSet`/`TreeMap`, which treat "`compareTo() == 0`" as **duplicate/equal**, silently dropping one of them. This is formally called being **"inconsistent with `equals()`"** — legal per the interface but strongly discouraged, and explicitly called out in the JDK's own documentation.
- ❌ Using subtraction (`return this.salary - other.salary;`) for comparison — this can silently **overflow** for large values (e.g., comparing `Integer.MAX_VALUE` and a large negative number), producing incorrect ordering. Always prefer `Integer.compare()`, `Double.compare()`, etc.
- ❌ Writing a `Comparator` that isn't **transitive** (if A < B and B < C, then A must be < C) — violating this can cause unpredictable behavior in sorting algorithms and even throw `IllegalArgumentException: Comparison method violates its general contract!` on large datasets (Java's `TimSort` actively detects certain contract violations at runtime).
- ❌ Forgetting `Comparator.reversed()` exists — manually writing `return other.compareTo(this);` works, but `.reversed()` is clearer and less error-prone.
- ❌ Not using `thenComparing()` for tie-breaking, and instead writing a single convoluted `compare()` method with nested if-else logic for multiple fields — `thenComparing()` chains are far more readable and maintainable.

---

## Interview Questions

1. What is the fundamental difference between `Comparable` and `Comparator`, beyond just "one has `compareTo` and the other has `compare`"?
2. Why does Java provide two separate interfaces for object comparison instead of just one?
3. Can a class implement `Comparable` and also be sorted using a `Comparator` at the same time? What takes priority when both are available?
4. Why is `return this.salary - other.salary;` considered a bad practice inside `compareTo()`?
5. What does it mean for a `compareTo()` implementation to be "inconsistent with `equals()`", and why is that dangerous specifically for `TreeSet`/`TreeMap`?
6. If you insert two objects into a `TreeSet` where `compareTo()` returns `0` but `equals()` returns `false`, what actually happens?
7. What is the contract that `compareTo()`/`compare()` must satisfy regarding transitivity, and what happens if you violate it?
8. How does `TreeMap`/`TreeSet` decide which ordering to use if you construct it without passing a `Comparator`, versus when you do pass one?
9. What is `Comparator.thenComparing()`, and how does it help when sorting by multiple fields?
10. How would you sort a `List<String>` by string length, and then alphabetically for strings of the same length, using `Comparator`?
11. Why can't you use `Comparable` to sort a third-party class in two different ways for two different screens in your application?
12. What is the difference between `Comparator.naturalOrder()` and implementing `Comparable` yourself?
13. How does `Comparator.reversed()` work internally — does it modify the original comparator or create a new one?
14. Why might Java's sort algorithm throw `"Comparison method violates its general contract!"` at runtime, and what usually causes it?
15. Can `compareTo()` or `compare()` return any negative/positive integer, or must it strictly be `-1`, `0`, or `1`?
16. How would you make a class immutable-safe for use as a `TreeMap` key, considering both `Comparable` and `hashCode()`/`equals()` concerns?
17. What's the performance implication of using `Comparator.comparing()` with a key extractor versus a hand-written `compare()` method?
18. If a class doesn't implement `Comparable` and you try to put it into a `TreeSet` without a `Comparator`, what happens at runtime?