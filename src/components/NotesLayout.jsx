import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { noteCategories } from './notesData.js';

export default function NotesLayout() {
  const [isTopicsOpen, setIsTopicsOpen] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const notesLayoutRef = useRef(null);

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

  return (
    <div
      ref={notesLayoutRef}
      className={`notes-layout ${isTopicsOpen ? 'topics-open' : 'topics-collapsed'}`}
      style={{ '--notes-sidebar-width': `${sidebarWidth}px` }}
    >
      {isTopicsOpen && (
        <button
          type="button"
          className="notes-drawer-backdrop"
          onClick={closeTopics}
          aria-label="Close topics panel"
        />
      )}
      <aside className={`notes-sidebar ${isTopicsOpen ? 'is-open' : 'is-collapsed'}`}>
        <div className="notes-sidebar-header">
          <div>
            <Link to="/" className="notes-back-link">&larr; Back to Portfolio</Link>
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
            <span aria-hidden="true">{isTopicsOpen ? '−' : '+'}</span>
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