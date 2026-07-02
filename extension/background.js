// Service worker: owns all backend calls (no page CSP / mixed-content issues here).

const DEFAULTS = {
  backend: 'http://localhost:8080',
  scope: 'personal',
  teamName: '',
};

async function cfg() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return { ...DEFAULTS, ...stored };
}

async function call(path, body, method = 'POST') {
  const c = await cfg();
  const headers = {
    'Content-Type': 'application/json',
    'X-Scope': c.scope,
  };
  if (c.teamName) headers['X-Team'] = c.teamName;

  const res = await fetch(c.backend + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'wm-save',
    title: 'Save to Recall AI (Alt+W)',
    contexts: ['selection'],
  });
  chrome.contextMenus.create({
    id: 'wm-ask',
    title: 'Ask Recall AI (Alt+Shift+W)',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!info.selectionText) return;
  const mode = info.menuItemId === 'wm-ask' ? 'ask' : 'save';
  chrome.tabs.sendMessage(tab.id, { type: 'wm-context', mode, text: info.selectionText });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'wm-save') {
        const r = await call('/api/browser/capture', {
          mode: 'save',
          text: msg.text,
          url: msg.url,
          title: msg.title,
          tags: msg.tags || [],
        });
        sendResponse({ ok: true, data: r });

      } else if (msg.type === 'wm-ask') {
        const r = await call('/api/ask', { query: msg.text });
        sendResponse({ ok: true, data: r });

      } else if (msg.type === 'wm-note') {
        const r = await call('/api/notes', {
          title: msg.title,
          text: msg.text,
          tags: msg.tags || [],
        });
        sendResponse({ ok: true, data: r });

      } else if (msg.type === 'wm-save-answer') {
        const r = await call('/api/memories/save-answer', {
          question: msg.question,
          answer: msg.answer,
          tags: ['chrome-extension', 'qa'],
        });
        sendResponse({ ok: true, data: r });

      } else if (msg.type === 'wm-get-settings') {
        const c = await cfg();
        sendResponse({ ok: true, data: c });

      } else if (msg.type === 'wm-save-settings') {
        await chrome.storage.sync.set(msg.settings);
        sendResponse({ ok: true });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});
