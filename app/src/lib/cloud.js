// Sincronização com o Supabase. Tudo que sai do aparelho já vai cifrado.
// Cada leito e os ajustes são documentos separados ("bed:<id>", "settings"),
// então celular e PC podem editar leitos diferentes ao mesmo tempo.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, APP_URL } from '../config.js';
import { deriveKeys, encryptDoc, decryptDoc } from './crypto.js';
import { getCache, setCache, setAccount, storeKey, loadKey, deleteKey, getAccount } from './storage.js';

const TABLE = 'ronda_docs';

export class Cloud {
  constructor({ onRemote, onStatus }) {
    this.onRemote = onRemote; // (docKey, value, updatedAt) => void
    this.onStatus = onStatus; // ({ state, detail }) => void
    this.client = null;
    this.key = null;
    this.user = null;
    this.channel = null;
    this.cache = null;
    this.pushTimer = null;
    this.pushing = false;
  }

  status(state, detail = '') { this.onStatus && this.onStatus({ state, detail }); }

  makeClient(remember) {
    if (this.client) return this.client;
    this.client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: remember, autoRefreshToken: true, storageKey: 'ronda-cti-auth', detectSessionInUrl: false },
    });
    return this.client;
  }

  // Entrar (ou criar a conta). Retorna { ok, needsConfirm, error }.
  async unlock({ email, password, remember, create }) {
    email = String(email || '').trim().toLowerCase();
    if (!email || !password) return { ok: false, error: 'Preencha e-mail e senha.' };
    this.status('working', 'Derivando a chave');
    const { encKey, authSecret } = await deriveKeys(email, password);
    const sb = this.makeClient(remember);
    let res;
    if (create) {
      res = await sb.auth.signUp({ email, password: authSecret, options: { emailRedirectTo: APP_URL } });
      if (res.error) return { ok: false, error: traduz(res.error) };
      if (!res.data.session) {
        this.status('idle');
        return { ok: false, needsConfirm: true };
      }
    } else {
      res = await sb.auth.signInWithPassword({ email, password: authSecret }).catch((e) => ({ error: e }));
      if (res.error) {
        // Servidor fora do ar ou sem internet: abre com a cópia cifrada deste aparelho e reconecta sozinho depois.
        if (semServidor(res.error)) {
          const off = await this.unlockOffline(email, encKey, authSecret, remember);
          if (off) return off;
        }
        this.status('idle');
        return { ok: false, error: traduz(res.error) };
      }
    }
    this.user = res.data.user;
    this.key = encKey;
    setAccount({ email, remember: !!remember });
    if (remember) await storeKey(encKey).catch(() => {});
    else await deleteKey();
    const cache = getCache();
    this.cache = cache && cache.email === email ? cache : { email, cursor: null, docs: {} };
    this.saveCache();
    return { ok: true };
  }

  // Abre só com o cache local (a senha é conferida decifrando um documento). Sem cache, não abre.
  async unlockOffline(email, encKey, authSecret, remember) {
    const cache = getCache();
    if (!cache || cache.email !== email) return null;
    const doc = Object.entries(cache.docs || {}).find(([, d]) => d && d.c && !d.deleted);
    if (!doc) return null;
    try { await decryptDoc(encKey, doc[0], doc[1].c); } catch { return { ok: false, error: 'E-mail ou senha incorretos.' }; }
    this.key = encKey;
    this.user = null;
    this.cache = cache;
    this.pendingAuth = { email, authSecret };
    if (remember) await storeKey(encKey).catch(() => {});
    this.status('offline', 'Servidor indisponível: salvando no aparelho');
    clearInterval(this.retryTimer);
    this.retryTimer = setInterval(() => this.reconnect(), 20000);
    return { ok: true, offline: true };
  }

  // Tenta entrar de novo; quando o servidor volta, baixa o que mudou, envia o que ficou pendente e liga o tempo real.
  async reconnect() {
    if (!this.pendingAuth || !this.client || this.reconnecting) return;
    this.reconnecting = true;
    try {
      const { email, authSecret } = this.pendingAuth;
      const res = await this.client.auth.signInWithPassword({ email, password: authSecret }).catch((e) => ({ error: e }));
      if (res.error || !res.data || !res.data.user) return;
      this.user = res.data.user;
      this.pendingAuth = null;
      clearInterval(this.retryTimer);
      const changed = await this.pull();
      for (const r of changed) this.onRemote && this.onRemote(r.docKey, r.value, r.updatedAt);
      this.subscribe();
      this.push();
    } finally {
      this.reconnecting = false;
    }
  }

  // Aparelho lembrado: abre direto com a chave do IndexedDB e a sessão salva.
  async autoUnlock() {
    const acc = getAccount();
    if (!acc || !acc.remember) return false;
    const key = await loadKey();
    if (!key) return false;
    const sb = this.makeClient(true);
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) return false;
    this.user = data.session.user;
    this.key = key;
    const cache = getCache();
    this.cache = cache && cache.email === acc.email ? cache : { email: acc.email, cursor: null, docs: {} };
    return true;
  }

  get email() { return this.cache ? this.cache.email : ''; }
  get unlocked() { return !!this.key; }

  saveCache() { if (this.cache) setCache(this.cache); }

  // Lê o que está no cache cifrado deste aparelho.
  async readCache() {
    const out = [];
    for (const [docKey, d] of Object.entries(this.cache.docs)) {
      if (d.deleted || !d.c) { out.push({ docKey, value: null, updatedAt: d.u }); continue; }
      try { out.push({ docKey, value: await decryptDoc(this.key, docKey, d.c), updatedAt: d.u }); } catch { /* documento ilegível: ignora */ }
    }
    return out;
  }

  // Grava um documento: cifra, guarda no aparelho e agenda o envio.
  async save(docKey, value, updatedAt) {
    if (!this.key) return;
    const deleted = value === null;
    const c = deleted ? null : await encryptDoc(this.key, docKey, value);
    this.cache.docs[docKey] = { c, u: updatedAt, dirty: true, deleted };
    this.saveCache();
    this.schedulePush();
  }

  schedulePush(ms = 800) {
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.push(), ms);
  }

  async push() {
    if (!this.user && this.pendingAuth) { this.status('offline', 'Servidor indisponível: salvando no aparelho'); return; }
    if (!this.key || !this.user || this.pushing) return;
    const dirty = Object.entries(this.cache.docs).filter(([, d]) => d.dirty);
    if (!dirty.length) { this.status('synced'); return; }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) { this.status('offline'); return; }
    this.pushing = true;
    this.status('saving');
    try {
      const rows = dirty.map(([docKey, d]) => ({
        user_id: this.user.id, doc_key: docKey, ciphertext: d.deleted ? null : d.c,
        deleted: !!d.deleted, client_updated_at: d.u,
      }));
      const { error } = await this.client.from(TABLE).upsert(rows, { onConflict: 'user_id,doc_key' });
      if (error) throw error;
      for (const [docKey, d] of dirty) {
        const cur = this.cache.docs[docKey];
        if (cur && cur.u === d.u) cur.dirty = false; // não mudou enquanto enviava
      }
      this.saveCache();
      this.status('synced');
    } catch (e) {
      this.status(navigator.onLine === false ? 'offline' : 'error', traduz(e));
      this.schedulePush(15000);
    } finally {
      this.pushing = false;
      if (Object.values(this.cache.docs).some((d) => d.dirty)) this.schedulePush(1500);
    }
  }

  // Busca o que mudou no servidor desde a última vez.
  async pull() {
    if (!this.key || !this.user) return [];
    let q = this.client.from(TABLE).select('doc_key, ciphertext, client_updated_at, deleted, updated_at').order('updated_at', { ascending: true });
    if (this.cache.cursor) q = q.gt('updated_at', new Date(new Date(this.cache.cursor).getTime() - 5000).toISOString());
    const { data, error } = await q;
    if (error) { this.status('error', traduz(error)); return []; }
    const changed = [];
    for (const row of data || []) {
      const r = await this.applyRow(row);
      if (r) changed.push(r);
      if (!this.cache.cursor || row.updated_at > this.cache.cursor) this.cache.cursor = row.updated_at;
    }
    this.saveCache();
    return changed;
  }

  // Aplica uma linha do servidor ao cache se ela for mais nova que a cópia local.
  async applyRow(row) {
    const docKey = row.doc_key;
    const local = this.cache.docs[docKey];
    const u = Number(row.client_updated_at) || 0;
    if (local && local.u >= u) return null; // a cópia local é igual ou mais nova
    let value = null;
    if (!row.deleted && row.ciphertext) {
      try { value = await decryptDoc(this.key, docKey, row.ciphertext); } catch { return null; }
    }
    this.cache.docs[docKey] = { c: row.deleted ? null : row.ciphertext, u, dirty: false, deleted: !!row.deleted };
    return { docKey, value, updatedAt: u };
  }

  subscribe() {
    if (!this.client || this.channel || !this.user) return;
    this.channel = this.client
      .channel('ronda-docs')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, async (payload) => {
        const row = payload.new;
        if (!row || !row.doc_key) return;
        const r = await this.applyRow(row);
        if (r) {
          if (!this.cache.cursor || row.updated_at > this.cache.cursor) this.cache.cursor = row.updated_at;
          this.saveCache();
          this.onRemote && this.onRemote(r.docKey, r.value, r.updatedAt);
        }
      })
      .subscribe((st) => { if (st === 'SUBSCRIBED') this.status('synced'); });
  }

  // Bloqueia: esquece a chave e a sessão da memória; o cache continua cifrado no aparelho.
  async lock() {
    clearTimeout(this.pushTimer);
    clearInterval(this.retryTimer);
    this.pendingAuth = null;
    if (this.channel) { await this.client.removeChannel(this.channel).catch(() => {}); this.channel = null; }
    const acc = getAccount();
    if (!(acc && acc.remember) && this.client) await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
    this.key = null;
    this.user = null;
    this.client = null;
    this.status('locked');
  }

  // Sair deste aparelho: apaga chave, sessão e cache local. Os dados continuam na nuvem.
  async logout() {
    if (this.client) await this.client.auth.signOut({ scope: 'local' }).catch(() => {});
    await deleteKey();
    setCache(null);
    setAccount(null);
    this.cache = null;
    await this.lock();
  }
}

// Erro de rede ou servidor parado/pausado (não é senha errada).
export function semServidor(e) {
  const m = String((e && (e.message || e.name)) || e || '');
  const st = e && e.status;
  return (e && e.name === 'AuthRetryableFetchError') || st === 0 || (st >= 500 && st < 600) || /Failed to fetch|NetworkError|network|Load failed|fetch/i.test(m);
}

export function traduz(e) {
  const m = String((e && (e.message || e.error_description)) || e || '');
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Abra o link que o Supabase enviou.';
  if (/User already registered/i.test(m)) return 'Esta conta já existe. Use Entrar.';
  if (/not authorized/i.test(m)) return 'Use o mesmo e-mail da sua conta do Supabase: o envio de e-mail de confirmação só funciona para ele.';
  if (/rate limit/i.test(m)) return 'Muitas tentativas seguidas. Espere alguns minutos.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sem conexão com o servidor.';
  if (/password/i.test(m) && /short|least/i.test(m)) return 'Senha curta demais.';
  return m || 'Erro desconhecido.';
}
