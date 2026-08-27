# Object-Oriented Programming (OOPs) — Complete Notes

> **Topic:** Core OOP Principles in Java
> **Level:** Beginner → Advanced (Interview Ready)

---

## What is Object-Oriented Programming?

**Object-Oriented Programming (OOP)** is a programming paradigm built around the concept of **objects** — real-world entities that bundle together **state** (data/attributes) and **behavior** (methods/functions) into a single unit.

Instead of writing code as a sequence of instructions acting on raw data (like procedural programming), OOP models software as a collection of interacting objects — similar to how real-world systems work: a `Car` has attributes like `color` and `speed`, and behaviors like `accelerate()` and `brake()`.

### Why OOP Exists (The Industry Motivation)
Large software systems (banking platforms, e-commerce sites, food-delivery apps) grow to millions of lines of code, touched by hundreds of engineers. Without structure, this becomes unmaintainable spaghetti code. OOP solves this by giving us:

- **Modularity** — code is organized into self-contained, testable units (classes).
- **Reusability** — existing classes can be extended or reused instead of rewritten.
- **Scalability** — new features can be added with minimal ripple effect on existing code.
- **Real-world mapping** — business domains (Order, Customer, Payment) map naturally onto classes, making systems easier to design and reason about.

---

## The Four Pillars of OOP

```
        ┌───────────────────────────┐
        │   Object-Oriented Design  │
        └─────────────┬─────────────┘
                       │
   ┌───────────┬───────┴───────┬───────────────┐
   │           │                │               │
Encapsulation Abstraction  Inheritance     Polymorphism
```

---

## 1. Encapsulation

**Encapsulation** is the practice of **bundling data (fields) and the methods that operate on that data into a single unit (class)**, while **restricting direct access** to the internal state from outside the class. Access is only allowed through well-defined public methods (getters/setters).

Think of it as a **capsule** — the internal machinery is hidden; only a controlled interface is exposed.

### How It's Achieved in Java
- Declare fields as `private`.
- Expose controlled access via `public` getter/setter methods.
- Add validation logic inside setters to protect the object's invariants.

```java
class BankAccount {
    private double balance;   // hidden from outside world

    public double getBalance() {
        return balance;
    }

    public void deposit(double amount) {
        if (amount <= 0) {
            throw new IllegalArgumentException("Deposit must be positive");
        }
        balance += amount;
    }

    public void withdraw(double amount) {
        if (amount > balance) {
            throw new IllegalStateException("Insufficient funds");
        }
        balance -= amount;
    }
}
```

Notice: nobody can do `account.balance = -5000;` directly — every change is forced to go through validated methods.

### Real-World Industry Example
In a **banking application** (like a core banking system at a bank), the `Account` class never exposes its `balance` field directly. Every deposit/withdrawal goes through service-layer methods that enforce business rules (minimum balance, fraud checks, transaction logging). This is encapsulation protecting financial integrity — a UI or another microservice can *never* directly mutate the balance; it can only call `deposit()` or `withdraw()` APIs.

### Why It Matters
- Prevents invalid object states.
- Hides implementation details — internal representation can change without breaking external code.
- Central point for validation, logging, and security checks.

---

## 2. Abstraction

**Abstraction** means **hiding complex implementation details and showing only the essential features** of an object to the user. It answers "**what** an object does" without exposing "**how** it does it."

Achieved in Java via:
- **Abstract classes** (partial abstraction — can have both abstract and concrete methods)
- **Interfaces** (full abstraction of contract — implementing classes decide "how")

```java
abstract class PaymentProcessor {
    // abstract method — no implementation, just a contract
    abstract void processPayment(double amount);

    // concrete method — shared logic
    void logTransaction(double amount) {
        System.out.println("Logging transaction of ₹" + amount);
    }
}

class UpiPaymentProcessor extends PaymentProcessor {
    @Override
    void processPayment(double amount) {
        System.out.println("Processing ₹" + amount + " via UPI");
        // actual UPI gateway integration logic hidden here
    }
}

class CardPaymentProcessor extends PaymentProcessor {
    @Override
    void processPayment(double amount) {
        System.out.println("Processing ₹" + amount + " via Card");
        // actual card gateway integration logic hidden here
    }
}
```

```java
PaymentProcessor processor = new UpiPaymentProcessor();
processor.processPayment(499.0);   // caller doesn't know/care about internal gateway logic
```

### Real-World Industry Example
In a **food delivery app** (like Swiggy/Zomato-style systems), the checkout flow calls `paymentGateway.charge(amount)`. The calling code has **no idea** whether that hits Razorpay, Stripe, PayU, or an internal wallet system — it only knows the abstract contract. Engineers can swap payment providers entirely without touching checkout logic, because the abstraction boundary hides the complexity.

### Why It Matters
- Reduces complexity for the consumer of a class.
- Enforces a contract that multiple implementations can fulfill (`List` interface → `ArrayList`, `LinkedList`).
- Enables loose coupling between components — a cornerstone of scalable architecture.

---

## 3. Inheritance

**Inheritance** allows a class (**subclass/child**) to acquire the fields and methods of another class (**superclass/parent**), enabling **code reuse** and establishing an **"IS-A" relationship**.

```java
class Employee {
    String name;
    double baseSalary;

    void work() {
        System.out.println(name + " is working");
    }

    double calculateSalary() {
        return baseSalary;
    }
}

class Manager extends Employee {
    double teamBonus;

    @Override
    double calculateSalary() {
        return baseSalary + teamBonus;   // extends parent behavior
    }
}
```

```java
Manager m = new Manager();
m.name = "Priya";
m.baseSalary = 80000;
m.teamBonus = 15000;
System.out.println(m.calculateSalary());   // 95000
```

Here, `Manager` **IS-A** `Employee` — it inherits `name`, `work()`, and reuses/overrides `calculateSalary()`.

### Types of Inheritance in Java
| Type | Supported? | Notes |
|---|---|---|
| Single | ✅ | One subclass, one superclass |
| Multilevel | ✅ | `C extends B extends A` |
| Hierarchical | ✅ | Multiple subclasses from one superclass |
| Multiple (via classes) | ❌ | Not supported — avoids the "Diamond Problem" |
| Multiple (via interfaces) | ✅ | A class can implement multiple interfaces |

### Real-World Industry Example
In an **e-commerce platform's notification system**, you might have a base class `Notification` with common fields (`userId`, `message`, `timestamp`) and shared logic (`send()`, `logDelivery()`). `EmailNotification`, `SmsNotification`, and `PushNotification` all extend it, reusing common plumbing while overriding the actual delivery mechanism (`deliver()`). This avoids duplicating logging/retry logic in every notification type.

### Why It Matters
- Avoids code duplication.
- Establishes a natural hierarchy that mirrors real-world taxonomies.
- Enables **polymorphism** (see below) — treating subclasses uniformly through the parent type.

---

## 4. Polymorphism

**Polymorphism** ("many forms") means **the same method/interface behaves differently depending on the object that invokes it**, or depending on how it's called.

### 4.1 Compile-Time Polymorphism (Method Overloading)
Same method name, different parameter list — resolved by the **compiler** at compile time (also called **static binding**).

```java
class InvoiceCalculator {
    double calculateTotal(double price) {
        return price;
    }
    double calculateTotal(double price, double taxRate) {
        return price + (price * taxRate);
    }
    double calculateTotal(double price, double taxRate, double discount) {
        return (price + (price * taxRate)) - discount;
    }
}
```

### 4.2 Runtime Polymorphism (Method Overriding)
Subclass provides a specific implementation of a method already defined in its parent — resolved at **runtime** based on the actual object type (also called **dynamic binding**), using the mechanism of **upcasting**.

```java
class Shape {
    double area() { return 0; }
}

class Circle extends Shape {
    double radius;
    Circle(double radius) { this.radius = radius; }
    @Override
    double area() { return Math.PI * radius * radius; }
}

class Rectangle extends Shape {
    double length, width;
    Rectangle(double length, double width) { this.length = length; this.width = width; }
    @Override
    double area() { return length * width; }
}
```

```java
List<Shape> shapes = List.of(new Circle(5), new Rectangle(4, 6));
for (Shape s : shapes) {
    System.out.println(s.area());   // correct area() called based on ACTUAL object, not reference type
}
```

### Real-World Industry Example
In a **ride-sharing app** (like Uber/Ola-style systems), a `Vehicle` reference can point to `Bike`, `Sedan`, or `SUV` objects — each overriding `calculateFare(distance)` differently (bikes cheaper per km, SUVs costlier). The fare-calculation service just calls `vehicle.calculateFare(distance)` on a `Vehicle` reference without needing to know or check the exact subtype — the correct fare logic is picked automatically at runtime. This is polymorphism enabling clean, extensible business logic — adding a new vehicle type (`AutoRickshaw`) requires zero change to the fare service.

### Why It Matters
- Enables writing generic code (`List<Shape>`) that works with any subtype.
- Core to **extensibility** — new subclasses "just work" with existing code (Open/Closed Principle).
- Powers frameworks (Spring, JDBC drivers) where you code against interfaces, and the concrete implementation is plugged in at runtime.

---

## HAS-A Relationship (Association)

While inheritance models **IS-A**, many real-world relationships are better modeled as **HAS-A** — one class **contains a reference to** another class as a field, rather than extending it.

```java
class Engine {
    void start() { System.out.println("Engine starting..."); }
}

class Car {
    private Engine engine;   // Car HAS-A Engine
    Car(Engine engine) {
        this.engine = engine;
    }
    void start() {
        engine.start();
        System.out.println("Car is ready to drive");
    }
}
```

A `Car` is **not** an `Engine` (that would be wrong to model via inheritance) — it simply **has** one. HAS-A is implemented via **composition** or **aggregation**, which differ in **lifecycle ownership**.

---

## Aggregation (Weak HAS-A)

**Aggregation** is a HAS-A relationship where the **contained object can exist independently** of the container. It represents a **"whole-part"** relationship with **weak ownership** — if the whole is destroyed, the part continues to exist.

```java
class Department {
    String name;
    Department(String name) { this.name = name; }
}

class Professor {
    String name;
    Department department;   // Professor HAS-A Department (aggregation)

    Professor(String name, Department department) {
        this.name = name;
        this.department = department;
    }
}
```

```java
Department cs = new Department("Computer Science");
Professor p1 = new Professor("Dr. Mehta", cs);
Professor p2 = new Professor("Dr. Rao", cs);
// If p1 and p2 objects are destroyed, `cs` (Department) still exists independently
```

### Real-World Industry Example
In an **HR management system**, an `Employee` object holds a reference to a `Department` object. If an employee resigns and their `Employee` record is deleted/archived, the `Department` itself (e.g., "Engineering") **continues to exist** — it's shared and independent of any single employee. This is classic aggregation: the department was never "owned" by that one employee.

---

## Composition (Strong HAS-A)

**Composition** is a HAS-A relationship with **strong ownership** — the contained object's **lifecycle is entirely dependent** on the container. If the container is destroyed, the contained part is destroyed too. The part typically has **no meaning outside** the whole.

```java
class Engine {
    Engine() { System.out.println("Engine built"); }
}

class Car {
    private final Engine engine;   // Car OWNS Engine — created and destroyed with Car

    Car() {
        this.engine = new Engine();   // Engine's lifecycle tied to Car's lifecycle
    }
}
```

Here, the `Engine` object is created **inside** `Car`'s constructor — it has no existence outside a `Car`, and it's never passed in from outside. When a `Car` object is garbage collected, its `Engine` object becomes unreachable too.

### Real-World Industry Example
In an **e-commerce order system**, an `Order` object composes multiple `OrderItem` objects. An `OrderItem` (e.g., "2x Blue T-Shirt at ₹499") has **no meaning without its parent Order** — it isn't shared across orders, and if the `Order` is deleted, all its `OrderItem`s are deleted with it (cascade delete in the database mirrors this exact composition relationship). This is composition: strong, exclusive ownership.

```java
class OrderItem {
    String productName;
    int quantity;
    double price;
    OrderItem(String productName, int quantity, double price) {
        this.productName = productName;
        this.quantity = quantity;
        this.price = price;
    }
}

class Order {
    private final List<OrderItem> items = new ArrayList<>();  // Order OWNS OrderItems

    void addItem(String productName, int quantity, double price) {
        items.add(new OrderItem(productName, quantity, price));
    }
}
```

### Aggregation vs Composition — Side by Side

| Aspect | Aggregation | Composition |
|---|---|---|
| Ownership | Weak | Strong |
| Lifecycle | Independent | Dependent — part dies with whole |
| Real-world analogy | Professor ↔ Department | Car ↔ Engine, Order ↔ OrderItem |
| Object creation | Usually passed in (constructor injection) | Usually created internally by the owner |
| UML notation | Hollow diamond ◇ | Filled diamond ◆ |
| Can the part be shared across multiple wholes? | ✅ Yes | ❌ No (typically exclusive) |

---

## Why Favor Composition Over Inheritance? (Design Principle)

A widely followed industry principle: **"Favor composition over inheritance."**

- Inheritance creates **tight coupling** — a change in the parent class can silently break every subclass (the **fragile base class problem**).
- Deep inheritance hierarchies become hard to understand and maintain as systems grow.
- Composition offers more **flexibility** — behavior can be composed/swapped at runtime by injecting different implementations, whereas inheritance hierarchies are fixed at compile time.

```java
// Instead of: class ElectricCar extends Car extends Vehicle ... (rigid hierarchy)
// Prefer composing behavior:
interface Engine {
    void start();
}

class PetrolEngine implements Engine {
    public void start() { System.out.println("Vroom! Petrol engine started"); }
}

class ElectricEngine implements Engine {
    public void start() { System.out.println("Silent start — electric engine"); }
}

class Car {
    private Engine engine;   // composition — behavior injected, swappable
    Car(Engine engine) { this.engine = engine; }
    void start() { engine.start(); }
}
```

```java
Car petrolCar = new Car(new PetrolEngine());
Car electricCar = new Car(new ElectricEngine());
```

This is exactly how **Spring Framework's Dependency Injection** works at industry scale — services are composed together via interfaces rather than built through rigid inheritance chains.

---

## Interview Questions

### OOP Fundamentals

    1. What is OOP, and why was it introduced over procedural programming?

    2. What are the four pillars of OOP?

    3. Is Java a 100% pure object-oriented language? Why or why not?

    4. What is the difference between a class and an object?

---

### Encapsulation & Abstraction

    5. What is encapsulation, and how is it implemented in Java?

    6. Why should fields generally be `private` instead of `public`?

    7. What is the real difference between abstraction and encapsulation?

    8. Can you achieve abstraction without using an interface or abstract class?

    9. How does encapsulation help with thread-safety in a multi-threaded application?

---

### Inheritance

    10. What is inheritance, and what problem does it solve?

    11. Why does Java not support multiple inheritance through classes?

    12. What is the Diamond Problem, and why does it occur with multiple inheritance?

    13. How does Java's interface design handle the Diamond Problem?

    14. What are the design pitfalls of overusing inheritance in a large real-world codebase?

    15. Why is it said that "inheritance breaks encapsulation"?

    16. Why is "favor composition over inheritance" considered a best practice?

    17. Can you give a real-world example where inheritance would be a poor design choice compared to composition?

---

### 4. Polymorphism, Overloading & Overriding

    18. What is polymorphism?

    19. What is the difference between method overloading and method overriding?

    20. What is compile-time polymorphism, and why is it called static binding?

    21. What is runtime polymorphism, and how does the JVM decide which method to call?

    22. What is the difference between compile-time/static binding and runtime/dynamic binding?

    23. Can a `static` method be overridden in Java? Why or why not?

    24. Why are `static` methods hidden instead of overridden?

    25. Can you overload the `main()` method in Java?

    26. Can constructors be overloaded? Can they be overridden?

    27. What happens when you call an overridden method from within a constructor?

---

### 5. Abstract Classes & Interfaces

    28. What is the difference between an abstract class and an interface?

    29. Since Java 8 introduced default methods in interfaces, what is still different between an interface and an abstract class?

    30. Can an abstract class have a constructor? If yes, when is it called?

    31. Can an interface extend multiple interfaces?

    32. Can a class implement multiple interfaces?

    33. What is `InterfaceName.super.methodName()` used for?

---

### 6. Constructors, `this` & `super`

    34. What is the use of the `this` keyword? Give at least three use cases.

    35. What is the use of the `super` keyword?

    36. What happens if you don't explicitly call `super()` in a child class constructor?

    37. What happens if the parent class has no no-argument constructor and the child doesn't explicitly call `super()`?

    38. Can `this()` and `super()` be used in the same constructor?

    39. Why must `this()` or `super()` be the first statement in a constructor?

    40. Why can't constructors be polymorphic or overridden?            

---

### 7. Static vs Instance Members

    41. What is the significance of the `static` keyword at the class level versus the instance level?

    42. Can you access a non-static variable from a static method? Why or why not?

    43. What happens when a static method and an instance method have the same name in a parent-child relationship?

---

### 8. Association, Aggregation & Composition

    44. What is the difference between association, aggregation, and composition?

    45. What is the difference between aggregation and composition?

    46. What are "IS-A" and "HAS-A" relationships?

    47. How do you decide whether two classes should have an aggregation or composition relationship?

    48. Can a class have both an IS-A and HAS-A relationship at the same time?

    49. Is a `HashMap` field inside a class an example of composition or aggregation?

    50. Can a class exhibit both aggregation and composition relationships simultaneously with different fields?

    51. How would aggregation and composition be represented in a UML diagram?

    52. If you delete a "whole" object in composition, what happens to its "parts" in memory? Is it always immediate?

---

### 9. SOLID & Design Principles

    53. What is the Liskov Substitution Principle (LSP), and how does it relate to inheritance and polymorphism?

    54. How does polymorphism support the Open/Closed Principle (OCP)?

    55. Why is composition often preferred over inheritance in large-scale system design?

---

### 10. Java-Specific OOP Concepts

    56. What is object slicing, and does this concept apply to Java the way it does in C++?

    57. Why can't constructors be overridden?

    58. How does Java achieve runtime method dispatch?

    59. Why does Java allow multiple inheritance through interfaces but not through classes?

---

### 11. Advanced System Design Perspective

    60. How do OOP principles such as abstraction, encapsulation, inheritance, and polymorphism apply in a microservices architecture beyond a single codebase?

    61. In a real project, how would you decide between inheritance and composition?

    62. What problems can deep inheritance hierarchies cause in a large application?

    63. How would you refactor an inheritance-heavy design into a composition-based design?

    64. How do interfaces and polymorphism help make a system easier to extend and maintain?
