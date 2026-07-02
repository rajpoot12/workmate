import { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';

// Phosphor-green CRT syntax theme
const phosphorTheme = {
  'code[class*="language-"]': { color: '#33ff77', background: 'transparent', fontFamily: 'inherit', fontSize: '0.85em' },
  'pre[class*="language-"]': { color: '#33ff77', background: '#0a120a', padding: '0.75rem', margin: '0.5rem 0', overflow: 'auto', border: '1px solid #1f7a3f' },
  comment: { color: '#4a8a4a', fontStyle: 'italic' },
  string: { color: '#ffb000' },
  number: { color: '#00d4ff' },
  keyword: { color: '#ff9944' },
  operator: { color: '#aaaaaa' },
  function: { color: '#88ff44' },
  'class-name': { color: '#88ff44' },
  punctuation: { color: '#7a8a7a' },
  'attr-name': { color: '#ffb000' },
  'attr-value': { color: '#33ff77' },
  property: { color: '#00d4ff' },
  builtin: { color: '#ff9944' },
  tag: { color: '#ff5f56' },
};

function detectLanguage(code) {
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|GRANT|WITH)\b/im.test(code)) return 'sql';
  if (/^\s*(#!\/|apt|yum|kubectl|docker|psql|mvn|npm|git )/m.test(code)) return 'bash';
  if (/class\s+\w+|import\s+\w|public\s+static/.test(code)) return 'java';
  if (/const\s|let\s|function\s|=>\s*{|require\(|import\s+{/.test(code)) return 'javascript';
  if (/def\s+\w+\(|import\s+\w+\n|print\(/.test(code)) return 'python';
  if (/^\s*\{[\s\S]*\}\s*$/.test(code)) return 'json';
  return 'text';
}

const ClipboardIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

/** One-click copy with transient "copied" confirmation. */
export function CopyButton({ text, className = '' }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <button
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`inline-flex items-center border px-1.5 py-px transition-colors
        ${copied
          ? 'border-phosphor-green text-phosphor-green'
          : 'border-phosphor-dim text-phosphor-dim hover:border-phosphor-green hover:text-phosphor-green'}
        ${className}`}
    >
      {copied ? '✓' : <ClipboardIcon />}
    </button>
  );
}

/**
 * Renders text that may contain ``` code blocks with syntax highlighting
 * and a per-block copy button (ChatGPT-style).
 */
export function MemoryText({ text }) {
  if (!text) return null;

  // Split on fenced code blocks
  const parts = text.split(/(```[\w]*\n[\s\S]*?```|```[\w]*[\s\S]*?```)/g);
  const hasCodeFence = parts.length > 1;

  if (!hasCodeFence) {
    // Check if entire content looks like code (SQL dumps, scripts)
    const looksLikeCode =
      /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|#!\/)/im.test(text) &&
      text.split('\n').length > 2;

    if (looksLikeCode) {
      return (
        <div className="relative group">
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
            <CopyButton text={text} />
          </div>
          <SyntaxHighlighter language={detectLanguage(text)} style={phosphorTheme} wrapLongLines>
            {text}
          </SyntaxHighlighter>
        </div>
      );
    }
    return <pre className="whitespace-pre-wrap text-phosphor-gray text-sm leading-relaxed">{text}</pre>;
  }

  return (
    <div className="space-y-1">
      {parts.map((part, i) => {
        if (part.startsWith('```')) {
          const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
          if (match) {
            const [, lang, code] = match;
            const language = lang || detectLanguage(code);
            const trimmed = code.trim();
            return (
              <div key={i} className="relative group">
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <CopyButton text={trimmed} />
                </div>
                <SyntaxHighlighter language={language} style={phosphorTheme} wrapLongLines>
                  {trimmed}
                </SyntaxHighlighter>
              </div>
            );
          }
        }
        if (part.trim()) {
          return (
            <pre key={i} className="whitespace-pre-wrap text-phosphor-gray text-sm leading-relaxed">
              {part}
            </pre>
          );
        }
        return null;
      })}
    </div>
  );
}

export function Badge({ children, tone = 'green' }) {
  const tones = {
    green: 'border-phosphor-dim text-phosphor-green',
    amber: 'border-phosphor-amber text-phosphor-amber',
    cyan: 'border-phosphor-cyan text-phosphor-cyan',
    red: 'border-phosphor-red text-phosphor-red',
    gray: 'border-phosphor-gray text-phosphor-gray',
  };
  return (
    <span className={`inline-block border px-1.5 py-[1px] text-[10px] uppercase tracking-wider ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function Panel({ title, titleRight, children, className = '' }) {
  return (
    <div className={`border border-phosphor-dim bg-phosphor-panel ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-phosphor-dim px-3 py-1">
          <span className="text-xs uppercase tracking-widest text-phosphor-gray">{title}</span>
          {titleRight && <span>{titleRight}</span>}
        </div>
      )}
      <div className="p-3">{children}</div>
    </div>
  );
}

export function confidenceTone(c) {
  return { high: 'green', medium: 'amber', low: 'gray', none: 'red' }[c] || 'gray';
}

export function scopeTone(s) {
  return s === 'team' ? 'cyan' : 'green';
}
