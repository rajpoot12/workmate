import { useState, useEffect, useRef } from 'react';
import { api, getScope } from '../api.js';
import { Badge, CopyButton, MemoryText, confidenceTone, scopeTone } from './ui.jsx';

/**
 * Cmd+K / Ctrl+K command palette.
 * Type normally → Ask Recall AI
 * Type "> " prefix → Save as note to current scope
 */
export default function CommandPalette({ onClose }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { type: 'ask' | 'save', data }
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const isSaveMode = input.startsWith('>');
  const displayText = isSaveMode ? input.slice(1).trimStart() : input;
  const scope = getScope();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  async function execute() {
    const text = displayText.trim();
    if (!text) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      if (isSaveMode) {
        const r = await api.createNote({ title: '', text, tags: [] });
        setResult({ type: 'save', data: r });
      } else {
        const r = await api.ask(text);
        setResult({ type: 'ask', data: r });
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4"
         style={{ background: 'rgba(0,0,0,0.75)' }}
         onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl border border-phosphor-green bg-[#080d08] shadow-2xl"
           style={{ boxShadow: '0 0 40px rgba(51,255,119,0.15)' }}>

        {/* Input bar */}
        <div className="flex items-center gap-2 border-b border-phosphor-dim px-3 py-2">
          <span className={`shrink-0 text-xs font-bold ${isSaveMode ? 'text-phosphor-amber' : 'text-phosphor-green'}`}>
            {isSaveMode ? 'save>' : 'ask>'}
          </span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setResult(null); setError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); execute(); } }}
            placeholder={isSaveMode ? 'type your note…' : 'ask anything… (type > to save instead)'}
            className="flex-1 bg-transparent text-phosphor-green placeholder-phosphor-dim outline-none text-sm"
            autoComplete="off"
          />
          <span className="text-[10px] text-phosphor-dim shrink-0">↵ enter · ESC close</span>
        </div>

        {/* Mode hint */}
        {!result && !loading && !error && (
          <div className="px-3 py-2 text-[10px] text-phosphor-dim border-b border-phosphor-dim/30 flex gap-4">
            <span><span className="text-phosphor-green">ask&gt;</span> search your memory</span>
            <span><span className="text-phosphor-amber">&gt; text</span> save a quick note</span>
            <span className="ml-auto">{scope} scope</span>
          </div>
        )}

        {/* Results area */}
        {loading && (
          <div className="px-3 py-4 text-sm text-phosphor-amber">
            {isSaveMode ? 'saving…' : 'searching memory…'}
          </div>
        )}

        {error && (
          <div className="px-3 py-3 text-sm text-phosphor-red">! {error}</div>
        )}

        {result && result.type === 'save' && (
          <div className="px-3 py-3 text-sm">
            <div className="text-phosphor-green glow">✓ saved to {scope}</div>
            <div className="text-phosphor-dim text-xs mt-1">"{result.data.title}"</div>
            {result.data.redactionCount > 0 && (
              <div className="mt-1 text-xs text-phosphor-amber">{result.data.redactionCount} items masked</div>
            )}
          </div>
        )}

        {result && result.type === 'ask' && (
          <div className="px-3 py-3 space-y-2 max-h-96 overflow-auto">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="gray">{result.data.router}</Badge>
              <Badge tone={confidenceTone(result.data.confidence)}>{result.data.confidence}</Badge>
              <span className="ml-auto">
                <CopyButton text={result.data.answer} />
              </span>
            </div>
            <MemoryText text={result.data.answer} />
            {result.data.sources.length > 0 && (
              <div className="space-y-1 pt-1 border-t border-phosphor-dim">
                {result.data.sources.slice(0, 3).map((s) => (
                  <div key={s.memoryId} className="flex items-center gap-2 text-xs">
                    <Badge tone={scopeTone(s.scope)}>{s.scope}</Badge>
                    <span className="text-phosphor-dim truncate">{s.title}</span>
                    <span className="text-phosphor-dim shrink-0">{s.score}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-3 py-1.5 border-t border-phosphor-dim/30 flex justify-between text-[10px] text-phosphor-dim">
          <span>Recall AI — Ctrl+K to reopen</span>
          <button onClick={onClose} className="hover:text-phosphor-green">close</button>
        </div>
      </div>
    </div>
  );
}
