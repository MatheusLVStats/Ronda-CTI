// Armazenamento no aparelho.
// - Sem conta: JSON em localStorage (como no app anterior).
// - Com conta: só documentos cifrados; a chave fica em memória ou, se "lembrar neste aparelho",
//   num CryptoKey não exportável guardado no IndexedDB.
import { emptyState, migrateV1, normalizePatient, defaultSettings } from './model.js';
import { todayISO } from './dates.js';

export const K = {
  v1: 'ronda_cti_v1',
  plain: 'ronda_cti_v2',
  cache: 'ronda_cti_v2_cache',
  account: 'ronda_cti_account',
};

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
};
export { ls };

export function normalizeState(s) {
  const base = emptyState();
  if (!s || typeof s !== 'object') return base;
  const settings = { ...defaultSettings(), ...(s.settings || {}) };
  if (!Array.isArray(settings.leitos) || !settings.leitos.length) settings.leitos = defaultSettings().leitos;
  const beds = {};
  for (const l of settings.leitos) {
    const b = (s.beds || {})[l.id];
    beds[l.id] = { patient: b && b.patient ? normalizePatient(b.patient) : null, updatedAt: (b && b.updatedAt) || 0 };
  }
  return { version: 2, settings, settingsUpdatedAt: s.settingsUpdatedAt || 0, beds };
}

// Estado salvo sem conta (ou migrado do app anterior).
export function loadPlain() {
  const raw = ls.get(K.plain);
  if (raw) {
    try { return { state: normalizeState(JSON.parse(raw)), migrated: false }; } catch { /* cai para v1 */ }
  }
  const v1 = ls.get(K.v1);
  if (v1) {
    try { return { state: normalizeState(migrateV1(JSON.parse(v1), todayISO())), migrated: true }; } catch { /* ignora */ }
  }
  return { state: emptyState(), migrated: false };
}

export function savePlain(state) {
  return ls.set(K.plain, JSON.stringify(state));
}

export function clearPlain() {
  ls.del(K.plain);
  ls.del(K.v1);
}

export function hasPlainData() {
  return !!(ls.get(K.plain) || ls.get(K.v1));
}

// Conta lembrada neste aparelho: { email, remember }.
export function getAccount() {
  try { return JSON.parse(ls.get(K.account) || 'null'); } catch { return null; }
}
export function setAccount(a) { a ? ls.set(K.account, JSON.stringify(a)) : ls.del(K.account); }

// Cache cifrado: { email, cursor, docs: { [docKey]: { c, u, dirty, deleted } } }
export function getCache() {
  try { return JSON.parse(ls.get(K.cache) || 'null'); } catch { return null; }
}
export function setCache(c) { c ? ls.set(K.cache, JSON.stringify(c)) : ls.del(K.cache); }

// ---- IndexedDB: guarda o CryptoKey (não exportável) quando o aparelho é lembrado ----
function idb() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) { reject(new Error('sem IndexedDB')); return; }
    const req = indexedDB.open('ronda-cti', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function storeKey(key) {
  const db = await idb();
  await new Promise((res, rej) => {
    const tx = db.transaction('keys', 'readwrite');
    tx.objectStore('keys').put(key, 'enc');
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
  db.close();
}

export async function loadKey() {
  try {
    const db = await idb();
    const key = await new Promise((res, rej) => {
      const tx = db.transaction('keys', 'readonly');
      const r = tx.objectStore('keys').get('enc');
      r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
    });
    db.close();
    return key;
  } catch { return null; }
}

export async function deleteKey() {
  try {
    const db = await idb();
    await new Promise((res) => {
      const tx = db.transaction('keys', 'readwrite');
      tx.objectStore('keys').delete('enc');
      tx.oncomplete = res; tx.onerror = res;
    });
    db.close();
  } catch { /* ignora */ }
}

// Backup em arquivo (JSON). Contém dados de pacientes: guardar com cuidado.
export function backupBlob(state) {
  return new Blob([JSON.stringify({ app: 'ronda-cti', exportedAt: new Date().toISOString(), state }, null, 2)], { type: 'application/json' });
}

export function parseBackup(text) {
  const obj = JSON.parse(text);
  if (Array.isArray(obj)) return normalizeState(migrateV1(obj, todayISO()));
  return normalizeState(obj.state || obj);
}
