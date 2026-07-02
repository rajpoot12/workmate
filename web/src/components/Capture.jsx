import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { Badge, Panel } from './ui.jsx';

function Result({ r }) {
  if (!r) return null;
  if (r.error) return <div className="mt-2 text-phosphor-red">! {r.error}</div>;
  return (
    <div className="mt-2 text-sm text-phosphor-gray">
      ✓ saved "{r.title || r.rootDir}"{' '}
      {r.redactionCount > 0 && <Badge tone="amber">{r.redactionCount} masked</Badge>}
      {r.scope === 'team' && <Badge tone="cyan">team</Badge>}
      {typeof r.filesIndexed === 'number' && (
        <span> — indexed {r.filesIndexed} files, {r.contentIndexed} with content</span>
      )}
    </div>
  );
}

function SimilarWarning({ matches }) {
  if (!matches || matches.length === 0) return null;
  return (
    <div className="border border-phosphor-amber bg-phosphor-panel px-3 py-2 text-xs">
      <div className="text-phosphor-amber mb-1">⚑ Similar memories already exist:</div>
      {matches.map((m) => (
        <div key={m.memoryId} className="flex items-center gap-2 text-phosphor-gray">
          <span className="text-phosphor-amber">{m.score}</span>
          <span className="truncate">{m.title}</span>
        </div>
      ))}
      <div className="mt-1 text-phosphor-dim">You can still save — or update an existing memory instead.</div>
    </div>
  );
}

function TagChips({ suggested, current, onAdd }) {
  const existing = new Set(current.split(',').map(t => t.trim().toLowerCase()).filter(Boolean));
  const newOnes = suggested.filter(t => !existing.has(t.toLowerCase()));
  if (newOnes.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-phosphor-dim">suggest:</span>
      {newOnes.map(tag => (
        <button key={tag}
          onClick={() => onAdd(tag)}
          className="border border-phosphor-dim px-1.5 py-px text-[10px] text-phosphor-gray hover:border-phosphor-green hover:text-phosphor-green">
          +{tag}
        </button>
      ))}
    </div>
  );
}

export default function Capture({ scope }) {
  const isTeam = scope === 'team';

  const [note, setNote] = useState('');
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState('');
  const [noteRes, setNoteRes] = useState(null);
  const [suggestedTags, setSuggestedTags] = useState([]);
  const [similarMatches, setSimilarMatches] = useState([]);
  const [busy, setBusy] = useState(false);

  const [path, setPath] = useState('');
  const [indexContent, setIndexContent] = useState(false);
  const [scanRes, setScanRes] = useState(null);
  const [fileRes, setFileRes] = useState(null);

  // Debounced auto-tag + similar check
  const debounceRef = useRef(null);
  useEffect(() => {
    if (note.length < 40 && title.length < 10) { setSuggestedTags([]); setSimilarMatches([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const [tagRes, simRes] = await Promise.all([
          fetch('/api/tags/suggest', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, text: note }),
          }).then(r => r.json()),
          fetch('/api/memories/similar', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Scope': scope },
            body: JSON.stringify({ title, text: note }),
          }).then(r => r.json()),
        ]);
        setSuggestedTags(tagRes.tags || []);
        setSimilarMatches(simRes || []);
      } catch (_) {}
    }, 800);
    return () => clearTimeout(debounceRef.current);
  }, [note, title, scope]);

  function addTag(tag) {
    const current = tags.split(',').map(t => t.trim()).filter(Boolean);
    if (!current.includes(tag)) {
      setTags(current.length > 0 ? current.join(', ') + ', ' + tag : tag);
    }
  }

  async function saveNote() {
    if (!note.trim()) return;
    setBusy(true);
    try {
      setNoteRes(await api.createNote({
        title,
        text: note,
        tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      }));
      setNote(''); setTitle(''); setTags('');
      setSuggestedTags([]); setSimilarMatches([]);
    } catch (e) {
      setNoteRes({ error: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    try {
      setFileRes(await api.upload(file, tags));
    } catch (e2) {
      setFileRes({ error: e2.message });
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function scan() {
    if (!path.trim()) return;
    setBusy(true);
    try {
      const r = await api.scan(path.trim(), indexContent);
      setScanRes(r.exists ? r : { error: 'directory not found: ' + path });
    } catch (e) {
      setScanRes({ error: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {isTeam && (
        <div className="border border-phosphor-cyan px-3 py-1.5 text-xs text-phosphor-cyan">
          ⚑ Team mode — content will be redacted before saving to the team database.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="quick note">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="title (optional)"
            className="mb-2 w-full border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-phosphor-green outline-none" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={6}
            placeholder="paste a note, SQL snippet, runbook, or fix…"
            className="w-full border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-phosphor-green outline-none" />

          <SimilarWarning matches={similarMatches} />

          <div className="mt-2">
            <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="tags, comma, separated"
              className="w-full border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-phosphor-green outline-none" />
            <TagChips suggested={suggestedTags} current={tags} onAdd={addTag} />
          </div>

          <div className="mt-3">
            <button onClick={saveNote} disabled={busy}
              className="border border-phosphor-green px-3 py-1 text-phosphor-green hover:bg-phosphor-dim/30 disabled:opacity-50">
              {busy ? 'saving…' : 'save note'}
            </button>
          </div>
          <Result r={noteRes} />
        </Panel>

        <div className="space-y-4">
          <Panel title="upload file (pdf / docx / code / text)">
            <input type="file" onChange={upload}
              className="w-full text-sm text-phosphor-gray file:mr-3 file:border file:border-phosphor-dim file:bg-phosphor-bg file:px-2 file:py-1 file:text-phosphor-green" />
            <p className="mt-1 text-xs text-phosphor-dim">extracted → {isTeam ? 'redacted → ' : ''}chunked → embedded</p>
            <Result r={fileRes} />
          </Panel>

          <Panel title="scan a directory (locate index)">
            <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="/absolute/path/to/dir"
              className="w-full border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-phosphor-green outline-none" />
            <label className="mt-2 flex items-center gap-2 text-xs text-phosphor-gray">
              <input type="checkbox" checked={indexContent} onChange={(e) => setIndexContent(e.target.checked)} />
              also index file contents (slower)
            </label>
            <button onClick={scan} disabled={busy}
              className="mt-2 border border-phosphor-green px-3 py-1 text-phosphor-green hover:bg-phosphor-dim/30 disabled:opacity-50">
              scan
            </button>
            <Result r={scanRes} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
