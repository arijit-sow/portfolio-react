## Why Were Interfaces and Abstract Classes Introduced?

Both exist to support **abstraction** — hiding implementation details while exposing only essential behavior — but they were introduced to solve slightly different design problems:

- **Abstract classes** were introduced so related classes could **share common code** (fields, partially implemented methods) while still forcing subclasses to implement certain behaviors themselves. They model an **"is-a"** relationship with shared state.
- **Interfaces** were introduced to define a **pure contract** — a guarantee of *what* a class can do, without dictating *how* — allowing completely unrelated classes to promise the same capability. They also became Java's way of achieving a safe form of **multiple inheritance of type**, since Java classes can only extend one class but can implement many interfaces.

> **Note:** Before interfaces existed, if two unrelated classes (like a `Bird` and an `Airplane`) both needed to guarantee a `fly()` behavior, there was no clean way to enforce that contract across unrelated class hierarchies without duplicating code or resorting to fragile conventions.

---

## Abstract Classes

### What is an Abstract Class?

- A class declared with the `abstract` keyword that **cannot be instantiated directly** — you can never write `new AbstractClassName()`.
- It can contain a **mix** of fully implemented (concrete) methods and unimplemented (`abstract`) methods that subclasses are forced to define.

### How to Declare an Abstract Class

```java
public abstract class PaymentProcessor {

    protected String transactionId;   // regular field

    // concrete method - shared logic, used as-is by all subclasses
    public void logTransaction() {
        System.out.println("Logging transaction: " + transactionId);
    }

    // abstract method - no body, MUST be implemented by any concrete subclass
    public abstract boolean processPayment(double amount);
}
```

```java
public class CreditCardProcessor extends PaymentProcessor {
    @Override
    public boolean processPayment(double amount) {
        // actual credit card processing logic
        return true;
    }
}
```

### Features of Abstract Classes

- Can have **both** abstract methods (no body) and concrete methods (with a body).
- Can have **constructors** — even though you can't instantiate an abstract class directly, its constructor still runs when a subclass object is created (via an implicit or explicit `super()` call).
- Can have **instance fields**, `static` fields, `static` methods, and blocks — just like a normal class.
- Can have any access modifier on its methods: `public`, `protected`, `default`, but **not `private`** for abstract methods (a subclass couldn't override a private method anyway).
- A class extending an abstract class **must implement all its abstract methods**, unless the subclass itself is also declared `abstract`.
- A class can extend **only one** abstract class (single inheritance rule still applies).

### Why Can an Abstract Class Have a Constructor If It's Never Instantiated Directly?

Because subclasses rely on it to initialize the **shared/inherited state** defined in the abstract class. When you write `new CreditCardProcessor()`, the JVM still calls `PaymentProcessor`'s constructor first (via an implicit `super()`) to properly set up the inherited fields before the subclass's own constructor logic runs.

---

## Interfaces

### What is an Interface?

- A reference type in Java, similar to a class, that defines a **contract** of behavior — traditionally, only method signatures with no implementation, though this has expanded significantly since Java 8.
- Any class that `implements` an interface is making a formal promise to provide concrete implementations for its methods.

### How to Declare an Interface

```java
public interface PaymentGateway {
    boolean processPayment(double amount);   // implicitly public and abstract
    void refund(String transactionId);
}
```

```java
public class RazorpayGateway implements PaymentGateway {
    @Override
    public boolean processPayment(double amount) {
        // Razorpay-specific implementation
        return true;
    }

    @Override
    public void refund(String transactionId) {
        // Razorpay-specific refund logic
    }
}
```

### Evolution of Interfaces Across Java Versions

| Java Version | What Was Added |
|---|---|
| **Before Java 8** | Only abstract methods (implicitly `public abstract`) and `public static final` constants |
| **Java 8** | **Default methods** (`default` keyword) — allow interfaces to provide a method body, so existing implementing classes don't break when new methods are added |
| **Java 8** | **Static methods** — utility methods that belong to the interface itself, called via `InterfaceName.methodName()` |
| **Java 9** | **Private methods** — allow internal helper logic to be shared between default/static methods within the interface, without exposing that helper to implementing classes |

```java
public interface PaymentGateway {
    boolean processPayment(double amount);

    // default method - has a body, optional to override
    default void logAttempt() {
        System.out.println("Attempting payment...");
    }

    // static method - belongs to the interface itself
    static PaymentGateway getDefault() {
        return new RazorpayGateway();
    }

    // private method (Java 9+) - internal helper, not visible to implementers
    private void internalAudit() {
        System.out.println("Auditing internally...");
    }
}
```

### Features of Interfaces

- All fields in an interface are **implicitly `public static final`** (constants) — you cannot declare a regular instance field in an interface.
- All abstract methods are **implicitly `public abstract`**, even if you don't write those keywords.
- Interfaces **cannot have constructors** — since they can never be instantiated on their own.
- A class can implement **multiple** interfaces, unlike extending only one abstract class.
- An interface can **extend multiple other interfaces** (unlike classes, which can extend only one class).

```java
public interface Readable { void read(); }
public interface Writable { void write(); }

public interface ReadWritable extends Readable, Writable {
    // inherits both read() and write() as abstract methods
}
```

### Functional Interfaces (Java 8+)

- An interface with **exactly one** abstract method is called a **Functional Interface**, and can be implemented using a **lambda expression** instead of a full class.
- Marked (optionally, but recommended) with `@FunctionalInterface` so the compiler enforces the single-abstract-method rule.

```java
@FunctionalInterface
public interface Validator {
    boolean isValid(String input);
}

Validator emailValidator = input -> input.contains("@");   // lambda implementation
```

> **Note:** Built-in examples you already use constantly — `Runnable`, `Comparator`, and everything in `java.util.function` (`Function`, `Predicate`, `Supplier`, `Consumer`) — are all functional interfaces.

---

## Abstract Class vs Interface — Full Comparison

| Feature | Abstract Class | Interface |
|---|---|---|
| Keyword | `abstract class` | `interface` |
| Instantiation | Cannot be instantiated | Cannot be instantiated |
| Methods | Can have abstract AND concrete methods | Traditionally only abstract; now also `default`, `static`, `private` (Java 8+/9+) |
| Fields | Can have any kind of field (instance, static, final, or not) | Only `public static final` constants |
| Constructors | Can have constructors | Cannot have constructors |
| Inheritance | A class can extend only **one** abstract class | A class can implement **multiple** interfaces |
| Interface-to-interface | N/A | An interface can extend **multiple** interfaces |
| Access modifiers on methods | `public`, `protected`, `default` allowed | Implicitly `public` (except `private` helper methods since Java 9) |
| Use case | Sharing common code + state across closely related classes | Defining a capability/contract across unrelated classes |
| Speed (historically) | Slightly faster (direct method resolution) — largely negligible in modern JVMs | Slightly slower historically due to extra indirection — negligible today |

---

## When to Use Which

**Use an Abstract Class when:**
- Multiple related classes share **common code** (fields, helper methods) that you don't want to duplicate.
- You want to provide a **partial implementation** and force subclasses to complete specific parts.
- The relationship between classes is a true **"is-a"** hierarchy (e.g., `CreditCardProcessor is-a PaymentProcessor`).
- You need **constructors** to initialize shared state.

**Use an Interface when:**
- You want to define a **capability/contract** that completely unrelated classes can implement (e.g., both a `Bird` and an `Airplane` can implement `Flyable`, despite having nothing else in common).
- You need a class to honor **multiple** contracts at once (multiple interface implementation).
- You're designing a public API/library, where you want to be free to change the internal implementation without breaking the exposed contract.
- You want to take advantage of **lambda expressions** for simple, single-method behaviors (functional interfaces).

---

## Real-World Industry Implementation

### Abstract Class Example — Report Generation Framework

A reporting module in an enterprise system (e.g., generating PDF, Excel, or CSV reports) often uses an abstract class to share the overall report-building workflow, while letting subclasses customize only the format-specific parts:

```java
public abstract class ReportGenerator {

    // shared workflow (Template Method Pattern)
    public final void generateReport(List<Data> data) {
        fetchHeader();
        writeBody(data);
        writeFooter();
    }

    protected void fetchHeader() {
        System.out.println("Standard company header");
    }

    protected void writeFooter() {
        System.out.println("Standard footer with page numbers");
    }

    protected abstract void writeBody(List<Data> data);  // format-specific
}

public class PdfReportGenerator extends ReportGenerator {
    @Override
    protected void writeBody(List<Data> data) {
        // PDF-specific rendering logic
    }
}

public class ExcelReportGenerator extends ReportGenerator {
    @Override
    protected void writeBody(List<Data> data) {
        // Excel-specific rendering logic
    }
}
```

This is a real, widely used design (the **Template Method Pattern**) — the header/footer logic is written once and shared, while each report format only implements the part that's genuinely different.

### Interface Example — Multi-Provider Cloud Messaging System

A real messaging/notification microservice that must support multiple SMS providers (Twilio, AWS SNS, MSG91) is typically built entirely around an interface, since these providers have nothing in common except the contract they fulfill:

```java
public interface SmsProvider {
    boolean sendSms(String phoneNumber, String message);
}

public class TwilioSmsProvider implements SmsProvider {
    @Override
    public boolean sendSms(String phoneNumber, String message) {
        // Twilio SDK-specific call
        return true;
    }
}

public class AwsSnsProvider implements SmsProvider {
    @Override
    public boolean sendSms(String phoneNumber, String message) {
        // AWS SNS SDK-specific call
        return true;
    }
}
```

```java
public class SmsService {
    private final SmsProvider provider;   // depends only on the interface

    public SmsService(SmsProvider provider) {
        this.provider = provider;
    }

    public void notifyUser(String phone, String msg) {
        provider.sendSms(phone, msg);
    }
}
```

The business logic (`SmsService`) never needs to know or care which actual SMS provider is plugged in — this is exactly how real systems swap vendors (e.g., migrating from Twilio to AWS SNS for cost reasons) without touching a single line of core application logic.

---

## Interview & Tricky Questions

1. Why were interfaces introduced in Java if abstract classes already support abstraction?
2. Can an abstract class have zero abstract methods? Is that still useful?
3. Can you instantiate an abstract class using an anonymous inner class? If so, how?
4. Why can't an interface have instance (non-static, non-final) fields?
5. Why are all fields in an interface implicitly `public static final`?
6. Why can't interfaces have constructors?
7. What problem did default methods (Java 8) solve for existing interface implementations?
8. What is the difference between a default method and a static method in an interface?
9. Why were private methods added to interfaces in Java 9?
10. What is a functional interface, and what rule must it follow?
11. Can a functional interface have default and static methods in addition to its one abstract method?
12. Why can a class implement multiple interfaces but extend only one class?
13. Can an interface extend multiple other interfaces? Can a class do the same with abstract classes?
14. If a class implements two interfaces that both have a conflicting default method, what happens?
15. Can an abstract class implement an interface without implementing all of its methods?
16. Why does an abstract class need a constructor if it can never be instantiated directly?
17. What is the Template Method design pattern, and how does it rely on abstract classes?
18. Give a real scenario where you'd choose an interface over an abstract class, and explain why.
19. Give a real scenario where you'd choose an abstract class over an interface, and explain why.
20. Can an abstract method be `private` or `static`? Why or why not?
21. Is it possible for an abstract class to not have any constructor explicitly, yet still have one available?
22. What happens if a subclass of an abstract class doesn't implement all abstract methods, and is not itself declared abstract?
23. Why might using an interface make unit testing easier compared to depending directly on a concrete class?
24. How do interfaces enable Java to achieve a safe form of "multiple inheritance"?