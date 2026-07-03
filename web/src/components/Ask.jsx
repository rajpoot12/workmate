import { useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
import { Badge, CopyButton, MemoryText, Panel, confidenceTone, scopeTone } from './ui.jsx';

const SAMPLES = [
  'What caused the payment timeout incident?',
  'How do we handle kafka consumer lag?',
  'kafka_lag*.sh',
  'deploy_prod',
];

export default function Ask({ scope }) {
  const [query, setQuery] = useState('');
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  const [savedTitle, setSavedTitle] = useState(null);
  const [theme] = useTheme();

  async function run(q) {
    const text = (q ?? query).trim();
    if (!text) return;
    setQuery(text);
    setLoading(true);
    setErr(null);
    setSaved(false);
    setSavedTitle(null);
    try {
      setRes(await api.ask(text));
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveAnswer() {
    try {
      const r = await api.saveAnswer(query, res.answer, []);
      setSaved(true);
      setSavedTitle(r.title || query);
    } catch(e) {
      setSavedTitle('save failed: ' + e.message);
    }
  }

  if (theme === 'friendly') {
    return (
      <div className="space-y-4 font-sans">
        {/* Search bar */}
        <div className="flex items-center gap-2 bg-friendly-surface border border-friendly-border rounded-xl px-4 py-3 focus-within:border-friendly-accent transition-colors">
          <svg className="w-4 h-4 text-friendly-muted shrink-0" viewBox="0 0 20 20" fill="none">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M13 13L16.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="Ask anything — what is the deploy process? what is my API key?…"
            className="w-full bg-transparent text-friendly-text placeholder-friendly-muted outline-none text-sm"
          />
          {query && (
            <button onClick={() => run()} className="shrink-0 bg-friendly-accent text-white rounded-lg px-3 py-1 text-xs font-medium">
              Search
            </button>
          )}
        </div>

        {/* Suggestions */}
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-friendly-muted self-center">Try:</span>
          {SAMPLES.map((s) => (
            <button key={s} onClick={() => run(s)}
              className="text-xs bg-friendly-accentBg text-friendly-accent rounded-full px-3 py-1 hover:bg-friendly-accent hover:text-white transition-colors">
              {s}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-friendly-muted text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-friendly-accent border-t-transparent animate-spin" />
            {scope === 'team' ? 'Searching team memory…' : 'Searching your memory…'}
          </div>
        )}
        {err && <div className="text-friendly-red text-sm bg-friendly-redBg rounded-lg px-4 py-3">Error: {err}</div>}

        {res && !loading && (
          <div className="space-y-4">
            {/* Meta badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-friendly-muted">Router: {res.router}</span>
              <span className={`text-xs font-medium rounded-full px-2 py-0.5
                ${res.confidence === 'high' ? 'bg-friendly-greenBg text-friendly-green'
                : res.confidence === 'medium' ? 'bg-friendly-amberBg text-friendly-amber'
                : 'bg-friendly-border text-friendly-muted'}`}>
                {res.confidence === 'high' ? 'High confidence' : res.confidence === 'medium' ? 'Medium confidence' : 'Low confidence'}
              </span>
              {res.mode === 'verbatim' && (
                <span className="text-xs bg-friendly-cyanBg text-friendly-cyan rounded-full px-2 py-0.5">Full recall</span>
              )}
            </div>

            {/* Answer card */}
            {res.answer && (
              <div className="bg-friendly-surface border border-friendly-border rounded-xl p-5">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-xs font-semibold text-friendly-muted uppercase tracking-wide">Answer</span>
                  <CopyButton text={res.answer} />
                </div>
                <div className="text-friendly-text text-sm leading-relaxed">
                  <MemoryText text={res.answer} />
                </div>
                {res.confidence !== 'none' && res.sources.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-friendly-border">
                    {saved ? (
                      <div className="flex items-center gap-2 text-sm text-friendly-green">
                        <span>Saved to memory</span>
                        {savedTitle && <span className="text-friendly-muted truncate max-w-xs text-xs">"{savedTitle}"</span>}
                      </div>
                    ) : (
                      <button onClick={saveAnswer}
                        className="flex items-center gap-2 text-sm text-friendly-accent bg-friendly-accentBg rounded-lg px-4 py-2 hover:bg-friendly-accent hover:text-white transition-colors">
                        <span>+</span>
                        <span>Save this answer to memory</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Sources */}
            {res.sources.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-friendly-muted uppercase tracking-wide mb-2">
                  Sources ({res.sources.length}) — every claim is cited
                </p>
                <div className="space-y-2">
                  {res.sources.map((s) => (
                    <div key={s.memoryId} className="bg-friendly-surface border border-friendly-border rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-friendly-accent shrink-0" />
                        <span className="text-friendly-accent text-sm font-medium">{s.title}</span>
                        <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium
                          ${s.scope === 'team' ? 'bg-friendly-cyanBg text-friendly-cyan' : 'bg-friendly-accentBg text-friendly-accent'}`}>
                          {s.scope}
                        </span>
                        <span className="text-[10px] text-friendly-muted ml-auto">score {s.score}</span>
                      </div>
                      <p className="text-xs text-friendly-muted pl-4">"{s.quote}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {res.files.length > 0 && (
              <div className="bg-friendly-surface border border-friendly-border rounded-xl p-4">
                <p className="text-xs font-semibold text-friendly-muted uppercase tracking-wide mb-3">Files ({res.files.length})</p>
                <ul className="space-y-2">
                  {res.files.map((f) => (
                    <li key={f.id} className="flex items-center gap-2 text-sm">
                      <span className="text-friendly-cyan font-medium">{f.name}</span>
                      {f.prodDanger && <span className="text-[10px] bg-friendly-redBg text-friendly-red rounded px-1.5">prod</span>}
                      <span className="truncate text-xs text-friendly-muted">{f.path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Developer theme ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border border-phosphor-dim bg-phosphor-panel px-3 py-2">
        <span className="shrink-0 text-phosphor-dim">wm@{scope}:~$</span>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && run()}
          placeholder="ask anything, or type a filename / glob…"
          className="w-full bg-transparent text-phosphor-green placeholder-phosphor-dim outline-none glow"
        />
        <span className="blink text-phosphor-green">▊</span>
      </div>

      <div className="flex flex-wrap gap-2 text-xs text-phosphor-gray">
        <span>try:</span>
        {SAMPLES.map((s) => (
          <button key={s} onClick={() => run(s)} className="underline decoration-dotted hover:text-phosphor-green">
            {s}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-phosphor-amber glow-amber">
          {scope === 'team' ? 'searching team memory…' : 'searching personal + team memory…'}
        </div>
      )}
      {err && <div className="text-phosphor-red">! {err}</div>}

      {res && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="gray">router: {res.router}</Badge>
            <Badge tone={confidenceTone(res.confidence)}>confidence: {res.confidence}</Badge>
            {res.mode === 'verbatim' && (
              <Badge tone="cyan">full recall — not summarized</Badge>
            )}
          </div>

          {res.answer && (
            <Panel title="answer" titleRight={<CopyButton text={res.answer} />}>
              <MemoryText text={res.answer} />
              {res.confidence !== 'none' && res.sources.length > 0 && (
                <div className="mt-3 border-t border-phosphor-dim pt-3">
                  {saved ? (
                    <div className="flex items-center gap-2 text-xs text-phosphor-green">
                      <span className="glow">✓ saved to memory</span>
                      {savedTitle && <span className="text-phosphor-dim truncate max-w-xs">"{savedTitle}"</span>}
                    </div>
                  ) : (
                    <button
                      onClick={saveAnswer}
                      className="flex items-center gap-2 border border-phosphor-dim px-3 py-1.5 text-xs text-phosphor-gray hover:border-phosphor-green hover:text-phosphor-green transition-colors"
                    >
                      <span>⊕</span>
                      <span>learn from this answer — save to memory</span>
                    </button>
                  )}
                </div>
              )}
            </Panel>
          )}

          {res.sources.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-widest text-phosphor-gray">
                sources ({res.sources.length}) — every claim is cited
              </div>
              {res.sources.map((s) => (
                <div key={s.memoryId} className="border-l-2 border-phosphor-dim pl-3">
                  <div className="flex items-center gap-2">
                    <span className="text-phosphor-green">{s.title}</span>
                    <Badge tone={scopeTone(s.scope)}>{s.scope}</Badge>
                    <Badge tone="gray">{s.sourceType}</Badge>
                    <span className="text-[10px] text-phosphor-dim">score {s.score}</span>
                  </div>
                  <p className="mt-1 text-sm text-phosphor-gray">"{s.quote}"</p>
                </div>
              ))}
            </div>
          )}

          {res.files.length > 0 && (
            <Panel title={`files (${res.files.length})`}>
              <ul className="space-y-1 text-sm">
                {res.files.map((f) => (
                  <li key={f.id} className="flex items-center gap-2">
                    <span className="text-phosphor-cyan">{f.name}</span>
                    {f.prodDanger && <Badge tone="red">prod-danger</Badge>}
                    <span className="truncate text-xs text-phosphor-dim">{f.path}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>
      )}
    </div>
  );
}
