// src/data.js
export const portfolioData = {
  about: {
    name: "Arijit",
    bioParagraph1: "I'm a Java backend developer passionate about building clean, performant APIs and scalable systems. I love turning complex problems into elegant solutions using Spring Boot, JPA, and cloud-ready architectures.",
    bioParagraph2: "When I'm not writing code, I'm exploring system design, reading about distributed systems, or contributing to open source projects.",
    yearsExperience: "3",
    resumeUrl: "/resume/Arijit-Sow-Resume.pdf"
  },
  skills: [
    { id: 1, name: "Java", category: "Backend" },
    { id: 2, name: "Spring Boot", category: "Backend" },
    { id: 3, name: "REST APIs", category: "Backend" },
    { id: 4, name: "Microservices", category: "Backend" },
    { id: 5, name: "React", category: "Frontend" },
    { id: 6, name: "HTML/CSS", category: "Frontend" },
    { id: 7, name: "JavaScript", category: "Frontend" },
    { id: 8, name: "PostgreSQL", category: "Database" },
    { id: 9, name: "MySQL", category: "Database" },
    { id: 10, name: "Redis", category: "Database" },
    { id: 11, name: "Docker", category: "Tools" },
    { id: 12, name: "Git", category: "Tools" },
    { id: 13, name: "Maven", category: "Tools" },
    { id: 14, name: "JUnit", category: "Testing" },
    { id: 15, name: "Mockito", category: "Testing" },
    { id: 16, name: "Postman", category: "Testing" },
    { id: 17, name: "Swagger", category: "Testing" },
    { id: 18, name: "Kafka", category: "Messaging Queue" },
    { id: 19, name: "Prometheus", category: "Monitoring" },
    { id: 20, name: "Grafana", category: "Monitoring" },
    { id: 21, name: "ELK Stack", category: "Logging" },
  ],
  projects: [
    {
      id: 1,
      title: "Cine Vault - Movie Ticket Booking System",
      description: "A full-fledged movie ticket booking system with features like user authentication, seat selection, payment integration, and real-time booking status updates.",
      techStack: ["Java", "Spring Boot", "PostgreSQL", "Docker", "Redis"],
      githubUrl: "https://gitlab.com/sow-arijit/cine-vault",
    },
    {
      id: 2,
      title: "Kira - Beauty E-commerce Platform",
      description: "A scalable e-commerce platform for beauty products, featuring product listings, shopping cart, order management.",
      techStack: ["Java", "Spring Boot", "PostgreSQL", "Git", "Docker", "Redis"],
      githubUrl: "https://gitlab.com/kira_group/kira_application",
      liveUrl: ""
    }
  ],
  education: [
    {
      id: 1,
      yearSpan: "2019 — 2023",
      degree: "Bachelor of Technology in Computer Science",
      school: "Maulana Abul Kalam Azad University of Technology, Kolkata",
      grade: "8.84 CGPA",
      certificateUrl: "/certificates/Degree-Certificate.pdf",
    }
  ]
};