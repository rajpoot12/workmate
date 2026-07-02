import { useEffect, useState } from 'react';
import { api } from '../api.js';
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
