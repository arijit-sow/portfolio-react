import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Fuse from 'fuse.js';

function HighlightedText({ text, matches = [] }) {
  const ranges = matches
    .filter((match) => Array.isArray(match) && match.length === 2)
    .sort((first, second) => first[0] - second[0]);
  const parts = [];
  let cursor = 0;

  ranges.forEach(([start, end], index) => {
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={`${start}-${end}-${index}`}>{text.slice(start, end + 1)}</mark>);
    cursor = end + 1;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));

  return parts;
}

function topicLabel(topic) {
  return topic.split(/[-_]/).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function contentPreview(content, contentMatches) {
  const matchStart = contentMatches?.[0]?.[0] || 0;
  const start = Math.max(0, Math.min(matchStart - 40, content.length - 100));
  const preview = content.slice(start, start + 100);
  const offset = start;
  const matches = (contentMatches || [])
    .map(([matchStartIndex, matchEndIndex]) => [matchStartIndex - offset, matchEndIndex - offset])
    .filter(([matchStartIndex, matchEndIndex]) => matchEndIndex >= 0 && matchStartIndex < preview.length)
    .map(([matchStartIndex, matchEndIndex]) => [
      Math.max(0, matchStartIndex),
      Math.min(preview.length - 1, matchEndIndex)
    ]);

  return { preview, matches };
}

export default function GlobalNoteSearch() {
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState([]);
  const [loadError, setLoadError] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    fetch('/search-index.json')
      .then((response) => {
        if (!response.ok) throw new Error('Unable to load note search index.');
        return response.json();
      })
      .then(setNotes)
      .catch((error) => setLoadError(error.message));
  }, []);

  useEffect(() => {
    const closeResults = (event) => {
      if (!searchRef.current?.contains(event.target)) setQuery('');
    };
    document.addEventListener('mousedown', closeResults);
    return () => document.removeEventListener('mousedown', closeResults);
  }, []);

  const fuse = useMemo(() => new Fuse(notes, {
    keys: ['title', 'content', 'topic'],
    includeMatches: true,
    threshold: 0.35,
    ignoreLocation: true
  }), [notes]);
  const results = query.trim() ? fuse.search(query.trim()).slice(0, 12) : [];

  return (
    <div className="global-note-search" ref={searchRef}>
      <label className="global-note-search-label" htmlFor="global-note-search-input">
        Search all notes
      </label>
      <input
        id="global-note-search-input"
        className="global-note-search-input"
        type="search"
        value={query}
        placeholder="Search notes, topics, and keywords..."
        onChange={(event) => setQuery(event.target.value)}
        onFocus={(event) => event.target.select()}
        aria-expanded={Boolean(query.trim())}
        aria-controls="global-note-search-results"
      />

      {query.trim() && (
        <div id="global-note-search-results" className="global-note-search-results" role="listbox">
          {loadError && <p className="global-note-search-status">{loadError}</p>}
          {!loadError && results.length === 0 && (
            <p className="global-note-search-status">No matching notes found.</p>
          )}
          {results.map(({ item, matches }) => {
            const titleMatches = matches.find((match) => match.key === 'title')?.indices;
            const contentMatches = matches.find((match) => match.key === 'content')?.indices;
            const preview = contentPreview(item.content, contentMatches);

            return (
              <Link
                key={item.path}
                className="global-note-search-result"
                to={`/notes/${item.id}`}
                onClick={() => setQuery('')}
                role="option"
              >
                <span className="global-note-search-topic">{topicLabel(item.topic)}</span>
                <strong><HighlightedText text={item.title} matches={titleMatches} /></strong>
                <span className="global-note-search-preview">
                  <HighlightedText text={preview.preview} matches={preview.matches} />
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
