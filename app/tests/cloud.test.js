// Sincronização entre dois aparelhos, com um servidor simulado que segue as regras do banco
// (RLS por usuário, gravação atrasada ignorada, realtime para os outros aparelhos).
import { describe, it, expect, vi } from 'vitest';
import { Cloud, traduz } from '../src/lib/cloud.js';

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

const server = { users: new Map(), rows: new Map(), subs: [], tick: 0 };
const stamp = () => new Date(Date.UTC(2026, 10, 1, 12, 0, 0) + ++server.tick * 1000).toISOString();

class Query {
  constructor(sessionRef) { this.s = sessionRef; this.op = null; this.filters = []; }
  upsert(rows) { this.op = { type: 'upsert', rows }; return this; }
  select() { this.op = this.op || { type: 'select' }; return this; }
  order() { return this; }
  gt(col, v) { this.filters.push((r) => r[col] > v); return this; }
  then(res, rej) { return Promise.resolve().then(() => this.run()).then(res, rej); }
  run() {
    const s = this.s();
    if (!s) return { data: null, error: { message: 'JWT expired' } };
    const uid = s.user.id;
    if (this.op.type === 'upsert') {
      for (const r of this.op.rows) {
        if (r.user_id !== uid) return { error: { message: 'new row violates row-level security policy' } };
        const key = `${uid}|${r.doc_key}`;
        const old = server.rows.get(key);
        if (old && r.client_updated_at < old.client_updated_at) continue; // gatilho: atrasada é ignorada
        const row = { ...r, updated_at: stamp() };
        server.rows.set(key, row);
        for (const sub of server.subs) if (sub.uid === uid) sub.cb({ new: row });
      }
      return { data: null, error: null };
    }
    const data = [...server.rows.values()].filter((r) => r.user_id === uid).filter((r) => this.filters.every((f) => f(r)))
      .sort((a, b) => a.updated_at.localeCompare(b.updated_at));
    return { data, error: null };
  }
}

function fakeClient() {
  let session = null;
  return {
    auth: {
      async signUp({ email, password }) {
        if (server.users.has(email)) return { data: { user: null, session: null }, error: { message: 'User already registered' } };
        const user = { id: 'uid-' + email, email };
        server.users.set(email, { user, password });
        session = { user };
        return { data: { user, session }, error: null };
      },
      async signInWithPassword({ email, password }) {
        const u = server.users.get(email);
        if (!u || u.password !== password) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
        session = { user: u.user };
        return { data: { user: u.user, session }, error: null };
      },
      async getSession() { return { data: { session } }; },
      async signOut() { session = null; return { error: null }; },
    },
    from() { return new Query(() => session); },
    channel() {
      const ch = {
        on(_ev, _f, cb) { this.cb = cb; return this; },
        subscribe(st) { server.subs.push({ uid: session.user.id, cb: (p) => this.cb(p), ch: this }); st && st('SUBSCRIBED'); return this; },
      };
      return ch;
    },
    async removeChannel(ch) { server.subs = server.subs.filter((s) => s.ch !== ch); },
  };
}

vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }));

globalThis.localStorage = new MemStorage();

// Cada aparelho tem o seu localStorage.
function device() {
  const store = new MemStorage();
  const remote = [];
  const cloud = new Cloud({ onRemote: (k, v, at) => remote.push({ k, v, at }), onStatus: () => {} });
  const run = async (fn) => { globalThis.localStorage = store; const r = await fn(cloud); clearTimeout(cloud.pushTimer); return r; };
  return { store, remote, cloud, run };
}

const EMAIL = 'medico@exemplo.com';
const SENHA = 'frase secreta do plantao';
const paciente = { idade: '58', diagnosticos: [{ texto: 'HSA aneurismática' }] };

describe('sincronização cifrada entre celular e PC', () => {
  const cel = device();
  const pc = device();

  it('celular cria a conta e envia o leito cifrado', async () => {
    const r = await cel.run((c) => c.unlock({ email: EMAIL, password: SENHA, remember: false, create: true }));
    expect(r.ok).toBe(true);
    await cel.run(async (c) => { await c.save('bed:b1', paciente, 1000); await c.push(); });
    const row = server.rows.get(`uid-${EMAIL}|bed:b1`);
    expect(row.ciphertext).toBeTruthy();
    expect(row.ciphertext).not.toContain('HSA');
    expect(server.users.get(EMAIL).password).not.toBe(SENHA); // o servidor nunca vê a senha
    expect(cel.store.getItem('ronda_cti_v2_cache')).not.toContain('HSA'); // nem o cache local
  });

  it('PC entra com a mesma senha e recebe o leito', async () => {
    const r = await pc.run((c) => c.unlock({ email: EMAIL, password: SENHA, remember: false, create: false }));
    expect(r.ok).toBe(true);
    const changed = await pc.run((c) => c.pull());
    expect(changed).toEqual([{ docKey: 'bed:b1', value: paciente, updatedAt: 1000 }]);
  });

  it('mudança no PC chega ao celular em tempo real', async () => {
    await cel.run((c) => c.subscribe());
    await pc.run((c) => c.subscribe());
    const novo = { ...paciente, peso: '72' };
    await pc.run(async (c) => { await c.save('bed:b1', novo, 2000); await c.push(); });
    await new Promise((r) => setTimeout(r, 50));
    expect(cel.remote.at(-1)).toEqual({ k: 'bed:b1', v: novo, at: 2000 });
  });

  it('gravação atrasada (relógio para trás) não apaga a mais nova', async () => {
    await cel.run(async (c) => { await c.save('bed:b1', { idade: 'velho' }, 1500); await c.push(); });
    expect(server.rows.get(`uid-${EMAIL}|bed:b1`).client_updated_at).toBe(2000);
    const back = await cel.run((c) => c.pull());
    expect(back.find((x) => x.docKey === 'bed:b1').value.peso).toBe('72');
  });

  it('alta apaga o conteúdo do leito na nuvem', async () => {
    await pc.run(async (c) => { await c.save('bed:b1', null, 3000); await c.push(); });
    const row = server.rows.get(`uid-${EMAIL}|bed:b1`);
    expect(row.deleted).toBe(true);
    expect(row.ciphertext).toBeNull();
  });

  it('senha errada não entra e bloquear esquece a chave', async () => {
    const outro = device();
    const r = await outro.run((c) => c.unlock({ email: EMAIL, password: 'errada', remember: false, create: false }));
    expect(r.ok).toBe(false);
    expect(r.error).toBe('E-mail ou senha incorretos.');
    await cel.run((c) => c.lock());
    expect(cel.cloud.unlocked).toBe(false);
  });

  it('traduz o erro de e-mail fora da equipe do Supabase', () => {
    expect(traduz({ message: 'Email address not authorized' })).toContain('mesmo e-mail da sua conta do Supabase');
  });
});
