# Servlets & Web Lifecycle

> **Topic:** The Servlet API, container-managed lifecycle, request/response handling, sessions, filters, listeners, and JSP

---

## 1. What Is a Servlet, and Why Does It Exist?

A **servlet** is a Java class that runs inside a **servlet container** (like Apache Tomcat, Jetty, or the servlet engine embedded in an application server) and handles HTTP requests, producing HTTP responses. It is Java's foundational, standardized answer to "how do I write server-side code that responds to a web request?" — and nearly every modern Java web framework (Spring MVC, JSF, Struts) is ultimately built **on top of** the Servlet API, even when developers never interact with `HttpServlet` directly.

### The problem it solves — life before servlets

Before servlets, server-side dynamic web content on many platforms was generated via **CGI (Common Gateway Interface)** — where each incoming HTTP request spawned a brand-new **operating system process** to handle it, which then exited once the response was sent.

This had severe, fundamental problems:
- **Process-per-request overhead.** Starting a new OS process for every single request (fork/exec on Unix systems) is expensive — far more expensive than handling a request within an already-running program.
- **No shared state between requests.** Since each request got a fresh, independent process, there was no natural way to share a database connection pool, an in-memory cache, or any other expensive-to-create resource across requests — everything had to be re-established from scratch, every time.
- **Poor scalability under load.** A busy server could easily be overwhelmed by the sheer overhead of constantly creating and destroying processes, long before it hit any real computational limit.

### The servlet solution

A servlet container keeps a **single, long-running Java process** (the container itself) alive, and within it, a servlet is instantiated **once** and then reused to handle **many requests over its lifetime**, each request handled by a separate lightweight thread rather than a heavyweight OS process.

```java
public class HelloServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        resp.setContentType("text/html");
        resp.getWriter().println("<h1>Hello, World!</h1>");
    }
}
```

> 💡 **Key insight:** The single most important architectural shift servlets introduced was moving from **"a new process per request"** to **"a shared, long-lived object, invoked repeatedly, once per request, on a pooled thread."** This single change is what made server-side Java web applications genuinely scalable, and it's the same underlying model (a long-lived object serving many short-lived units of work on pooled threads) that essentially every subsequent Java web technology has continued to build on.

---

## 2. The Servlet Container's Role

A **servlet container** (Tomcat, Jetty, Undertow, or the servlet engine inside a full Java EE/Jakarta EE application server) is responsible for everything a servlet developer would otherwise have to build by hand:

- Listening on a TCP port, accepting incoming HTTP connections, and parsing raw HTTP requests into `HttpServletRequest` objects.
- Managing a **thread pool**, assigning each incoming request to a worker thread.
- Managing the **lifecycle** of every deployed servlet (instantiation, initialization, destruction — see Section 3).
- Managing **sessions** (Section 6) and mapping incoming request URLs to the correct servlet based on configured URL patterns.
- Serializing an `HttpServletResponse` object back into raw HTTP bytes sent back to the client.

This is precisely analogous to how the JVM itself abstracts away OS-level thread scheduling from application code — the servlet container abstracts away raw socket/HTTP-protocol handling from servlet code, letting the servlet author focus purely on "given a request, produce a response."

---

## 3. The Servlet Lifecycle

Every servlet's life is managed entirely by the container, following a strict, well-defined sequence dictated by the `Servlet` interface's three core methods.

```
Container starts
      │
      ▼
Servlet class loaded 
(typically lazily, on first request — unless load-on-startup is configured)
      │
      ▼
Servlet instance created (exactly ONE instance, by default)
      │
      ▼
init(ServletConfig config) ← called exactly once, before the servlet handles any request
      │
      ▼
service(request, response) ← called ONCE PER REQUEST, for the servlet's entire lifetime
      │                      (dispatches internally to doGet/doPost/doPut/doDelete/etc.)
      │
      ▼
(repeats for every incoming request, 
 on a pooled thread, for as long as the container runs)
      │
      ▼
destroy()   ← called exactly once, when the container is shutting down 
              or undeploying the servlet
```

### `init()` — one-time setup

```java
@Override
public void init(ServletConfig config) throws ServletException {
    super.init(config);
    this.dataSource = (DataSource) config.getServletContext().getAttribute("dataSource");
}
```
Called exactly once, before the servlet handles its first request. This is the correct place to perform expensive, one-time setup — obtaining a reference to a shared resource (a connection pool, a configuration object) — precisely because it runs only once, no matter how many thousands of requests the servlet later handles.

### `service()` — dispatched per request

```java
// HttpServlet's own service() implementation (conceptually) does this dispatch for you:
protected void service(HttpServletRequest req, HttpServletResponse resp) {
    String method = req.getMethod();
    switch (method) {
        case "GET" -> doGet(req, resp);
        case "POST" -> doPost(req, resp);
        case "PUT" -> doPut(req, resp);
        case "DELETE" -> doDelete(req, resp);
        // ...
    }
}
```
When extending `HttpServlet` (the standard, HTTP-specific subclass almost every real servlet uses, as opposed to the more generic, protocol-agnostic `GenericServlet`), you virtually never override `service()` directly — instead, you override the specific `doGet()`/`doPost()`/etc. methods corresponding to the HTTP methods your servlet needs to handle, and `HttpServlet`'s own `service()` implementation dispatches to the right one based on the incoming request's HTTP method.

### `destroy()` — one-time cleanup

```java
@Override
public void destroy() {
    connectionPool.close();
}
```
Called exactly once, when the container is shutting down the servlet (application undeployment, or full container shutdown) — the correct place to release resources acquired in `init()`.

---

## 4. Critical Thread-Safety Implication: One Instance, Many Threads

By default, a servlet container creates **exactly one instance** of each servlet, and that single instance's `service()` method is invoked **concurrently, on multiple threads at once**, for however many requests happen to arrive simultaneously.

> ⚠️ **This is the single most important — and most commonly violated — rule in servlet programming:** any **instance field** on a servlet is **shared, mutable state accessed concurrently by many threads**, exactly the same category of hazard covered in the Synchronization notes' discussion of race conditions.

```java
// DANGEROUS — counter is shared across every concurrent request
public class CounterServlet extends HttpServlet {
    private int counter = 0; // instance field — shared by ALL requests, ALL threads

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        counter++; // classic read-modify-write race condition under concurrent requests
        resp.getWriter().println("Count: " + counter);
    }
}
```

```java
// CORRECT — no shared mutable instance state; local variables are thread-confined by definition
public class SafeServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        int localValue = computeSomething(); // a local variable — each thread gets its own stack frame
        resp.getWriter().println("Value: " + localValue);
    }
}
```

The correct pattern: servlets should be treated as effectively **stateless** with respect to per-request data — any state that genuinely needs to be shared across requests safely (like a connection pool reference set up once in `init()` and never mutated afterward) is fine, but any state that varies per-request must live in **local variables**, `HttpServletRequest` attributes, or `HttpSession` attributes — never in a plain instance field that gets mutated during request handling.

---

## 5. `ServletConfig` vs `ServletContext`

| | `ServletConfig` | `ServletContext` |
|---|---|---|
| Scope | One per servlet | One per entire web application |
| Obtained via | `getServletConfig()` | `getServletContext()` (also reachable from `ServletConfig`) |
| Typical use | Servlet-specific init parameters | Application-wide shared attributes, resources, and configuration |

```java
// web.xml or annotation-based servlet-specific init param
String uploadDir = getServletConfig().getInitParameter("uploadDirectory");

// application-wide attribute, visible to every servlet, filter, and listener
getServletContext().setAttribute("dataSource", dataSource);
DataSource ds = (DataSource) getServletContext().getAttribute("dataSource");
```

`ServletContext` is effectively the application's shared "global" scope for the entire deployed web application — a common, safe place to store singleton-style shared resources (like a connection pool or a cache) that every servlet, filter, and listener in the application needs access to.

---

## 6. Session Management

HTTP is fundamentally **stateless** — each request is, in principle, independent, with no built-in memory of prior requests from the same client. Real applications almost always need to track a user across multiple requests (a shopping cart, a logged-in user's identity), which requires an explicit **session mechanism** layered on top of stateless HTTP.

### How `HttpSession` works internally

```java
HttpSession session = request.getSession(); // creates a new session if one doesn't already exist
session.setAttribute("cartItems", cartItems);

// on a later request from the same client:
HttpSession session = request.getSession(false); // false = don't create a new one if absent
List<CartItem> items = (List<CartItem>) session.getAttribute("cartItems");
```

The container generates a unique **session ID** the first time `getSession()` creates a new session, and that ID must somehow travel back to the client and be sent back with every subsequent request for the container to recognize "this request belongs to the same session as before." Two mechanisms accomplish this:

1. **Cookies (the default, standard approach)** — the container sends the session ID back in a `Set-Cookie: JSESSIONID=...` response header, and the browser automatically includes it in a `Cookie:` request header on every subsequent request to the same domain.
2. **URL rewriting (a fallback)** — if the client has cookies disabled, the container can instead append the session ID directly into every generated URL (`;jsessionid=...`), so it round-trips as part of the URL itself rather than via a cookie. This requires the application to consistently use `response.encodeURL(...)` when generating links, and is a common source of subtle bugs in legacy applications that forgot to do so consistently.

### Session storage — where does session data actually live?

By default, session data lives **in the memory of the specific server instance** that created it. This has an important, often-overlooked consequence in a **load-balanced, multi-server deployment**: if a user's first request lands on Server A (creating a session there) and a subsequent request is routed by the load balancer to Server B, Server B has **no knowledge** of that session unless one of several mitigations is in place:

- **Sticky sessions** — the load balancer is configured to always route a given client's requests to the same server, based on the session ID.
- **Session replication** — the container/cluster mirrors session data across all server instances, so any server can serve any request, at the cost of replication overhead.
- **Externalized session storage** — session data is stored in a shared external store (Redis, a database) rather than in any individual server's memory, so every server instance reads/writes the same source of truth.

> ⚠️ **Common real-world mistake:** Storing large or numerous objects in the `HttpSession` "because it's convenient," without considering that this memory is held **per logged-in user, for the entire duration of their session**, across potentially thousands of concurrent users — a significant, easily underestimated source of server memory pressure, and a serious added cost if that session data must also be replicated across a cluster.

---

## 7. Filters

A **filter** intercepts requests and responses **before** they reach a servlet (or **after** the servlet has produced a response, on the way back out), allowing cross-cutting logic — logging, authentication, compression, character encoding — to be applied uniformly, independent of any individual servlet's own code.

```java
@WebFilter("/*")
public class LoggingFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        long start = System.currentTimeMillis();
        chain.doFilter(request, response); // pass control to the next filter, or the servlet itself
        long duration = System.currentTimeMillis() - start;
        System.out.println("Request took " + duration + "ms");
    }
}
```

### The filter chain — internals

Multiple filters can be configured to apply to the same URL pattern, forming a **chain**. Each filter receives a `FilterChain` object and must explicitly call `chain.doFilter(request, response)` to pass control onward — to the next filter in the chain, or, if this is the last filter, to the target servlet itself. This gives each filter full control to:
- Inspect or modify the request/response **before** calling `chain.doFilter()`.
- **Skip** calling `chain.doFilter()` entirely, short-circuiting the chain (e.g., an authentication filter rejecting an unauthenticated request with a 401 response, never letting the request reach the actual servlet).
- Perform additional logic **after** `chain.doFilter()` returns, once the rest of the chain (including the target servlet) has already run — exactly how the logging filter above measures total request duration.

> 💡 **Why filters exist as a separate concept from servlets:** Without filters, cross-cutting concerns like authentication or logging would need to be duplicated inside every individual servlet, or bolted on via inheritance from some shared base servlet class (an inflexible, brittle design). Filters let this logic be defined **once** and declaratively applied to whichever URL patterns need it, completely decoupled from any specific servlet's own implementation — a direct real-world instance of the broader "separation of cross-cutting concerns" principle that later inspired Spring's full Aspect-Oriented Programming (AOP) support.

---

## 8. Listeners

**Listeners** let application code react to lifecycle events of the container's core objects — the application itself starting/stopping, a session being created/destroyed, or an attribute being added/removed — without needing to embed that logic inside a servlet or filter.

```java
@WebListener
public class AppLifecycleListener implements ServletContextListener {
    @Override
    public void contextInitialized(ServletContextEvent event) {
        DataSource ds = createConnectionPool();
        event.getServletContext().setAttribute("dataSource", ds);
    }

    @Override
    public void contextDestroyed(ServletContextEvent event) {
        DataSource ds = (DataSource) event.getServletContext().getAttribute("dataSource");
        ds.close();
    }
}
```

```java
@WebListener
public class SessionCounterListener implements HttpSessionListener {
    private static final AtomicInteger activeSessions = new AtomicInteger();

    @Override
    public void sessionCreated(HttpSessionEvent se) {
        activeSessions.incrementAndGet();
    }

    @Override
    public void sessionDestroyed(HttpSessionEvent se) {
        activeSessions.decrementAndGet();
    }
}
```

`ServletContextListener`'s `contextInitialized()` is the standard, idiomatic place to perform application-wide startup work (setting up a connection pool, loading configuration) exactly once when the application deploys — a cleaner, more explicit alternative to relying on a specific servlet's `init()` method with a `load-on-startup` configuration, since a listener's purpose (react to application startup) is unambiguous from its type alone.

---

## 9. Request Dispatching: `forward()` vs `include()`

Servlets can delegate part or all of request handling to another resource (another servlet, or a JSP) within the same application, via a `RequestDispatcher`.

```java
RequestDispatcher dispatcher = request.getRequestDispatcher("/WEB-INF/views/orderDetails.jsp");
dispatcher.forward(request, response);
```

| Method | Behavior |
|---|---|
| `forward()` | Control is **transferred entirely** to the target resource; the original servlet's own output (if any was written) is discarded, and the browser's URL bar does **not** change — this all happens server-side, invisibly to the client |
| `include()` | The target resource's output is **inserted into** the current response, and control **returns** to the original servlet afterward, which can continue writing additional output |

`forward()` is the standard mechanism behind the classic **Model-View-Controller (MVC)** pattern in servlet-based applications: a "controller" servlet processes the request, prepares data (the "model," often set as request attributes), and then forwards to a JSP (the "view") to render the final HTML — all without an extra client-visible redirect round-trip.

```java
// Classic servlet-based MVC controller pattern
List<Order> orders = orderService.findOrdersForUser(userId);
request.setAttribute("orders", orders);
request.getRequestDispatcher("/WEB-INF/views/orderList.jsp").forward(request, response);
```

> ⚠️ **`forward()` vs `sendRedirect()` — a frequently confused distinction:** `response.sendRedirect(url)` is a completely different mechanism — it sends an HTTP 302 response back to the **browser**, instructing the browser to make a brand-new request to a different URL, which **does** change the URL bar and costs an extra round-trip. `forward()` is a server-side-only handoff, invisible to the browser. Choosing the wrong one is a common source of bugs — e.g., using `sendRedirect()` after a form POST when a same-visible-URL server-side `forward()` was actually intended, or vice versa (using `forward()` when you specifically wanted the URL bar to change, e.g., to prevent a form resubmission on page refresh — the well-known Post/Redirect/Get pattern).

---

## 10. JSP (JavaServer Pages)

**JSP** is a technology for writing the **view** layer of a web application by embedding Java logic directly inside what otherwise looks like an HTML document — the inverse of a servlet, which embeds HTML-generation logic inside Java code.

```jsp
<html>
<body>
    <h1>Welcome, <%= user.getName() %>!</h1>
    <ul>
        <% for (Order order : orders) { %>
            <li><%= order.getId() %> - $<%= order.getTotal() %></li>
        <% } %>
    </ul>
</body>
</html>
```

### How a JSP actually executes — translation to a servlet

A JSP file is **never executed directly**. On first request (or at deployment, depending on container configuration), the container's **JSP engine** translates the `.jsp` file into an ordinary **Java servlet source file**, compiles it into a `.class` file, and from that point on, the generated servlet is what actually handles every request for that JSP — identical in principle to any hand-written servlet, just generated automatically from a more HTML-friendly source format.

```
MyPage.jsp  →  (JSP engine translates)  →  MyPage_jsp.java  →  (javac compiles)  →  MyPage_jsp.class
```

This is precisely why the very first request to a given JSP is often noticeably slower than subsequent requests (a real, commonly-observed production behavior) — that first request pays the one-time cost of translation and compilation, while every later request reuses the already-compiled servlet class exactly like any other servlet.

### JSP scripting elements

| Syntax | Purpose |
|---|---|
| `<%= expression %>` | Expression — evaluated and its result inserted directly into the output |
| `<% code %>` | Scriptlet — arbitrary Java code, executed but producing no direct output itself |
| `<%! declaration %>` | Declaration — declares a field or method on the generated servlet class itself |
| `<%@ page ... %>` | Page directive — page-level configuration (imports, content type, error page) |

### Why raw JSP scriptlets fell out of favor

Embedding raw Java logic (loops, conditionals, business logic) directly inside a JSP via `<% %>` scriptlets — common in early Java web development — became widely recognized as poor practice, because it mixes presentation markup and business/application logic in the same file, making the page hard to read, hard to test, and hard to hand off between developers focused on markup versus developers focused on logic. This directly motivated the development of the **JSP Standard Tag Library (JSTL)** and the **Expression Language (EL)**, which express the same view-layer needs in a more markup-native, logic-light way:

```jsp
<%-- Modern JSTL/EL style — no raw Java code in the view --%>
<c:forEach var="order" items="${orders}">
    <li>${order.id} - $${order.total}</li>
</c:forEach>
```

> 💡 **Key insight:** The evolution from raw JSP scriptlets to JSTL/EL, and ultimately to the fuller separation of concerns in modern frameworks like Spring MVC (with Thymeleaf or a dedicated templating engine as the view layer, completely decoupled from Java compilation), reflects a consistent, recurring theme in web development generally: presentation logic and business logic want to be developed, tested, and reasoned about **separately**, and any technology that blurs that line too much tends to be superseded over time by one that enforces cleaner separation.

---

## 11. Asynchronous Servlets (Servlet 3.0+)

By default, the thread handling a request is held for the **entire duration** of that request — including any time spent waiting on a slow downstream call (a slow database query, a slow external API). Under high concurrency with many slow requests, this can exhaust the container's thread pool even though most of those threads are doing nothing but waiting.

```java
@WebServlet(urlPatterns = "/slow", asyncSupported = true)
public class AsyncServlet extends HttpServlet {
    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) {
        AsyncContext asyncContext = req.startAsync();
        executorService.submit(() -> {
            String result = callSlowExternalService(); // runs on a separate thread pool
            try {
                resp.getWriter().write(result);
            } catch (IOException e) {
                // handle error
            }
            asyncContext.complete(); // release the response back to the container
        });
        // the original request-handling thread is now free to serve OTHER requests immediately
    }
}
```

`req.startAsync()` detaches the response from the original container-managed request-handling thread, freeing that thread to immediately go back to the pool and serve a different request, while the actual slow work continues on a separate thread (often from an application-managed executor). This is conceptually the direct servlet-era predecessor to the same underlying problem virtual threads (covered in the Java 21 notes) solve even more simply — letting a server handle a very large number of concurrent, mostly-waiting connections without needing one dedicated OS thread tied up per connection for the connection's entire duration.

---

## 12. Real-World Scenarios

### E-commerce — Shopping cart persisted across requests via `HttpSession`
```java
HttpSession session = request.getSession();
List<CartItem> cart = (List<CartItem>) session.getAttribute("cart");
if (cart == null) {
    cart = new ArrayList<>();
    session.setAttribute("cart", cart);
}
cart.add(newItem);
```
A shopping cart is the textbook use case for session state — it must persist across multiple independent requests (browsing more products, eventually checking out) from a client that HTTP itself has no built-in memory of.

### Enterprise applications — Centralized authentication via a filter
```java
@WebFilter("/admin/*")
public class AuthenticationFilter implements Filter {
    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) req;
        if (httpReq.getSession(false) == null || httpReq.getSession().getAttribute("user") == null) {
            ((HttpServletResponse) res).sendRedirect("/login");
            return; // chain.doFilter() never called — request never reaches the admin servlet
        }
        chain.doFilter(req, res);
    }
}
```
Every servlet under `/admin/*` is automatically protected by this single filter, without needing to duplicate an authentication check inside each individual admin-related servlet.

### Reporting dashboards — Application-wide shared resources via `ServletContextListener`
A reporting application initializes a shared, expensive-to-create analytics connection pool exactly once at startup via a `ServletContextListener`, storing it in the `ServletContext` so every reporting servlet across the application can access the same pool without each servlet managing its own separate connection lifecycle.

### High-traffic APIs — Freeing threads during slow downstream calls with async servlets
A public API gateway servlet that proxies requests to a slow, occasionally-overloaded downstream partner service uses `startAsync()` so that a burst of slow partner-service calls doesn't exhaust the gateway's own limited container thread pool, keeping the gateway responsive for other, faster requests even while some requests are still waiting on the slow partner.

---

## 13. Common Mistakes / Gotchas

> ⚠️ **Storing per-request mutable state in a servlet instance field** — a single servlet instance is shared across all concurrent requests; per-request data must live in local variables, request attributes, or session attributes, never in a plain instance field.

> ⚠️ **Confusing `forward()` and `sendRedirect()`** — one is an invisible, server-side handoff with no URL change and no extra round-trip; the other is a client-visible browser redirect with a URL change and an extra round-trip.

> ⚠️ **Storing large or numerous objects in `HttpSession`** without considering the cumulative memory cost across potentially thousands of concurrent sessions, and the added cost if that session data must be replicated across a cluster.

> ⚠️ **Forgetting that session data is often server-local by default**, causing confusing, intermittent "I was logged in a second ago" bugs in a load-balanced, multi-server deployment without sticky sessions, session replication, or externalized session storage.

> ⚠️ **Writing business logic directly in JSP scriptlets**, tightly coupling presentation and application logic in a way that becomes difficult to test and maintain as the application grows.

> ⚠️ **Forgetting to call `chain.doFilter()`** in a filter (when the request should legitimately continue), silently breaking every request that passes through that filter without any obvious error at the point of the mistake.

---

## 14. Comparison: Servlets vs JSP vs Filters vs Listeners

| Component | Primary purpose | Typical location in an MVC-style app |
|---|---|---|
| **Servlet** | Handle a request, execute logic, prepare data | Controller |
| **JSP** | Render HTML/view output from prepared data | View |
| **Filter** | Apply cross-cutting logic uniformly across many URLs | Cross-cutting (logging, auth, encoding) |
| **Listener** | React to container lifecycle events (app/session start-stop) | Application-wide setup/teardown |

---

## Interview Questions

1. What specific scalability and resource-sharing problems did the servlet model solve compared to the older CGI process-per-request approach?
2. Explain the servlet lifecycle in order — why is `init()` called only once, and what category of setup logic belongs there versus in `doGet()`/`doPost()`?
3. Why is it dangerous to store per-request data in a servlet's instance field, given that a container typically creates only one instance of a given servlet class?
4. What is the practical difference between `ServletConfig` and `ServletContext`, and give a real example of when you'd reach for each.
5. How does a container know that two separate HTTP requests belong to the same `HttpSession`, and what are the two mechanisms it can use to track this across stateless HTTP requests?
6. What real-world problem arises with default, in-memory session storage in a load-balanced, multi-server deployment, and what are the three common mitigations?
7. What is the purpose of a `FilterChain`, and how can a filter deliberately short-circuit the chain to prevent a request from ever reaching its target servlet?
8. Explain the difference between `RequestDispatcher.forward()` and `HttpServletResponse.sendRedirect()` in terms of what the browser sees, how many HTTP round-trips occur, and when you'd choose one over the other.
9. What actually happens the very first time a specific JSP page is requested, and why is that first request typically slower than subsequent requests to the same page?
10. Why did the industry move away from embedding raw Java scriptlets directly in JSP files, in favor of JSTL and Expression Language?
11. What problem do asynchronous servlets (`req.startAsync()`) solve, and how is that problem conceptually similar to the motivation behind virtual threads?
12. If a `ServletContextListener`'s `contextInitialized()` method sets up a shared connection pool as a `ServletContext` attribute, why is this generally considered cleaner than doing the same setup inside a specific servlet's `init()` method with `load-on-startup` configured?