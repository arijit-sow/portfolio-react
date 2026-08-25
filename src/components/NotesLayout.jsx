import { Link, Outlet } from 'react-router-dom';

const noteCategories = [
  {
    category: "Core Java",
    notes: [
      { id: "java-introduction", title: "Java Introduction" },
      { id: "jvm-architecture", title: "JVM Architecture & Memory" },
      { id: "java-data-types", title: "Java Data Types & Variables" },
      { id: "java-control-flow", title: "Control Flow & Loops" },
      { id: "classes-and-objects", title: "Classes and Objects" },
      { id: "interfaces-and-abstract-classes", title: "Interfaces and Abstract Classes" },
      { id: "constructor", title: "Constructor" },
      { id: "strings-and-memory", title: "Strings & Memory Pool" },
      { id: "oops-deep-dive", title: "OOPs Principles" }
    ]
  },
  {
    category: "Java Collections",
    notes: [
      { id: "collections-framework", title: "Collections Framework Overview" },
      { id: "list-implementations", title: "List Implementations" },
      { id: "set-implementations", title: "Set Implementations" },
      { id: "map-implementations", title: "Map Implementations" },
      { id: "queue-implementations", title: "Queue Implementations" },
      { id: "comparator-vs-comparable", title: "Comparator vs Comparable" },
      { id: "hashing-and-hashcode", title: "Hashing & HashCode" },
      {id: "concurrent-collections", title: "Concurrent Collections" }
    ]
  },
  {
    category: "Advanced Java",
    notes: [
      { id: "jdbc-architecture", title: "JDBC & Connection Pooling" },
      { id: "servlets-and-jsp", title: "Servlets & Web Lifecycle" },
      { id: "hibernate-jpa", title: "Hibernate & JPA" }
    ]
  },
  {
    category: "Spring Ecosystem",
    notes: [
      { id: "spring-core", title: "Spring Core & IoC" },
      { id: "spring-mvc", title: "Spring MVC Architecture" },
      { id: "spring-boot", title: "Spring Boot Essentials" }
    ]
  },
  {
    category: "Distributed Systems",
    notes: [
      { id: "kafka-event-driven", title: "Kafka & Event-Driven Architecture" },
      { id: "saga-pattern", title: "Saga Pattern" }
    ]
  },
  {
    category: "Integrations",
    notes: [
      { id: "stripe-webhooks", title: "Stripe Webhooks" }

    ]
  }
];

export default function NotesLayout() {
  return (
    <div className="notes-layout">
      <aside className="notes-sidebar">
        <Link to="/" className="notes-back-link">&larr; Back to Portfolio</Link>
        <h1>Technical Notes</h1>

        {noteCategories.map((group) => (
          <section key={group.category} className="notes-category">
            <h2>{group.category}</h2>
            <ul>
              {group.notes.map((note) => (
                <li key={note.id}>
                  <Link className="notes-nav-link" to={`/notes/${note.id}`}>{note.title}</Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </aside>

      <main className="notes-content">
        <Outlet />
      </main>
    </div>
  );
}