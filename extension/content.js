// Grammarly-style in-page capture. Renders inside a shadow root so page CSS
// never leaks in. select text -> floating pill -> Save / Ask Recall AI.

(() => {
  if (window.__wmInjected) return;
  window.__wmInjected = true;

  const host = document.createElement('div');
  host.id = 'wm-host';
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    .wrap { font-family: 'JetBrains Mono', ui-monospace, Menlo, monospace; }
    .pill, .panel {
      position: absolute; background: #0e140e; color: #33ff77;
      border: 1px solid #1f7a3f; box-shadow: 0 0 0 1px #000, 0 6px 20px rgba(0,0,0,.5);
      z-index: 2147483647;
    }
    .pill { display: flex; gap: 6px; padding: 4px 6px; border-radius: 2px; }
    .pill button {
      all: unset; cursor: pointer; font-size: 11px; padding: 2px 8px;
      border: 1px solid #1f7a3f; color: #33ff77; text-transform: uppercase; letter-spacing: .08em;
    }
    .pill button:hover { background: #103016; }

    /* Panel */
    .panel { width: 340px; border-radius: 2px; font-size: 12px; overflow: hidden; }
    .panel-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 6px 10px; border-bottom: 1px solid #1f7a3f; background: #0a120a;
    }
    .panel-title { color: #7a8a7a; text-transform: uppercase; letter-spacing: .12em; font-size: 10px; }
    .panel-body { padding: 10px; }

    /* Close button — large hit target */
    .close-btn {
      all: unset; cursor: pointer;
      width: 24px; height: 24px;
      display: flex; align-items: center; justify-content: center;
      color: #7a8a7a; font-size: 14px; border-radius: 2px;
    }
    .close-btn:hover { color: #ff5f56; background: rgba(255,95,86,.1); }

    /* Content inside panel body */
    .answer { color: #33ff77; white-space: pre-wrap; line-height: 1.5; max-height: 200px; overflow: auto; }
    .src { color: #7a8a7a; border-left: 2px solid #1f7a3f; padding-left: 6px; margin-top: 6px; font-size: 11px; }
    .badge {
      display: inline-block; border: 1px solid #1f7a3f; padding: 0 4px;
      font-size: 9px; margin-right: 4px; text-transform: uppercase; color: #7a8a7a;
    }
    .muted { color: #7a8a7a; }
    .amber { color: #ffb000; border-color: #ffb000; }
    .red { color: #ff5f56; border-color: #ff5f56; }

    /* Pinned footer — always visible, never scrolls off screen */
    .panel-footer {
      display: flex; align-items: center; gap: 6px;
      padding: 6px 10px; border-top: 1px solid #1f7a3f; background: #0a120a;
    }
    .action-btn {
      all: unset; cursor: pointer; display: inline-flex; align-items: center;
      gap: 4px; padding: 3px 8px;
      border: 1px solid #1f7a3f; color: #7a8a7a;
      font-size: 10px; text-transform: uppercase; letter-spacing: .06em;
    }
    .action-btn:hover { color: #33ff77; border-color: #33ff77; }
    .action-btn.ok { color: #33ff77; border-color: #33ff77; }

    /* Save form */
    .save-form input[type=text] {
      all: unset; display: block; width: 100%; box-sizing: border-box;
      background: #080d08; color: #33ff77; border: 1px solid #1f7a3f;
      padding: 5px 8px; font: inherit; font-size: 11px; margin-top: 6px;
    }
    .save-form input[type=text]:focus { border-color: #33ff77; outline: none; }
    .save-form .preview {
      color: #4a6a4a; font-size: 10px; line-height: 1.4;
      max-height: 48px; overflow: hidden; margin-bottom: 2px;
    }
    .save-form .row { display: flex; gap: 6px; margin-top: 8px; }
    .save-form button {
      all: unset; cursor: pointer; font-size: 11px; padding: 3px 10px;
      border: 1px solid #1f7a3f; color: #33ff77; text-transform: uppercase;
    }
    .save-form button:hover { background: #103016; }
    .save-form button.cancel { color: #7a8a7a; }
  `;
  root.appendChild(style);

  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  root.appendChild(wrap);

  let pill = null;
  let panel = null;
  let lastSelection = '';

  function clearPill() {
    if (pill) { pill.remove(); pill = null; }
  }
  function clearPanel() {
    if (panel) { panel.remove(); panel = null; }
  }

  function selectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;
    return rect;
  }

  document.addEventListener('mouseup', () => {
    setTimeout(() => {
      const text = (window.getSelection() || '').toString().trim();
      const rect = selectionRect();
      if (!text || !rect || text.length > 5000) { clearPill(); return; }
      lastSelection = text;
      showPill(rect);
    }, 10);
  });

  // Click outside host → close pill AND panel
  document.addEventListener('mousedown', (e) => {
    const path = e.composedPath ? e.composedPath() : [];
    if (!path.includes(host)) {
      clearPill();
      clearPanel();
    }
  });

  // Escape → close panel
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { clearPanel(); clearPill(); return; }

    // Alt+W — instant save (no tag form, stays frictionless)
    if (e.altKey && !e.shiftKey && e.key === 'w') {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && text.length <= 5000) {
        lastSelection = text;
        const rect = selectionRect() || { top: 80, left: 40, bottom: 88 };
        doSaveImmediate(text, rect);
      }
    }

    // Alt+Shift+W → ask
    if (e.altKey && e.shiftKey && e.key === 'W') {
      e.preventDefault();
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && text.length <= 5000) {
        lastSelection = text;
        const rect = selectionRect() || { top: 80, left: 40, bottom: 88 };
        doAsk(text, rect);
      }
    }
  });

  function showPill(rect) {
    clearPill();
    pill = document.createElement('div');
    pill.className = 'pill';

    const save = document.createElement('button');
    save.textContent = '＋ Save';
    const ask = document.createElement('button');
    ask.textContent = '? Ask';
    pill.appendChild(save);
    pill.appendChild(ask);
    wrap.appendChild(pill);

    const top = window.scrollY + rect.top - 38;
    const left = window.scrollX + rect.left;
    pill.style.top = Math.max(top, window.scrollY + 4) + 'px';
    pill.style.left = left + 'px';

    // Pill Save → show tags form first
    save.onclick = () => doSaveWithTags(lastSelection, rect);
    ask.onclick = () => doAsk(lastSelection, rect);
  }

  // ── Panel builder ─────────────────────────────────────────────────────────
  function openPanel(rect, title) {
    clearPill();
    clearPanel();

    panel = document.createElement('div');
    panel.className = 'panel';

    // Header with reliable close button
    const header = document.createElement('div');
    header.className = 'panel-header';

    const titleEl = document.createElement('span');
    titleEl.className = 'panel-title';
    titleEl.textContent = title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-btn';
    closeBtn.setAttribute('aria-label', 'close');
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); clearPanel(); });

    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const body = document.createElement('div');
    body.className = 'panel-body';
    panel.appendChild(body);

    wrap.appendChild(panel);

    const top = window.scrollY + (rect ? rect.bottom + 8 : 80);
    const left = window.scrollX + (rect ? rect.left : 40);
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';

    return body;
  }

  // ── Send helper ───────────────────────────────────────────────────────────
  function send(message) {
    return new Promise((resolve) => chrome.runtime.sendMessage(message, resolve));
  }

  // ── Save with tag form (pill button path) ────────────────────────────────
  function doSaveWithTags(text, rect) {
    const body = openPanel(rect, 'save → recall ai');

    const form = document.createElement('div');
    form.className = 'save-form';

    const preview = document.createElement('div');
    preview.className = 'preview';
    preview.textContent = text.length > 120 ? text.slice(0, 120) + '…' : text;

    const tagsInput = document.createElement('input');
    tagsInput.type = 'text';
    tagsInput.placeholder = 'tags, comma separated (optional)';

    const row = document.createElement('div');
    row.className = 'row';

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'cancel';
    cancelBtn.textContent = 'Cancel';

    row.appendChild(saveBtn);
    row.appendChild(cancelBtn);
    form.appendChild(preview);
    form.appendChild(tagsInput);
    form.appendChild(row);
    body.appendChild(form);

    // Autofocus tags input
    setTimeout(() => tagsInput.focus(), 60);

    cancelBtn.onclick = clearPanel;

    async function submitSave() {
      const tags = tagsInput.value.split(',').map((t) => t.trim()).filter(Boolean);
      saveBtn.textContent = 'saving…';
      saveBtn.disabled = true;
      const r = await send({ type: 'wm-save', text, url: location.href, title: document.title, tags });
      if (!r || !r.ok) {
        body.innerHTML = `<span class="red">! ${r ? r.error : 'no response'}</span>`;
        return;
      }
      const masked = r.data.redactionCount > 0
        ? `<span class="badge amber">${r.data.redactionCount} masked</span>` : '';
      body.innerHTML = `<span class="badge">saved</span>${masked}<div style="margin-top:6px;color:#7a8a7a;font-size:11px">"${escapeHtml(r.data.title)}"</div>`;
    }

    saveBtn.onclick = submitSave;
    tagsInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitSave(); } });
  }

  // ── Instant save (Alt+W / context-menu path) ──────────────────────────────
  async function doSaveImmediate(text, rect) {
    const body = openPanel(rect, 'save → recall ai');
    body.innerHTML = '<span class="muted">saving…</span>';
    const r = await send({ type: 'wm-save', text, url: location.href, title: document.title, tags: [] });
    if (!r || !r.ok) { body.innerHTML = `<span class="red">! ${r ? r.error : 'no response'}</span>`; return; }
    const masked = r.data.redactionCount > 0
      ? `<span class="badge amber">${r.data.redactionCount} masked</span>` : '';
    body.innerHTML = `<span class="badge">saved</span>${masked}<div style="margin-top:6px;color:#7a8a7a;font-size:11px">"${escapeHtml(r.data.title)}"</div>`;
  }

  const COPY_ICON = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="display:inline-block;vertical-align:middle"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  // ── Ask ───────────────────────────────────────────────────────────────────
  async function doAsk(text, rect) {
    const body = openPanel(rect, 'ask → recall ai');
    body.innerHTML = '<span class="muted">searching…</span>';

    const r = await send({ type: 'wm-ask', text });
    if (!r || !r.ok) { body.innerHTML = `<span class="red">! ${r ? r.error : 'no response'}</span>`; return; }

    const d = r.data;
    const answer = d.answer || '';

    // Badges + answer text in scrollable body
    const answerEl = document.createElement('div');

    const badges = document.createElement('div');
    badges.style.marginBottom = '6px';
    badges.innerHTML = `<span class="badge">${escapeHtml(d.router)}</span><span class="badge">${escapeHtml(d.confidence)}</span>`;

    const answerText = document.createElement('div');
    answerText.className = 'answer';
    answerText.textContent = answer;

    answerEl.appendChild(badges);
    answerEl.appendChild(answerText);

    body.innerHTML = '';
    body.appendChild(answerEl);

    // Pinned footer — appended to panel directly so it's always visible
    const footer = document.createElement('div');
    footer.className = 'panel-footer';

    const copyBtn = document.createElement('button');
    copyBtn.className = 'action-btn';
    copyBtn.innerHTML = COPY_ICON;
    copyBtn.title = 'Copy answer';
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(answer).then(() => {
        copyBtn.innerHTML = '✓';
        copyBtn.classList.add('ok');
        setTimeout(() => { copyBtn.innerHTML = COPY_ICON; copyBtn.classList.remove('ok'); }, 1800);
      });
    };

    footer.appendChild(copyBtn);
    panel.appendChild(footer);
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'wm-context') {
      const rect = selectionRect();
      if (msg.mode === 'ask') doAsk(msg.text, rect);
      else doSaveImmediate(msg.text, rect); // context-menu → instant save
    }
  });
})();
