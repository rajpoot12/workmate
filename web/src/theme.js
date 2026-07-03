/**
 * Theme management.
 *
 * The backend (`/api/theme`) is the single source of truth — it's what the
 * browser extension popup and in-page floater read too, so setting the
 * theme once on the web app's Config page applies everywhere instantly.
 *
 * localStorage is only a fast local cache so the web app can paint the
 * right theme before the network round-trip to the backend completes.
 */
import { useEffect, useState } from 'react';
import { api } from './api.js';

const KEY = 'wm_theme';
const VALID = ['dev', 'friendly'];

export function getTheme() {
  const v = localStorage.getItem(KEY);
  return VALID.includes(v) ? v : 'dev';
}

function cacheLocally(value) {
  localStorage.setItem(KEY, value);
}

/** Apply/remove the theme-friendly class on <body> immediately. */
export function applyThemeClass(value) {
  if (value === 'friendly') {
    document.body.classList.add('theme-friendly');
  } else {
    document.body.classList.remove('theme-friendly');
  }
}

function broadcast(value) {
  window.dispatchEvent(new CustomEvent('wm-theme-change', { detail: value }));
}

/**
 * Persist the theme to the backend so it applies everywhere (web app,
 * browser extension popup, in-page floater), and update the local cache.
 */
export async function setTheme(value) {
  if (!VALID.includes(value)) value = 'dev';
  cacheLocally(value);
  applyThemeClass(value);
  broadcast(value);
  try {
    await api.setTheme(value);
  } catch (_) {
    // Backend unreachable — local UI still switched; will resync next load.
  }
}

/** React hook — returns [theme, setTheme]. Re-renders on change, syncs from backend on mount. */
export function useTheme() {
  const [theme, setThemeState] = useState(getTheme);

  useEffect(() => {
    applyThemeClass(theme);
    // Backend is the source of truth — reconcile on mount in case another
    // surface (extension, another device) changed it.
    api.getTheme().then(({ theme: remote }) => {
      if (VALID.includes(remote) && remote !== getTheme()) {
        cacheLocally(remote);
        applyThemeClass(remote);
        setThemeState(remote);
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handler(e) {
      setThemeState(e.detail);
    }
    window.addEventListener('wm-theme-change', handler);
    return () => window.removeEventListener('wm-theme-change', handler);
  }, []);

  function change(value) {
    setThemeState(value);
    setTheme(value);
  }

  return [theme, change];
}

export const isFriendly = () => getTheme() === 'friendly';

/**
 * Lightweight read-only hook — subscribes to theme changes without doing its
 * own backend fetch. Use this in small/repeated components (form fields,
 * buttons, etc.) so mounting many of them doesn't fire many network calls.
 * Use `useTheme()` instead at the top of a page/screen, which reconciles
 * with the backend once.
 */
export function useThemeValue() {
  const [theme, setThemeState] = useState(getTheme);
  useEffect(() => {
    function handler(e) { setThemeState(e.detail); }
    window.addEventListener('wm-theme-change', handler);
    return () => window.removeEventListener('wm-theme-change', handler);
  }, []);
  return theme;
}
