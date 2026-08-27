# Stream API

The Stream API processes sequences of data through a pipeline of operations without changing the source collection.

```java
List<String> result = names.stream()
    .filter(name -> name.length() > 3)
    .map(String::toUpperCase)
    .toList();
```

## Pipeline stages

- **Source:** collection, array, or generator.
- **Intermediate operations:** `filter`, `map`, `sorted`, and `distinct`.
- **Terminal operation:** `toList`, `collect`, `count`, `reduce`, or `forEach`.

Intermediate operations are lazy. Work begins only when a terminal operation is invoked. Avoid side effects in stream operations and use parallel streams only after measuring that they improve the workload.
