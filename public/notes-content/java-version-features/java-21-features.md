# Java 21 Features

Java 21 is an LTS release with virtual threads, record patterns, pattern matching for switch, and sequenced collections.

## Virtual Threads

Virtual threads are lightweight threads managed by the JVM:

```java
try (ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()) {
    executor.submit(() -> fetchData());
}
```

They are a good fit for high-concurrency, blocking I/O workloads. They do not make CPU-bound work faster.

## Pattern Matching for switch

```java
String result = switch (value) {
    case Integer number -> "number: " + number;
    case String text -> "text: " + text;
    case null -> "missing";
    default -> "other";
};
```

## Sequenced Collections

`SequencedCollection`, `SequencedSet`, and `SequencedMap` provide consistent first and last element operations across ordered collections.

## Choosing Java 21

Use virtual threads for large numbers of independent blocking tasks, but continue to apply normal limits to databases, remote services, and other finite resources.
