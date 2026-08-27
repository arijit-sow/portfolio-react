## What is a Class?

- A **class** is a user-defined blueprint or template that defines the **structure** (fields/state) and **behavior** (methods) that its objects will have.
- A class itself doesn't occupy memory for the data it describes — it only exists as a description. Memory is only allocated when an **object** is actually created from it.
- Every class in Java, directly or indirectly, extends `java.lang.Object` — the root of the entire class hierarchy.

```java
public class Employee {
    // fields (state)
    String name;
    double salary;

    // constructor
    public Employee(String name, double salary) {
        this.name = name;
        this.salary = salary;
    }

    // method (behavior)
    public void giveRaise(double amount) {
        salary += amount;
    }
}
```

---

## What is an Object?

- An **object** is a concrete instance of a class — an actual entity in memory with real values assigned to its fields, created using the `new` keyword (in most cases).
- If `Employee` is the blueprint, then `emp1` and `emp2` below are two independent objects, each with their own copy of `name` and `salary`.

```java
Employee emp1 = new Employee("Riya", 55000);
Employee emp2 = new Employee("Aman", 62000);
```

> **Note:** `emp1` and `emp2` share the same method definitions (`giveRaise()` isn't duplicated in memory for each object — only one copy of the method's bytecode exists in the Method Area), but each object maintains its own separate copy of instance fields (`name`, `salary`) in the Heap.

---

## Anatomy of a Class — What Can Go Inside

A Java class can contain any combination of:

| Member | Purpose |
|---|---|
| **Fields (instance/static variables)** | Store the state/data of the class |
| **Constructors** | Special methods used to initialize a newly created object |
| **Methods** | Define the behavior/actions the class can perform |
| **Blocks** | Static blocks (run once at class load) or instance blocks (run before every constructor call) |
| **Nested classes/interfaces** | Classes or interfaces declared inside another class, for tightly related helper logic |

```java
public class BankAccount {
    // static field - shared across all objects
    static int totalAccountsCreated = 0;

    // instance fields - unique to each object
    private String accountHolder;
    private double balance;

    // static block - runs once, when class is first loaded
    static {
        System.out.println("BankAccount class loaded into memory");
    }

    // instance block - runs before every constructor call
    {
        System.out.println("Preparing a new account...");
    }

    // constructor - initializes a new object
    public BankAccount(String accountHolder, double balance) {
        this.accountHolder = accountHolder;
        this.balance = balance;
        totalAccountsCreated++;
    }

    // instance method - defines behavior
    public void deposit(double amount) {
        balance += amount;
    }
}
```

---

## How to Write a Class — Syntax and Rules

```java
[accessModifier] [class] ClassName [extends SuperClass] [implements Interface1, Interface2] {
    // class body
}
```

- **Class name conventions:** PascalCase (e.g., `Employee`, `BankAccount`), following identifier rules — no spaces, cannot start with a digit, case sensitive.
- A single `.java` file can contain **multiple classes**, but **only one** of them can be `public`, and if there is a `public` class, the **file name must exactly match that public class's name**.
- A class can extend **only one** other class (`extends`) — Java doesn't support multiple class inheritance — but can implement **multiple** interfaces (`implements`).

### Why We Write Classes This Way (The Reasoning)

- **Encapsulating state and behavior together** mirrors how real-world entities work — a `BankAccount` naturally "owns" its balance and the operations (`deposit`, `withdraw`) that are allowed to touch that balance, instead of scattering that logic across unrelated functions.
- **Access modifiers on fields** (typically `private`) combined with public methods enforce controlled access — this is the practical implementation of encapsulation, protecting data integrity.
- **Constructors** exist specifically so an object is never left in a "half-built" or invalid state — by the time `new BankAccount(...)` returns, the object is guaranteed to have valid initial values.
- **One public class per file** is a JVM/compiler convention that makes it trivial for the class loader to locate the right `.class` file matching a public class by name, without needing to scan file contents first.

---

## How to Create Objects

### Using the `new` Keyword (Most Common Way)

```java
Employee emp = new Employee("Riya", 55000);
```

### What Actually Happens When You Write `new Employee(...)` — Step by Step

1. **Class loading check:** The JVM checks if the `Employee` class is already loaded into the Method Area. If not, the Class Loader Subsystem loads, links, and initializes it first.
2. **Memory allocation:** The JVM allocates memory for the new object in the **Heap** (Eden space, typically).
3. **Default values assigned:** All instance fields are automatically given their default values (`0`, `false`, `null`, etc.) before the constructor runs.
4. **Constructor invoked:** The matching constructor executes, assigning the actual values passed in (`"Riya"`, `55000`) to the fields.
5. **Reference returned:** The `new` expression returns a reference (memory address) to the newly created object, which gets stored in the variable `emp` (on the Stack, if `emp` is a local variable).

### Other Ways to Create Objects (Less Common, Good to Know)

```java
// 1. Using Class.newInstance() / Constructor.newInstance() (Reflection)
Employee emp2 = Employee.class.getDeclaredConstructor().newInstance();

// 2. Using clone() - creates a copy of an existing object
Employee emp3 = (Employee) emp.clone();

// 3. Using deserialization - recreating an object from a saved byte stream
Employee emp4 = (Employee) objectInputStream.readObject();

// 4. Using factory methods (common in real frameworks)
Employee emp5 = Employee.create("Aman", 62000);
```

> **Note:** In real-world enterprise code, direct `new` calls are often avoided in favor of **Factory patterns** or **Dependency Injection frameworks** (like Spring), so that object creation logic can be centralized, mocked in tests, or swapped without touching business logic.

---

## Packages

### What is a Package?

- A **package** is a namespace/folder-like mechanism used to group related classes and interfaces together, and to avoid naming conflicts between classes with the same name.
- Physically, a package corresponds to a **directory structure** on disk — the package `com.company.project.service` maps to the folder path `com/company/project/service/`.

### Why Do We Need Packages?

1. **Avoiding naming collisions** — Two classes named `Employee` can coexist peacefully if one is `com.hr.Employee` and the other is `com.payroll.Employee`.
2. **Better code organization** — Related classes (e.g., all database-related classes) are grouped logically, making large codebases navigable.
3. **Access control** — Package-private (default) access lets classes within the same package share internal details without exposing them to the entire application.
4. **Easier maintenance** — Clear separation of concerns (e.g., `controller`, `service`, `repository` packages in a typical Spring Boot project).

### How to Declare a Package

```java
package com.company.banking.service;

public class AccountService {
    // class body
}
```

- The `package` statement, if present, **must be the very first line** of the file (only comments can precede it).
- **Naming convention:** All lowercase, using **reverse domain name** notation (e.g., a company owning `company.com` would use `com.company...`) to guarantee global uniqueness across organizations.

### Importing Packages

```java
import java.util.List;              // imports a single class
import java.util.*;                 // imports all classes in java.util (wildcard)
import com.company.banking.model.Account;  // importing your own package's class
```

- Classes inside `java.lang` (like `String`, `System`, `Math`) are **imported automatically** — you never need to write `import java.lang.String;`.
- Wildcard imports (`import java.util.*;`) only import classes directly inside that package — they do **not** include sub-packages.

### The Default Package

- If a `.java` file has **no** `package` statement, its classes belong to the unnamed **default package**.
- This is fine for small throwaway scripts, but strongly discouraged in real projects since it prevents proper organization and can't be properly imported by classes that *do* belong to named packages.

---

## The Meaning Behind `public static void main(String[] args)`

Every standalone Java application needs this exact method signature as its entry point, because the JVM is hardcoded to look for it. Let's break down **why** each word is required:

```java
public static void main(String[] args) {
    // program starts here
}
```

| Keyword | Why It's Required |
|---|---|
| **`public`** | The JVM is technically "outside" your class when it starts your program — it needs to call `main()` from outside, so the method must be accessible from anywhere, hence `public`. If it were `private`, the JVM couldn't invoke it and you'd get a runtime error. |
| **`static`** | The JVM calls `main()` **before any object of your class exists**. Since instance methods require an object to be called on, `main()` must belong to the class itself (`static`) so it can be invoked without creating an instance first. |
| **`void`** | `main()` doesn't need to return anything to the JVM — the program's "result" is communicated through its exit code (via `System.exit(code)`) or simply by finishing execution, not through a return value. |
| **`main`** | This exact name is what the JVM specification defines as the method it will search for and invoke — it's a hardcoded convention, not something arbitrary. |
| **`String[] args`** | Allows the program to receive **command-line arguments** when launched (e.g., `java Program hello world` makes `args = {"hello", "world"}`). Even if unused, the parameter must be declared so the JVM's expected method signature matches exactly. |

### What If You Change the Signature?

| Change | Result |
|---|---|
| Remove `static` | Compiles, but throws `NoSuchMethodError: main` at runtime — the JVM can't call an instance method without an object. |
| Change `public` to `private`/default | Compiles, but the JVM cannot access it, causing a runtime error. |
| Change `void` to something else (e.g., `int`) | The JVM will not recognize this as the valid entry point, and running it directly will fail. |
| Rename `args` to something else, like `params` | Perfectly fine — the **parameter name** doesn't matter, only the **type** (`String[]`) matters. |
| Use `String... args` instead of `String[] args` | Also valid — varargs syntax is functionally equivalent to an array here. |
| Overload `main()` with a different signature | Allowed to compile, but the JVM will **only** call the exact `public static void main(String[] args)` version as the entry point; other overloads must be called manually from within your code. |

> **Note:** "PSVM" is simply a shorthand/mnemonic (and an actual IDE code-snippet shortcut in IntelliJ IDEA) for typing out `public static void main(String[] args)` quickly — it's not a special Java keyword, just the initials of the method signature.

---

## Interview & Tricky Questions

1. What is the difference between a class and an object?
2. Can a single `.java` file contain multiple classes? What are the restrictions?
3. Why must the public class name match the file name exactly?
4. What is the exact sequence of steps that happens internally when you write `new Employee(...)`?
5. Where is the actual object data stored when you use `new`, and where is the reference to it stored?
6. What are the different ways to create an object in Java besides using `new`?
7. Why do enterprise applications often avoid calling `new` directly and use Factory patterns or Dependency Injection instead?
8. What is a package, and how does it map to the physical file system?
9. Why is reverse domain naming convention used for packages?
10. What happens if a class has no `package` statement at the top?
11. Does a wildcard import (`import java.util.*;`) also import classes from sub-packages? Why or why not?
12. Why don't we need to explicitly import classes from `java.lang`?
13. Why must the `package` statement be the very first line in a Java file?
14. Why is `main()` declared as `public`?
15. Why is `main()` declared as `static`?
16. What would happen if you removed `static` from the `main()` method signature?
17. Why does `main()` return `void` instead of some other type?
18. Does the parameter name in `main(String[] args)` matter? What actually matters?
19. Is `String[] args` the same as `String... args` in the `main()` method? Why does this work?
20. Can you overload the `main()` method? Will the JVM call the overloaded version automatically?
21. What is the actual purpose of the `args` parameter in `main()`?
22. What access modifier restrictions exist for a top-level class versus a nested class?
23. Can two classes in different packages have the exact same class name without conflict? Why?
24. What is the default access level of a class or member if no access modifier is specified?