# Hibernate & JPA

> **Topic:** ORM fundamentals, the Persistence Context, entity lifecycle, lazy loading internals, the N+1 problem, caching, and locking strategies

---

## 1. What Is ORM, and Why Does It Exist?

**Object-Relational Mapping (ORM)** is a technique for automatically translating between two fundamentally different ways of modeling data: **objects** (with fields, references, inheritance, and identity) in your Java code, and **rows in relational tables** (with columns, foreign keys, and no native concept of inheritance) in your database. This mismatch is widely known as the **object-relational impedance mismatch**.

### The impedance mismatch, concretely

| Object model | Relational model |
|---|---|
| Objects have **identity** independent of their field values (two distinct `Order` objects can have identical fields) | A row is identified purely by its **primary key value** |
| Supports **inheritance** (`PremiumCustomer extends Customer`) | Tables have no native concept of inheritance |
| References between objects are **direct pointers** (`order.getCustomer()`) | Relationships are expressed via **foreign keys**, requiring an explicit `JOIN` to traverse |
| Object graphs can be **arbitrarily large and deeply nested** in memory | Loading an entire deep object graph requires either many queries or complex joins |
| Java has **rich types** (enums, collections, dates with time zones) | SQL types are comparatively primitive and vendor-specific |

Without an ORM, bridging this gap meant writing enormous amounts of repetitive, error-prone **boilerplate JDBC code**: manually mapping each `ResultSet` row to an object field-by-field, manually writing `INSERT`/`UPDATE` statements reflecting an object's current field values, and manually tracking which objects had actually changed since they were loaded (so you only wrote the columns that needed updating).

### The ORM solution

```java
@Entity
public class Order {
    @Id @GeneratedValue
    private Long id;
    private BigDecimal total;

    @ManyToOne
    private Customer customer;
}

Order order = entityManager.find(Order.class, 42L); // no manual SQL or ResultSet mapping
order.setTotal(new BigDecimal("199.99"));
// no explicit UPDATE statement needed — Hibernate detects the change and persists it automatically
```

An ORM framework takes over exactly the tedious, mechanical translation work described above: mapping rows to objects and back, tracking which objects have changed, generating the necessary SQL, and managing the relationships between entities — letting application code work primarily in terms of objects and their relationships, rather than rows and joins.

> 💡 **Key insight:** An ORM doesn't eliminate SQL or the relational model underneath — it automates the **translation layer** between two representations that will always be somewhat different in nature, and it does so well enough, most of the time, that developers can think primarily in objects. But (as covered throughout this file) that automation can leak in important ways, and a developer who doesn't understand what's happening underneath the ORM is prone to serious, hard-to-diagnose performance and correctness bugs.

---

## 2. JPA vs Hibernate — Specification vs Implementation

This distinction trips up many developers, and it directly mirrors a pattern already covered elsewhere in this notes series (SLF4J as a facade over Logback/Log4j2, or the JDBC API as a facade over vendor-specific drivers).

| | **JPA (Jakarta Persistence API)** | **Hibernate** |
|---|---|---|
| What it is | A **specification** — a set of interfaces and annotations (`@Entity`, `EntityManager`, etc.) defined by a standard | A **concrete implementation** of that specification (and more) |
| Analogy | Like `java.sql.Connection`/`Driver` — the standard interface | Like a specific JDBC driver — the actual, vendor-specific engine underneath |
| Can you swap it out? | Yes — code written against JPA's standard API can, in principle, run against any compliant JPA provider | Hibernate is one of several JPA providers (others include EclipseLink, OpenJPA) |
| Extra features beyond the spec | N/A | Hibernate offers its own additional APIs (`Session`, `Criteria`, HQL) beyond what JPA strictly requires |

```java
// Pure JPA — portable across any compliant JPA provider
EntityManager em = entityManagerFactory.createEntityManager();
Order order = em.find(Order.class, 42L);

// Hibernate-specific — ties your code to Hibernate specifically
Session session = sessionFactory.openSession();
Order order = session.get(Order.class, 42L);
```

> 💡 **Why this matters practically:** Most modern applications (especially those using Spring Data JPA) are written almost entirely against the **JPA standard API**, with Hibernate simply plugged in underneath as the actual engine doing the work — this is precisely why you'll frequently see "JPA" and "Hibernate" used together or even loosely interchangeably in casual conversation, even though they are, strictly speaking, a specification and one particular implementation of it.

---

## 3. The `EntityManager` and the Persistence Context

The **`EntityManager`** is JPA's central API for interacting with the database — creating, reading, updating, and deleting entities, and managing transactions. But its most important, least understood responsibility is managing the **Persistence Context**.

### What the Persistence Context actually is

The Persistence Context is, conceptually, an **in-memory cache and change-tracking registry** of every entity currently "managed" by a given `EntityManager` — often called the **first-level cache**, and implemented internally as an **identity map** (a map keyed by entity type + primary key, guaranteeing that within a single Persistence Context, requesting the same entity twice always returns the **exact same Java object instance**).

```java
Order order1 = em.find(Order.class, 42L);
Order order2 = em.find(Order.class, 42L);
System.out.println(order1 == order2); // true — same object instance, not just equal fields
```

The second `find()` call does **not** hit the database at all — the `EntityManager` recognizes it already has this entity managed in its Persistence Context and returns the existing instance directly. This identity-map behavior is also what makes **automatic dirty checking** (Section 4) possible: since the Persistence Context holds the actual managed instance, it can compare that instance's current field values against a snapshot taken when it was first loaded, to detect what's changed.

### Scope — the Persistence Context is typically transaction-scoped

In most Spring-managed applications, a Persistence Context's lifetime is tied to a single transaction — created when the transaction begins, and discarded when the transaction commits or rolls back. This has a crucial, frequently-misunderstood consequence covered in Section 8: entities loaded within one transaction become **detached** the moment that transaction ends, and further lazy-loading attempts on them will fail.

---

## 4. The Entity Lifecycle

Every JPA entity instance exists in exactly one of four distinct states at any given time:

```
        new Order()
             │
             ▼
        [ TRANSIENT ]  ── never persisted, not tracked by any Persistence Context
             │
       em.persist(order)
             ▼
        [ PERSISTENT/MANAGED ]  ── tracked by the Persistence Context, changes auto-detected
             │
    ┌────────┼────────┐
    │        │         │
em.detach() commit/  em.remove()
    │      close()      │
    ▼        │           ▼
[ DETACHED ] │      [ REMOVED ]  ── scheduled for DELETE on next flush
             ▼
        [ DETACHED ]  ── no longer tracked, changes NOT auto-detected
             │
        em.merge(order)
             ▼
        back to [ PERSISTENT/MANAGED ] (a NEW managed instance, copied from the detached one)
```

| State | Description |
|---|---|
| **Transient** | A plain Java object created with `new`, never associated with any Persistence Context or database row. Changes have no effect on the database. |
| **Managed / Persistent** | Associated with an active Persistence Context. Any field change is automatically detected and eventually written to the database (dirty checking). |
| **Detached** | Was managed once, but its Persistence Context has since closed (transaction ended, `EntityManager` closed, or explicitly detached). The object still holds its data, but changes to it are **silently ignored** by JPA — nothing is tracking it anymore. |
| **Removed** | Marked for deletion via `em.remove()`. Still exists in memory and in the Persistence Context until the next flush, at which point a `DELETE` statement is issued. |

```java
Order order = new Order();              // TRANSIENT
order.setTotal(new BigDecimal("100"));

em.persist(order);                       // now PERSISTENT — INSERT issued at flush time
order.setTotal(new BigDecimal("150"));   // automatically detected — UPDATE issued at flush time

em.detach(order);                        // now DETACHED
order.setTotal(new BigDecimal("200"));   // silently has NO effect on the database

Order merged = em.merge(order);          // re-attaches — returns a NEW managed instance with the 200 value
```

> ⚠️ **Common mistake:** Continuing to mutate a detached entity and expecting those changes to be persisted automatically. Once an entity is detached, JPA is no longer watching it — you must explicitly call `em.merge()` (which copies the detached entity's current state onto a freshly-managed instance) to have those changes actually reach the database.

---

## 5. Automatic Dirty Checking

One of Hibernate/JPA's most valuable — and most "magical" — features: you never write an explicit `UPDATE` statement for a managed entity.

### How it works internally

When an entity is first loaded into the Persistence Context, Hibernate takes a **snapshot** of its field values at that moment. When the Persistence Context is **flushed** (see below), Hibernate compares the entity's **current** field values against that original snapshot, field by field, and generates an `UPDATE` statement containing only the columns that actually changed — entirely without the developer writing any explicit update logic.

```java
Order order = em.find(Order.class, 42L); // snapshot taken here: {total: 100, status: "PENDING"}
order.setStatus("SHIPPED");               // just a plain field mutation — no explicit save() call needed
// at flush time, Hibernate detects status changed, total did not, and issues:
// UPDATE orders SET status = 'SHIPPED' WHERE id = 42
```

### When does a flush actually happen?

A **flush** is the point at which the Persistence Context's pending changes (inserts, updates, deletes) are actually translated into SQL and sent to the database — this is **not** the same moment as a **commit** (which finalizes the database transaction). Flushes happen:
- Automatically, right before a JPQL/HQL query is executed, so the query sees any pending in-memory changes reflected in the database it's about to query (by default — see `FlushModeType`).
- Automatically, at transaction commit time, if not already flushed.
- Manually, via an explicit `em.flush()` call.

> ⚠️ **Common performance mistake:** Not understanding the distinction between flush and commit leads some developers to call `em.flush()` far more often than necessary — each flush is a real round-trip of SQL statements to the database, and doing it unnecessarily (rather than letting Hibernate batch changes together and flush them naturally at the right moments) can hurt performance for no correctness benefit.

---

## 6. Mapping Relationships

### The four relationship annotations

```java
@Entity
public class Customer {
    @Id @GeneratedValue
    private Long id;

    @OneToMany(mappedBy = "customer", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Order> orders = new ArrayList<>();
}

@Entity
public class Order {
    @Id @GeneratedValue
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "customer_id")
    private Customer customer;
}
```

| Annotation | Meaning | Owning side |
|---|---|---|
| `@OneToMany` | One entity relates to many of another (e.g., one `Customer` has many `Order`s) | Usually the "many" side (`@ManyToOne`) owns the foreign key |
| `@ManyToOne` | The inverse — many entities relate to one (e.g., many `Order`s belong to one `Customer`) | This side typically holds the actual foreign-key column via `@JoinColumn` |
| `@OneToOne` | A strict one-to-one relationship (e.g., one `User` has one `UserProfile`) | Either side can own the foreign key, depending on design |
| `@ManyToMany` | Many-to-many (e.g., `Student`s and `Course`s), requiring a join table | Either side can be designated the owner; the other uses `mappedBy` |

### `mappedBy` — the owning side vs the inverse side

In a bidirectional relationship, exactly **one** side is the "owning" side — the side whose annotation directly controls the foreign-key column via `@JoinColumn`. The other side is the "inverse" side, marked with `mappedBy`, pointing back at the field name on the owning side that manages the relationship.

> ⚠️ **Critical, extremely common mistake:** Setting a relationship **only** on the inverse (`mappedBy`) side and expecting the foreign key to update. It won't — since the inverse side has no actual control over the database column, only changes made via the **owning side** are ever persisted:

```java
// WRONG — customer.getOrders().add(order) alone does NOT set the foreign key
customer.getOrders().add(order);
em.persist(order); // order.customer is still null! FK column will be NULL

// CORRECT — must set the owning side explicitly
order.setCustomer(customer);         // owning side — this actually sets the FK
customer.getOrders().add(order);     // inverse side — keeps the in-memory object graph consistent
em.persist(order);
```

### Cascade types

`cascade = CascadeType.ALL` (or a more specific subset like `PERSIST`, `MERGE`, `REMOVE`) propagates an operation performed on the parent entity to its associated children automatically — e.g., persisting a `Customer` also persists any new `Order`s already attached to its `orders` collection, without needing a separate `em.persist()` call for each order.

> ⚠️ **Dangerous default to watch for:** `CascadeType.REMOVE` (or `ALL`, which includes it) on a `@OneToMany` means deleting the parent entity **also deletes every associated child row** — a correct and intentional behavior in some domains (deleting an `Order` should delete its `OrderLine`s), but a serious, sometimes catastrophic bug if applied to a relationship where children have independent lifecycle meaning (e.g., accidentally cascading delete from a `Department` to its `Employee`s).

---

## 7. Lazy vs Eager Loading, and Proxy Objects

### `FetchType.LAZY` vs `FetchType.EAGER`

```java
@ManyToOne(fetch = FetchType.LAZY)   // load on first access, not immediately
private Customer customer;

@OneToMany(fetch = FetchType.EAGER)  // load immediately, as part of the parent's own query
private List<Order> orders;
```

By default, JPA specifies `@ManyToOne`/`@OneToOne` as `EAGER` and `@OneToMany`/`@ManyToMany` as `LAZY` — but in real-world Hibernate applications, it's extremely common practice to **explicitly override `@ManyToOne` to `LAZY` as well**, since eagerly loading every related entity by default is one of the most common causes of unintentional over-fetching and performance problems.

### How lazy loading actually works — proxy objects

When you `find()` an entity with a lazy-loaded association, Hibernate does **not** leave that field `null` and does **not** immediately query for the related entity either. Instead, it populates the field with a **dynamically-generated proxy object** — a runtime-generated subclass of the actual entity class (via bytecode generation, using a library like ByteBuddy internally) that looks and behaves like the real entity, but initially holds only the entity's **identifier** (its primary key), with no other fields populated.

```java
Order order = em.find(Order.class, 42L);
// order.customer is actually a Hibernate-generated proxy: CustomerProxy extends Customer
// at this point, the database has NOT been queried for the customer's actual data yet

String name = order.getCustomer().getName(); // THIS line triggers the actual SELECT query
```

The moment any method other than the identifier getter is called on this proxy, Hibernate intercepts that call, executes a `SELECT` against the database to fully populate the real entity's fields, and delegates the method call through to the now-initialized underlying object — a transparent process the calling code never explicitly sees, which is exactly why it's easy to forget it's happening at all, until it causes a real problem (see the next section).

---

## 8. `LazyInitializationException` — The Most Notorious Hibernate Bug

> ⚠️ **This is arguably the single most commonly encountered real-world Hibernate error.**

Recall from Section 3 that a Persistence Context is typically scoped to a single transaction. If an entity with a lazy-loaded association is fetched **inside** a transaction, but that association is accessed **after** the transaction has already ended (the Persistence Context is closed), Hibernate has no active session left through which it can execute the necessary `SELECT` to initialize the proxy — and throws `LazyInitializationException: could not initialize proxy - no Session`.

```java
// Service layer method — @Transactional boundary ends when this method returns
@Transactional
public Order getOrder(Long id) {
    return orderRepository.findById(id).orElseThrow(); // still inside the transaction here
}

// Controller layer — transaction has ALREADY ended by the time this runs
Order order = orderService.getOrder(42L);
String customerName = order.getCustomer().getName(); // LazyInitializationException!
```

The order entity itself was successfully fetched, but its `customer` field is still an uninitialized proxy — and by the time the controller tries to access it, the transactional Persistence Context that could have fetched it is already gone.

### Common fixes

| Approach | How it works |
|---|---|
| **Fetch what you need inside the transaction** | Call `order.getCustomer().getName()` (or use a JPQL `JOIN FETCH`) while still inside the `@Transactional` method, before returning |
| **`JOIN FETCH` in the query** | Explicitly eager-load the association for this specific query, without changing the entity's default mapping | 
| **DTO projection** | Query directly into a plain data-transfer object containing only the needed fields, sidestepping lazy-loading entirely for read-heavy use cases |
| **Open Session in View (OSIV)** | Keeps the Hibernate session open for the entire web request, including view rendering — widely used historically, but increasingly discouraged (see below) |

```java
// JOIN FETCH — explicitly eager-load customer for this specific query only
@Query("SELECT o FROM Order o JOIN FETCH o.customer WHERE o.id = :id")
Optional<Order> findByIdWithCustomer(@Param("id") Long id);
```

> ⚠️ **Why "Open Session in View" is controversial:** OSIV avoids `LazyInitializationException` by simply keeping the database session (and connection) open for the entire duration of a web request, including template rendering. This "fixes" the symptom but at a real cost: database connections are held longer than strictly necessary (worsening connection pool pressure under load — recall the JDBC & Connection Pooling notes' discussion of pool sizing), and it makes it easy to accidentally trigger lazy-loading queries deep inside a view template, hiding potentially expensive database access behind what looks like simple, harmless presentation code. Many teams and Spring Boot's own more recent defaults have moved toward **disabling OSIV** and being explicit about fetching what's needed within the service layer instead.

---

## 9. The N+1 Query Problem

This is the single most common **performance** problem in real-world JPA/Hibernate applications — distinct from the *correctness* issue of `LazyInitializationException`, though caused by the same underlying lazy-loading mechanism.

### How it happens

```java
List<Order> orders = orderRepository.findAll(); // 1 query — fetches N orders
for (Order order : orders) {
    System.out.println(order.getCustomer().getName()); // triggers 1 additional query PER order
}
```

Fetching a list of `N` orders costs **one** query. But if each order's `customer` association is lazily loaded, and the loop then accesses `getCustomer()` for every single order, Hibernate issues **one additional query per order** to resolve each proxy — for a total of **1 + N** queries, where a single, well-written query with a `JOIN` could have retrieved everything in one round-trip.

For a page displaying 50 orders, this means 51 separate database round-trips instead of 1 — and the problem scales linearly (and often invisibly, in local development with small datasets) with the size of the result set, frequently going unnoticed until it causes a real production performance incident at larger data volumes.

### The fix: `JOIN FETCH`

```java
@Query("SELECT o FROM Order o JOIN FETCH o.customer")
List<Order> findAllWithCustomer();
```

`JOIN FETCH` tells Hibernate to retrieve the associated `customer` data **as part of the same single query**, via an actual SQL `JOIN`, populating the association eagerly for this specific query — eliminating the N additional queries entirely, while still leaving the entity's default mapping as `LAZY` for other, unrelated code paths that don't need the customer data.

> 💡 **Why this is worth specifically watching for in code review:** The N+1 problem is notoriously easy to introduce accidentally (a perfectly innocent-looking `for` loop calling a getter) and notoriously easy to miss in testing with a small local dataset, since the code is functionally correct — it just performs far worse than necessary as data volume grows. Many teams adopt tooling (Hibernate's own statistics logging, or third-party libraries like Datasource Proxy) specifically to detect and flag N+1 patterns during development and testing, before they reach production.

---

## 10. Caching: First-Level vs Second-Level Cache

| | First-Level Cache | Second-Level Cache |
|---|---|---|
| Scope | Per `EntityManager`/Persistence Context (i.e., typically per transaction) | Shared across the entire `EntityManagerFactory`/`SessionFactory` — spans multiple transactions and, in a clustered setup, potentially multiple application instances |
| Enabled by default? | Yes — always on, cannot be disabled | No — must be explicitly configured and enabled |
| Implementation | Built directly into every `EntityManager` (the identity map from Section 3) | A pluggable external cache provider (Ehcache, Infinispan, Hazelcast, Caffeine) |

```java
@Entity
@Cacheable
@org.hibernate.annotations.Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class Product {
    @Id
    private Long id;
    private String name;
}
```

The second-level cache is most valuable for entities that are **read frequently, written rarely, and shared broadly across many transactions/users** — a classic example being a product catalog, where the same relatively-static product data is read by an enormous number of concurrent requests but changes only occasionally.

> ⚠️ **Common mistake:** Enabling the second-level cache broadly, across entities that are actually written frequently or that contain user-specific/sensitive data without appropriate cache region isolation — a cache designed for infrequently-changing, broadly-shared data can introduce subtle staleness bugs (or, in the case of sensitive data leaking across user contexts if misconfigured) if applied indiscriminately to the wrong kind of entity.

---

## 11. Locking Strategies: Optimistic vs Pessimistic

When multiple transactions might concurrently read and update the same row, JPA offers two fundamentally different strategies to prevent lost updates.

### Optimistic locking — `@Version`

```java
@Entity
public class Account {
    @Id
    private Long id;

    @Version
    private int version;

    private BigDecimal balance;
}
```

Every entity with a `@Version` field has that field automatically incremented on every update, and every `UPDATE` statement Hibernate generates includes a `WHERE version = <the version that was read>` clause:

```sql
UPDATE account SET balance = 150, version = 6 WHERE id = 42 AND version = 5
```

If another transaction already updated (and incremented) that row's version in the meantime, this `UPDATE` affects **zero rows** — Hibernate detects this and throws `OptimisticLockException`, signaling that the data was modified concurrently and the current operation should be retried (typically by re-reading the latest data and re-applying the change).

> 💡 **Why "optimistic":** This strategy assumes conflicts are **rare**, and pays essentially no cost in the common case (no locks held, no blocking) — it only pays a cost (an exception, requiring a retry) in the comparatively rare case where a genuine conflict actually occurred. This makes it well-suited to workloads with low contention and where blocking other transactions would be more costly than occasionally retrying.

### Pessimistic locking

```java
Account account = em.find(Account.class, 42L, LockModeType.PESSIMISTIC_WRITE);
// issues a SELECT ... FOR UPDATE — other transactions attempting to lock this row will BLOCK
```

Pessimistic locking assumes conflicts are **likely**, and proactively takes a database-level row lock (`SELECT ... FOR UPDATE`) the moment the row is read, forcing any other transaction that tries to acquire a conflicting lock on the same row to **block and wait** until the first transaction completes — trading potential blocking/reduced concurrency for a guarantee that no conflicting concurrent modification can happen at all during the locked window.

| | Optimistic | Pessimistic |
|---|---|---|
| Mechanism | `@Version` field + conditional `UPDATE` | Database-level row lock (`SELECT ... FOR UPDATE`) |
| Assumes conflicts are | Rare | Likely |
| Cost when no conflict occurs | Essentially free | Lock acquisition/release overhead, reduced concurrency |
| Cost when a conflict occurs | Exception + required retry logic | Blocking wait (no exception, just delay) |
| Best suited for | High-concurrency, low-contention workloads (most typical web applications) | High-contention, correctness-critical workloads (e.g., a single hot inventory row under heavy simultaneous demand) |

---

## 12. HQL/JPQL vs Native SQL vs Criteria API

```java
// JPQL — queries the object model (entity names, field names), not the raw table/column names
List<Order> orders = em.createQuery(
        "SELECT o FROM Order o WHERE o.total > :minTotal", Order.class)
        .setParameter("minTotal", new BigDecimal("100"))
        .getResultList();

// Native SQL — full vendor-specific SQL, useful for database-specific features JPQL can't express
List<Order> orders = em.createNativeQuery(
        "SELECT * FROM orders WHERE total > ?", Order.class)
        .setParameter(1, 100)
        .getResultList();

// Criteria API — type-safe, programmatic query construction, useful for dynamically-built queries
CriteriaBuilder cb = em.getCriteriaBuilder();
CriteriaQuery<Order> query = cb.createQuery(Order.class);
Root<Order> root = query.from(Order.class);
query.select(root).where(cb.gt(root.get("total"), new BigDecimal("100")));
List<Order> orders = em.createQuery(query).getResultList();
```

JPQL/HQL is database-agnostic (queries the entity model, and Hibernate translates it to the correct dialect's SQL underneath), while native SQL sacrifices that portability in exchange for access to database-specific features JPQL doesn't support. The Criteria API trades some readability for full type-safety and the ability to build a query's structure programmatically and conditionally at runtime (e.g., a search feature with many optional filter criteria) rather than string-concatenating JPQL by hand.

---

## 13. `equals()`/`hashCode()` on Entities — A Subtle, Real Pitfall

Implementing `equals()`/`hashCode()` "the normal way" (comparing all fields, as recommended for ordinary classes) is a common source of bugs specific to JPA entities, because of the proxy mechanism from Section 7 and the entity lifecycle from Section 4.

```java
// PROBLEMATIC — comparing a real entity against a lazy-loading proxy of the same row
// can incorrectly return false, since getClass() differs between the proxy subclass and the real class
@Override
public boolean equals(Object o) {
    if (!(o instanceof Customer)) return false;
    return getClass() == o.getClass() && Objects.equals(name, ((Customer) o).name);
}
```

Common, widely-recommended approaches instead:
- Base `equals()`/`hashCode()` **only on the entity's ID**, with careful handling of the transient (null ID) case.
- Use `instanceof` rather than strict `getClass()` equality checks, since a Hibernate proxy is technically a different runtime class than the real entity, even though it represents the same logical row.
- Avoid using the ID-based `hashCode()` before the entity has actually been persisted (i.e., while its ID is still `null`) as a `HashSet`/`HashMap` key, since the object's hash code would change once an ID is finally assigned — violating the same hash-code-stability contract discussed in the HashMap internals notes.

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Customer other)) return false;
    return id != null && id.equals(other.id);
}

@Override
public int hashCode() {
    return getClass().hashCode(); // stable regardless of ID assignment timing
}
```

---

## 14. Real-World Scenarios

### E-commerce — Avoiding N+1 on an order history page
```java
@Query("SELECT o FROM Order o JOIN FETCH o.customer JOIN FETCH o.items WHERE o.customer.id = :customerId")
List<Order> findOrderHistory(@Param("customerId") Long customerId);
```
A customer's order history page displaying 50 orders, each with its items and customer info, is fetched in a single query with joins, rather than 1 + 50 + 50 separate queries — a direct, practical N+1 fix applied to one of the most common real-world list-with-details UI patterns.

### Banking — Optimistic locking on account balances under concurrent updates
```java
@Entity
public class Account {
    @Id private Long id;
    @Version private int version;
    private BigDecimal balance;
}

@Retryable(retryFor = OptimisticLockException.class, maxAttempts = 3)
public void withdraw(Long accountId, BigDecimal amount) {
    Account account = em.find(Account.class, accountId);
    account.setBalance(account.getBalance().subtract(amount));
}
```
Two concurrent withdrawal requests against the same account are protected against a lost-update race condition — whichever transaction commits second sees an `OptimisticLockException` and retries against the now-current balance, rather than silently overwriting the first transaction's change.

### Reporting — DTO projections to sidestep lazy-loading entirely
```java
public record OrderSummary(Long id, String customerName, BigDecimal total) { }

@Query("SELECT new com.example.OrderSummary(o.id, o.customer.name, o.total) FROM Order o")
List<OrderSummary> findOrderSummaries();
```
For a read-heavy reporting endpoint that only needs three specific fields, projecting directly into a lightweight DTO avoids loading full entity graphs, avoids any risk of `LazyInitializationException`, and is often noticeably faster than hydrating full managed entities the caller doesn't actually need.

### SaaS platforms — Second-level cache for shared, rarely-changing reference data
```java
@Entity
@Cacheable
@Cache(usage = CacheConcurrencyStrategy.READ_ONLY)
public class Country {
    @Id private String code;
    private String name;
}
```
A `Country` reference table, read constantly across every tenant's requests but essentially never modified, is an ideal second-level cache candidate — dramatically reducing repeated identical database queries for data that almost never changes.

---

## 15. Common Mistakes / Gotchas

> ⚠️ **Setting a relationship only on the `mappedBy` (inverse) side**, forgetting that only the owning side's changes are actually persisted to the foreign-key column.

> ⚠️ **Accessing a lazy association after its Persistence Context/transaction has closed**, causing `LazyInitializationException`.

> ⚠️ **Introducing accidental N+1 queries** via an innocent-looking loop calling a getter on a lazily-loaded association for every element of a collection.

> ⚠️ **Using `CascadeType.REMOVE`/`ALL` on a relationship where children have independent lifecycle meaning**, accidentally deleting far more data than intended.

> ⚠️ **Implementing `equals()`/`hashCode()` on entities using all fields (or strict `getClass()` checks)**, causing subtle bugs when a Hibernate proxy is compared against the real entity class.

> ⚠️ **Relying on Open Session in View** as a default fix for `LazyInitializationException`, without considering its connection-pool and hidden-lazy-loading-in-views costs.

> ⚠️ **Continuing to mutate a detached entity and expecting the changes to persist automatically**, without realizing `em.merge()` is required to reattach it.

---

## Interview Questions

1. What is the object-relational impedance mismatch, and give at least two concrete examples of where the object model and relational model fundamentally disagree.
2. What is the practical difference between JPA and Hibernate, and why might a codebase be described as "using JPA" even though Hibernate is doing all the actual work underneath?
3. What is the Persistence Context, and how does its identity-map behavior guarantee that two `find()` calls for the same entity return the exact same object instance?
4. Walk through the four entity lifecycle states and explain what happens if you mutate an entity's field while it's in each state.
5. How does Hibernate's automatic dirty checking work internally, and what specifically does it compare to determine which columns need updating?
6. What is the difference between a flush and a commit, and why can calling `em.flush()` unnecessarily hurt performance?
7. Explain the owning side vs. inverse side (`mappedBy`) of a bidirectional relationship, and what concretely goes wrong if you only update the inverse side.
8. What is a Hibernate proxy, and what actually happens the first time a method (other than a getter for the ID) is called on one?
9. Explain exactly why `LazyInitializationException` occurs, tying your answer to the Persistence Context's typical transaction-bound scope.
10. What is the N+1 query problem, why is it easy to miss during development with a small dataset, and how does `JOIN FETCH` solve it?
11. Compare optimistic and pessimistic locking — what does each assume about the likelihood of conflicts, and what is the cost profile of each when a conflict does and doesn't occur?
12. Why is implementing entity `equals()`/`hashCode()` using all fields and a strict `getClass()` check considered a pitfall specific to JPA/Hibernate, and what's the generally recommended alternative?