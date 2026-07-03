import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
import { Badge, MemoryText, scopeTone } from './ui.jsx';

export default function Library({ scope }) {
  const [items, setItems] = useState([]);
  const [tags, setTags] = useState([]);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null); // id pending confirmation
  const [deleting, setDeleting] = useState(null);
  const [theme] = useTheme();

  async function load() {
    setItems(await api.memories({ q, tag }));
  }

  useEffect(() => { load(); }, [q, tag, scope]);

  useEffect(() => {
    api.tags().then(setTags);
  }, [scope]);

  async function toggle(id) {
    if (open === id) { setOpen(null); return; }
    setOpen(id);
    setDetail(await api.memory(id));
  }

  async function doDelete(id) {
    setDeleting(id);
    try {
      await api.deleteMemory(id);
      setItems((prev) => prev.filter((m) => m.id !== id));
      if (open === id) setOpen(null);
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }

  if (theme === 'friendly') {
    return (
      <div className="space-y-4 font-sans">
        {/* Search + filter bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-48 bg-friendly-surface border border-friendly-border rounded-lg px-3 py-2">
            <svg className="w-4 h-4 text-friendly-muted shrink-0" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M13 13L16.5 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…"
              className="w-full bg-transparent text-sm text-friendly-text placeholder-friendly-muted outline-none" />
          </div>
          <select value={tag} onChange={(e) => setTag(e.target.value)}
            className="border border-friendly-border bg-friendly-surface rounded-lg px-3 py-2 text-sm text-friendly-text outline-none focus:border-friendly-accent">
            <option value="">All tags</option>
            {tags.map((t) => <option key={t} value={t}>#{t}</option>)}
          </select>
          <span className="text-xs text-friendly-muted ml-auto">{items.length} notes</span>
          <span className={`text-xs font-medium rounded-full px-2 py-0.5
            ${scope === 'team' ? 'bg-friendly-cyanBg text-friendly-cyan' : 'bg-friendly-accentBg text-friendly-accent'}`}>
            {scope}
          </span>
        </div>

        {/* Memory cards */}
        <div className="space-y-2">
          {items.map((m) => (
            <div key={m.id} className="bg-friendly-surface border border-friendly-border rounded-xl overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-2 px-4 py-3">
                <button onClick={() => toggle(m.id)} className="flex flex-1 items-center gap-2 text-left min-w-0">
                  <span className="text-friendly-muted text-xs shrink-0">{open === m.id ? '▾' : '▸'}</span>
                  <span className="text-friendly-text text-sm font-medium truncate">{m.title}</span>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium shrink-0
                    ${m.db === 'team' ? 'bg-friendly-cyanBg text-friendly-cyan' : 'bg-friendly-accentBg text-friendly-accent'}`}>
                    {m.db}
                  </span>
                  <span className="text-[10px] text-friendly-muted shrink-0 bg-friendly-border rounded px-1.5 py-0.5">{m.sourceType}</span>
                  {m.redactionCount > 0 && (
                    <span className="text-[10px] bg-friendly-amberBg text-friendly-amber rounded-full px-2 py-0.5 shrink-0">{m.redactionCount} masked</span>
                  )}
                </button>
                <span className="text-[11px] text-friendly-muted shrink-0">
                  {new Date(m.createdAt).toLocaleDateString()}
                </span>

                {/* Delete controls */}
                {confirmDelete === m.id ? (
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-xs text-friendly-red">Delete?</span>
                    <button onClick={() => doDelete(m.id)} disabled={deleting === m.id}
                      className="text-xs bg-friendly-red text-white rounded px-2 py-0.5 hover:opacity-90 disabled:opacity-50">
                      {deleting === m.id ? '…' : 'Yes'}
                    </button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="text-xs text-friendly-muted hover:text-friendly-text px-1">
                      No
                    </button>
                  </div>
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); setConfirmDelete(m.id); }}
                    className="shrink-0 text-friendly-muted hover:text-friendly-red text-sm transition-colors p-1"
                    title="Delete">
                    ✕
                  </button>
                )}
              </div>

              {/* Expanded detail */}
              {open === m.id && detail && detail.id === m.id && (
                <div className="border-t border-friendly-border px-4 py-3 bg-friendly-bg">
                  {detail.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      {detail.tags.map((t) => (
                        <span key={t} className="text-xs bg-friendly-accentBg text-friendly-accent rounded-full px-2 py-0.5">#{t}</span>
                      ))}
                    </div>
                  )}
                  <div className="max-h-72 overflow-auto text-sm text-friendly-text leading-relaxed">
                    <MemoryText text={detail.rawText} />
                  </div>
                </div>
              )}
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-center py-12 text-friendly-muted">
              <div className="text-4xl mb-3">📝</div>
              <div className="font-medium text-friendly-text mb-1">No notes yet</div>
              <div className="text-sm">Go to "Add Note" to save your first memory.</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Developer theme ───────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="grep memories…"
          className="border border-phosphor-dim bg-phosphor-panel px-2 py-1 text-phosphor-green outline-none"
        />
        <select value={tag} onChange={(e) => setTag(e.target.value)}
          className="border border-phosphor-dim bg-phosphor-panel px-2 py-1 text-phosphor-green outline-none">
          <option value="">tag: any</option>
          {tags.map((t) => (
            <option key={t} value={t}>#{t}</option>
          ))}
        </select>
        <span className="text-xs text-phosphor-dim">{items.length} memories</span>
        <span className={`ml-2 text-xs ${scope === 'team' ? 'text-phosphor-cyan' : 'text-phosphor-green'}`}>
          [{scope}]
        </span>
      </div>

      <div className="space-y-2">
        {items.map((m) => (
          <div key={m.id} className="border border-phosphor-dim bg-phosphor-panel">
            {/* Row header */}
            <div className="flex w-full items-center gap-2 px-3 py-2">
              <button onClick={() => toggle(m.id)} className="flex flex-1 items-center gap-2 text-left min-w-0">
                <span className="text-phosphor-dim shrink-0">{open === m.id ? '▼' : '▶'}</span>
                <span className="text-phosphor-green truncate">{m.title}</span>
                <Badge tone={scopeTone(m.db)}>{m.db}</Badge>
                <Badge tone="gray">{m.sourceType}</Badge>
                {m.redactionCount > 0 && <Badge tone="amber">{m.redactionCount} masked</Badge>}
              </button>
              <span className="text-[10px] text-phosphor-dim shrink-0">
                {new Date(m.createdAt).toLocaleDateString()}
              </span>

              {/* Delete controls */}
              {confirmDelete === m.id ? (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] text-phosphor-red">delete?</span>
                  <button
                    onClick={() => doDelete(m.id)}
                    disabled={deleting === m.id}
                    className="border border-phosphor-red px-1.5 py-px text-[10px] text-phosphor-red hover:bg-phosphor-red/10 disabled:opacity-50">
                    {deleting === m.id ? '…' : 'yes'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="border border-phosphor-dim px-1.5 py-px text-[10px] text-phosphor-gray hover:text-phosphor-green">
                    no
                  </button>
                </span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(m.id); }}
                  className="shrink-0 border border-transparent px-1.5 py-px text-[10px] text-phosphor-dim hover:border-phosphor-red hover:text-phosphor-red"
                  title="Delete memory">
                  ✕
                </button>
              )}
            </div>

            {/* Expanded detail */}
            {open === m.id && detail && detail.id === m.id && (
              <div className="border-t border-phosphor-dim px-3 py-2 text-sm">
                <div className="mb-2 flex flex-wrap gap-1">
                  {detail.tags.map((t) => (
                    <span key={t} className="text-xs text-phosphor-cyan">#{t}</span>
                  ))}
                </div>
                <div className="max-h-72 overflow-auto"><MemoryText text={detail.rawText} /></div>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <div className="text-phosphor-dim">no memories in this scope.</div>}
      </div>
    </div>
  );
}
