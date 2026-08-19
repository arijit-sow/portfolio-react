import { useState, useEffect } from 'react';
import './App.css';
import { portfolioData } from './data.js';
import profilePic from './assets/profile.png';
import logger from './logger.js';

export default function App() {
  // ── 1. THEME STATE & PERSISTENCE ──
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('theme') || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    if (theme === 'light') {
      document.body.classList.add('light-theme');
    } else {
      document.body.classList.remove('light-theme');
    }
    try {
      localStorage.setItem('theme', theme);
    } catch (e) {
      logger.warn('localStorage unavailable', { error: String(e) });
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // ── 2. MOBILE MENU STATE ──
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ── 3. SCROLL TO TOP STATE ──
  const [showScrollTop, setShowScrollTop] = useState(false);

  // ── 4. CONTACT FORM STATE ──
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [formStatus, setFormStatus] = useState(''); // 'success', 'error', or ''
  const [formErrors, setFormErrors] = useState({});
  const [isFormLoading, setIsFormLoading] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 300);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Global error handlers — log uncaught errors/rejections
  useEffect(() => {
    const onError = (event) => {
      logger.error('Uncaught error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error ? String(event.error) : undefined
      });
    };

    const onRejection = (event) => {
      logger.error('Unhandled promise rejection', { reason: event.reason });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── 4. SCROLL REVEAL ANIMATION ──
  useEffect(() => {
    try {
      const reveals = document.querySelectorAll('.section, .project-card, .skill-group, .education-card');
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('visible');
            }
          });
        },
        { threshold: 0.1 }
      );

      reveals.forEach((el) => {
        el.classList.add('reveal');
        observer.observe(el);
      });

      return () => observer.disconnect();
    } catch (e) {
      logger.error('Scroll reveal setup failed', { error: String(e) });
    }
  }, []);

  // ── 5. FORM VALIDATION ──
  const validateForm = () => {
    const errors = {};

    if (!formData.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address';
    }

    if (!formData.message.trim()) {
      errors.message = 'Message is required';
    } else if (formData.message.trim().length < 10) {
      errors.message = 'Message must be at least 10 characters';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── 6. CONTACT FORM HANDLER ──
  const handleFormChange = (e) => {
    const { id, value } = e.target;
    setFormData((prev) => ({ ...prev, [id]: value }));
    if (formErrors[id]) {
      setFormErrors((prev) => ({ ...prev, [id]: '' }));
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      logger.info('Form validation failed', { errors: formErrors });
      return;
    }

    setIsFormLoading(true);
    setFormStatus('');

    try {
      await fetch('https://script.google.com/macros/s/AKfycbyUD_MBYdjr0yPDr-KutZ9lzuWOC-SM32IxqkAotZqAxgNoBxV6BfC3e_yAPwnIfYI05A/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
        mode: 'no-cors'
      });

      setFormStatus('success');
      setFormData({ name: '', email: '', subject: '', message: '' });
      setFormErrors({});
      setTimeout(() => setFormStatus(''), 5000);
    } catch (error) {
      logger.error('Form submission error', { error: String(error) });
      setFormStatus('error');
      setTimeout(() => setFormStatus(''), 5000);
    } finally {
      setIsFormLoading(false);
    }
  };

  const [expandedProjects, setExpandedProjects] = useState([]);
  const toggleExpand = (id) => {
    setExpandedProjects((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const [expandedEducation, setExpandedEducation] = useState([]);
  const toggleEdu = (id) => {
    setExpandedEducation((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const { about, skills, projects, education } = portfolioData;

  return (
    <div>
      <div className="circuit-bg" aria-hidden="true">
          <svg viewBox="0 0 1200 600" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg" role="presentation">
            {/* faint static circuit lines */}
            <path className="circuit-line" d="M40 120 H400 V220 H760 V120 H1160" />
            <path className="circuit-line" d="M120 300 H500 V420 H900" />
            <path className="circuit-line" d="M60 480 H1160" />
            <path className="circuit-line" d="M220 40 V160 H320 V260" />

            {/* moving electric flow (same paths, animated dash) */}
            <path className="circuit-flow" d="M40 120 H400 V220 H760 V120 H1160" />
            <path className="circuit-flow" d="M120 300 H500 V420 H900" />
            <path className="circuit-flow" d="M60 480 H1160" />
            <path className="circuit-flow" d="M220 40 V160 H320 V260" />
          </svg>
        </div>
      {/* ── NAVIGATION ── */}
      <nav className="nav">
        <span className="nav-logo">arijit.</span>

        <button
          className="mobile-menu-btn"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMobileMenuOpen ? '✕' : '☰'}
        </button>

        <ul className={`nav-links ${isMobileMenuOpen ? 'active' : ''}`}>
          <li><a href="#about" onClick={() => setIsMobileMenuOpen(false)}>About</a></li>
          <li><a href="#skills" onClick={() => setIsMobileMenuOpen(false)}>Skills</a></li>
          <li><a href="#projects" onClick={() => setIsMobileMenuOpen(false)}>Projects</a></li>
          <li><a href="#education" onClick={() => setIsMobileMenuOpen(false)}>Education</a></li>
          <li><a href="#contact" onClick={() => setIsMobileMenuOpen(false)}>Contact</a></li>
          <li>
            <button onClick={toggleTheme} className="theme-btn" aria-label="Toggle theme">
              {theme === 'light' ? '🌙' : '☀️'}
            </button>
          </li>
        </ul>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="hero">
        <h1 className="hero-title">
          Building <em>backends</em><br />that actually scale<span className="blink-dots" aria-hidden="true"><span className="dot"></span><span className="dot"></span><span className="dot"></span></span><span className="sr-only">...</span>
        </h1>
        <p className="hero-sub">
          Java · Spring Boot · REST APIs · Microservices · PostgreSQL · MySQL · Redis · Docker · Git
        </p>
        <div className="hero-cta">
          <a href="#projects" className="btn-primary">View Projects</a>
          <a href={about.resumeUrl} target="_blank" rel="noreferrer" className="btn-outline">📄 Resume</a>
          <a href="#contact" className="btn-outline">Get in Touch</a>
        </div>
        <div className="hero-scroll">scroll ↓</div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" className="section about">
        <div className="about-grid">
          <div className="about-img-wrap">
            <img src={profilePic} alt="Arijit" className="about-img" />
          </div>
          <div className="about-text">
            <span className="section-label">About Me</span>
            <h2>Hey, I'm {about.name} 👋</h2>
            <p>{about.bioParagraph1}</p>
            <p>{about.bioParagraph2}</p>
            <div className="about-stats">
              <div className="stat">
                <span className="stat-num">{about.yearsExperience}</span>
                <span className="stat-label">Years Exp.</span>
              </div>
              <div className="stat">
                <span className="stat-num">{projects.length}+</span>
                <span className="stat-label">Projects</span>
              </div>
              <div className="stat">
                <span className="stat-num">{about.apisBuilt}</span>
                
              </div>
            </div>
            <div style={{ marginTop: '40px' }}>
              <a href={about.resumeUrl} target="_blank" rel="noreferrer" className="btn-outline">
                📄 View Resume
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ── SKILLS ── */}
      <section id="skills" className="section skills">
        <span className="section-label">What I Work With</span>
        <h2>Skills & Technologies</h2>
        <div className="skills-categories">
          {['Backend', 'Frontend', 'Database', 'Tools','Testing', 'Messaging Queue', 'Monitoring', 'Logging'].map((cat) => (
            <div key={cat} className="skill-group">
              <h3>{cat}</h3>
              <div className="skill-tags">
                {skills
                  .filter((s) => s.category === cat)
                  .map((skill) => (
                    <span key={skill.id} className={`skill-tag ${cat.toLowerCase()}`} tabIndex={0}>
                      {skill.name}
                    </span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── PROJECTS ── */}
      <section id="projects" className="section projects">
        <span className="section-label">What I've Built</span>
        <h2>Projects</h2>
        <div className="projects-grid">
          {projects.map((project) => {
            const words = (project.description || '').split(/\s+/).filter(Boolean);
            const hasLongDesc = words.length > 22;
            const hasExtras = hasLongDesc || ((project.techStack || []).length > 0) || !!project.githubUrl || !!project.liveUrl;
            const isExpanded = expandedProjects.includes(project.id);

            return (
              <div key={project.id} className="project-card">
                {/* top-right actions (read more) */}
                {hasExtras && (
                  <div className="card-top-actions">
                    <button
                      className="read-more-btn small"
                      onClick={() => toggleExpand(project.id)}
                      aria-expanded={isExpanded}
                    >
                      {isExpanded ? 'Hide' : 'More'}
                    </button>
                  </div>
                )}

                <div className="project-content">
                  <h3>{project.title}</h3>

                  <p>
                    {isExpanded ? project.description : `${words.slice(0, 22).join(' ')}${hasLongDesc ? '...' : ''}`}
                  </p>

                  {isExpanded && (
                    <>
                      <div className="project-tech">
                        {(project.techStack || []).map((tech) => (
                          <span key={tech} className="tech-tag">{tech}</span>
                        ))}
                      </div>

                      <div className="project-links">
                        {project.githubUrl && (
                          <a href={project.githubUrl} target="_blank" rel="noreferrer" className="project-link">
                            Gitlab →
                          </a>
                        )}
                        {project.liveUrl && (
                          <a href={project.liveUrl} target="_blank" rel="noreferrer" className="project-link live">
                            Live Demo ↗
                          </a>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── EDUCATION ── */}
      <section id="education" className="section education">
        <span className="section-label">My Background</span>
        <h2>Education</h2>
        <div className="education-grid">
          {education.map((edu) => {
            const isExpandedEdu = expandedEducation.includes(edu.id);
            return (
              <div key={edu.id} className="education-card">
                <div className="edu-top-actions">
                  {edu.certificateUrl ? (
                    <a href={edu.certificateUrl} target="_blank" rel="noreferrer" className="btn-outline small">📜</a>
                  ) : (
                    <button className="btn-outline small locked" disabled aria-disabled="true">🔒</button>
                  )}

                  <button
                    className="read-more-btn small edu-toggle"
                    onClick={() => toggleEdu(edu.id)}
                    aria-expanded={isExpandedEdu}
                  >
                    {isExpandedEdu ? 'Less' : 'More'}
                  </button>
                </div>

                <div className="edu-body">
                  <div className="edu-year">{edu.yearSpan}</div>
                  <h3>{edu.degree}</h3>
                  <p className="edu-school">{edu.school}</p>
                  <p className="edu-desc">{edu.description}</p>

                  {isExpandedEdu && (
                    <div className="edu-extra">
                      {/* prefer explicit CGPA field if present, otherwise fall back to grade */}
                      {edu.cgpa ? <p>CGPA: {edu.cgpa}</p> : edu.grade ? <p>Grade: {edu.grade}</p> : null}

                      {edu.coursework && (
                        <div>
                          <strong>Coursework:</strong>
                          <ul>
                            {edu.coursework.map((c) => (
                              <li key={c}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="section contact">
        <span className="section-label">Get In Touch</span>
        <h2>Let's Work Together</h2>
        <p className="contact-sub">
          Have a project in mind or want to discuss opportunities?<br />
          I'd love to hear from you.
        </p>
        <form className="contact-form" onSubmit={handleFormSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Name</label>
              <input 
                type="text" 
                id="name" 
                placeholder="Your name" 
                value={formData.name}
                onChange={handleFormChange}
                required 
                className={formErrors.name ? 'input-error' : ''}
              />
              {formErrors.name && <span className="error-text">{formErrors.name}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input 
                type="email" 
                id="email" 
                placeholder="your@email.com" 
                value={formData.email}
                onChange={handleFormChange}
                required 
                className={formErrors.email ? 'input-error' : ''}
              />
              {formErrors.email && <span className="error-text">{formErrors.email}</span>}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="subject">Subject</label>
            <input 
              type="text" 
              id="subject" 
              placeholder="What's this about?" 
              value={formData.subject}
              onChange={handleFormChange}
            />
          </div>
          <div className="form-group">
            <label htmlFor="message">Message</label>
            <textarea 
              id="message" 
              rows="5" 
              placeholder="Tell me about your project..." 
              value={formData.message}
              onChange={handleFormChange}
              required
              className={formErrors.message ? 'input-error' : ''}
            ></textarea>
            {formErrors.message && <span className="error-text">{formErrors.message}</span>}
          </div>
          <button 
            type="submit" 
            className="btn-primary" 
            disabled={isFormLoading}
            style={{ opacity: isFormLoading ? 0.7 : 1, cursor: isFormLoading ? 'not-allowed' : 'pointer' }}
          >
            {isFormLoading ? 'Sending...' : 'Send Message →'}
          </button>
          {formStatus === 'success' && <p style={{ color: '#4CAF50', marginTop: '10px' }}>✓ Message sent successfully!</p>}
          {formStatus === 'error' && <p style={{ color: '#f44336', marginTop: '10px' }}>✗ Failed to send message. Please try again.</p>}
        </form>
      </section>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <span>© 2026 Arijit | Software Developer</span>
        <div className="footer-links">
          <a href="https://github.com/arijit-sow" target="_blank" rel="noreferrer" className="social-link" aria-label="GitHub">
            <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M12 .296C5.37.296 0 5.667 0 12.297c0 5.29 3.438 9.773 8.205 11.365.6.111.82-.261.82-.58 0-.287-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.089-.745.083-.73.083-.73 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.775.418-1.305.762-1.606-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.468-2.381 1.235-3.221-.124-.303-.535-1.527.117-3.176 0 0 1.007-.322 3.3 1.23.957-.266 1.98-.399 3-.405 1.02.006 2.043.139 3 .405 2.29-1.552 3.295-1.23 3.295-1.23.655 1.649.244 2.873.12 3.176.77.84 1.233 1.911 1.233 3.221 0 4.61-2.804 5.622-5.475 5.92.43.37.814 1.102.814 2.222 0 1.606-.014 2.896-.014 3.286 0 .32.216.697.825.579C20.565 22.068 24 17.585 24 12.297 24 5.667 18.627.296 12 .296z"/></svg>
            <span className="social-label">github</span>
          </a>

          <a href="https://gitlab.com/sow-arijit" target="_blank" rel="noreferrer" className="social-link" aria-label="GitLab">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-gitlab" viewBox="0 0 16 16">
              <path d="m15.734 6.1-.022-.058L13.534.358a.57.57 0 0 0-.563-.356.6.6 0 0 0-.328.122.6.6 0 0 0-.193.294l-1.47 4.499H5.025l-1.47-4.5A.572.572 0 0 0 2.47.358L.289 6.04l-.022.057A4.044 4.044 0 0 0 1.61 10.77l.007.006.02.014 3.318 2.485 1.64 1.242 1 .755a.67.67 0 0 0 .814 0l1-.755 1.64-1.242 3.338-2.5.009-.007a4.05 4.05 0 0 0 1.34-4.668Z"/>
            </svg>
            <span className="social-label">gitlab</span>
          </a>

          <a href="https://www.linkedin.com/in/arijit-sow/" target="_blank" rel="noreferrer" className="social-link" aria-label="LinkedIn">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-linkedin" viewBox="0 0 16 16">
              <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854zm4.943 12.248V6.169H2.542v7.225zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248S2.4 3.226 2.4 3.934c0 .694.521 1.248 1.327 1.248zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016l.016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225z"/>
            </svg>
            <span className="social-label">linkedin</span>
          </a>

          <a href="https://www.facebook.com/arijit.sow.7" target="_blank" rel="noreferrer" className="social-link" aria-label="Facebook">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-facebook" viewBox="0 0 16 16">
              <path d="M16 8.049c0-4.446-3.582-8.05-8-8.05C3.58 0-.002 3.603-.002 8.05c0 4.017 2.926 7.347 6.75 7.951v-5.625h-2.03V8.05H6.75V6.275c0-2.017 1.195-3.131 3.022-3.131.876 0 1.791.157 1.791.157v1.98h-1.009c-.993 0-1.303.621-1.303 1.258v1.51h2.218l-.354 2.326H9.25V16c3.824-.604 6.75-3.934 6.75-7.951"/>
            </svg>
            <span className="social-label">facebook</span>
          </a>

          <a href="https://www.instagram.com/sow_arijit/" target="_blank" rel="noreferrer" className="social-link" aria-label="Instagram">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-instagram" viewBox="0 0 16 16">
              <path d="M8 0C5.829 0 5.556.01 4.703.048 3.85.088 3.269.222 2.76.42a3.9 3.9 0 0 0-1.417.923A3.9 3.9 0 0 0 .42 2.76C.222 3.268.087 3.85.048 4.7.01 5.555 0 5.827 0 8.001c0 2.172.01 2.444.048 3.297.04.852.174 1.433.372 1.942.205.526.478.972.923 1.417.444.445.89.719 1.416.923.51.198 1.09.333 1.942.372C5.555 15.99 5.827 16 8 16s2.444-.01 3.298-.048c.851-.04 1.434-.174 1.943-.372a3.9 3.9 0 0 0 1.416-.923c.445-.445.718-.891.923-1.417.197-.509.332-1.09.372-1.942C15.99 10.445 16 10.173 16 8s-.01-2.445-.048-3.299c-.04-.851-.175-1.433-.372-1.941a3.9 3.9 0 0 0-.923-1.417A3.9 3.9 0 0 0 13.24.42c-.51-.198-1.092-.333-1.943-.372C10.443.01 10.172 0 7.998 0zm-.717 1.442h.718c2.136 0 2.389.007 3.232.046.78.035 1.204.166 1.486.275.373.145.64.319.92.599s.453.546.598.92c.11.281.24.705.275 1.485.039.843.047 1.096.047 3.231s-.008 2.389-.047 3.232c-.035.78-.166 1.203-.275 1.485a2.5 2.5 0 0 1-.599.919c-.28.28-.546.453-.92.598-.28.11-.704.24-1.485.276-.843.038-1.096.047-3.232.047s-2.39-.009-3.233-.047c-.78-.036-1.203-.166-1.485-.276a2.5 2.5 0 0 1-.92-.598 2.5 2.5 0 0 1-.6-.92c-.109-.281-.24-.705-.275-1.485-.038-.843-.046-1.096-.046-3.233s.008-2.388.046-3.231c.036-.78.166-1.204.276-1.486.145-.373.319-.64.599-.92s.546-.453.92-.598c.282-.11.705-.24 1.485-.276.738-.034 1.024-.044 2.515-.045zm4.988 1.328a.96.96 0 1 0 0 1.92.96.96 0 0 0 0-1.92m-4.27 1.122a4.109 4.109 0 1 0 0 8.217 4.109 4.109 0 0 0 0-8.217m0 1.441a2.667 2.667 0 1 1 0 5.334 2.667 2.667 0 0 1 0-5.334"/>
            </svg>
            <span className="social-label">instagram</span>
          </a>
        </div>
      </footer>

      {/* ── SCROLL TO TOP ── */}
      <button
        onClick={scrollToTop}
        className={`scroll-to-top ${showScrollTop ? 'show' : ''}`}
        aria-label="Scroll to top"
      >
        ↑
      </button>
    </div>
  );
}