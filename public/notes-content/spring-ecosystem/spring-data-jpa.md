# Spring Data JPA

Spring Data JPA provides repository abstractions for working with JPA entities while keeping persistence code focused on application behavior.

## Repository example

```java
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);
}
```

Method names can derive simple queries. Use `@Query` for queries that need explicit JPQL or native SQL.

## Transactions

Put transaction boundaries in the service layer with `@Transactional`. Keep lazy entity access inside an active persistence context and use projections or fetch joins when a use case needs a defined read shape.
