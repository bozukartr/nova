/* NOVA · ayar kalıcılığı — localStorage kapalıysa (gizli sekme, iframe) sessizce bellekte kalır. */

import { STORE_KEY, DEFAULTS } from './config.js';

let memory = null;

function backing() {
  try {
    const probe = '__nova__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

const store = backing();

export function loadSettings() {
  if (memory) return { ...memory };
  let saved = null;
  try {
    saved = store ? JSON.parse(store.getItem(STORE_KEY) || 'null') : null;
  } catch {
    saved = null;
  }
  memory = { ...DEFAULTS, ...(saved && typeof saved === 'object' ? saved : {}) };
  return { ...memory };
}

export function saveSettings(patch) {
  memory = { ...loadSettings(), ...patch };
  try {
    if (store) store.setItem(STORE_KEY, JSON.stringify(memory));
  } catch {
    /* kota dolu ya da erişim yok: bellekteki kopya yeter */
  }
  return { ...memory };
}
