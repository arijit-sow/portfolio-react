# Hibernate ORM & JPA

Hibernate is an Object-Relational Mapping (ORM) framework implementing the Jakarta Persistence API (JPA) specification.

---

## 1. Core Architecture
- **EntityManagerFactory / SessionFactory:** Thread-safe, heavy object created once per database.
- **EntityManager / Session:** Lightweight, non-thread-safe object representing a single persistence context unit of work.
- **Transaction:** Manages boundary demarcations (`commit`, `rollback`) for ACID guarantees.

---

## 2. Entity Lifecycle States

| State | Definition |
|---|---|
| **Transient** | Newly instantiated object (`new User()`), not associated with an active session, no database ID. |
| **Persistent / Managed** | Associated with an active persistence context; any field changes are automatically tracked and flushed to the DB on commit ("dirty checking"). |
| **Detached** | Was once persistent, but the associated Session/EntityManager was closed or cleared. |
| **Removed** | Marked for deletion from the database within an active transaction. |

---

## 3. Fetching Strategies & The N+1 Problem
- **Lazy Loading (`FetchType.LAZY`):** Loads child entities on-demand using proxy objects.
- **Eager Loading (`FetchType.EAGER`):** Loads child entities immediately using SQL joins.
- **N+1 Problem:** Occurs when executing 1 query to fetch $N$ parent records, followed by $N$ separate queries to fetch each parent's associated children.
- **Solution:** Use `JOIN FETCH` queries, Entity Graphs, or Batch fetching (`@BatchSize`).