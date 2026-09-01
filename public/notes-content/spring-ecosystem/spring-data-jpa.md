# Spring Data JPA

> **Topic:** The Repository abstraction, derived query methods, the dynamic proxy mechanism behind them, pagination, specifications, projections, and auditing

---

## 1. Why Spring Data JPA Exists

Recall from the Hibernate & JPA notes that plain JPA already eliminates a huge amount of manual JDBC boilerplate. But even with plain JPA, a typical DAO (Data Access Object) class still requires writing a fair amount of repetitive, mechanical code for the same handful of operations that show up in almost every entity's data-access layer:

```java
// Plain JPA DAO — repetitive boilerplate repeated for nearly every entity in the application
@Repository
public class OrderRepository {
    @PersistenceContext
    private EntityManager em;

    public Order findById(Long id) {
        return em.find(Order.class, id);
    }

    public List<Order> findAll() {
        return em.createQuery("SELECT o FROM Order o", Order.class).getResultList();
    }

    public Order save(Order order) {
        if (order.getId() == null) {
            em.persist(order);
            return order;
        }
        return em.merge(order);
    }

    public void deleteById(Long id) {
        Order order = em.find(Order.class, id);
        if (order != null) em.remove(order);
    }

    public List<Order> findByCustomerEmail(String email) {
        return em.createQuery("SELECT o FROM Order o WHERE o.customer.email = :email", Order.class)
                .setParameter("email", email)
                .getResultList();
    }
}
```

Nearly every entity in a real application needs this same handful of CRUD operations, and hand-writing them for dozens of entities is pure, mechanical repetition — exactly the kind of pattern Spring Data JPA was built to eliminate entirely.

### The Spring Data JPA solution

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    List<Order> findByCustomerEmail(String email);
}
```

That's the **entire** implementation. No class body, no `EntityManager` field, no method bodies — just an **interface**, and Spring Data JPA generates a fully working implementation for it automatically at application startup, including the custom `findByCustomerEmail` method, derived entirely from its name.

> 💡 **Key insight:** Spring Data JPA's core idea is that an enormous share of real-world data-access code follows entirely predictable, mechanical patterns — so rather than making a developer write that predictable code by hand every time, the framework **generates it automatically** from a declared interface, using naming conventions and reflection to figure out exactly what SQL/JPQL needs to run.

---

## 2. The Repository Interface Hierarchy

```
Repository<T, ID>                          ← marker interface, no methods
      │
      ▼
CrudRepository<T, ID>                      ← save, findById, findAll, deleteById, count, existsById...
      │
      ▼
PagingAndSortingRepository<T, ID>          ← adds findAll(Pageable), findAll(Sort)
      │
      ▼
JpaRepository<T, ID>                       ← adds JPA-specific extras: flush(), saveAndFlush(), batch deletes, getReferenceById()
```

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    // inherits save(), findById(), findAll(), deleteById(), count(), existsById(),
    // findAll(Pageable), findAll(Sort), flush(), saveAndFlush(), and more — for free
}
```

In practice, almost every real-world repository extends `JpaRepository` directly, since it includes everything from the interfaces beneath it plus the JPA-specific conveniences layered on top — the intermediate interfaces exist mainly to support Spring Data's other modules (Spring Data MongoDB, Spring Data Redis, etc.), which share the same `Repository`/`CrudRepository`/`PagingAndSortingRepository` abstractions across entirely different underlying data stores.

---

## 3. How Spring Data JPA Actually Implements an Interface at Runtime

This is the single most important internal mechanism to understand — `OrderRepository` is just an **interface**, with no implementing class anywhere in your source code. So what object actually gets injected when you `@Autowired` an `OrderRepository`?

### The mechanism, step by step

1. At startup, `@EnableJpaRepositories` (implicitly included by Spring Boot's auto-configuration whenever Spring Data JPA is on the classpath) scans the configured base package for interfaces extending `Repository` (directly or transitively).
2. For each such interface found, Spring Data JPA's `JpaRepositoryFactoryBean` creates a **JDK dynamic proxy** (recall this exact mechanism from the Spring Core notes' discussion of AOP proxies) implementing that interface.
3. This proxy's `InvocationHandler` is backed by `SimpleJpaRepository` — a single, generic, concrete class that implements all of `CrudRepository`'s and `JpaRepository`'s standard methods (`save()`, `findById()`, `findAll()`, etc.) using the standard `EntityManager` API underneath, entirely generically, using reflection and generics to work against **any** entity type.
4. For any method the proxy receives a call for that **isn't** one of these standard, already-implemented methods (like your custom `findByCustomerEmail`), the proxy instead delegates to a **query-derivation mechanism** (Section 4) that parses the method's name and generates the appropriate JPQL query on the fly, the very first time that method is resolved.

```
Your code calls:  orderRepository.findByCustomerEmail("alice@example.com")
                            │
                            ▼
              JDK Dynamic Proxy implementing OrderRepository
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
   Is this a standard CRUD method?   Is this a custom, derived-query method?
   (save, findById, etc.)             (findByCustomerEmail)
              │                           │
              ▼                           ▼
     Delegate to SimpleJpaRepository   Parse method name → generate JPQL →
     (generic EntityManager calls)     execute via EntityManager
```

> 💡 **Why this matters:** Understanding that `OrderRepository` is a **proxy backed by `SimpleJpaRepository` plus a query-derivation layer** demystifies what otherwise looks like pure magic — there's no compiler trick or bytecode weaving involved, just the same dynamic-proxy technique from the Spring Core notes, applied specifically to implement a data-access interface generically at runtime rather than requiring hand-written implementation code.

---

## 4. Derived Query Methods — Parsing SQL Out of a Method Name

Spring Data JPA parses a repository method's name according to a well-defined grammar, splitting it into a **subject** (what kind of result — `find`, `count`, `exists`, `delete`) and a **predicate** (the `By...` clause describing the `WHERE` conditions), and translates it directly into a JPQL query.

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByStatus(OrderStatus status);
    // → SELECT o FROM Order o WHERE o.status = ?1

    List<Order> findByCustomerEmailAndStatus(String email, OrderStatus status);
    // → SELECT o FROM Order o WHERE o.customer.email = ?1 AND o.status = ?2
    // note: "CustomerEmail" automatically navigates the customer relationship's "email" field

    List<Order> findByTotalGreaterThanEqual(BigDecimal minTotal);
    // → SELECT o FROM Order o WHERE o.total >= ?1

    List<Order> findByCreatedAtBetween(Instant start, Instant end);
    // → SELECT o FROM Order o WHERE o.createdAt BETWEEN ?1 AND ?2

    List<Order> findByCustomerNameContainingIgnoreCase(String namePart);
    // → SELECT o FROM Order o WHERE LOWER(o.customer.name) LIKE LOWER(CONCAT('%', ?1, '%'))

    List<Order> findByStatusOrderByCreatedAtDesc(OrderStatus status);
    // → SELECT o FROM Order o WHERE o.status = ?1 ORDER BY o.createdAt DESC

    long countByStatus(OrderStatus status);       // → SELECT COUNT(o) FROM Order o WHERE o.status = ?1
    boolean existsByCustomerEmail(String email);  // → SELECT COUNT(o) > 0 FROM Order o WHERE ...
    void deleteByStatus(OrderStatus status);       // → generates and executes a DELETE
}
```

### Common keywords in the predicate grammar

| Keyword | Meaning |
|---|---|
| `And` / `Or` | Combines multiple conditions |
| `Between` | Range condition |
| `LessThan` / `GreaterThan` / `LessThanEqual` / `GreaterThanEqual` | Comparison operators |
| `Like` / `Containing` / `StartingWith` / `EndingWith` | Pattern matching |
| `IgnoreCase` | Case-insensitive comparison |
| `OrderBy...Asc`/`Desc` | Sorting, embedded directly in the method name |
| `In` / `NotIn` | Membership against a collection argument |
| `IsNull` / `IsNotNull` | Null checks |
| `True` / `False` | Boolean field checks |

> ⚠️ **A real, practical limitation:** Derived query method names can become extremely long and hard to read once a query has more than two or three conditions (`findByStatusAndCustomerEmailAndCreatedAtBetweenOrderByTotalDesc`), and the naming grammar simply cannot express every kind of query (complex joins, subqueries, aggregations beyond simple `count`). For these cases, `@Query` (Section 5) or the Specification API (Section 7) are the appropriate escape hatches — derived query methods are a convenience for the common, simple case, not a replacement for JPQL entirely.

---

## 5. `@Query` — Explicit JPQL or Native SQL

```java
public interface OrderRepository extends JpaRepository<Order, Long> {

    @Query("SELECT o FROM Order o JOIN FETCH o.customer WHERE o.total > :minTotal")
    List<Order> findHighValueOrdersWithCustomer(@Param("minTotal") BigDecimal minTotal);

    @Query(value = "SELECT * FROM orders WHERE created_at > NOW() - INTERVAL '7 days'", nativeQuery = true)
    List<Order> findRecentOrdersNative();

    @Modifying
    @Query("UPDATE Order o SET o.status = :status WHERE o.id = :id")
    int updateStatus(@Param("id") Long id, @Param("status") OrderStatus status);
}
```

`@Query` is used when a derived method name would be unreadable or simply cannot express the needed query (an explicit `JOIN FETCH` to prevent N+1, as covered in the Hibernate & JPA notes, is a particularly common reason to reach for it), or when native, database-specific SQL is genuinely required.

> ⚠️ **`@Modifying` is required for `UPDATE`/`DELETE` queries.** Without it, Spring Data JPA assumes every `@Query` is a `SELECT` and will throw an exception when the generated statement is actually an update or delete — `@Modifying` signals that this method changes data and should be executed accordingly (and, by default, also clears the persistence context afterward, since bulk updates like this bypass the normal managed-entity dirty-checking flow entirely, potentially leaving already-loaded managed entities in memory out of sync with what's now in the database).

---

## 6. Pagination and Sorting

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    Page<Order> findByStatus(OrderStatus status, Pageable pageable);
}

Pageable pageable = PageRequest.of(0, 20, Sort.by("createdAt").descending());
Page<Order> page = orderRepository.findByStatus(OrderStatus.SHIPPED, pageable);

page.getContent();        // the actual List<Order> for this page
page.getTotalElements();  // total matching rows across ALL pages
page.getTotalPages();
page.hasNext();
```

### `Page` vs `Slice`

| | `Page<T>` | `Slice<T>` |
|---|---|---|
| Knows total element/page count? | Yes — runs an **additional `COUNT` query** to compute this | No — only knows whether a next page exists, by fetching one extra row beyond the requested page size |
| Extra query cost | Yes, always | No |
| Use when | You need to render page numbers / "showing X of Y results" | You only need "infinite scroll"-style next-page navigation, where the total count is irrelevant |

> 💡 **Why this distinction matters for performance:** `Page`'s extra `COUNT(*)` query can become genuinely expensive on very large tables, especially with complex `WHERE` conditions the database can't answer via an index alone. If your UI only ever needs a "load more" button rather than a numbered page list, `Slice` avoids paying for a count query your application doesn't actually need.

---

## 7. `Specification` — Type-Safe, Dynamically-Composed Queries

Derived query methods and `@Query` both work well for a **fixed, known-in-advance** query shape, but real-world search/filter features often need queries whose exact conditions depend on which optional filters the user actually supplied at runtime — a scenario neither approach handles gracefully.

```java
public interface OrderRepository extends JpaRepository<Order, Long>, JpaSpecificationExecutor<Order> { }

public class OrderSpecifications {
    public static Specification<Order> hasStatus(OrderStatus status) {
        return (root, query, cb) -> status == null ? null : cb.equal(root.get("status"), status);
    }

    public static Specification<Order> hasMinTotal(BigDecimal minTotal) {
        return (root, query, cb) -> minTotal == null ? null : cb.greaterThanOrEqualTo(root.get("total"), minTotal);
    }
}

// Building a query dynamically, based on which filters are actually present
Specification<Order> spec = Specification.where(OrderSpecifications.hasStatus(status))
        .and(OrderSpecifications.hasMinTotal(minTotal));
List<Order> results = orderRepository.findAll(spec);
```

Each `Specification` is a small, composable, reusable predicate-building function — a thin, more ergonomic layer over the Criteria API (already introduced in the Hibernate & JPA notes) — and they can be combined with `.and()`/`.or()` at runtime, conditionally including or excluding each filter depending on whether the user actually supplied a value for it (returning `null` from a specification, as shown above, tells Spring Data JPA to simply omit that condition entirely).

> 💡 **Why this beats string-building JPQL by hand:** Manually constructing a JPQL string by conditionally appending `AND` clauses based on which filters are present is exactly the kind of error-prone, easy-to-get-subtly-wrong string manipulation that `PreparedStatement`'s parameterization (from the JDBC notes) exists to avoid at the SQL level — `Specification` provides the same kind of safe, structured, dynamic-query-building capability, but expressed as type-safe Java code operating on the Criteria API rather than string concatenation.

---

## 8. `@EntityGraph` — Fixing N+1 Without Rewriting Every Query

Recall the N+1 query problem from the Hibernate & JPA notes, and its `JOIN FETCH` fix. `@EntityGraph` provides a declarative, reusable alternative specifically suited to Spring Data JPA repositories:

```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    @EntityGraph(attributePaths = {"customer", "items"})
    List<Order> findByStatus(OrderStatus status);
}
```

This tells Spring Data JPA to eagerly fetch the `customer` and `items` associations **for this specific query only**, without changing the entity's own default `FetchType` mapping (which might need to stay `LAZY` for other, unrelated queries against the same entity) — a targeted, per-query fix rather than a global one, achieving the same practical outcome as an explicit `JOIN FETCH` in a `@Query`, but expressed declaratively via annotation instead.

---

## 9. Projections — Fetching Only What You Need

Recall the DTO-projection technique from the Hibernate & JPA notes (`SELECT new com.example.OrderSummary(...)`). Spring Data JPA offers two additional, often more convenient styles.

### Interface-based projections

```java
public interface OrderSummary {
    Long getId();
    BigDecimal getTotal();
    String getCustomerName(); // Spring Data JPA maps this to a nested property path automatically
}

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<OrderSummary> findByStatus(OrderStatus status);
}
```

Spring Data JPA generates a runtime proxy implementing this interface (the same dynamic-proxy technique from Section 3, applied here to the **result** of a query rather than the repository itself), backing each getter with the corresponding column from a query that Spring Data JPA constructs to fetch *only* the needed columns — avoiding the cost of hydrating a full `Order` entity (and its full object graph) when the caller only actually needs three specific fields.

### Class-based (record) projections

```java
public record OrderSummary(Long id, BigDecimal total, String customerName) { }

public interface OrderRepository extends JpaRepository<Order, Long> {
    List<OrderSummary> findByStatus(OrderStatus status);
}
```

With Java records (from the Java 17 notes) as the projection type, Spring Data JPA matches constructor parameter names to query result columns automatically — a clean, modern, boilerplate-free way to get exactly the DTO-based projection benefits described in the Hibernate & JPA notes, without writing a JPQL constructor expression by hand.

---

## 10. Auditing — Automatic `createdAt`/`updatedAt` Tracking

```java
@Configuration
@EnableJpaAuditing
public class JpaConfig { }

@Entity
@EntityListeners(AuditingEntityListener.class)
public class Order {
    @CreatedDate
    private Instant createdAt;

    @LastModifiedDate
    private Instant updatedAt;

    @CreatedBy
    private String createdBy;

    @LastModifiedBy
    private String lastModifiedBy;
}
```

Once `@EnableJpaAuditing` is active, these fields are populated **automatically** by Spring Data JPA's own `AuditingEntityListener` — hooking into the standard JPA entity lifecycle callbacks (`@PrePersist`/`@PreUpdate`, the same general category of lifecycle hook covered conceptually in the Hibernate & JPA notes) — eliminating the need to manually set timestamp fields in every service method that creates or modifies an entity. `@CreatedBy`/`@LastModifiedBy` require an `AuditorAware` bean supplying the current user's identity (typically pulled from Spring Security's authentication context, covered in the Spring Security notes), letting audit trails automatically capture *who* made a change, not just *when*.

---

## 11. Repository Method Transaction Behavior

By default, every method on `SimpleJpaRepository` (Section 3) is already annotated `@Transactional` internally — read methods (`findById`, `findAll`, etc.) run with `readOnly = true` (a hint that allows some database drivers and Hibernate itself to apply performance optimizations, like skipping dirty-checking snapshot comparisons entirely, since nothing is expected to change), while write methods (`save`, `delete`) run with a normal, full read-write transaction.

> ⚠️ **A common, real-world consequence:** Calling a repository's `findById()` method **outside** of any broader `@Transactional` service method still works for simple field access, since the repository method itself opens and closes its own short-lived transaction — but if the returned entity has a lazy association, accessing that association **after** the repository call returns will still throw `LazyInitializationException` (recall this from the Hibernate & JPA notes), because that repository-internal transaction has already closed by the time your calling code tries to touch the lazy association. This is precisely why service-layer methods that need to safely navigate an entity's lazy associations should wrap the relevant logic in their own `@Transactional` boundary, or use `@EntityGraph`/`JOIN FETCH` to eagerly load exactly what's needed up front.

---

## 12. Real-World Scenarios

### E-commerce — A dynamic product search filter using Specifications
```java
public List<Product> search(String category, BigDecimal maxPrice, Boolean inStock) {
    Specification<Product> spec = Specification.where(ProductSpecs.hasCategory(category))
            .and(ProductSpecs.priceLessThanOrEqual(maxPrice))
            .and(ProductSpecs.inStock(inStock));
    return productRepository.findAll(spec);
}
```
A product search page with several optional filters (category, max price, in-stock toggle) builds exactly the right `WHERE` clause for whichever combination of filters the user actually applied, without needing a separate hand-written derived query method for every possible combination of filters.

### Reporting dashboards — Interface projections for a lightweight summary list
```java
public interface OrderRepository extends JpaRepository<Order, Long> {
    List<OrderSummary> findByCreatedAtBetween(Instant start, Instant end);
}
```
A dashboard listing thousands of orders in a given date range only needs an ID, a total, and a customer name for each row — an interface-based projection fetches exactly those three columns, dramatically lighter than hydrating full `Order` entities (with all their associations) for a view that never needed them.

### High-traffic APIs — `@EntityGraph` fixing an N+1 in a paginated endpoint
```java
@EntityGraph(attributePaths = "customer")
Page<Order> findByStatus(OrderStatus status, Pageable pageable);
```
A paginated "recent orders" API endpoint that was silently issuing one extra query per order to resolve each order's lazily-loaded customer is fixed with a single annotation, collapsing what could be 21 queries (1 + 20 per page) down to 1, without touching the entity's own default lazy-fetch mapping used elsewhere in the codebase.

### Compliance / audit trails — Automatic tracking of who changed a record and when
```java
@CreatedBy private String createdBy;
@LastModifiedBy private String lastModifiedBy;
@CreatedDate private Instant createdAt;
@LastModifiedDate private Instant updatedAt;
```
A financial records system automatically stamps every entity with who created and last modified it, and when, purely through JPA auditing — critical, audit-trail metadata that's populated consistently everywhere, with zero risk of a developer forgetting to set it manually in some code path.

---

## 13. Common Mistakes / Gotchas

> ⚠️ **Writing an unreadably long derived query method name** instead of switching to `@Query` once a query has more than two or three conditions.

> ⚠️ **Forgetting `@Modifying` on an `UPDATE`/`DELETE` `@Query`**, causing Spring Data JPA to reject it as an invalid `SELECT`.

> ⚠️ **Using `Page<T>` when `Slice<T>` would do**, paying for an unnecessary `COUNT(*)` query on a large table purely for a UI that never actually displays a total count.

> ⚠️ **Assuming a repository method call alone is enough to safely navigate a lazily-loaded association afterward**, forgetting that the repository's own internal transaction has already closed by the time calling code tries to access it — leading to the same `LazyInitializationException` covered in the Hibernate & JPA notes.

> ⚠️ **Manually building dynamic JPQL strings via conditional concatenation** for optional search filters, instead of using the `Specification` API, reintroducing exactly the kind of fragile, error-prone string-manipulation code the framework exists to help you avoid.

> ⚠️ **Fetching full entities via `findAll()` for a read-only reporting or listing feature**, when an interface or record projection would fetch only the needed columns, at a real, avoidable performance cost as data volume grows.

---

## 14. Comparison: Choosing the Right Query Approach

| Approach | Best for |
|---|---|
| Derived query method (`findByStatus`) | Simple, fixed queries with 1–3 conditions, no joins needed beyond simple property navigation |
| `@Query` (JPQL) | More complex, still fixed-shape queries; explicit `JOIN FETCH` to control N+1 |
| `@Query` (native SQL) | Database-specific features JPQL can't express |
| `Specification` | Dynamic queries whose exact conditions depend on runtime-supplied, optional filters |
| `@EntityGraph` | Fixing N+1 for a specific repository method without changing the entity's default fetch type |
| Interface/record projection | Read-heavy endpoints that only need a subset of an entity's fields |

---

## Interview Questions

1. Given that a Spring Data JPA repository is just an interface with no implementing class in your source code, what actually gets injected when you `@Autowired` it, and what mechanism creates that object?
2. What is `SimpleJpaRepository`, and how does it manage to implement `save()`/`findById()`/`findAll()` generically for any entity type, rather than needing a separate implementation per entity?
3. Walk through how Spring Data JPA parses `findByCustomerEmailAndStatus(String email, OrderStatus status)` into an actual JPQL query.
4. When should you switch from a derived query method to `@Query`, and give a concrete example of a query a derived method name genuinely cannot express well.
5. Why is `@Modifying` required on an `@Query` that performs an `UPDATE` or `DELETE`, and what does Spring Data JPA assume about a `@Query` without it?
6. What is the practical performance difference between `Page<T>` and `Slice<T>`, and when would choosing `Slice` meaningfully improve performance on a large table?
7. How does `Specification` solve the problem of building a query with several optional, runtime-determined filter conditions, compared to manually concatenating JPQL strings?
8. What does `@EntityGraph` actually change about how a specific repository method executes, and how is this different from changing the entity's own `@ManyToOne`/`@OneToMany` `fetch` attribute globally?
9. How does an interface-based projection avoid fetching an entity's full set of columns, and what mechanism actually backs the projection interface's getter methods at runtime?
10. Why can calling `orderRepository.findById(id)` and then accessing a lazy association on the returned entity still throw `LazyInitializationException`, even though the repository call itself succeeded?
11. What does `@EnableJpaAuditing` combined with `@CreatedDate`/`@LastModifiedDate` actually do under the hood, and what JPA lifecycle mechanism does it rely on?
12. Why do `SimpleJpaRepository`'s read methods (like `findById`) default to `@Transactional(readOnly = true)`, and what real performance benefit can that provide?