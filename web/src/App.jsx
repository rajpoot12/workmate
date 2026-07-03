import { useEffect, useState, useCallback } from 'react';
import { api, getScope, setScope, getTeam, setTeam } from './api.js';
import { useTheme } from './theme.js';
import Ask from './components/Ask.jsx';
import Library from './components/Library.jsx';
import Capture from './components/Capture.jsx';
import Configuration from './components/Configuration.jsx';
import CommandPalette from './components/CommandPalette.jsx';

const TABS = ['ask', 'library', 'capture', 'config'];

// Tab labels per theme
const TAB_LABELS = {
  dev:      { ask: 'ASK', library: 'LIBRARY', capture: 'CAPTURE', config: 'CONFIG' },
  friendly: { ask: 'Search', library: 'My Notes', capture: 'Add Note', config: 'Settings' },
};

export default function App() {
  const [tab, setTab] = useState('ask');
  const [scope, setScopeState] = useState(getScope());
  const [health, setHealth] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme] = useTheme();

  useEffect(() => {
    api.health().then(h => {
      setHealth(h);
      // Keep localStorage team name in sync with what the backend has configured.
      // This runs on every page load so the X-Team header is always correct.
      if (h.teamName) setTeam(h.teamName);
    }).catch(() => {});
  }, []);

  // Ctrl+K / Cmd+K opens the command palette
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function toggleScope() {
    const next = scope === 'personal' ? 'team' : 'personal';
    setScope(next);
    setScopeState(next);
  }

  const teamName = getTeam();
  const isTeam = scope === 'team';
  const teamOnline = health?.team === 'up';
  const teamEnabled = health?.teamEnabled;
  const friendly = theme === 'friendly';
  const labels = TAB_LABELS[theme] || TAB_LABELS.dev;

  if (friendly) {
    return (
      <div className="min-h-full bg-friendly-bg font-sans">
        {paletteOpen && <CommandPalette onClose={closePalette} />}

        {/* Friendly header */}
        <header className="bg-friendly-surface border-b border-friendly-border sticky top-0 z-10">
          <div className="mx-auto max-w-4xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-friendly-accent flex items-center justify-center">
                <span className="text-white font-bold text-sm">R</span>
              </div>
              <span className="font-semibold text-friendly-text text-sm">Recall AI</span>
            </div>

            {/* Scope toggle */}
            <div className="flex items-center gap-2">
              <button onClick={toggleScope}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors
                  ${!isTeam
                    ? 'bg-friendly-accentBg text-friendly-accent'
                    : 'text-friendly-muted hover:bg-friendly-border'}`}>
                Personal
              </button>
              <button onClick={toggleScope}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors
                  ${isTeam
                    ? 'bg-friendly-cyanBg text-friendly-cyan'
                    : 'text-friendly-muted hover:bg-friendly-border'}`}>
                Team{teamName ? ` (${teamName})` : ''}
              </button>
              {isTeam && teamEnabled && (
                <span className={`text-[10px] font-medium ${teamOnline ? 'text-friendly-green' : 'text-friendly-red'}`}>
                  {teamOnline ? '● online' : '● offline'}
                </span>
              )}
              {isTeam && !teamEnabled && (
                <span className="text-[10px] text-friendly-amber">● not configured</span>
              )}
            </div>
          </div>

          {/* Tab bar */}
          <div className="mx-auto max-w-4xl px-4 flex">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                  ${tab === t
                    ? 'border-friendly-accent text-friendly-accent'
                    : 'border-transparent text-friendly-muted hover:text-friendly-text'}`}>
                {labels[t]}
              </button>
            ))}
            {isTeam && (
              <span className="ml-auto self-center text-[10px] text-friendly-cyan bg-friendly-cyanBg rounded-full px-2 py-0.5 font-medium">
                Team mode
              </span>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-4xl px-4 py-6">
          {tab === 'ask'     && <Ask scope={scope} />}
          {tab === 'library' && <Library scope={scope} />}
          {tab === 'capture' && <Capture scope={scope} />}
          {tab === 'config'  && <Configuration health={health} />}
        </main>

        <footer className="mt-8 border-t border-friendly-border py-4 text-center text-[11px] text-friendly-muted">
          {isTeam
            ? 'Team mode — searches team memory only · content redacted before storage · every answer cited'
            : 'Personal mode — searches your memory · every answer cited'}
        </footer>
      </div>
    );
  }

  // ── Developer / terminal theme (default) ──────────────────────────────────
  return (
    <div className="crt min-h-full">
      {paletteOpen && <CommandPalette onClose={closePalette} />}
      <div className="mx-auto max-w-4xl px-4 py-6">
        {/* terminal title bar */}
        <header className="mb-5 border border-phosphor-dim bg-phosphor-panel">
          <div className="flex items-center gap-2 border-b border-phosphor-dim px-3 py-1.5">
            <span className="h-3 w-3 rounded-full bg-phosphor-red" />
            <span className="h-3 w-3 rounded-full bg-phosphor-amber" />
            <span className="h-3 w-3 rounded-full bg-phosphor-green" />
            <span className="ml-2 text-xs text-phosphor-gray">recall ai — ai memory layer for work</span>
            <button onClick={() => setPaletteOpen(true)}
              className="ml-2 border border-phosphor-dim px-2 py-px text-[10px] text-phosphor-dim hover:text-phosphor-green hover:border-phosphor-green">
              Ctrl+K
            </button>
            <span className="ml-auto text-xs text-phosphor-dim">
              {health ? `● ${health.status}` : '○ connecting'}
            </span>
          </div>

          {/* compact logo + scope toggle */}
          <div className="flex items-center justify-between px-3 py-2">
            <span className="font-bold text-phosphor-green glow text-sm tracking-widest">
              ▚ RA<span className="text-[10px] font-normal text-phosphor-dim ml-1">recall ai</span>
            </span>

            {/* Personal / Team toggle */}
            <div className="flex items-center gap-2 text-xs">
              <span className={`${!isTeam ? 'text-phosphor-green glow' : 'text-phosphor-dim'}`}>personal</span>
              <button
                onClick={toggleScope}
                title={isTeam ? 'Switch to Personal' : 'Switch to Team'}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-none border transition-colors
                  ${isTeam ? 'border-phosphor-cyan bg-phosphor-dim/40' : 'border-phosphor-green bg-phosphor-dim/20'}`}
              >
                <span className={`inline-block h-4 w-4 transform transition-transform mt-[1px]
                  ${isTeam ? 'translate-x-4 bg-phosphor-cyan' : 'translate-x-[1px] bg-phosphor-green'}`} />
              </button>
              <span className={`${isTeam ? 'text-phosphor-cyan' : 'text-phosphor-dim'}`}>
                team{teamName ? ` (${teamName})` : ''}
              </span>
              {isTeam && teamEnabled && (
                <span className={`text-[10px] ${teamOnline ? 'text-phosphor-green' : 'text-phosphor-red'}`}>
                  {teamOnline ? '● online' : '● offline'}
                </span>
              )}
              {isTeam && !teamEnabled && (
                <span className="text-[10px] text-phosphor-amber">● not configured</span>
              )}
            </div>
          </div>
        </header>

        {/* nav tabs */}
        <nav className="mb-5 flex flex-wrap items-center gap-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`border px-3 py-1 uppercase tracking-wider ${
                tab === t
                  ? 'border-phosphor-green text-phosphor-green glow'
                  : 'border-phosphor-dim text-phosphor-gray hover:text-phosphor-green'
              }`}
            >
              {labels[t]}
            </button>
          ))}
          {isTeam && (
            <span className="ml-2 border border-phosphor-cyan px-2 py-1 text-[10px] uppercase tracking-wider text-phosphor-cyan">
              team mode — saves will be redacted
            </span>
          )}
        </nav>

        <main>
          {tab === 'ask'     && <Ask scope={scope} />}
          {tab === 'library' && <Library scope={scope} />}
          {tab === 'capture' && <Capture scope={scope} />}
          {tab === 'config'  && <Configuration health={health} />}
        </main>

        <footer className="mt-8 border-t border-phosphor-dim pt-3 text-center text-[10px] text-phosphor-dim">
          {isTeam
            ? 'team mode — ask searches team only · redacted before storage · every answer cited'
            : 'personal (raw) · ask searches personal + team · every answer cited'}
        </footer>
      </div>
    </div>
  );
}
