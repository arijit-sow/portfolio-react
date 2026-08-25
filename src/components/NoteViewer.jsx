import { useState, useEffect, Children } from 'react';
import { Link, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import mermaid from 'mermaid';
import { noteCategories } from './notesData.js';

function MermaidDiagram({ chart }) {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let isCurrent = true;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;
    const theme = document.body.classList.contains('light-theme') ? 'default' : 'dark';

    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme });
    mermaid.render(id, chart)
      .then(({ svg: renderedSvg }) => {
        if (isCurrent) setSvg(renderedSvg);
      })
      .catch((renderError) => {
        if (isCurrent) setError(renderError.message || 'Unable to render this diagram.');
      })
      .finally(() => {
        document.getElementById(`d${id}`)?.remove();
      });

    return () => {
      isCurrent = false;
    };
  }, [chart]);

  if (error) {
    return <div className="notes-mermaid-error">Diagram could not be rendered: {error}</div>;
  }

  return (
    <div
      className="notes-mermaid"
      aria-label="Mermaid diagram"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export default function NoteViewer() {
  const { topicId } = useParams();
  const [note, setNote] = useState({ topicId: null, content: '', loading: true });
  const notes = noteCategories.flatMap((group) => group.notes);
  const currentIndex = notes.findIndex((item) => item.id === (topicId || 'jvm-architecture'));
  const previousNote = currentIndex > 0 ? notes[currentIndex - 1] : null;
  const nextNote = currentIndex >= 0 && currentIndex < notes.length - 1 ? notes[currentIndex + 1] : null;

  useEffect(() => {
    const fileName = topicId ? `${topicId}.md` : 'jvm-architecture.md';
    const filePath = `/notes-content/${fileName}`;
    let isCurrentRequest = true;

    fetch(filePath)
      .then((res) => {
        if (!res.ok) throw new Error('Note not found');
        return res.text();
      })
      .then((text) => {
        if (isCurrentRequest) {
          setNote({ topicId, content: text, loading: false });
        }
      })
      .catch(() => {
        if (isCurrentRequest) {
          setNote({
            topicId,
            content: '# 404\nNote not found. Please select a valid topic.',
            loading: false
          });
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [topicId]);

  if (note.loading || note.topicId !== topicId) return <div>Loading...</div>;

  return (
    <article className="notes-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="notes-markdown-h1">{children}</h1>,
          h2: ({ children }) => <h2 className="notes-markdown-h2">{children}</h2>,
          p: ({ children }) => <p className="notes-markdown-p">{children}</p>,
          table: ({ children }) => (
            <div className="notes-table-wrapper">
              <table className="notes-markdown-table">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="notes-markdown-th">{children}</th>,
          td: ({ children }) => <td className="notes-markdown-td">{children}</td>,
          code: ({ children, className }) => {
            const isMermaid = className?.includes('language-mermaid');
            if (isMermaid) {
              return <MermaidDiagram chart={String(children).replace(/\n$/, '')} />;
            }
            return <code className={`notes-markdown-code ${className || ''}`}>{children}</code>;
          },
          pre: ({ children }) => {
            const child = Children.toArray(children)[0];
            if (child?.type === MermaidDiagram) return child;
            return <pre className="notes-markdown-pre">{children}</pre>;
          }
        }}
      >
        {note.content}
      </ReactMarkdown>

      {(previousNote || nextNote) && (
        <nav className="notes-pagination" aria-label="Note navigation">
          {previousNote ? (
            <Link className="notes-pagination-link previous" to={`/notes/${previousNote.id}`}>
              <span className="notes-pagination-direction">Previous note</span>
              <span className="notes-pagination-title">← {previousNote.title}</span>
            </Link>
          ) : <span />}
          {nextNote ? (
            <Link className="notes-pagination-link next" to={`/notes/${nextNote.id}`}>
              <span className="notes-pagination-direction">Next note</span>
              <span className="notes-pagination-title">{nextNote.title} →</span>
            </Link>
          ) : <span />}
        </nav>
      )}
    </article>
  );
}