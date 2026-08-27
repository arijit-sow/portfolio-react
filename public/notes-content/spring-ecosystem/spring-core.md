# Spring Core Framework

The foundation of the Spring framework is built on **Inversion of Control (IoC)** and **Dependency Injection (DI)**.

---

## 1. Inversion of Control & Dependency Injection
- **Inversion of Control (IoC):** Transferring the control of object creation, configuration, and lifecycle management from the developer code to the Spring Container (`ApplicationContext`).
- **Dependency Injection (DI):** The mechanism by which the container injects dependent objects into dependent classes.

```java
// Constructor-based Dependency Injection (Recommended pattern)
@Service
public class OrderService {
    private final PaymentProcessor paymentProcessor;

    @Autowired
    public OrderService(PaymentProcessor paymentProcessor) {
        this.paymentProcessor = paymentProcessor;
    }
}