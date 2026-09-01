const note = (id, title, category) => ({
  id,
  title,
  file: `${category}/${id}.md`
});

export const noteCategories = [
  {
    category: 'Core Java',
    notes: [
      note('java-introduction', 'Java Introduction', 'core-java'),
      note('jvm-architecture', 'JVM Architecture & Memory', 'core-java'),
      note('java-data-types', 'Java Data Types & Variables', 'core-java'),
      note('java-control-flow', 'Control Flow & Loops', 'core-java'),
      note('arrays', 'Arrays', 'core-java'),
      note('classes-and-objects', 'Classes and Objects', 'core-java'),
      note('constructor', 'Constructor', 'core-java'),
      note('keywords-and-modifiers', 'Keywords and Modifiers', 'core-java'),
      note('strings-and-memory', 'Strings & Memory Pool', 'core-java'),
      note('oops-deep-dive', 'OOPs Principles', 'core-java'),
      note('interfaces-and-abstract-classes', 'Interfaces and Abstract Classes', 'core-java')
    ]
  },
  {
    category: 'Java Collections',
    notes: [
      note('generics-and-type-erasure', 'Generics & Type Erasure', 'java-collections'),
      note('collections-framework', 'Collections Framework Overview', 'java-collections'),
      note('list-implementations', 'List Implementations', 'java-collections'),
      note('set-implementations', 'Set Implementations', 'java-collections'),
      note('map-implementations', 'Map Implementations', 'java-collections'),
      note('queue-implementations', 'Queue Implementations', 'java-collections'),
      note('comparator-vs-comparable', 'Comparator vs Comparable', 'java-collections'),
      note('concurrent-collections', 'Concurrent Collections', 'java-collections'),
      note('stream-api', 'Stream API', 'java-collections')
    ]
  },
  {
    category: 'Multithreading & Concurrency',
    notes: [
      note('threading-basics', 'Threading Basics', 'multithreading-concurrency'),
      note('synchronization', 'Synchronization', 'multithreading-concurrency'),
      note('locks-and-latches', 'Locks & Latches', 'multithreading-concurrency'),
      note('executors-framework', 'Executors Framework', 'multithreading-concurrency'),
      note('virtual-threading', 'Virtual Threading', 'multithreading-concurrency')
    ]
  },
  {
    category: 'Exception Handling & Logging',
    notes: [
      note('exception-handling', 'Exception Handling', 'exception-handling-logging'),
      note('logging-frameworks', 'Logging Frameworks', 'exception-handling-logging')
    ]
  },
  {
    category: 'Advanced Java',
    notes: [
      note('jdbc-architecture', 'JDBC & Connection Pooling', 'advanced-java'),
      note('servlets-and-jsp', 'Servlets & Web Lifecycle', 'advanced-java'),
      note('hibernate-jpa', 'Hibernate & JPA', 'advanced-java')
    ]
  },
  {
    category: 'Java Version Features',
    notes: [
      note('java-8-features', 'Java 8 (LTS)', 'java-version-features'),
      note('java-9-modules', 'Java 9', 'java-version-features'),
      note('java-11-lts', 'Java 11 (LTS)', 'java-version-features'),
      note('java-17-features', 'Java 17 (LTS)', 'java-version-features'),
      note('java-21-features', 'Java 21 (LTS)', 'java-version-features'),
      note('java-25-features', 'Java 25 (LTS)', 'java-version-features')
    ]
  },
  {
    category: 'Spring Ecosystem',
    notes: [
      note('spring-core', 'Spring Core & IoC', 'spring-ecosystem'),
      note('spring-aop', 'Spring AOP', 'spring-ecosystem'),
      note('spring-mvc', 'Spring MVC Architecture', 'spring-ecosystem'),
      note('spring-boot', 'Spring Boot Essentials', 'spring-ecosystem'),
      note('spring-data-jpa', 'Spring Data JPA', 'spring-ecosystem'),
      note('spring-security', 'Spring Security', 'spring-ecosystem'),
      note('spring-cloud', 'Spring Cloud', 'spring-ecosystem')
    ]
  },
  {
    category: 'Distributed Systems',
    notes: [
      note('kafka-event-driven', 'Kafka & Event-Driven Architecture', 'distributed-systems'),
      note('saga-pattern', 'Saga Pattern', 'distributed-systems'),
      note('circuit-breaker-pattern', 'Circuit Breaker Pattern', 'distributed-systems'),
      note('caching-strategies-and-redis', 'Caching Strategies & Redis', 'distributed-systems')
    ]
  },
  {
    category: 'Integrations',
    notes: [
      note('stripe-webhooks', 'Stripe Webhooks', 'integrations')
    ]
  }
];
