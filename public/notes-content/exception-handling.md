# Exception Handling

> **Topic:** Errors, Exceptions, try-catch-finally, try-with-resources, custom exceptions, and JVM internals

---

## 1. What Is an Exception?

An **exception** is an event that occurs during the execution of a program that disrupts the normal flow of instructions. In Java, it is represented as an **object** — an instance of a class that extends `Throwable`.

The key idea: instead of a method returning a special "error code" (like `-1` or `null`) that the caller might silently ignore, Java forces an *out-of-band* signal. When something goes wrong, the method **throws** an object describing what happened, and execution jumps up the call stack until something **catches** it.

```java
public class Example {
    public static void main(String[] args) {
        int[] arr = new int[3];
        System.out.println(arr[5]); // throws ArrayIndexOutOfBoundsException
    }
}
```

> 💡 **Key insight:** Exceptions decouple *error detection* from *error handling*. The code that detects a problem (deep inside a library, say) rarely knows the right way to handle it. The code that knows how to handle it (the application layer) is often many stack frames away. Exceptions let that gap be bridged automatically.

---

## 2. Why Exceptions Exist — Design Rationale

Before exceptions became mainstream (C, early Pascal), error handling relied on:
- **Return codes** — e.g., `-1` for failure. Problem: callers can ignore the return value with zero compiler warning, and the "meaning" of `-1` is not self-documenting.
- **Global error flags** — e.g., `errno` in C. Problem: not thread-safe by default, and easy to check *too late* (after it's been overwritten by another call).
- **Output parameters** — passing a pointer to be filled with error info. Problem: clutters method signatures, doesn't compose well.

Java's designers wanted:
1. **Impossible to silently ignore** — a checked exception forces the caller to either handle it or declare it, at compile time.
2. **Rich, structured error information** — not just a code, but a full object with a message, a type (which becomes part of the API contract), and a stack trace.
3. **Separation of business logic and error-handling logic** — without `if (errorCode != 0)` checks polluting every line.
4. **Automatic propagation** — errors bubble up through the call stack without every intermediate method needing to explicitly forward them.

```java
// Without exceptions (C-style)
int result = openFile("data.txt");
if (result == -1) {
    // handle error — but what kind of error? disk full? permission denied? not found?
}

// With exceptions
try {
    openFile("data.txt");
} catch (FileNotFoundException e) {
    // precise, typed error information
}
```

---

## 3. The Throwable Hierarchy

Everything that can be thrown in Java extends `java.lang.Throwable`.

```
Throwable
    ├── Error
    │   ├── OutOfMemoryError
    │   ├── StackOverflowError
    │   ├── NoClassDefFoundError
    │   └── AssertionError
    └────────────────────────────── Exception
                                        ├── IOException               (checked)
                                        ├── SQLException              (checked)
                                        ├── ClassNotFoundException    (checked)
                                        |
                                        └── RuntimeException          (unchecked)
                                            ├── NullPointerException
                                            ├── ArrayIndexOutOfBoundsException
                                            ├── ClassCastException
                                            ├── IllegalArgumentException
                                            ├── IllegalStateException 
                                            └── ArithmeticException
```

### Why split into `Error` and `Exception`?

- **`Error`** represents conditions that a *reasonable application should not try to catch* — they typically indicate problems with the JVM itself or resources the application has no control over (`OutOfMemoryError`, `StackOverflowError`, `NoClassDefFoundError`). Catching them rarely helps because the JVM may already be in an unstable state.
- **`Exception`** represents conditions that an application *might reasonably want to catch and recover from* — a missing file, a malformed input, a network timeout.

> ⚠️ **Common mistake:** Catching `Throwable` or `Error` broadly (e.g., `catch (Throwable t)`) to "never crash." This can swallow `OutOfMemoryError` or `StackOverflowError`, leaving the JVM in a corrupted state while your code keeps running as if nothing happened — often worse than crashing cleanly.

---

## 4. Checked vs Unchecked Exceptions

This is one of Java's most distinctive (and most debated) design decisions.

| Aspect | Checked Exception | Unchecked Exception |
|---|---|---|
| Extends | `Exception` (not `RuntimeException`) | `RuntimeException` or `Error` |
| Compile-time enforcement | Must be caught or declared (`throws`) | No compiler enforcement |
| Represents | Recoverable, *expected* conditions external to the program (file missing, network down) | Programming errors / bugs (null deref, bad index, illegal argument) |
| Examples | `IOException`, `SQLException`, `TimeoutException` | `NullPointerException`, `IllegalArgumentException`, `ArithmeticException` |
| Philosophy | "You should have anticipated this and handled it." | "This shouldn't happen if the code is correct — fix the bug." |

```java
// Checked — compiler forces you to handle or declare
public void readFile(String path) throws IOException {
    Files.readAllLines(Paths.get(path));
}

// Unchecked — compiler says nothing, crashes at runtime if not careful
public int divide(int a, int b) {
    return a / b; // ArithmeticException if b == 0, no compiler warning
}
```

### Why does Java have checked exceptions at all (most languages don't)?

The designers' intent was **API contracts as documentation**: if a method can fail in a recoverable way, that possibility should be visible in its signature, not buried in documentation nobody reads. A caller *must* consciously decide: handle it here, or pass the responsibility upward.

### The controversy

In practice, checked exceptions have been criticized heavily (famously by Joshua Bloch's peers and by the Spring framework's founders) because:
- They lead to **exception swallowing anti-patterns**:
  ```java
  try {
      riskyOperation();
  } catch (IOException e) {
      // empty catch block — the "silent killer"
  }
  ```
- They make **functional-style code and lambdas painful** — a checked exception cannot be thrown from a standard functional interface like `Function<T, R>` without wrapping.
- They cause **"exception pollution"** — a low-level exception (`SQLException`) leaks into high-level method signatures across many layers, forcing every caller in between to know about persistence details.

This is largely why modern Java frameworks (Spring, most of the JDK's newer APIs like `java.nio.file` in some paths, and libraries like Reactor) lean heavily on **unchecked exceptions**, reserving checked exceptions for genuinely recoverable, expected-in-normal-operation cases.

> 💡 **Rule of thumb (Effective Java, Joshua Bloch):** Use checked exceptions for conditions from which the caller can reasonably be expected to recover. Use unchecked exceptions for programming errors.

---

## 5. try-catch-finally — Mechanics

```java
try {
    riskyOperation();
} catch (SpecificException e) {
    handleSpecific(e);
} catch (AnotherException e) {
    handleAnother(e);
} finally {
    cleanup(); // always runs
}
```

### Execution rules
1. Statements in `try` run until an exception is thrown or the block completes normally.
2. Catch blocks are checked **top to bottom**, and the **first matching type** wins (including subclass matches) — so catch blocks must be ordered **most specific to least specific**, or the compiler rejects unreachable catches.
3. `finally` executes **no matter what** — whether the try block completes normally, throws, or even if the catch block itself throws or the method `return`s from inside `try`/`catch`.

```java
public int test() {
    try {
        return 1;
    } finally {
        System.out.println("finally runs even though try returned");
    }
}
```

> ⚠️ **Gotcha:** If `finally` itself contains a `return` statement, it **swallows** any exception or return value from `try`/`catch`. This is almost always a bug:
```java
public int broken() {
    try {
        throw new RuntimeException("lost forever");
    } finally {
        return 42; // the exception above is silently discarded!
    }
}
```

### Multi-catch (Java 7+)

```java
try {
    process();
} catch (IOException | SQLException e) {
    log.error("Failed", e);
}
```
Internally, the compiler treats the multi-catch variable `e` as **implicitly final**, and its static type is the **least upper bound** of the listed exception types — you cannot reassign `e` to a different exception type inside the block.

---

## 6. How Exception Handling Works Internally (JVM Level)

This is the part most developers never see: **exception handling has almost zero cost when no exception is thrown**, and this is by design.

### No runtime cost for "happy path"
Unlike a naive implementation using flags checked after every statement, the JVM does **not** insert any per-statement checks for `try` blocks. Instead, the compiler generates an **exception table** attached to each method's bytecode.

```
Exception table:
   from    to  target  type
      2     8      11  java/io/IOException
      2     8      15  java/lang/Exception
```

Each row means: "if an exception of `type` (or subtype) occurs while the program counter is between bytecode offsets `from` and `to`, jump to bytecode offset `target`."

When you compile:
```java
try {
    doSomething();      // offset 2
} catch (IOException e) {  // target 11
    handle(e);
}
```
The JVM does **not** check anything while executing `doSomething()`. It just runs the bytecode normally. Only **if** an exception object is actually thrown does the JVM consult the exception table for the current method, find a matching range/type, and jump there.

### Stack unwinding
If a method has **no** matching entry in its exception table, the JVM:
1. Pops (unwinds) the current stack frame.
2. Looks at the caller's exception table.
3. Repeats up the call stack until a matching handler is found, or the stack is exhausted (in which case, for `Thread.run()`, the JVM prints the stack trace and terminates the thread — or the whole program if it was the main thread).

This is why exceptions are sometimes described as "cheap to set up, expensive to throw" — the `try` block itself costs nothing at runtime, but the actual **throw** operation involves stack walking.

### The real cost: `fillInStackTrace()`

When you do `new SomeException("msg")`, the constructor of `Throwable` calls `fillInStackTrace()`, which walks the **entire current call stack** and records it. This is the single most expensive part of exception handling — far more expensive than the throw/catch machinery itself.

```java
public class MyException extends Exception {
    public MyException(String msg) {
        super(msg); // triggers fillInStackTrace() internally
    }
}
```

> ⚠️ **Performance gotcha:** In extremely hot code paths (e.g., using exceptions for *control flow* rather than genuine error conditions — like using an exception to break out of nested loops thousands of times per second), the stack-trace capture cost can be significant. Java allows overriding `fillInStackTrace()` to skip this:
```java
public class FastException extends RuntimeException {
    @Override
    public synchronized Throwable fillInStackTrace() {
        return this; // skip expensive stack capture
    }
}
```
This is a known technique used internally by some high-performance libraries (e.g., certain lightweight validation exceptions in Netty), but should be used sparingly and only when you deliberately don't need a stack trace.

---

## 7. try-with-resources (Java 7+)

Before Java 7, releasing resources safely required verbose nested `finally` blocks:

```java
// Old, error-prone way
FileInputStream fis = null;
try {
    fis = new FileInputStream("data.txt");
    // use fis
} finally {
    if (fis != null) {
        try {
            fis.close();
        } catch (IOException e) { /* swallowed or logged */ }
    }
}
```

`try-with-resources` automates this for any class implementing `AutoCloseable`:

```java
try (FileInputStream fis = new FileInputStream("data.txt");
     BufferedReader br = new BufferedReader(new InputStreamReader(fis))) {
    // use fis, br
} catch (IOException e) {
    log.error("Failed to read file", e);
}
// both br and fis are closed automatically, in reverse order of declaration
```

### How it works internally

The compiler desugars this into a `try-finally` structure where `close()` is called automatically, and — critically — it handles the case where **both** the try block *and* `close()` throw exceptions, via **suppressed exceptions**:

```java
try {
    // body
} catch (Throwable primaryExc) {
    try {
        resource.close();
    } catch (Throwable closeExc) {
        primaryExc.addSuppressed(closeExc); // NOT thrown separately — attached
    }
    throw primaryExc;
}
```

You can retrieve suppressed exceptions later via `getSuppressed()`. This solves a subtle bug that plagued manual `finally` blocks: if the try body throws `ExceptionA` and `close()` in `finally` throws `ExceptionB`, the naive code would let `ExceptionB` **silently replace** `ExceptionA`, hiding the original root cause. Suppressed exceptions preserve both.

Resources are closed in **reverse declaration order** (last opened, first closed) — same principle as a stack — because later resources may depend on earlier ones.

---

## 8. Custom Exceptions

Creating domain-specific exceptions makes error handling self-documenting and lets calling code respond precisely.

```java
public class InsufficientFundsException extends Exception {
    private final double shortfall;

    public InsufficientFundsException(String message, double shortfall) {
        super(message);
        this.shortfall = shortfall;
    }

    public double getShortfall() {
        return shortfall;
    }
}
```

```java
public class InvalidOrderStateException extends RuntimeException {
    public InvalidOrderStateException(String message) {
        super(message);
    }
}
```

### Guidelines for custom exceptions
- Extend `RuntimeException` unless the failure is truly recoverable and the caller genuinely needs to be forced to handle it.
- Always provide constructors that accept a `message` and a `cause` (`Throwable`), to support **exception chaining** (see below).
- Name them clearly with an `Exception` suffix (`OrderNotFoundException`, not `OrderProblem`).
- Attach useful contextual data as fields (like `shortfall` above), not just a string message — this lets calling code programmatically react, not just log text.

---

## 9. Exception Chaining (Cause) 

When you catch a low-level exception and want to rethrow a higher-level, more meaningful one, **always preserve the original cause** — otherwise you destroy the original stack trace, making debugging far harder.

```java
public class PaymentService {
    public void charge(String cardToken, double amount) {
        try {
            paymentGateway.charge(cardToken, amount);
        } catch (SQLException e) {
            // BAD: original cause is lost
            // throw new PaymentFailedException("Payment failed");

            // GOOD: cause is chained
            throw new PaymentFailedException("Payment failed for token " + cardToken, e);
        }
    }
}
```

```java
public class PaymentFailedException extends RuntimeException {
    public PaymentFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
```

Internally, `Throwable` stores the cause in a `cause` field, and `printStackTrace()` prints a `"Caused by: ..."` section showing the full chain — essential for tracing a high-level error (e.g., "Payment failed") back to its root cause (e.g., a database connection timeout).

---

## 10. Real-World Scenarios

### E-commerce — Order placement with layered exceptions
```java
class InventoryUnavailableException extends RuntimeException {
    public InventoryUnavailableException(String sku) {
        super("Item out of stock: " + sku);
    }
}

class OrderService {
    public Order placeOrder(Cart cart) {
        for (CartItem item : cart.getItems()) {
            if (!inventoryService.isAvailable(item.getSku(), item.getQty())) {
                throw new InventoryUnavailableException(item.getSku());
            }
        }
        try {
            return paymentService.charge(cart);
        } catch (PaymentFailedException e) {
            inventoryService.releaseReservation(cart); // compensating action
            throw e;
        }
    }
}
```
Here exceptions drive a **compensating transaction** pattern — if payment fails after inventory was reserved, the reservation must be rolled back before the exception propagates further.

### Banking — Checked exception for a genuinely recoverable case
```java
class Account {
    private double balance;

    public void withdraw(double amount) throws InsufficientFundsException {
        if (amount > balance) {
            throw new InsufficientFundsException(
                "Cannot withdraw " + amount + ", balance is " + balance,
                amount - balance
            );
        }
        balance -= amount;
    }
}
```
A withdrawal failing due to insufficient funds is an **expected business outcome**, not a bug — a checked exception (or a `Result`-style return, depending on team convention) forces the UI layer to explicitly handle "insufficient funds," e.g., by showing a friendly message.

### Ride-sharing — Retrying on transient failures
```java
class DriverMatchingService {
    public Driver findDriver(RideRequest request) {
        int attempts = 0;
        while (attempts < 3) {
            try {
                return matchingEngine.match(request);
            } catch (TransientMatchingException e) {
                attempts++;
                log.warn("Retry {} for ride {}", attempts, request.getId(), e);
            }
        }
        throw new NoDriverAvailableException(request.getId());
    }
}
```
Distinguishing a `TransientMatchingException` (worth retrying — e.g., a temporary timeout to a matching microservice) from a `NoDriverAvailableException` (a genuine business outcome — don't retry, just tell the rider) is a common real-world pattern: **exception type dictates retry strategy**.

### Microservices — Translating exceptions across a REST boundary
```java
@ControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(InsufficientFundsException.class)
    public ResponseEntity<ErrorResponse> handle(InsufficientFundsException e) {
        return ResponseEntity.status(HttpStatus.UNPROCESSABLE_ENTITY)
                .body(new ErrorResponse("INSUFFICIENT_FUNDS", e.getMessage()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception e) {
        log.error("Unhandled exception", e);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(new ErrorResponse("INTERNAL_ERROR", "Something went wrong"));
    }
}
```
This is a central pattern in Spring-based microservices: **internal Java exceptions never leak directly to API clients**. A global handler translates domain exceptions into structured HTTP error responses, while unexpected exceptions are logged in full detail server-side but shown to clients as a generic, safe message (avoiding leaking stack traces or internal details).

---

## 11. Comparison: Checked vs Unchecked vs Error (Decision Table)

| Scenario | Recommended Type | Reason |
|---|---|---|
| File not found | Checked (`IOException`) or unchecked, per team convention | External resource, often recoverable |
| Invalid method argument (e.g., negative age) | Unchecked (`IllegalArgumentException`) | Programming/caller bug — fix the calling code |
| Network timeout calling another microservice | Checked or a custom unchecked wrapping it | Debatable — many modern services use unchecked + explicit retry logic |
| Null passed where an object was required | Unchecked (`NullPointerException`) | Programming bug |
| Business rule violation (insufficient funds, seat unavailable) | Checked, or a custom unchecked "domain exception" | Expected outcome, not a bug — but many teams prefer unchecked for flexibility with lambdas/streams |
| JVM ran out of memory | `Error` (`OutOfMemoryError`) — do not catch to "recover" | Application-level recovery is unreliable |
| Division by zero | Unchecked (`ArithmeticException`) — usually indicates a bug | Should be prevented via validation, not routinely caught |

---

## 12. Common Mistakes / Gotchas

> ⚠️ **Swallowing exceptions silently**
```java
try {
    risky();
} catch (Exception e) {
    // nothing here — the error vanishes, debugging becomes impossible
}
```

> ⚠️ **Catching `Exception` (or worse, `Throwable`) too broadly**, hiding bugs that should have crashed loudly during development.

> ⚠️ **Using exceptions for normal control flow** (e.g., throwing an exception to break out of a loop instead of using a `break` or boolean flag) — hurts readability and performance due to stack trace capture.

> ⚠️ **Losing the original cause** when wrapping exceptions (`throw new MyException("failed")` instead of `throw new MyException("failed", e)`).

> ⚠️ **`return` inside `finally`** silently discarding exceptions or return values from `try`/`catch`.

> ⚠️ **Resource leaks from manual `close()` calls** instead of try-with-resources — easy to forget the `close()` when an exception occurs mid-method.

> ⚠️ **Overly generic exception messages** — `"Error occurred"` provides zero debugging value compared to `"Failed to charge card token abc123: gateway timeout after 5000ms"`.

> ⚠️ **Throwing checked exceptions from functional interfaces** (`Runnable`, `Function`, `Supplier` etc. don't declare checked exceptions), forcing awkward try-catch-wrap boilerplate inside lambdas.

---

## 13. Assertions vs Exceptions

Briefly worth distinguishing: `assert` statements (`AssertionError`) are meant for verifying **internal invariants during development/testing** ("this should never happen if my code is correct") and are typically **disabled by default in production** (`-ea` flag required to enable them at runtime). They are not a substitute for validating external input or user-facing error conditions — use exceptions for anything that must always be checked.

```java
assert age >= 0 : "Age cannot be negative"; // disabled unless -ea flag passed
```

---

## Interview Questions

1. Why does Java distinguish between checked and unchecked exceptions, and what problems does this distinction attempt to solve? What are the strongest arguments against checked exceptions in modern codebases?
2. Walk through exactly what happens at the bytecode/JVM level when an exception is thrown and there is no matching `catch` block in the current method.
3. Why is `fillInStackTrace()` considered expensive, and under what circumstances would you consider overriding it?
4. What is a suppressed exception, and how does try-with-resources use `addSuppressed()` to avoid losing information when both the try body and the resource's `close()` method throw?
5. If a `finally` block contains a `return` statement, what happens to an exception thrown in the corresponding `try` block? Why is this considered dangerous?
6. Why should catch blocks for exception types be ordered from most specific to least specific, and what does the compiler do if they aren't?
7. Explain the difference between `Error` and `Exception` in terms of intended recoverability, and give a real scenario where catching an `Error` would be actively harmful.
8. Why can't standard functional interfaces like `Function<T, R>` declare checked exceptions, and what are the common workarounds developers use?
9. In a microservices architecture, why is it considered bad practice to let internal exception stack traces propagate directly into an HTTP API response? What should happen instead?
10. Design a custom exception hierarchy for a ride-sharing driver-matching system that distinguishes between transient failures (worth retrying) and permanent failures (should not be retried). What would you name the classes and how would calling code use `instanceof` or exception type to branch behavior?
11. Why is exception chaining (passing a `cause` to a wrapping exception) important, and what specifically is lost if you don't do it?
12. Multi-catch (`catch (IOException | SQLException e)`) — why is the variable `e` implicitly final, and what is its static type inside the block?