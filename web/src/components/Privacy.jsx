import { useEffect, useState } from 'react';
import { api, getTeam, setTeam, getScope } from '../api.js';
import { Badge, Panel, confidenceTone } from './ui.jsx';

export default function Privacy({ health }) {
  const [log, setLog] = useState([]);
  const [text, setText] = useState('login user=admin password=hunter2 token Bearer abc123def456 mail bob@corp.com host db.internal ip 10.1.2.3');
  const [preview, setPreview] = useState(null);
  const [teamNameInput, setTeamNameInput] = useState(getTeam());
  const [teamSaved, setTeamSaved] = useState(false);
  const [reindexResult, setReindexResult] = useState(null);
  const [reindexing, setReindexing] = useState(false);

  useEffect(() => {
    api.accessLog().then(setLog).catch(() => {});
  }, []);

  async function runPreview() {
    setPreview(await api.redactPreview(text));
  }
  useEffect(() => { runPreview(); }, []);

  function saveTeamName() {
    setTeam(teamNameInput.trim());
    setTeamSaved(true);
    setTimeout(() => setTeamSaved(false), 2000);
    window.location.reload();
  }

  async function reindexMemories() {
    setReindexing(true);
    setReindexResult(null);
    try {
      const r = await fetch('/api/memories/reindex', {
        method: 'POST',
        headers: { 'X-Scope': getScope() },
      }).then(res => res.json());
      setReindexResult(`✓ reindexed ${r.reindexed}/${r.total} memories`);
    } catch (e) {
      setReindexResult('! reindex failed: ' + e.message);
    } finally {
      setReindexing(false);
    }
  }

  const teamEnabled = health?.teamEnabled;
  const teamStatus = health?.team;

  return (
    <div className="space-y-4">

      {/* ── Team Settings ── */}
      <Panel title="team settings">
        <div className="space-y-3 text-sm">
          <div>
            <p className="text-phosphor-gray mb-2">
              Team database: <span className={
                !teamEnabled ? 'text-phosphor-amber'
                  : teamStatus === 'up' ? 'text-phosphor-green'
                  : 'text-phosphor-red'
              }>
                {!teamEnabled ? 'not configured' : teamStatus === 'up' ? '● online' : '● offline'}
              </span>
              {health?.teamName && (
                <span className="ml-2 text-phosphor-dim">server: {health.teamName}</span>
              )}
            </p>

            {!teamEnabled && (
              <div className="border border-phosphor-amber px-3 py-2 text-xs text-phosphor-amber">
                <p>To enable team features:</p>
                <ol className="mt-1 list-decimal list-inside space-y-0.5">
                  <li>Run <code>scripts/setup-team-server.sh</code> on your team server</li>
                  <li>Add the <code>WM_TEAM_*</code> keys from the script output to your <code>.env</code></li>
                  <li>Restart: <code>./wm.sh restart</code></li>
                </ol>
              </div>
            )}
          </div>

          <div>
            <label className="block text-phosphor-dim text-xs mb-1">
              Team name (used to filter your team's memories on the shared server)
            </label>
            <div className="flex gap-2">
              <input
                value={teamNameInput}
                onChange={(e) => { setTeamNameInput(e.target.value); setTeamSaved(false); }}
                placeholder="e.g. platform-sre"
                className="flex-1 border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-phosphor-green outline-none"
              />
              <button onClick={saveTeamName}
                className="border border-phosphor-green px-3 py-1 text-phosphor-green hover:bg-phosphor-dim/30">
                {teamSaved ? '✓ saved' : 'save'}
              </button>
            </div>
            <p className="mt-1 text-xs text-phosphor-dim">
              Changes take effect when you switch to Team scope.
            </p>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        {/* ── Redaction Preview ── */}
        <Panel title="redaction — what team saves mask">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4}
            className="w-full border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-phosphor-green outline-none" />
          <button onClick={runPreview} className="mt-2 border border-phosphor-green px-3 py-1 text-phosphor-green hover:bg-phosphor-dim/30">
            preview
          </button>
          {preview && (
            <div className="mt-3 text-sm">
              <div className="mb-1 flex flex-wrap gap-1">
                {Object.entries(preview.byType).map(([k, v]) => (
                  <Badge key={k} tone="amber">{k}×{v}</Badge>
                ))}
                {preview.count === 0 && <span className="text-phosphor-dim">nothing sensitive detected</span>}
              </div>
              <pre className="whitespace-pre-wrap text-phosphor-gray">{preview.redactedText}</pre>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          {/* ── AI Provider Info ── */}
          <Panel title="ai provider">
            <div className="text-sm text-phosphor-gray">
              provider: <span className="text-phosphor-green">{health?.aiProvider || '…'}</span>
              <p className="mt-1 text-xs text-phosphor-dim">
                Set <code>WM_AI_PROVIDER=openai</code> + <code>OPENAI_API_KEY</code> in <code>.env</code> for GPT-4o-mini.
                Personal content is <strong>not</strong> redacted before sending to OpenAI.
                Team content is always redacted first.
              </p>
            </div>
          </Panel>

          {/* ── Rebuild Embeddings ── */}
          <Panel title="rebuild embeddings">
            <p className="text-xs text-phosphor-dim mb-2">
              Re-embeds all memories so tag searches work correctly. Run after changing AI provider or if search results seem wrong.
            </p>
            <button onClick={reindexMemories} disabled={reindexing}
              className="border border-phosphor-green px-3 py-1 text-phosphor-green hover:bg-phosphor-dim/30 disabled:opacity-50 text-sm">
              {reindexing ? 'reindexing…' : 'rebuild embeddings'}
            </button>
            {reindexResult && (
              <p className={`mt-2 text-xs ${reindexResult.startsWith('!') ? 'text-phosphor-red' : 'text-phosphor-green'}`}>
                {reindexResult}
              </p>
            )}
          </Panel>

          {/* ── Access Log ── */}
          <Panel title="access log — what the ai read">
            <ul className="max-h-72 space-y-1 overflow-auto text-sm">
              {log.map((e) => (
                <li key={e.id} className="flex items-center gap-2">
                  <Badge tone="gray">{e.router}</Badge>
                  <Badge tone={confidenceTone(e.confidence)}>{e.confidence}</Badge>
                  {e.scope && <Badge tone={e.scope === 'team' ? 'cyan' : 'green'}>{e.scope}</Badge>}
                  <span className="truncate text-phosphor-gray">{e.query}</span>
                </li>
              ))}
              {log.length === 0 && <li className="text-phosphor-dim">no queries yet.</li>}
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
