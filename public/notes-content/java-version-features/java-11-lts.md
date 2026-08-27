# Java 11 LTS

> **Topic:** The standard HTTP Client, `var` in lambdas, new String/Files methods, single-file source execution, and the shift to the 6-month release cadence

---

## 1. Why Java 11 Matters — The Bigger Picture

Released in September 2018, Java 11 is significant less for any single blockbuster feature (unlike Java 8's lambdas or Java 9's module system) and more for **what it represents structurally**: it was the **first Long-Term Support (LTS) release under Oracle's new 6-month release cadence**, and the point at which a large share of the real-world Java ecosystem actually migrated off Java 8.

### Why the release model changed

Starting with Java 9, Oracle moved from the old "whenever it's ready" multi-year release cycle (Java 7 to 8 took about two years; Java 8 to 9 took over three) to a strict **6-month cadence**, with every release shipping on schedule regardless of which features were ready. Not every release gets long-term support, though — only designated **LTS releases** (Java 8, 11, 17, 21, and now every subsequent third release) receive extended vendor support and security patches for years; the interim releases (9, 10, 12–16, etc.) are supported only until the next release ships, six months later.

> 💡 **Key insight:** This is why so much real-world Java infrastructure and hiring language still centers on "Java 8, 11, 17, 21" specifically — those are the LTS releases most organizations actually standardize on and pay for extended support on, while the interim releases mostly matter to language enthusiasts who track every six-month drop closely.

### Why Java 11 specifically became a major migration target

Java 11 was the first release where **Oracle JDK builds became payment-required for commercial production use** (Oracle shifted to a subscription model), pushing much of the industry toward **OpenJDK** distributions (Eclipse Temurin/AdoptOpenJDK, Amazon Corretto, Azul Zulu, etc.) as free, production-grade alternatives — a major and lasting shift in how companies source their JVMs. Combined with several Java EE modules being stripped out of the JDK entirely (see below), migrating from 8 to 11 required real, hands-on effort — which is why Java 11 adoption took years to become mainstream, and many teams famously "skipped" 9 and 10 entirely, jumping straight from 8 to 11.

---

## 2. `var` for Local-Variable Type Inference in Lambda Parameters

Java 10 introduced `var` for local variable declarations (`var list = new ArrayList<String>();`), but at that point it could **not** be used inside a lambda expression's parameter list. Java 11 closes this specific gap:

```java
// Java 10 style — allowed for regular locals
var list = new ArrayList<String>();

// Java 11 — var now allowed in lambda parameters too
list.forEach((var item) -> System.out.println(item));

Comparator<String> cmp = (var a, var b) -> a.length() - b.length();
```

### Why this was a deliberately small, separate addition

At first glance, `(var item) -> ...` seems pointless — it's no more concise than `item -> ...` without any type at all. The actual motivation was to let developers **attach annotations or modifiers to inferred-type lambda parameters**, which Java's grammar didn't otherwise allow without spelling out the full type:

```java
list.forEach((@NonNull var item) -> process(item));
```

Before this change, if you wanted to annotate a lambda parameter, you were forced to write out the explicit type (`(@NonNull String item) -> ...`), which conflicted with wanting consistent, uniform use of `var` across a codebase's style guide. This was a narrow, somewhat niche fix — but it closed a genuine, if uncommon, inconsistency in the language grammar.

> ⚠️ **Style note:** Most style guides still recommend using plain lambda parameter names (`item -> ...`) over `(var item) -> ...` in ordinary code, since it adds no readability or type-safety benefit — reserving `var` lambda parameters specifically for the annotation use case.

---

## 3. The New HTTP Client (`java.net.http`)

For over 20 years, Java's only built-in way to make an HTTP request was the notoriously clunky `HttpURLConnection` — an API most developers avoided in favor of third-party libraries like Apache HttpClient or OkHttp.

### Problems with the old API

```java
// The old, painful way (pre-Java 11)
URL url = new URL("https://api.example.com/orders");
HttpURLConnection conn = (HttpURLConnection) url.openConnection();
conn.setRequestMethod("GET");
BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
StringBuilder response = new StringBuilder();
String line;
while ((line = reader.readLine()) != null) {
    response.append(line);
}
reader.close();
```

This required manual stream handling, no built-in JSON support, awkward exception handling, no native async support, and no HTTP/2 support at all — everything had to be layered on top manually or delegated to a third-party library.

### The Java 11 way

Originally introduced as an incubating module in Java 9, the HTTP Client was finalized as a standard API in Java 11, in `java.net.http`, supporting **HTTP/1.1, HTTP/2, and WebSocket**, with both synchronous and asynchronous request styles built in from day one.

```java
HttpClient client = HttpClient.newBuilder()
        .version(HttpClient.Version.HTTP_2)
        .connectTimeout(Duration.ofSeconds(10))
        .build();

HttpRequest request = HttpRequest.newBuilder()
        .uri(URI.create("https://api.example.com/orders"))
        .header("Content-Type", "application/json")
        .POST(HttpRequest.BodyPublishers.ofString("{\"item\":\"widget\"}"))
        .build();

// Synchronous (blocking)
HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
System.out.println(response.statusCode());
System.out.println(response.body());

// Asynchronous — returns a CompletableFuture, composes naturally
client.sendAsync(request, HttpResponse.BodyHandlers.ofString())
      .thenApply(HttpResponse::body)
      .thenAccept(System.out::println)
      .exceptionally(ex -> {
          log.error("Request failed", ex);
          return null;
      });
```

### Design highlights

- **Fluent builder pattern** throughout (`HttpClient.newBuilder()`, `HttpRequest.newBuilder()`) instead of mutable setter-based configuration.
- **Native HTTP/2 support**, including automatic multiplexing of multiple requests over a single connection where the server supports it — something `HttpURLConnection` never supported at all.
- **`CompletableFuture`-based async API** — directly building on Java 8's `CompletableFuture`, letting asynchronous HTTP calls compose naturally with other async pipelines (chaining, combining multiple requests, error handling) rather than relying on ad-hoc callback interfaces.
- **`BodyHandlers`/`BodyPublishers`** abstract over how request/response bodies are produced and consumed (`ofString`, `ofByteArray`, `ofFile`, `ofInputStream`), avoiding manual stream plumbing entirely.

> 💡 **Why this matters industry-wide:** Before this, essentially every Java project pulled in Apache HttpClient or OkHttp just to make HTTP calls reasonably. Java 11's client doesn't necessarily replace those libraries in every case (they still offer richer feature sets, connection pooling tuning, interceptors, etc.), but it made a genuinely modern, dependency-free HTTP client a realistic option for simple-to-moderate use cases for the first time in the platform's history.

---

## 4. New String Methods

Java 11 rounded out `String`'s API with several small but frequently-used convenience methods:

```java
"  hello  ".isBlank();      // false — has non-whitespace content
"   ".isBlank();            // true — Java 11 addition; differs from isEmpty()

"  hello  ".strip();        // "hello" — Unicode-aware whitespace trimming
"  hello  ".stripLeading();  // "hello  "
"  hello  ".stripTrailing(); // "  hello"

"line1\nline2\nline3".lines() // Stream<String>: "line1", "line2", "line3"
        .forEach(System.out::println);

"ab".repeat(3);              // "ababab"
```

### Why `strip()` instead of just improving `trim()`?

`String.trim()` (present since Java 1.0) only removes characters with a code point `<= U+0020` — a narrow, ASCII-era definition of "whitespace" that predates Unicode-aware character classification in Java. `strip()` uses `Character.isWhitespace()`, which correctly recognizes the full Unicode definition of whitespace (including characters like the non-breaking space in certain contexts, various Unicode space separators, etc.). Since changing `trim()`'s actual behavior would have silently altered output for any code relying on its long-standing exact behavior, Java 11 added `strip()` as a **new, correctly-Unicode-aware method** rather than fixing `trim()` in place — a clear illustration of Java's strong backward-compatibility discipline even when the existing API has a genuine, known flaw.

### Why `isBlank()` differs from `isEmpty()`

```java
"".isEmpty();     // true
"   ".isEmpty();  // false — has characters, just all whitespace
"   ".isBlank();  // true  — Java 11: checks for "no visible content"
```
This distinction matters constantly in real input-validation code, where a user submitting a form field containing only spaces should typically be treated the same as submitting nothing at all — before Java 11, this required manually calling `.trim().isEmpty()` everywhere.

---

## 5. New `Files` Methods — Reading and Writing Strings Directly

Before Java 11, reading an entire text file into a `String` required either manually looping over `Files.readAllLines()` and joining with newlines, or reaching for a third-party utility like Apache Commons IO or Guava.

```java
// Java 11
String content = Files.readString(Path.of("data.txt"));

Files.writeString(Path.of("output.txt"), "Hello, World!");

// With explicit charset
String content2 = Files.readString(Path.of("data.txt"), StandardCharsets.UTF_8);
```

This is a small addition, but a genuinely common real-world need (reading a config file, a small JSON/YAML payload, a template) that previously required boilerplate or an extra dependency for something conceptually trivial.

---

## 6. Running Single-File Source Code Without Explicit Compilation

Java 11 allows launching a single `.java` source file directly, without a separate `javac` compilation step:

```bash
# Before Java 11
javac HelloWorld.java
java HelloWorld

# Java 11+
java HelloWorld.java
```

Internally, `java` compiles the source file **in memory** and runs it immediately, discarding the compiled bytecode afterward rather than writing a `.class` file to disk. This was aimed squarely at scripting-style use cases, teaching environments, and quick one-off utilities — where the ceremony of an explicit two-step compile-then-run cycle (or a full Maven/Gradle project) is disproportionate to a five-line script.

> 💡 This feature became the direct foundation for the even more scripting-friendly experience introduced later (Java 21's ability to omit the `public static void main` boilerplate entirely for single-file programs) — Java 11 laid the initial groundwork for treating Java as a viable "just run this file" scripting language, not only a compile-first, project-based one.

---

## 7. Removal of Java EE and CORBA Modules

This was the single most **disruptive** change for real-world migrations from Java 8 to 11. Several modules bundled with the JDK since early Java versions — originally added when Java EE technologies were considered core platform features — were **completely removed**, not just deprecated:

| Removed module | What it provided |
|---|---|
| `java.xml.ws` (JAX-WS) | SOAP web services |
| `java.xml.bind` (JAXB) | XML data binding |
| `java.activation` (JAF) | MIME type handling |
| `java.xml.ws.annotation` | Common annotations |
| `java.corba` | CORBA support |
| `java.transaction` (JTA) | Transaction APIs |

### Why they were removed rather than kept

Java EE technologies had, by this point, been spun off into the independently-governed **Jakarta EE** project (under the Eclipse Foundation), and were widely viewed as no longer core to the Java **SE** platform — most applications either didn't use them at all, or already depended on newer, actively-maintained third-party versions (e.g., a standalone `javax.xml.bind` Maven artifact) rather than the JDK-bundled copies. Keeping them bundled indefinitely contradicted JPMS's explicit goal (see the Java 9 notes) of a leaner, more modular JDK.

### The real-world migration pain

Any application that had been silently relying on JAXB or JAX-WS being present on the classpath — without an explicit dependency declared in its build file, because "it just came with the JDK" — **broke immediately** upon upgrading to Java 11, typically with a `ClassNotFoundException` or `NoClassDefFoundError` for a class like `javax.xml.bind.JAXBContext`. The fix was simply to add the now-independent library as an explicit Maven/Gradle dependency, but discovering *which* transitive JDK convenience your application had been implicitly relying on was often a frustrating, trial-and-error debugging process during migration — a very commonly cited real-world Java 8→11 migration story.

---

## 8. Other Notable Java 11 Additions

| Feature | Summary |
|---|---|
| **Epsilon GC** | A deliberately "do-nothing" garbage collector that allocates memory but never reclaims it. Useful for extremely short-lived processes, or for precisely measuring an application's pure allocation-rate performance without any GC-induced noise. |
| **ZGC (experimental)** | A new, scalable, low-latency garbage collector aiming for pause times under 10ms even on multi-terabyte heaps — introduced experimentally here, matured and made production-ready in later LTS releases. |
| **Flight Recorder (JFR) open-sourced** | A low-overhead profiling and event-collection framework (previously a paid, closed-source Oracle JDK feature) was open-sourced and made freely available in OpenJDK, letting any team profile production JVMs without a commercial license. |
| **`Optional.isEmpty()`** | The logical complement to `isPresent()`, avoiding the slightly awkward `!optional.isPresent()` double-negative. |
| **`Collection.toArray(IntFunction)`** | `list.toArray(String[]::new)` — cleaner than the older `list.toArray(new String[0])` idiom. |
| **Nashorn JS engine deprecated** | Formally marked for future removal (fully removed in Java 15), continuing the deprecation path started in Java 8's own notes. |
| **TLS 1.3 support** | Added support for the latest (at the time) TLS protocol version for secure network communication. |
| **Deprecation of Pack200** | The `pack200`/`unpack200` JAR compression tools were deprecated for removal, having become largely obsolete. |

---

## 9. Real-World Scenarios

### Microservices — Dependency-free inter-service HTTP calls
A lightweight internal microservice needs to call two other internal services and combine their results, without wanting to pull in a heavyweight HTTP client library just for simple JSON-over-HTTP calls:
```java
HttpClient client = HttpClient.newHttpClient();

CompletableFuture<String> inventory = client.sendAsync(
        HttpRequest.newBuilder(URI.create("http://inventory-service/api/stock/123")).build(),
        HttpResponse.BodyHandlers.ofString()
).thenApply(HttpResponse::body);

CompletableFuture<String> pricing = client.sendAsync(
        HttpRequest.newBuilder(URI.create("http://pricing-service/api/price/123")).build(),
        HttpResponse.BodyHandlers.ofString()
).thenApply(HttpResponse::body);

CompletableFuture.allOf(inventory, pricing).join();
```
The built-in HTTP Client, combined with `CompletableFuture` (already familiar from Java 8), covers this common "aggregate a few internal calls" scenario with zero extra dependencies.

### DevOps tooling — Quick automation scripts as single-file Java programs
A platform team writes a small utility to parse log files and summarize error counts, choosing plain Java over Bash/Python specifically so it can reuse existing internal Java libraries (shared data models, logging config) without setting up a full Maven project:
```bash
java LogSummary.java /var/log/app/*.log
```
This lowered the friction for "just write a quick Java script" scenarios that had previously pushed teams toward other scripting languages purely to avoid Java's compile-then-run ceremony.

### Enterprise migration — Discovering hidden JAXB dependencies
A large legacy application upgrading from Java 8 to 11 fails to start with `NoClassDefFoundError: javax/xml/bind/JAXBException`. The team traces this to a SOAP client library that had silently relied on the JDK's bundled JAXB for years. The fix: adding `org.glassfish.jaxb:jaxb-runtime` as an explicit Maven dependency — a small fix, but one that required real investigation, illustrating why Java EE module removal was the most impactful practical migration hurdle in this release.

### Config loading — Simplifying file-reading boilerplate
```java
// Before Java 11
List<String> lines = Files.readAllLines(Path.of("config.properties"));
String content = String.join("\n", lines);

// Java 11
String content = Files.readString(Path.of("config.properties"));
```
A small but constantly-repeated piece of boilerplate across countless internal tools and services was eliminated with a single new standard-library method.

---

## 10. Comparison: Java 8 vs Java 11 (What Actually Changed for Most Applications)

| Aspect | Java 8 | Java 11 |
|---|---|---|
| HTTP client | Third-party library required (Apache HttpClient, OkHttp) for anything reasonable | Built-in, modern, HTTP/2 + async-capable `java.net.http` |
| Java EE modules (JAXB, JAX-WS, etc.) | Bundled with the JDK by default | Removed entirely — must be added as explicit dependencies |
| Running a script | `javac` then `java` — two steps | `java Script.java` — single step for simple programs |
| String whitespace handling | `trim()` only, ASCII-era whitespace definition | `strip()`/`isBlank()`, Unicode-aware |
| Default garbage collector | Parallel GC | G1 (inherited from Java 9), plus new Epsilon/experimental ZGC options |
| Commercial JDK usage | Free under Oracle's older license terms | Oracle JDK requires a subscription for commercial production use; OpenJDK builds (Temurin, Corretto, Zulu) become the mainstream free choice |

---

## Interview Questions

1. Why did Oracle move to a 6-month release cadence starting with Java 9/10, and why do only some releases (8, 11, 17, 21) receive Long-Term Support while others don't?
2. What specific gap in the language grammar did allowing `var` in lambda parameters actually close, given that `(var x) -> ...` offers no type-inference benefit over `x -> ...` on its own?
3. What concrete limitations of `HttpURLConnection` did the new `java.net.http.HttpClient` address, and why does its async API build directly on `CompletableFuture` rather than a custom callback interface?
4. Why did Java introduce a brand-new `strip()` method instead of simply fixing `trim()`'s narrow, ASCII-era definition of whitespace?
5. What is the practical difference between `String.isEmpty()` and `String.isBlank()`, and why does that distinction matter for real-world input validation?
6. Why were JAXB, JAX-WS, and CORBA support completely removed from the JDK in Java 11 rather than simply left in place or merely deprecated?
7. If a legacy application fails to start on Java 11 with a `NoClassDefFoundError` referencing a `javax.xml.bind` class, what is the most likely root cause, and how would you fix it?
8. How does running `java Script.java` differ internally from the traditional `javac Script.java && java Script`, in terms of what happens to the compiled bytecode?
9. What problem is Epsilon GC designed to solve, given that it never actually reclaims any memory?
10. Why did Java Flight Recorder being open-sourced in Java 11 matter to teams that previously couldn't use it at all?
11. Why did many organizations reportedly skip Java 9 and 10 entirely and migrate straight from Java 8 to Java 11?
12. What licensing change did Oracle make around Java 11 that pushed much of the industry toward OpenJDK distributions like Eclipse Temurin, Amazon Corretto, and Azul Zulu?