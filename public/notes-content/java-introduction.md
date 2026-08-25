## What is Java

- Java is a high-level, object-oriented programming language.
- **High level** means it is easy for programmers to read and write.
- **Object oriented** means everything is represented using objects.
- The most important feature of Java is that it is **platform independent**.
- Java was developed by Sun Microsystems in 1995, but is now maintained by Oracle.
- It is used to build web apps, mobile apps, enterprise systems, desktop software, and more.
- Java lets us **write a program once and run it anywhere**.

> **Note:** The original name of Java was "Oak," created by James Gosling. It was renamed to Java in 1995 before its official release.

---

## Why Java?

- Java is platform independent.
- It is object oriented.
- It is secure and robust.
- Java supports multithreading.

Java became popular because it solved many problems faced by older languages. It is platform independent, meaning the same program can run on different systems. It is secure, which is why it is widely used in banking and enterprise applications. Java is also robust, meaning it handles errors and memory very well.

---

## Real World Uses

- Banking systems
- Android apps
- Backend apps
- Large enterprise applications

> **Note:** Android app development uses Java (and Kotlin) heavily, and most enterprise-grade backend systems (banking, insurance, telecom) still run on Java because of its stability and long-term support.

---

## Java Program Structure

```java
class Hello {
    public static void main(String[] args) {
        System.out.println("Hello Java");
    }
}
```

- Every Java program starts with a **class**.
- `Class` → Blueprint
- `main()` → Entry point
- JVM starts execution from `main()`.
- JVM looks for the `main` method to start execution.
- Every Java program runs inside a class.

> **Note:** The signature `public static void main(String[] args)` is fixed — the JVM calls this exact method, so changing its signature (e.g., removing `static`) will stop the program from running as expected.

---

## How Java Works

1. **Write code** → `Hello.java`
2. **Compile using `javac`** → converts source code to bytecode.
3. **Bytecode** → platform independent, stored in a `.class` file.
4. **JVM** → converts bytecode into machine code.
5. **Output is produced**

First, we write the Java source code and save it with the `.java` extension. Then the Java compiler converts it into bytecode. This bytecode is platform independent. The JVM converts the bytecode into machine code based on the operating system. That is why Java is called **"Write Once, Run Anywhere."** Java is both **compiled** and **interpreted**.

---

## OOP Concepts

Java follows object-oriented programming. The core concepts are:

- **Class** — a blueprint of an object.
- **Object** — an instance of a class.
- **Inheritance** — allows code reusability by letting one class acquire the properties of another.
- **Polymorphism** — allows one method or object to behave differently in different contexts.
- **Encapsulation** — means data hiding, achieved by keeping fields private and exposing them through methods.
- **Abstraction** — means showing only essential details and hiding the internal complexities.

> **Note:** A simple way to remember the difference — Encapsulation hides *data*, Abstraction hides *implementation details*.

---

## Interview & Tricky Questions

1. **Why is Java called platform independent if the JVM itself is platform dependent?**
   Because the bytecode Java produces is the same across all systems — only the JVM (which interprets that bytecode) is built separately for each operating system.

2. **Is Java purely object-oriented?**
   No. Java uses primitive data types (`int`, `char`, `boolean`, etc.) which are not objects, so Java is not 100% object-oriented.

3. **Why does the `main()` method have to be `public static void`?**
   - `public` — so the JVM can access it from outside the class.
   - `static` — so it can be called without creating an object of the class.
   - `void` — because `main()` doesn't return any value to the JVM.

4. **What happens if you remove `static` from the `main()` method?**
   The program compiles but throws a runtime error, since the JVM cannot invoke a non-static method without first creating an object.

5. **Is Java compiled or interpreted?**
   Both. The source code is compiled into bytecode by `javac`, and that bytecode is then interpreted (and partially compiled by JIT) by the JVM.

6. **Can a Java program run without a `main()` method?**
   In older versions, static initializer blocks could execute without `main()`, but from Java 7 onward, the JVM explicitly requires a `main()` method to start execution.

7. **What is the difference between JDK, JRE, and JVM in one line?**
   JDK is for development, JRE is for running programs, and JVM is what actually executes the bytecode.

8. **Why is Java considered secure?**
   Because it has no explicit pointers, runs bytecode inside a controlled JVM environment, uses a bytecode verifier, and includes a built-in security manager.