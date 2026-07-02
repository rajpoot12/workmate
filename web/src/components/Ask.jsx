import { useState } from 'react';
import { api } from '../api.js';
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

      {loading && <div className="text-phosphor-amber glow-amber">searching personal + team memory…</div>}
      {err && <div className="text-phosphor-red">! {err}</div>}

      {res && !loading && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Badge tone="gray">router: {res.router}</Badge>
            <Badge tone={confidenceTone(res.confidence)}>confidence: {res.confidence}</Badge>
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
