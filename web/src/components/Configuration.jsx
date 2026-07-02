import { useEffect, useRef, useState } from 'react';
import { api, getScope } from '../api.js';
import { Badge, Panel, confidenceTone } from './ui.jsx';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="block text-xs text-phosphor-dim mb-1">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-phosphor-dim">{hint}</p>}
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder = '', disabled = false }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full border border-phosphor-dim bg-phosphor-bg px-2 py-1 text-sm text-phosphor-green outline-none
        disabled:opacity-40 focus:border-phosphor-green"
    />
  );
}

function TestButton({ onClick, status }) {
  const label = status === 'testing' ? 'testing…'
    : status === 'ok'   ? '✓ connected'
    : status === 'fail' ? '✗ failed'
    : 'test connection';
  const tone = status === 'ok'   ? 'text-phosphor-green'
    : status === 'fail' ? 'text-phosphor-red'
    : 'text-phosphor-gray';
  return (
    <button
      onClick={onClick}
      disabled={status === 'testing'}
      className={`border border-phosphor-dim px-3 py-1 text-xs ${tone}
        hover:border-phosphor-green hover:text-phosphor-green disabled:opacity-50 transition-colors`}
    >
      {label}
    </button>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 className="text-xs uppercase tracking-widest text-phosphor-dim mb-3">{children}</h3>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const POLL_INTERVAL = 2000;
const POLL_TIMEOUT  = 45000;

export default function Configuration({ health }) {
  // ── AI Engine ──────────────────────────────────────────────────────────
  const [aiProvider,           setAiProvider]           = useState('local');
  const [openaiApiKey,         setOpenaiApiKey]         = useState('');
  const [openaiBaseUrl,        setOpenaiBaseUrl]        = useState('https://api.openai.com/v1');
  const [openaiChatModel,      setOpenaiChatModel]      = useState('gpt-4o-mini');
  const [openaiEmbeddingModel, setOpenaiEmbeddingModel] = useState('text-embedding-3-small');
  const [aiTestStatus,         setAiTestStatus]         = useState('');
  const [aiTestError,          setAiTestError]          = useState('');

  // ── Personal DB ────────────────────────────────────────────────────────
  const [personalHost,     setPersonalHost]     = useState('localhost');
  const [personalPort,     setPersonalPort]     = useState('5433');
  const [personalDatabase, setPersonalDatabase] = useState('workmemory');
  const [personalUsername, setPersonalUsername] = useState('workmemory');
  const [personalPassword, setPersonalPassword] = useState('');
  const [personalTestStatus, setPersonalTestStatus] = useState('');
  const [personalTestError,  setPersonalTestError]  = useState('');

  // ── Team DB ────────────────────────────────────────────────────────────
  const [teamEnabled,  setTeamEnabled]  = useState(false);
  const [teamName,     setTeamName]     = useState('');
  const [teamHost,     setTeamHost]     = useState('');
  const [teamPort,     setTeamPort]     = useState('5432');
  const [teamDatabase, setTeamDatabase] = useState('workmemory');
  const [teamUsername, setTeamUsername] = useState('workmemory');
  const [teamPassword, setTeamPassword] = useState('');
  const [teamTestStatus, setTeamTestStatus] = useState('');
  const [teamTestError,  setTeamTestError]  = useState('');

  // guard: once settings are loaded from API, don't overwrite user edits
  const settingsLoaded = useRef(false);

  // ── Save / restart state ───────────────────────────────────────────────
  const [saving,      setSaving]      = useState(false);
  const [saveStatus,  setSaveStatus]  = useState(''); // '' | 'restarting' | 'done' | 'error'
  const [saveError,   setSaveError]   = useState('');
  const pollTimer = useRef(null);

  // ── Advanced section (privacy legacy) ─────────────────────────────────
  const [advancedOpen,    setAdvancedOpen]    = useState(false);
  const [log,             setLog]             = useState([]);
  const [reindexResult,   setReindexResult]   = useState(null);
  const [reindexing,      setReindexing]      = useState(false);

  // ── Load current settings ──────────────────────────────────────────────
  useEffect(() => {
    api.settings().then(s => {
      // Only populate form on first load — never overwrite user edits
      if (settingsLoaded.current) return;
      settingsLoaded.current = true;

      setAiProvider(s.aiProvider || 'local');
      setOpenaiApiKey(s.openaiApiKey || '');
      setOpenaiBaseUrl(s.openaiBaseUrl || 'https://api.openai.com/v1');
      setOpenaiChatModel(s.openaiChatModel || 'gpt-4o-mini');
      setOpenaiEmbeddingModel(s.openaiEmbeddingModel || 'text-embedding-3-small');

      setPersonalHost(s.personalHost || 'localhost');
      setPersonalPort(s.personalPort || '5433');
      setPersonalDatabase(s.personalDatabase || 'workmemory');
      setPersonalUsername(s.personalUsername || 'workmemory');
      setPersonalPassword(s.personalPassword || '');

      setTeamEnabled(!!s.teamEnabled);
      setTeamName(s.teamName || '');
      setTeamHost(s.teamHost || '');
      setTeamPort(s.teamPort || '5432');
      setTeamDatabase(s.teamDatabase || 'workmemory');
      setTeamUsername(s.teamUsername || 'workmemory');
      setTeamPassword(s.teamPassword || '');
    }).catch(() => {});

    api.accessLog().then(setLog).catch(() => {});
  }, []);

  // ── Test connections ───────────────────────────────────────────────────
  async function testAi() {
    setAiTestStatus('testing'); setAiTestError('');
    try {
      const r = await api.testConnection({ type: 'openai', apiKey: openaiApiKey, baseUrl: openaiBaseUrl });
      setAiTestStatus(r.ok ? 'ok' : 'fail');
      if (!r.ok) setAiTestError(r.error || 'Connection failed');
    } catch (e) {
      setAiTestStatus('fail'); setAiTestError(e.message);
    }
  }

  async function testPersonalDb() {
    setPersonalTestStatus('testing'); setPersonalTestError('');
    try {
      const r = await api.testConnection({
        type: 'personal-db', host: personalHost, port: personalPort,
        database: personalDatabase, username: personalUsername, password: personalPassword,
      });
      setPersonalTestStatus(r.ok ? 'ok' : 'fail');
      if (!r.ok) setPersonalTestError(r.error || 'Connection failed');
    } catch (e) {
      setPersonalTestStatus('fail'); setPersonalTestError(e.message);
    }
  }

  async function testTeamDb() {
    setTeamTestStatus('testing'); setTeamTestError('');
    try {
      const r = await api.testConnection({
        type: 'team-db', host: teamHost, port: teamPort,
        database: teamDatabase, username: teamUsername, password: teamPassword,
      });
      setTeamTestStatus(r.ok ? 'ok' : 'fail');
      if (!r.ok) setTeamTestError(r.error || 'Connection failed');
    } catch (e) {
      setTeamTestStatus('fail'); setTeamTestError(e.message);
    }
  }

  // ── Save & Apply ───────────────────────────────────────────────────────
  async function saveAndApply() {
    setSaving(true); setSaveStatus('restarting'); setSaveError('');
    try {
      await api.saveSettings({
        aiProvider, openaiApiKey, openaiBaseUrl, openaiChatModel, openaiEmbeddingModel,
        personalHost, personalPort, personalDatabase, personalUsername, personalPassword,
        teamEnabled, teamName, teamHost, teamPort, teamDatabase, teamUsername, teamPassword,
      });
      // Poll health until backend is back up
      const deadline = Date.now() + POLL_TIMEOUT;
      pollTimer.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(pollTimer.current);
          setSaveStatus('error');
          setSaveError('Backend did not restart in time. Check logs and try again.');
          setSaving(false);
          return;
        }
        try {
          await fetch('/api/health');
          clearInterval(pollTimer.current);
          setSaveStatus('done');
          setSaving(false);
        } catch (_) {
          // still restarting, keep polling
        }
      }, POLL_INTERVAL);
    } catch (e) {
      setSaveStatus('error'); setSaveError(e.message); setSaving(false);
    }
  }

  // Clean up poll on unmount
  useEffect(() => () => clearInterval(pollTimer.current), []);

  async function reindexMemories() {
    setReindexing(true); setReindexResult(null);
    try {
      const r = await fetch('/api/memories/reindex', {
        method: 'POST', headers: { 'X-Scope': getScope() },
      }).then(res => res.json());
      setReindexResult(`✓ reindexed ${r.reindexed}/${r.total} memories`);
    } catch (e) {
      setReindexResult('! reindex failed: ' + e.message);
    } finally {
      setReindexing(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── AI Engine ── */}
      <Panel title="AI engine">
        <SectionTitle>choose how WorkMemory generates answers</SectionTitle>

        <div className="space-y-2 text-sm">
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="ai" value="local" checked={aiProvider === 'local'}
              onChange={() => setAiProvider('local')}
              className="mt-0.5 accent-[#33ff77]" />
            <div>
              <span className="text-phosphor-green">Built-in</span>
              <span className="ml-2 text-phosphor-dim text-xs">works offline · no API key · good for finding exact scripts</span>
            </div>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input type="radio" name="ai" value="openai" checked={aiProvider === 'openai'}
              onChange={() => setAiProvider('openai')}
              className="mt-0.5 accent-[#33ff77]" />
            <div>
              <span className="text-phosphor-green">OpenAI</span>
              <span className="ml-2 text-phosphor-dim text-xs">GPT-4o-mini · smarter answers · requires API key</span>
            </div>
          </label>
        </div>

        {aiProvider === 'openai' && (
          <div className="mt-4 space-y-3 border-l-2 border-phosphor-dim pl-4">
            <Field label="API Key" hint="Starts with sk-  — saved securely in the .env file on this machine.">
              <Input type="password" value={openaiApiKey} onChange={setOpenaiApiKey}
                placeholder="sk-..." />
            </Field>
            <Field label="Base URL (change only for Azure / custom endpoints)">
              <Input value={openaiBaseUrl} onChange={setOpenaiBaseUrl} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Chat model">
                <Input value={openaiChatModel} onChange={setOpenaiChatModel} placeholder="gpt-4o-mini" />
              </Field>
              <Field label="Embedding model">
                <Input value={openaiEmbeddingModel} onChange={setOpenaiEmbeddingModel}
                  placeholder="text-embedding-3-small" />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <TestButton onClick={testAi} status={aiTestStatus} />
              {aiTestStatus === 'fail' && aiTestError && (
                <span className="text-xs text-phosphor-red">! {aiTestError}</span>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* ── Personal Database ── */}
      <Panel title="personal database">
        <SectionTitle>your local memory store — always on this machine</SectionTitle>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="Host">
                <Input value={personalHost} onChange={v => { setPersonalHost(v); setPersonalTestStatus(''); }} />
              </Field>
            </div>
            <Field label="Port">
              <Input value={personalPort} onChange={v => { setPersonalPort(v); setPersonalTestStatus(''); }} />
            </Field>
          </div>
          <Field label="Database name">
            <Input value={personalDatabase} onChange={v => { setPersonalDatabase(v); setPersonalTestStatus(''); }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <Input value={personalUsername} onChange={v => { setPersonalUsername(v); setPersonalTestStatus(''); }} />
            </Field>
            <Field label="Password">
              <Input type="password" value={personalPassword}
                onChange={v => { setPersonalPassword(v); setPersonalTestStatus(''); }} />
            </Field>
          </div>
          <div className="flex items-center gap-3">
            <TestButton onClick={testPersonalDb} status={personalTestStatus} />
            {personalTestStatus === 'fail' && personalTestError && (
              <span className="text-xs text-phosphor-red">! {personalTestError}</span>
            )}
          </div>
        </div>
      </Panel>

      {/* ── Team Database ── */}
      <Panel title="team database">
        <SectionTitle>shared memory for your team — optional</SectionTitle>

        <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
          <input type="checkbox" checked={teamEnabled}
            onChange={e => setTeamEnabled(e.target.checked)}
            className="accent-[#33ff77]" />
          <span className="text-phosphor-green">Enable team features</span>
          <span className="text-phosphor-dim text-xs ml-1">— connect to a shared team database</span>
        </label>

        {teamEnabled && (
          <div className="space-y-3 border-l-2 border-phosphor-dim pl-4">
            <Field label="Team name" hint="Used to filter your team's memories. e.g. franconnect-ops">
              <Input value={teamName} onChange={setTeamName} placeholder="your-team-name" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Field label="Host (server IP or hostname)">
                  <Input value={teamHost} onChange={v => { setTeamHost(v); setTeamTestStatus(''); }}
                    placeholder="10.2.179.63" />
                </Field>
              </div>
              <Field label="Port">
                <Input value={teamPort} onChange={v => { setTeamPort(v); setTeamTestStatus(''); }} />
              </Field>
            </div>
            <Field label="Database name">
              <Input value={teamDatabase} onChange={v => { setTeamDatabase(v); setTeamTestStatus(''); }} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <Input value={teamUsername} onChange={v => { setTeamUsername(v); setTeamTestStatus(''); }} />
              </Field>
              <Field label="Password">
                <Input type="password" value={teamPassword}
                  onChange={v => { setTeamPassword(v); setTeamTestStatus(''); }} />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <TestButton onClick={testTeamDb} status={teamTestStatus} />
              {teamTestStatus === 'fail' && teamTestError && (
                <span className="text-xs text-phosphor-red">! {teamTestError}</span>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* ── Save & Apply ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={saveAndApply}
          disabled={saving}
          className="border border-phosphor-green px-5 py-2 text-sm text-phosphor-green
            hover:bg-phosphor-dim/30 disabled:opacity-50 transition-colors"
        >
          {saving ? 'saving…' : 'Save & Apply'}
        </button>

        {saveStatus === 'restarting' && (
          <span className="text-sm text-phosphor-amber glow-amber">
            Restarting backend — this takes ~10 seconds…
          </span>
        )}
        {saveStatus === 'done' && (
          <span className="text-sm text-phosphor-green glow">
            ✓ Applied. WorkMemory is ready.
          </span>
        )}
        {saveStatus === 'error' && (
          <span className="text-sm text-phosphor-red">
            ! {saveError}
          </span>
        )}
      </div>

      {/* ── Advanced (legacy privacy panel) ── */}
      <div className="border border-phosphor-dim">
        <button
          onClick={() => setAdvancedOpen(v => !v)}
          className="w-full flex items-center justify-between px-3 py-2 text-xs uppercase
            tracking-widest text-phosphor-dim hover:text-phosphor-green"
        >
          <span>{advancedOpen ? '▾' : '▸'} Advanced</span>
          <span className="normal-case tracking-normal text-[10px]">
            redaction preview · access log · rebuild embeddings
          </span>
        </button>

        {advancedOpen && (
          <div className="border-t border-phosphor-dim p-4 space-y-4">

            {/* Rebuild embeddings */}
            <div>
              <p className="text-xs text-phosphor-dim mb-2">
                Re-embeds all memories so search works correctly after switching AI engines.
              </p>
              <button onClick={reindexMemories} disabled={reindexing}
                className="border border-phosphor-green px-3 py-1 text-sm text-phosphor-green
                  hover:bg-phosphor-dim/30 disabled:opacity-50">
                {reindexing ? 'rebuilding…' : 'Rebuild search index'}
              </button>
              {reindexResult && (
                <p className={`mt-2 text-xs ${reindexResult.startsWith('!') ? 'text-phosphor-red' : 'text-phosphor-green'}`}>
                  {reindexResult}
                </p>
              )}
            </div>

            {/* Access log */}
            <div>
              <p className="text-xs uppercase tracking-widest text-phosphor-dim mb-2">
                Recent searches (what the AI read)
              </p>
              <ul className="max-h-60 space-y-1 overflow-auto text-sm">
                {log.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    <Badge tone={confidenceTone(e.confidence)}>{e.confidence}</Badge>
                    {e.scope && (
                      <Badge tone={e.scope === 'team' ? 'cyan' : 'green'}>{e.scope}</Badge>
                    )}
                    <span className="truncate text-phosphor-gray">{e.query}</span>
                  </li>
                ))}
                {log.length === 0 && (
                  <li className="text-phosphor-dim text-xs">no searches yet.</li>
                )}
              </ul>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
