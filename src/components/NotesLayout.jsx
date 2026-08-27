import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { noteCategories } from './notesData.js';
import GlobalNoteSearch from './GlobalNoteSearch.jsx';

export default function NotesLayout() {
  const location = useLocation();
  const [isTopicsOpen, setIsTopicsOpen] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const notesLayoutRef = useRef(null);
  const notesSidebarRef = useRef(null);

  const closeTopics = () => setIsTopicsOpen(false);

  useEffect(() => {
    document.body.classList.remove('light-theme');

    return () => {
      try {
        if (localStorage.getItem('theme') === 'light') {
          document.body.classList.add('light-theme');
        }
      } catch {
        // Keep the notes route dark when saved theme state is unavailable.
      }
    };
  }, []);

  useEffect(() => {
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (!isMobile || !isTopicsOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isTopicsOpen]);

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 320);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!isResizing) return undefined;

    let pendingWidth = sidebarWidth;
    let frameId = null;

    const handlePointerMove = (event) => {
      pendingWidth = Math.min(480, Math.max(220, event.clientX));
      if (frameId !== null) return;

      frameId = window.requestAnimationFrame(() => {
        notesLayoutRef.current?.style.setProperty('--notes-sidebar-width', `${pendingWidth}px`);
        frameId = null;
      });
    };
    const stopResizing = () => {
      setSidebarWidth(pendingWidth);
      setIsResizing(false);
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResizing);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResizing);
    };
  }, [isResizing, sidebarWidth]);

  useEffect(() => {
    if (!isTopicsOpen) return undefined;

    const timeoutId = window.setTimeout(() => {
      const sidebar = notesSidebarRef.current;
      if (!sidebar) return;

      const activeLink = notesSidebarRef.current?.querySelector('.notes-nav-link.active')
        || notesSidebarRef.current?.querySelector('a[href="/notes/jvm-architecture"]');
      if (!activeLink) return;

      const sidebarRect = sidebar.getBoundingClientRect();
      const linkRect = activeLink.getBoundingClientRect();
      const targetTop = sidebar.scrollTop
        + linkRect.top
        - sidebarRect.top
        - (sidebar.clientHeight - linkRect.height) / 2;

      sidebar.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
    }, 350);

    return () => window.clearTimeout(timeoutId);
  }, [isTopicsOpen, location.pathname]);

  return (
    <div
      ref={notesLayoutRef}
      className={`notes-layout ${isTopicsOpen ? 'topics-open' : 'topics-collapsed'}`}
      style={{ '--notes-sidebar-width': `${sidebarWidth}px` }}
    >
      <header className="notes-topbar">
        <Link to="/" className="notes-home-link">arijit.</Link>
        <GlobalNoteSearch />
      </header>
      <div className="notes-layout-body">
      {isTopicsOpen && (
        <button
          type="button"
          className="notes-drawer-backdrop"
          onClick={closeTopics}
          aria-label="Close topics panel"
        />
      )}
      <aside
        ref={notesSidebarRef}
        className={`notes-sidebar ${isTopicsOpen ? 'is-open' : 'is-collapsed'}`}
      >
        <div className="notes-sidebar-header">
          <div>
            <h1>Technical Notes</h1>
          </div>
          <button
            type="button"
            className="notes-drawer-toggle"
            onClick={() => setIsTopicsOpen((open) => !open)}
            aria-expanded={isTopicsOpen}
            aria-controls="notes-topic-drawer"
            aria-label={isTopicsOpen ? 'Collapse topics' : 'Expand topics'}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              fill="currentColor"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M2.5 12a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5m0-4a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1-.5-.5"
              />
            </svg>
          </button>
        </div>

        <div id="notes-topic-drawer" className="notes-topic-drawer">
          <p className="notes-topic-label">Browse topics</p>
          {noteCategories.map((group) => (
            <section key={group.category} className="notes-category">
              <h2>{group.category}</h2>
              <ul>
                {group.notes.map((note) => (
                  <li key={note.id}>
                    <NavLink
                      className={({ isActive }) => `notes-nav-link ${isActive ? 'active' : ''}`}
                      to={`/notes/${note.id}`}
                      onClick={closeTopics}
                    >
                      <span>{note.title}</span>
                      <span className="notes-nav-arrow" aria-hidden="true">↗</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div
          className="notes-sidebar-resizer"
          role="separator"
          aria-label="Resize topics panel"
          aria-orientation="vertical"
          onPointerDown={() => setIsResizing(true)}
        />
      </aside>

      <main className="notes-content">
        <Outlet />
      </main>
      </div>

      <button
        type="button"
        className={`notes-scroll-top ${showScrollTop ? 'show' : ''}`}
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        aria-label="Scroll to top"
      >
        ↑
      </button>
    </div>
  );
}