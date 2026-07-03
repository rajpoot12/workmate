import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { useTheme } from '../theme.js';
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
  const [theme] = useTheme();

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

  if (theme === 'friendly') {
    return (
      <div className="space-y-4 font-sans">
        {isTeam && (
          <div className="bg-friendly-cyanBg text-friendly-cyan rounded-xl px-4 py-3 text-sm">
            Team mode — your note will be checked for sensitive content before saving to the shared team database.
          </div>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Quick note card */}
          <div className="bg-friendly-surface border border-friendly-border rounded-xl p-5">
            <h3 className="font-semibold text-friendly-text text-sm mb-4">Quick Note</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-friendly-muted mb-1">Title (optional)</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Leave policy, Deploy steps, API key…"
                  className="w-full border border-friendly-border bg-friendly-bg rounded-lg px-3 py-2 text-sm text-friendly-text placeholder-friendly-muted outline-none focus:border-friendly-accent transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-friendly-muted mb-1">Note</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5}
                  placeholder="Write anything you want to remember — links, instructions, credentials, notes…"
                  className="w-full border border-friendly-border bg-friendly-bg rounded-lg px-3 py-2 text-sm text-friendly-text placeholder-friendly-muted outline-none focus:border-friendly-accent transition-colors resize-none" />
              </div>

              {similarMatches.length > 0 && (
                <div className="bg-friendly-amberBg border border-friendly-amber/30 rounded-lg p-3 text-xs">
                  <div className="font-medium text-friendly-amber mb-1">Similar notes already exist:</div>
                  {similarMatches.map((m) => (
                    <div key={m.memoryId} className="text-friendly-muted truncate">{m.title}</div>
                  ))}
                  <div className="mt-1 text-friendly-muted">You can still save — or update an existing note instead.</div>
                </div>
              )}

              <div>
                <label className="block text-xs text-friendly-muted mb-1">Tags</label>
                <input value={tags} onChange={(e) => setTags(e.target.value)}
                  placeholder="deployment, team, important…"
                  className="w-full border border-friendly-border bg-friendly-bg rounded-lg px-3 py-2 text-sm text-friendly-text placeholder-friendly-muted outline-none focus:border-friendly-accent transition-colors" />
                {suggestedTags.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="text-[10px] text-friendly-muted self-center">Suggested:</span>
                    {suggestedTags.map(tag => (
                      <button key={tag} onClick={() => addTag(tag)}
                        className="text-[10px] bg-friendly-accentBg text-friendly-accent rounded-full px-2 py-0.5 hover:bg-friendly-accent hover:text-white transition-colors">
                        +{tag}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button onClick={saveNote} disabled={busy || !note.trim()}
                className="w-full bg-friendly-accent text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-friendly-accent/90 disabled:opacity-50 transition-colors">
                {busy ? 'Saving…' : 'Save Note'}
              </button>

              {noteRes && (
                noteRes.error
                  ? <div className="text-friendly-red text-sm bg-friendly-redBg rounded-lg px-3 py-2">{noteRes.error}</div>
                  : <div className="flex items-center gap-2 text-sm text-friendly-green bg-friendly-greenBg rounded-lg px-3 py-2">
                      <span>Saved — "{noteRes.title}"</span>
                      {noteRes.scope === 'team' && <span className="text-xs bg-friendly-cyanBg text-friendly-cyan rounded-full px-2 py-0.5">team</span>}
                    </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {/* Upload card */}
            <div className="bg-friendly-surface border border-friendly-border rounded-xl p-5">
              <h3 className="font-semibold text-friendly-text text-sm mb-1">Upload a File</h3>
              <p className="text-xs text-friendly-muted mb-3">PDF, Word doc, code file, plain text — we extract and remember it.</p>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-friendly-border rounded-lg p-6 cursor-pointer hover:border-friendly-accent transition-colors">
                <span className="text-friendly-muted text-sm mb-2">Choose a file or drag it here</span>
                <span className="bg-friendly-accentBg text-friendly-accent rounded-lg px-4 py-2 text-sm font-medium">Browse Files</span>
                <input type="file" onChange={upload} className="hidden" />
              </label>
              <p className="mt-2 text-[10px] text-friendly-muted text-center">
                extracted {isTeam ? '→ privacy check ' : ''}→ indexed → searchable
              </p>
              {fileRes && (
                fileRes.error
                  ? <div className="mt-2 text-friendly-red text-sm">{fileRes.error}</div>
                  : <div className="mt-2 text-sm text-friendly-green">Saved — "{fileRes.title}"</div>
              )}
            </div>

            {/* Scan card */}
            <div className="bg-friendly-surface border border-friendly-border rounded-xl p-5">
              <h3 className="font-semibold text-friendly-text text-sm mb-1">Index a Folder</h3>
              <p className="text-xs text-friendly-muted mb-3">Point to a directory and we index all file names (optionally file contents too).</p>
              <input value={path} onChange={(e) => setPath(e.target.value)}
                placeholder="/absolute/path/to/directory"
                className="w-full border border-friendly-border bg-friendly-bg rounded-lg px-3 py-2 text-sm text-friendly-text placeholder-friendly-muted outline-none focus:border-friendly-accent transition-colors mb-2" />
              <label className="flex items-center gap-2 text-sm text-friendly-muted mb-3 cursor-pointer">
                <input type="checkbox" checked={indexContent} onChange={(e) => setIndexContent(e.target.checked)}
                  className="accent-friendly-accent" />
                Also index file contents (slower)
              </label>
              <button onClick={scan} disabled={busy || !path.trim()}
                className="w-full bg-friendly-accent text-white rounded-lg py-2 text-sm font-medium hover:bg-friendly-accent/90 disabled:opacity-50 transition-colors">
                {busy ? 'Scanning…' : 'Scan Folder'}
              </button>
              {scanRes && (
                scanRes.error
                  ? <div className="mt-2 text-friendly-red text-sm">{scanRes.error}</div>
                  : <div className="mt-2 text-sm text-friendly-green">Indexed {scanRes.filesIndexed} files</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Developer theme ───────────────────────────────────────────────────────
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
