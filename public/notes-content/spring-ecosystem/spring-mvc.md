# Spring MVC Architecture

> **Topic:** The DispatcherServlet front controller, the request lifecycle, HandlerMapping/HandlerAdapter internals, message converters, and exception handling

---

## 1. Why Spring MVC Exists — Building on the Servlet Foundation

Recall from the Servlets & Web Lifecycle notes that raw servlets require a lot of manual, repetitive plumbing: mapping URLs to specific servlet classes in configuration, manually parsing request parameters, manually choosing and forwarding to the right view, and manually handling errors — all logic that has to be duplicated, in some form, across every servlet in a non-trivial application.

**Spring MVC** is a web framework built directly on top of the Servlet API that introduces the **Front Controller pattern**: instead of the container routing each URL directly to its own dedicated servlet, **one single servlet** receives every incoming request and delegates the actual work to your application's own, much simpler, plain-Java handler methods.

> 💡 **Key insight:** Spring MVC doesn't replace servlets — it's built entirely on top of them, with the same lifecycle, request/response objects, sessions, and filters from the Servlet notes still fully in play underneath. What Spring MVC adds is a much richer, annotation-driven layer of routing, argument binding, and view resolution *on top of* that same foundation, so application code almost never touches `HttpServletRequest`/`HttpServletResponse` directly.

---

## 2. The `DispatcherServlet` — The Front Controller

The **`DispatcherServlet`** is a single, central servlet — registered against a URL pattern (commonly `/`, meaning "every request") — that receives literally every incoming HTTP request for the application and orchestrates the entire process of finding the right handler, invoking it, and producing a response.

```
                    Incoming HTTP Request
                            │
                            ▼
                  ┌──────────────────────┐
                  │   DispatcherServlet   │  ← the ONE servlet every request goes through
                  └──────────────────────┘
                            │
              ┌─────────────┼─────────────┐
              ▼             ▼             ▼
      HandlerMapping   HandlerAdapter   ViewResolver
      (which method?)  (how to call it?) (how to render?)
```

This is a direct, practical application of the Front Controller pattern: centralizing request-handling infrastructure (routing, argument resolution, exception handling, view resolution) in **one place**, rather than duplicating that infrastructure across many individual servlets — exactly the same underlying motivation that led filters (in the Servlets notes) to centralize cross-cutting concerns, just applied to the entire request-handling pipeline itself rather than one narrow slice of it.

### How the `DispatcherServlet` gets registered

In a Spring Boot application, this is entirely automatic — `spring-boot-starter-web` auto-configures and registers a `DispatcherServlet` for you at startup, with zero manual `web.xml` or servlet-registration code required, continuing the "convention over configuration" theme that Spring Boot brings to the whole framework (covered fully in the Spring Boot notes).

---

## 3. The Full Request Lifecycle, Step by Step

```
1. Request arrives at DispatcherServlet
2. DispatcherServlet consults HandlerMapping: "which controller method handles this URL + HTTP method?"
3. HandlerMapping returns a HandlerExecutionChain (the target method + any applicable interceptors)
4. Interceptors' preHandle() methods run, in order
5. DispatcherServlet consults HandlerAdapter: "how do I actually invoke this specific handler method?"
6. HandlerAdapter resolves method arguments (path variables, request params, @RequestBody, etc.)
7. The actual @Controller method executes, returning a value (a String view name, a ResponseEntity, a domain object, etc.)
8. Interceptors' postHandle() methods run, in reverse order
9. If the return value is a view name: ViewResolver locates the actual View (JSP, Thymeleaf template, etc.)
10. The View renders the final response body
11. Interceptors' afterCompletion() methods run, in reverse order
12. Response sent back to the client
```

### 1) `HandlerMapping` — deciding which method handles a request

```java
@RestController
@RequestMapping("/api/orders")
public class OrderController {
    @GetMapping("/{id}")
    public Order getOrder(@PathVariable Long id) { ... }

    @PostMapping
    public Order createOrder(@RequestBody Order order) { ... }
}
```

At startup, Spring scans every `@Controller`/`@RestController` bean, examines its `@RequestMapping`-family annotations (`@GetMapping`, `@PostMapping`, etc.), and builds an internal registry mapping URL patterns + HTTP methods to specific controller methods. `RequestMappingHandlerMapping` is the concrete implementation responsible for this — when a request for `GET /api/orders/42` arrives, it looks up this registry and finds that `OrderController.getOrder(Long)` is the match.

### 2) `HandlerAdapter` — actually invoking the method, with argument resolution

Once the *which method* question is answered, the `HandlerAdapter` (specifically `RequestMappingHandlerAdapter` for annotation-based controllers) is responsible for the *how do I actually call it* problem — because a controller method's parameters can be an arbitrary mix of very different kinds of things:

```java
@PostMapping("/{id}/items")
public OrderItem addItem(
        @PathVariable Long id,                  // extracted from the URL path
        @RequestParam(required = false) String note, // extracted from query string / form params
        @RequestBody ItemRequest request,        // deserialized from the JSON request body
        @RequestHeader("X-User-Id") String userId, // extracted from an HTTP header
        HttpServletRequest rawRequest             // the raw servlet request, if genuinely needed
) { ... }
```

This works via a pluggable collection of `HandlerMethodArgumentResolver` implementations, each responsible for recognizing and populating one specific kind of parameter (one resolver handles `@PathVariable`, another handles `@RequestBody`, another handles raw `HttpServletRequest`/`HttpServletResponse` parameters, and so on) — the `HandlerAdapter` tries each resolver in turn for every parameter until it finds one that claims responsibility for it, then uses that resolver to actually produce the value passed into your method.

### 3) `ViewResolver` — turning a logical view name into an actual renderable view

```java
@Controller // note: plain @Controller, not @RestController — this method returns a VIEW NAME
public class OrderPageController {
    @GetMapping("/orders/{id}")
    public String showOrder(@PathVariable Long id, Model model) {
        model.addAttribute("order", orderService.findById(id));
        return "orderDetails"; // a logical view name, NOT a file path
    }
}
```

`"orderDetails"` is a **logical name**, not a literal file path — a `ViewResolver` (e.g., `InternalResourceViewResolver`, commonly configured with a prefix like `/WEB-INF/views/` and a suffix like `.jsp`) is responsible for translating that logical name into an actual, physical view resource (`/WEB-INF/views/orderDetails.jsp`) to render. This indirection means controller code never hard-codes physical file paths or file extensions, and the actual templating technology (JSP, Thymeleaf, FreeMarker) can be swapped by changing the configured `ViewResolver`, without touching any controller code.

---

## 4. `@Controller` vs `@RestController`

```java
@Controller
public class OrderPageController {
    @GetMapping("/orders/{id}")
    public String showOrder(@PathVariable Long id, Model model) {
        model.addAttribute("order", orderService.findById(id));
        return "orderDetails"; // interpreted as a VIEW NAME, resolved via ViewResolver
    }
}

@RestController
public class OrderApiController {
    @GetMapping("/api/orders/{id}")
    public Order getOrder(@PathVariable Long id) {
        return orderService.findById(id); // written DIRECTLY to the response body, as JSON/XML
    }
}
```

`@RestController` is simply `@Controller` combined with `@ResponseBody` applied automatically to **every method** in the class. Without `@ResponseBody`, a method's return value is treated as a logical view name to be resolved and rendered. With `@ResponseBody` (explicit, or implied by `@RestController`), the return value is instead passed directly to an `HttpMessageConverter` (Section 5) to be serialized straight into the HTTP response body — no view resolution involved at all. This single distinction is exactly what separates "building a traditional server-rendered web page" from "building a JSON REST API" in Spring MVC — both flow through the identical `DispatcherServlet`/`HandlerMapping`/`HandlerAdapter` machinery, differing only in this one final step.

---

## 5. `HttpMessageConverter` — Serialization for REST APIs

When a `@RestController` method returns a Java object, something has to turn that object into bytes on the wire (typically JSON), and, symmetrically, something has to turn an incoming JSON request body into a Java object for a `@RequestBody` parameter. This is the job of `HttpMessageConverter`.

```java
@PostMapping("/api/orders")
public Order createOrder(@RequestBody Order order) { // JSON in request body → Order object
    return orderService.save(order); // Order object → JSON in response body
}
```

Spring Boot auto-configures `MappingJackson2HttpMessageConverter` (backed by the Jackson library) by default, which handles the actual JSON ↔ Java object conversion. The specific converter chosen for a given request/response depends on **content negotiation** — examining the request's `Content-Type` header (for deserializing an incoming body) and `Accept` header (for choosing how to serialize the outgoing response), matched against the set of converters registered in the application (JSON via Jackson is the overwhelmingly common default, but XML, Protocol Buffers, and other formats can also be configured).

> 💡 **Key insight:** This is yet another instance of the same abstraction pattern seen repeatedly throughout this notes series (SLF4J over logging backends, JDBC over database drivers, JPA over Hibernate) — controller code depends only on plain Java objects, completely unaware of *how* those objects get turned into bytes on the wire; that translation is delegated to a pluggable converter, selected based on content negotiation rather than hard-coded into the controller itself.

---

## 6. Request Parameter and Body Binding — Key Annotations

| Annotation | Extracts from |
|---|---|
| `@PathVariable` | A segment of the URL path itself (`/orders/{id}`) |
| `@RequestParam` | Query string parameters (`?status=SHIPPED`) or form-encoded body fields |
| `@RequestBody` | The entire raw request body, deserialized via an `HttpMessageConverter` |
| `@RequestHeader` | A specific HTTP request header |
| `@CookieValue` | A specific cookie's value |
| `@ModelAttribute` | Binds request parameters onto the fields of a Java object automatically (common in traditional form-submission-based `@Controller` flows) |

```java
@GetMapping("/api/orders")
public List<Order> searchOrders(
        @RequestParam String status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(required = false) String customerName
) { ... }
```

### Bean Validation integration (`@Valid`)

```java
public class CreateOrderRequest {
    @NotNull
    @Positive
    private BigDecimal total;

    @NotBlank
    private String customerEmail;
}

@PostMapping("/api/orders")
public Order createOrder(@Valid @RequestBody CreateOrderRequest request) {
    // if validation fails, a MethodArgumentNotValidException is thrown automatically,
    // BEFORE this method body ever executes
    return orderService.create(request);
}
```

`@Valid` triggers Spring's integration with the standard **Bean Validation** (JSR 380/Jakarta Validation) API — annotations like `@NotNull`, `@Size`, `@Positive`, and `@Email` on a request DTO's fields are automatically checked before the controller method body runs, and a failure short-circuits straight to Spring's exception-handling machinery (Section 7) rather than letting invalid data reach your business logic at all.

---

## 7. Exception Handling — `@ExceptionHandler` and `@ControllerAdvice`

Without centralized exception handling, every controller method would need its own repetitive `try`/`catch` blocks to convert exceptions into sensible HTTP error responses — exactly the kind of cross-cutting duplication filters and `BeanPostProcessor`s exist elsewhere in this series to eliminate.

### Per-controller exception handling

```java
@RestController
public class OrderController {
    @GetMapping("/api/orders/{id}")
    public Order getOrder(@PathVariable Long id) {
        return orderService.findById(id).orElseThrow(() -> new OrderNotFoundException(id));
    }

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<String> handleNotFound(OrderNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(ex.getMessage());
    }
}
```

### Global exception handling with `@ControllerAdvice`

```java
@RestControllerAdvice // @ControllerAdvice + @ResponseBody, analogous to @RestController vs @Controller
public class GlobalExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(OrderNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(new ErrorResponse("ORDER_NOT_FOUND", ex.getMessage()));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return ResponseEntity.badRequest().body(new ErrorResponse("VALIDATION_FAILED", message));
    }

    @ExceptionHandler(Exception.class) // catch-all fallback for anything unexpected
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex) {
        log.error("Unhandled exception", ex);
        return ResponseEntity.internalServerError()
                .body(new ErrorResponse("INTERNAL_ERROR", "Something went wrong"));
    }
}
```

A `@ControllerAdvice`-annotated class applies its `@ExceptionHandler` methods **globally, across every controller in the application** (unless narrowed via `basePackages`/`assignableTypes`), giving you exactly one centralized place to define how each exception type maps to an HTTP response — directly analogous to the `GlobalExceptionHandler` pattern already covered in the Exception Handling notes, just implemented specifically for Spring MVC's request-handling pipeline. This is the standard, idiomatic way internal Java exceptions get translated into structured HTTP error responses rather than leaking raw stack traces to API clients.

---

## 8. Interceptors vs Filters

Recall filters from the Servlets notes — they operate at the raw servlet-container level, before Spring MVC even enters the picture. **Interceptors** (`HandlerInterceptor`) are Spring MVC's own, higher-level equivalent, operating specifically around the `DispatcherServlet`'s handling of a request, with awareness of *which controller method* is about to be (or was just) invoked.

```java
public class LoggingInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute("startTime", System.currentTimeMillis());
        return true; // returning false short-circuits — the controller method is never called
    }

    @Override
    public void postHandle(HttpServletRequest request, HttpServletResponse response, Object handler,
                            ModelAndView modelAndView) {
        // runs AFTER the controller method, but BEFORE the view is rendered
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler,
                                 Exception ex) {
        long duration = System.currentTimeMillis() - (long) request.getAttribute("startTime");
        log.info("Request took {}ms", duration);
    }
}
```

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {
    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new LoggingInterceptor()).addPathPatterns("/api/**");
    }
}
```

| | Servlet Filter | Spring `HandlerInterceptor` |
|---|---|---|
| Operates at | Raw servlet-container level, before `DispatcherServlet` even runs | Inside Spring MVC's own request-handling pipeline, around a specific handler |
| Aware of which controller method will run? | No | Yes — receives the actual `Handler` object (typically the controller method) |
| Access to Spring beans directly? | Only indirectly (must be a Spring-managed bean itself, in a Spring Boot app) | Yes, naturally, since it's a first-class Spring MVC concept |
| Typical use | Broad, protocol-level concerns: compression, raw request logging, CORS headers, character encoding | Web-layer, business-aware concerns: authentication tied to specific handler metadata, per-endpoint timing, adding common model attributes |

---

## 9. Content Negotiation

A single endpoint can, in principle, serve the same underlying data as JSON, XML, or another format, depending on what the client actually wants — determined via the `Accept` request header (or, less commonly today, a URL suffix/parameter).

```java
@GetMapping(value = "/api/orders/{id}", produces = { MediaType.APPLICATION_JSON_VALUE, MediaType.APPLICATION_XML_VALUE })
public Order getOrder(@PathVariable Long id) { ... }
```

If a client sends `Accept: application/xml`, and an XML-capable `HttpMessageConverter` (e.g., backed by JAXB) is registered, Spring automatically serializes the response as XML instead of the default JSON — the controller method itself is completely unaware of which format was ultimately chosen, since that decision is made entirely by the content-negotiation and message-converter layer beneath it.

---

## 10. Real-World Scenarios

### E-commerce — A REST API and a server-rendered admin page sharing the same service layer
```java
@RestController
@RequestMapping("/api/orders")
public class OrderApiController {
    private final OrderService orderService;
    // constructor injection, per the Spring Core notes

    @GetMapping("/{id}")
    public Order getOrder(@PathVariable Long id) {
        return orderService.findById(id);
    }
}

@Controller
public class OrderAdminController {
    private final OrderService orderService; // same underlying service, different presentation layer

    @GetMapping("/admin/orders/{id}")
    public String showOrder(@PathVariable Long id, Model model) {
        model.addAttribute("order", orderService.findById(id));
        return "admin/orderDetails";
    }
}
```
Both a JSON API for a mobile app and a server-rendered HTML admin dashboard reuse the exact same `OrderService`, differing only in their controller's return type and annotation (`@RestController` vs `@Controller`) — a direct, practical benefit of Spring MVC's clean separation between the web layer and the business logic layer underneath it.

### Banking — Centralized, structured error responses across an entire API
```java
@RestControllerAdvice
public class ApiExceptionHandler {
    @ExceptionHandler(InsufficientFundsException.class)
    public ResponseEntity<ErrorResponse> handle(InsufficientFundsException ex) {
        return ResponseEntity.unprocessableEntity()
                .body(new ErrorResponse("INSUFFICIENT_FUNDS", ex.getMessage()));
    }
}
```
Every controller across a banking API automatically returns a consistent, structured error format for this exception type, without any individual controller needing its own repeated `try`/`catch` — critical for API consumers who need to reliably parse and react to specific error codes.

### Microservices — Request-scoped correlation ID via an interceptor
```java
public class CorrelationIdInterceptor implements HandlerInterceptor {
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String correlationId = request.getHeader("X-Correlation-Id");
        if (correlationId == null) correlationId = UUID.randomUUID().toString();
        MDC.put("correlationId", correlationId); // ties directly into the Logging Frameworks notes' MDC section
        response.setHeader("X-Correlation-Id", correlationId);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        MDC.clear(); // critical — see the Logging Frameworks notes' thread-pool leakage gotcha
    }
}
```
This interceptor ties directly back into the MDC-based cross-service log correlation pattern from the Logging Frameworks notes, implemented specifically at the Spring MVC layer where the framework already has clean, well-defined "before" and "after" hooks around every request.

### Public APIs — Bean Validation catching malformed requests before they reach business logic
A payments API rejects a request with a negative `total` field automatically, via `@Valid` and `@Positive`, returning a structured 400 response from the global `@ControllerAdvice` handler — the `OrderService`'s actual business logic never even sees the invalid data, since it never gets past the validation and exception-handling layers in front of it.

---

## 11. Common Mistakes / Gotchas

> ⚠️ **Confusing `@Controller` and `@RestController`**, forgetting that a plain `@Controller` method's return value is a view name, not a response body — leading to confusing "why is my JSON object showing up as a Thymeleaf template lookup error" bugs when `@ResponseBody` was needed but omitted.

> ⚠️ **Putting business-logic-aware, Spring-bean-dependent behavior in a raw Servlet `Filter`** when a `HandlerInterceptor` would be a more natural, framework-aware fit — and vice versa, using an interceptor for something that's really a protocol-level, framework-agnostic concern better suited to a filter.

> ⚠️ **Forgetting `@Valid` on a `@RequestBody` parameter**, silently skipping all the Bean Validation annotations declared on the request DTO — validation constraints do nothing on their own without this trigger.

> ⚠️ **Not centralizing exception handling with `@ControllerAdvice`**, leading to inconsistent, ad-hoc error response formats scattered across different controllers, making life harder for API consumers.

> ⚠️ **Returning raw entities directly from a REST controller** rather than a dedicated DTO — this can accidentally leak internal fields (or trigger `LazyInitializationException` from the Hibernate/JPA notes, if a lazy association gets serialized outside its transaction) that were never meant to be part of the public API contract.

---

## 12. Comparison: The Core Spring MVC Components

| Component | Question it answers |
|---|---|
| `DispatcherServlet` | "Where does every request go first?" |
| `HandlerMapping` | "Which controller method should handle this specific request?" |
| `HandlerAdapter` | "How do I actually invoke that method, given its specific parameter types?" |
| `HandlerMethodArgumentResolver` | "How do I populate one specific kind of method parameter?" |
| `HttpMessageConverter` | "How do I turn a Java object into (or out of) an HTTP body?" |
| `ViewResolver` | "What actual view file does this logical view name refer to?" |
| `HandlerInterceptor` | "What cross-cutting logic should run before/after this specific handler?" |
| `@ControllerAdvice` | "How should exceptions from any controller be turned into HTTP responses?" |

---

## Interview Questions

1. What is the Front Controller pattern, and how does `DispatcherServlet` embody it compared to the traditional one-servlet-per-URL model from the plain Servlet API?
2. Walk through the full request lifecycle from an incoming HTTP request to a rendered response, naming each major component involved in order.
3. What is the actual difference between `@Controller` and `@RestController`, and what specific annotation does the latter implicitly apply to every method?
4. What is the role of an `HttpMessageConverter`, and why does using it mean a `@RestController` method never needs to manually serialize a Java object to JSON itself?
5. How does `HandlerAdapter` decide how to populate a controller method's diverse mix of parameter types (`@PathVariable`, `@RequestBody`, `@RequestHeader`, etc.)?
6. What is the purpose of a `ViewResolver`, and why do controller methods return logical view names rather than physical file paths?
7. What does `@Valid` actually trigger, and what happens to a request if bean validation fails on its `@RequestBody` parameter?
8. Explain the difference between a `@ExceptionHandler` method scoped to a single controller versus one declared inside a `@ControllerAdvice` class.
9. What is the structural and practical difference between a Servlet `Filter` and a Spring `HandlerInterceptor`, and when would you choose one over the other?
10. How does content negotiation determine whether a given request/response is serialized as JSON versus XML, and where does that decision actually get made?
11. Why can returning a JPA entity directly from a REST controller be risky, tying your answer back to concepts from the Hibernate & JPA notes?
12. If you inject `MDC.put()`/`MDC.clear()` calls into a `HandlerInterceptor`'s `preHandle()`/`afterCompletion()` methods for request correlation logging, why is it critical that `afterCompletion()` (not just `postHandle()`) is where the cleanup happens?