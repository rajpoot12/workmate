const DEFAULTS = { backend: 'http://localhost:8080', scope: 'personal', teamName: '' };

const $ = (id) => document.getElementById(id);

// ── Tabs ────────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    $('pane-' + btn.dataset.tab).classList.add('active');
  });
});

// ── Scope toggle ─────────────────────────────────────────────────────────────
let currentScope = 'personal';

async function loadState() {
  const c = await chrome.storage.sync.get(DEFAULTS);
  currentScope = c.scope || 'personal';
  $('backend').value = c.backend;
  $('teamName').value = c.teamName || '';
  renderScope();
  // Autofocus the question field since Ask is the default tab
  setTimeout(() => $('question').focus(), 80);
}
loadState();

// ── Theme — configured once in the web app's Config page, applied here too ──
chrome.runtime.sendMessage({ type: 'wm-get-theme' }, (r) => {
  const theme = r && r.ok ? r.data.theme : 'dev';
  document.body.classList.toggle('theme-friendly', theme === 'friendly');
});

function renderScope() {
  const badge = $('scopeBadge');
  badge.textContent = currentScope;
  badge.className = 'scope-badge' + (currentScope === 'team' ? ' team' : '');
}

$('scopeBadge').addEventListener('click', async () => {
  currentScope = currentScope === 'personal' ? 'team' : 'personal';
  await chrome.storage.sync.set({ scope: currentScope });
  renderScope();
});

// ── Settings ─────────────────────────────────────────────────────────────────
$('saveCfg').addEventListener('click', async () => {
  await chrome.storage.sync.set({
    backend: $('backend').value.trim(),
    teamName: $('teamName').value.trim(),
  });
  setMsg('cfgMsg', 'saved', 'ok');
});

// ── Save note ─────────────────────────────────────────────────────────────────
$('saveBtn').addEventListener('click', () => {
  const text = $('text').value.trim();
  if (!text) return;
  setMsg('saveMsg', 'saving…', '');
  $('saveBtn').disabled = true;

  chrome.runtime.sendMessage(
    {
      type: 'wm-note',
      title: $('title').value.trim(),
      text,
      tags: $('tags').value.split(',').map((t) => t.trim()).filter(Boolean),
    },
    (r) => {
      $('saveBtn').disabled = false;
      if (!r || !r.ok) {
        setMsg('saveMsg', '! ' + (r ? r.error : 'no backend'), 'err');
        return;
      }
      const masked = r.data.redactionCount > 0 ? ` (${r.data.redactionCount} masked)` : '';
      setMsg('saveMsg', 'saved' + masked, r.data.redactionCount > 0 ? 'amber' : 'ok');
      $('title').value = '';
      $('text').value = '';
      $('tags').value = '';
    }
  );
});

// ── Ask ───────────────────────────────────────────────────────────────────────
let lastAskResult = null;

$('question').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doAsk(); }
});
$('askBtn').addEventListener('click', doAsk);

function doAsk() {
  const q = $('question').value.trim();
  if (!q) return;
  setMsg('askMsg', 'searching…', '');
  $('askBtn').disabled = true;
  $('answerBox').classList.remove('visible');
  $('saveAnswerBtn').style.display = 'none';
  $('copyAnswerBtn').style.display = 'none';
  lastAskResult = null;

  chrome.runtime.sendMessage({ type: 'wm-ask', text: q }, (r) => {
    $('askBtn').disabled = false;
    if (!r || !r.ok) {
      setMsg('askMsg', '! ' + (r ? r.error : 'no backend'), 'err');
      return;
    }
    setMsg('askMsg', '', '');
    lastAskResult = r.data;
    renderAnswer(r.data, q);
  });
}

function renderAnswer(d, question) {
  const box = $('answerBox');
  box.classList.add('visible');

  // Badges
  const confColor = { high: 'ok', medium: 'amber', low: '', none: '' }[d.confidence] || '';
  $('answerBadges').innerHTML =
    `<span class="badge ${confColor}">${d.confidence}</span>` +
    `<span class="badge">${d.router}</span>`;

  // Copy button
  const copyBtn = $('copyAnswerBtn');
  copyBtn.style.display = 'inline-block';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(d.answer || '').then(() => {
      copyBtn.textContent = '✓ copied';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'copy'; copyBtn.classList.remove('copied'); }, 1800);
    });
  };

  // Answer text
  $('answerText').textContent = d.answer || '(no answer)';

  // Sources
  const meta = $('answerMeta');
  meta.innerHTML = '';
  (d.sources || []).slice(0, 3).forEach((s) => {
    const row = document.createElement('div');
    row.className = 'source-row';
    row.textContent = s.title + (s.quote ? ' — "' + s.quote.slice(0, 60) + '"' : '');
    meta.appendChild(row);
  });

  // Save answer button (only if answer is meaningful)
  if (d.confidence !== 'none' && (d.sources || []).length > 0) {
    $('saveAnswerBtn').style.display = 'inline-block';
    $('saveAnswerBtn').textContent = '⊕ save this answer';
    $('saveAnswerBtn').onclick = () => saveAnswer(question, d.answer);
  }
}

function saveAnswer(question, answer) {
  $('saveAnswerBtn').textContent = 'saving…';
  $('saveAnswerBtn').disabled = true;
  chrome.runtime.sendMessage(
    { type: 'wm-save-answer', question, answer },
    (r) => {
      if (!r || !r.ok) {
        $('saveAnswerBtn').textContent = '! failed';
      } else {
        $('saveAnswerBtn').textContent = '✓ saved';
      }
    }
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setMsg(id, text, cls) {
  const el = $(id);
  el.textContent = text;
  el.className = 'msg' + (cls ? ' ' + cls : '');
}
