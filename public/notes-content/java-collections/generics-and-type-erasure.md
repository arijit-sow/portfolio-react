# Generics & Type Erasure

Generics provide compile-time type safety for classes, interfaces, methods, and collections.

## Why use generics?

```java
List<String> names = new ArrayList<>();
names.add("Ada");
String name = names.get(0);
```

The compiler checks the element type and removes most explicit casts from application code.

## Type erasure

Java implements generics through type erasure. Generic type arguments are primarily available at compile time; at runtime, `List<String>` and `List<Integer>` are represented as `List`.

Because of erasure, Java does not allow `new T()`, `new List<String>[10]`, or overloads that differ only by generic type arguments.

## Best practices

- Prefer interfaces such as `List<T>` in variable and parameter types.
- Use bounded wildcards for flexible APIs, such as `List<? extends Number>`.
- Follow the PECS rule: Producer Extends, Consumer Super.
