# Java 17 Features

Java 17 is an LTS release that includes sealed classes, pattern matching for `instanceof`, records, and stronger encapsulation of JDK internals.

## Sealed Classes

```java
public sealed interface Shape permits Circle, Rectangle {}
public final class Circle implements Shape {}
public final class Rectangle implements Shape {}
```

Sealed types constrain the inheritance hierarchy and make domain models easier to reason about.

## Pattern Matching for instanceof

```java
if (value instanceof String text && !text.isBlank()) {
    System.out.println(text);
}
```

The variable is tested and initialized in one expression.

## Records

Records provide concise immutable data carriers:

```java
record Point(int x, int y) {}
```

The compiler supplies accessors, a canonical constructor, `equals`, `hashCode`, and `toString`.
