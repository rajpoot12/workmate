import { useEffect, useRef, useState } from 'react';
import { api, getScope, setTeam } from '../api.js';
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
  const label =
    status === 'testing' ? 'testing…'
    : status === 'ok'    ? '✓ connected'
    : status === 'fail'  ? '✗ failed'
    : 'test connection';
  const tone =
    status === 'ok'   ? 'text-phosphor-green border-phosphor-green'
    : status === 'fail' ? 'text-phosphor-red border-red-700'
    : 'text-phosphor-gray border-phosphor-dim';
  return (
    <button
      onClick={onClick}
      disabled={status === 'testing'}
      className={`border px-3 py-1 text-xs ${tone}
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
// Constants
// ---------------------------------------------------------------------------
const POLL_INTERVAL = 2000;
const POLL_TIMEOUT  = 60000;

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
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
  const [personalHost,       setPersonalHost]       = useState('localhost');
  const [personalPort,       setPersonalPort]       = useState('5433');
  const [personalDatabase,   setPersonalDatabase]   = useState('workmemory');
  const [personalUsername,   setPersonalUsername]   = useState('workmemory');
  const [personalPassword,   setPersonalPassword]   = useState('');
  const [personalTestStatus, setPersonalTestStatus] = useState('');
  const [personalTestError,  setPersonalTestError]  = useState('');

  // ── Team DB ────────────────────────────────────────────────────────────
  const [teamEnabled,    setTeamEnabled]    = useState(false);
  const [teamName,       setTeamName]       = useState('');
  const [teamHost,       setTeamHost]       = useState('');
  const [teamPort,       setTeamPort]       = useState('5432');
  const [teamDatabase,   setTeamDatabase]   = useState('workmemory');
  const [teamUsername,   setTeamUsername]   = useState('workmemory');
  const [teamPassword,   setTeamPassword]   = useState('');
  const [teamTestStatus, setTeamTestStatus] = useState('');
  const [teamTestError,  setTeamTestError]  = useState('');

  // ── Save / restart state ───────────────────────────────────────────────
  const [saving,     setSaving]     = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'restarting' | 'done' | 'error'
  const [saveError,  setSaveError]  = useState('');

  // ── Standalone restart button state ───────────────────────────────────
  const [restarting,     setRestarting]     = useState(false);
  const [restartStatus,  setRestartStatus]  = useState(''); // '' | 'restarting' | 'done' | 'error'
  const [restartError,   setRestartError]   = useState('');

  const pollTimer = useRef(null);

  // ── Advanced section ───────────────────────────────────────────────────
  const [advancedOpen,  setAdvancedOpen]  = useState(false);
  const [log,           setLog]           = useState([]);
  const [reindexResult, setReindexResult] = useState(null);
  const [reindexing,    setReindexing]    = useState(false);

  // ── Load settings from backend ─────────────────────────────────────────
  function loadSettings() {
    api.settings().then(s => {
      setAiProvider(s.aiProvider || 'local');
      // Only update API key field if it's not currently a real value the user typed
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
      // Sync team name to localStorage so the X-Team header is sent correctly
      if (s.teamEnabled && s.teamName) setTeam(s.teamName);
      setTeamHost(s.teamHost || '');
      setTeamPort(s.teamPort || '5432');
      setTeamDatabase(s.teamDatabase || 'workmemory');
      setTeamUsername(s.teamUsername || 'workmemory');
      setTeamPassword(s.teamPassword || '');
    }).catch(() => {});
    api.accessLog().then(setLog).catch(() => {});
  }

  useEffect(() => { loadSettings(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── Poll until backend is healthy, then call onBack ───────────────────
  function pollUntilHealthy(onBack, onTimeout) {
    clearInterval(pollTimer.current);
    const deadline = Date.now() + POLL_TIMEOUT;
    // Give backend a few seconds to actually go down before we start polling
    setTimeout(() => {
      pollTimer.current = setInterval(async () => {
        if (Date.now() > deadline) {
          clearInterval(pollTimer.current);
          onTimeout();
          return;
        }
        try {
          const res = await fetch('/api/health');
          if (res.ok) {
            clearInterval(pollTimer.current);
            onBack();
          }
        } catch (_) {
          // Backend still restarting — keep polling
        }
      }, POLL_INTERVAL);
    }, 4000); // wait 4s for backend to start shutting down
  }

  useEffect(() => () => clearInterval(pollTimer.current), []);

  // ── Test connections ───────────────────────────────────────────────────
  async function testAi() {
    setAiTestStatus('testing'); setAiTestError('');
    try {
      const r = await api.testConnection({
        type: 'openai', apiKey: openaiApiKey, baseUrl: openaiBaseUrl,
      });
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
    setSaving(true); setSaveStatus('saving'); setSaveError('');
    try {
      await api.saveSettings({
        aiProvider, openaiApiKey, openaiBaseUrl, openaiChatModel, openaiEmbeddingModel,
        personalHost, personalPort, personalDatabase, personalUsername, personalPassword,
        teamEnabled, teamName, teamHost, teamPort, teamDatabase, teamUsername, teamPassword,
      });
      setSaveStatus('restarting');
      pollUntilHealthy(
        () => { setSaveStatus('done'); setSaving(false); loadSettings(); },
        () => {
          setSaveStatus('error');
          setSaveError('Backend did not come back in time. Click "Restart Backend" below to retry.');
          setSaving(false);
        }
      );
    } catch (e) {
      setSaveStatus('error'); setSaveError(e.message || 'Save failed — backend may be down'); setSaving(false);
    }
  }

  // ── Standalone restart backend ─────────────────────────────────────────
  async function restartBackend() {
    setRestarting(true); setRestartStatus('restarting'); setRestartError('');
    try {
      // Fire-and-forget — backend will kill itself and restart
      fetch('/api/settings/restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {}); // ignore — connection will drop when backend restarts
    } catch (_) {}

    pollUntilHealthy(
      () => { setRestartStatus('done'); setRestarting(false); loadSettings(); },
      () => {
        setRestartStatus('error');
        setRestartError('Backend did not come back. Open a terminal and run: ./wm.sh restart backend');
        setRestarting(false);
      }
    );
  }

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

      {/* ── Restart Backend button — always visible at top ── */}
      <div className="border border-phosphor-dim bg-phosphor-bg/40 px-4 py-3 flex items-center gap-4">
        <div className="flex-1">
          <p className="text-xs text-phosphor-dim uppercase tracking-widest mb-0.5">Backend Engine</p>
          <p className="text-[11px] text-phosphor-dim">
            {restartStatus === 'restarting'
              ? 'Restarting — usually takes 15–25 seconds…'
              : restartStatus === 'done'
              ? '✓ Backend is back online'
              : restartStatus === 'error'
              ? `! ${restartError}`
              : 'Restart the backend to apply new settings or if the app seems stuck.'}
          </p>
        </div>
        <button
          onClick={restartBackend}
          disabled={restarting || saving}
          className="border border-phosphor-dim px-4 py-2 text-xs text-phosphor-green
            hover:border-phosphor-green disabled:opacity-40 transition-colors whitespace-nowrap"
        >
          {restarting ? '⟳ restarting…' : '⟳ Restart Backend'}
        </button>
      </div>

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
            <Field label="API Key" hint="Starts with sk-  — saved in the .env file on this machine only.">
              <Input type="password" value={openaiApiKey} onChange={v => { setOpenaiApiKey(v); setAiTestStatus(''); }}
                placeholder="sk-…" />
            </Field>
            <Field label="Base URL (leave default unless using Azure or custom endpoint)">
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
            <div className="flex items-center gap-3 flex-wrap">
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
                <Input value={personalHost}
                  onChange={v => { setPersonalHost(v); setPersonalTestStatus(''); }} />
              </Field>
            </div>
            <Field label="Port">
              <Input value={personalPort}
                onChange={v => { setPersonalPort(v); setPersonalTestStatus(''); }} />
            </Field>
          </div>
          <Field label="Database name">
            <Input value={personalDatabase}
              onChange={v => { setPersonalDatabase(v); setPersonalTestStatus(''); }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <Input value={personalUsername}
                onChange={v => { setPersonalUsername(v); setPersonalTestStatus(''); }} />
            </Field>
            <Field label="Password">
              <Input type="password" value={personalPassword}
                onChange={v => { setPersonalPassword(v); setPersonalTestStatus(''); }} />
            </Field>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
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
            onChange={e => { setTeamEnabled(e.target.checked); setTeamTestStatus(''); }}
            className="accent-[#33ff77]" />
          <span className="text-phosphor-green">Enable team features</span>
          <span className="text-phosphor-dim text-xs ml-1">— connect to a shared team database</span>
        </label>

        {teamEnabled && (
          <div className="space-y-3 border-l-2 border-phosphor-dim pl-4">
            <Field label="Team name" hint="Used to label memories. e.g. franconnect-ops">
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
              <Input value={teamDatabase}
                onChange={v => { setTeamDatabase(v); setTeamTestStatus(''); }} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <Input value={teamUsername}
                  onChange={v => { setTeamUsername(v); setTeamTestStatus(''); }} />
              </Field>
              <Field label="Password">
                <Input type="password" value={teamPassword}
                  onChange={v => { setTeamPassword(v); setTeamTestStatus(''); }} />
              </Field>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <TestButton onClick={testTeamDb} status={teamTestStatus} />
              {teamTestStatus === 'fail' && teamTestError && (
                <span className="text-xs text-phosphor-red">! {teamTestError}</span>
              )}
            </div>
          </div>
        )}
      </Panel>

      {/* ── Save & Apply ── */}
      <div className="border border-phosphor-dim p-4">
        <p className="text-xs text-phosphor-dim mb-3">
          Saves all settings above and restarts the backend so they take effect immediately.
          Takes about 20 seconds.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={saveAndApply}
            disabled={saving || restarting}
            className="border border-phosphor-green px-5 py-2 text-sm text-phosphor-green
              hover:bg-phosphor-dim/30 disabled:opacity-50 transition-colors"
          >
            {saving ? 'saving…' : 'Save & Apply'}
          </button>

          {(saveStatus === 'saving' || saveStatus === 'restarting') && (
            <span className="text-sm text-phosphor-amber">
              {saveStatus === 'saving'
                ? 'Writing settings…'
                : '⟳ Restarting backend — about 20 seconds…'}
            </span>
          )}
          {saveStatus === 'done' && (
            <span className="text-sm text-phosphor-green">
              ✓ Applied. WorkMemory is ready.
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-sm text-phosphor-red">
              ! {saveError}
            </span>
          )}
        </div>
      </div>

      {/* ── Advanced ── */}
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
