// WorkMemory API client — scope is personal/team toggle, no login required.

const LS_SCOPE = 'wm_scope';
const LS_TEAM  = 'wm_team_name';

let currentScope = localStorage.getItem(LS_SCOPE) || 'personal';
let currentTeam  = localStorage.getItem(LS_TEAM)  || '';

export function getScope() { return currentScope; }
export function setScope(s) {
  currentScope = s;
  localStorage.setItem(LS_SCOPE, s);
}
export function getTeam() { return currentTeam; }
export function setTeam(t) {
  currentTeam = t;
  localStorage.setItem(LS_TEAM, t);
}

function headers(extra = {}) {
  const h = {
    'X-Scope': currentScope,
    ...extra,
  };
  if (currentTeam) h['X-Team'] = currentTeam;
  return h;
}

async function json(res) {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const b = await res.json();
      msg = b.error || JSON.stringify(b);
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  health: () => fetch('/api/health').then(json),

  tags: () => fetch('/api/tags', { headers: headers() }).then(json),

  ask: (query) =>
    fetch('/api/ask', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ query }),
    }).then(json),

  memories: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v != null && v !== '')
    ).toString();
    return fetch('/api/memories' + (q ? '?' + q : ''), { headers: headers() }).then(json);
  },
  memory: (id) => fetch('/api/memories/' + id, { headers: headers() }).then(json),

  createNote: (body) =>
    fetch('/api/notes', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(json),

  upload: (file, tags) => {
    const fd = new FormData();
    fd.append('file', file);
    if (tags) fd.append('tags', tags);
    return fetch('/api/files/upload', { method: 'POST', headers: headers(), body: fd }).then(json);
  },

  scan: (rootDir, indexContent) =>
    fetch('/api/files/scan', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ rootDir, indexContent }),
    }).then(json),

  deleteMemory: (id) =>
    fetch(`/api/memories/${id}`, { method: 'DELETE', headers: headers() }).then(json),

  saveAnswer: (question, answer, tags) =>
    fetch('/api/memories/save-answer', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question, answer, tags }),
    }).then(json),

  accessLog: () => fetch('/api/access-log', { headers: headers() }).then(json),

  redactPreview: (text) =>
    fetch('/api/redact/preview', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ text }),
    }).then(json),

  settings: () =>
    fetch('/api/settings', { headers: headers() }).then(json),

  saveSettings: (body) =>
    fetch('/api/settings', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(json),

  testConnection: (body) =>
    fetch('/api/settings/test', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }).then(json),

  restartBackend: () =>
    fetch('/api/settings/restart', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
    }).then(json),

  // Theme is the single source of truth for web app, browser extension, and floater.
  getTheme: () => fetch('/api/theme').then(json),
  setTheme: (theme) =>
    fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme }),
    }).then(json),
};
