import React, { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { todayISO, ddmm, diaSemana } from './lib/dates.js';
import { emptyState, newPatient, normalizePatient } from './lib/model.js';
import { novoDia } from './lib/rollover.js';
import { buildEvolucao, buildPassagem } from './lib/text.js';
import { loadPlain, savePlain, clearPlain, getAccount, normalizeState, hasPlainData } from './lib/storage.js';
import { Cloud, traduz } from './lib/cloud.js';
import { AUTORIA, AUTO_LOCK_MIN } from './config.js';
import BedMap from './components/BedMap.jsx';
import BedView from './components/BedView.jsx';
import Calc from './components/Calc.jsx';
import Settings from './components/Settings.jsx';
import Login from './components/Login.jsx';
import { Icon, TextModal } from './components/ui.jsx';
import { PrintDialog, PrintSheets } from './components/PrintRound.jsx';

const metaVersion = typeof document !== 'undefined' ? document.querySelector('meta[name="app-version"]') : null;
const VERSION = metaVersion && !metaVersion.content.includes('__') ? metaVersion.content : 'dev';

function reducer(state, a) {
  switch (a.type) {
    case 'load':
      return a.state;
    case 'bed': {
      const cur = state.beds[a.id] || { patient: null, updatedAt: 0 };
      return { ...state, beds: { ...state.beds, [a.id]: { patient: a.fn(cur.patient), updatedAt: a.at } } };
    }
    case 'settings': {
      const beds = { ...state.beds };
      for (const l of a.settings.leitos) if (!beds[l.id]) beds[l.id] = { patient: null, updatedAt: 0 };
      return { ...state, settings: a.settings, settingsUpdatedAt: a.at, beds };
    }
    case 'remote': {
      if (a.docKey === 'settings') {
        if (!a.value || a.at <= state.settingsUpdatedAt) return state;
        const settings = { ...state.settings, ...a.value };
        const beds = { ...state.beds };
        for (const l of settings.leitos) if (!beds[l.id]) beds[l.id] = { patient: null, updatedAt: 0 };
        return { ...state, settings, settingsUpdatedAt: a.at, beds };
      }
      if (a.docKey.startsWith('bed:')) {
        const id = a.docKey.slice(4);
        const cur = state.beds[id];
        if (cur && cur.updatedAt >= a.at) return state;
        return { ...state, beds: { ...state.beds, [id]: { patient: a.value ? normalizePatient(a.value) : null, updatedAt: a.at } } };
      }
      return state;
    }
    default:
      return state;
  }
}

// Monta o estado a partir dos documentos decifrados.
function stateFromDocs(docs) {
  const st = emptyState();
  const s = docs.find((d) => d.docKey === 'settings');
  if (s && s.value) { st.settings = { ...st.settings, ...s.value }; st.settingsUpdatedAt = s.updatedAt; }
  const beds = {};
  for (const d of docs) {
    if (d.docKey.startsWith('bed:')) beds[d.docKey.slice(4)] = { patient: d.value, updatedAt: d.updatedAt };
  }
  st.beds = beds;
  return normalizeState(st);
}

// Junta o que estava só neste aparelho com o que veio da nuvem (o mais novo vence).
function mergeLocal(server, local) {
  const out = { ...server, beds: { ...server.beds } };
  const dirty = [];
  const now = Date.now();
  if (!server.settingsUpdatedAt || local.settingsUpdatedAt > server.settingsUpdatedAt) {
    out.settings = local.settings;
    out.settingsUpdatedAt = local.settingsUpdatedAt || now;
    dirty.push('settings');
  }
  for (const l of out.settings.leitos) {
    const L = local.beds[l.id], S = server.beds[l.id];
    if (L && L.patient && (!S || (L.updatedAt || 0) > (S.updatedAt || 0))) {
      out.beds[l.id] = { patient: L.patient, updatedAt: L.updatedAt || now };
      dirty.push('bed:' + l.id);
    }
  }
  return { state: normalizeState(out), dirty };
}

const STATUS_TXT = {
  idle: '', working: 'Abrindo...', saving: 'Salvando...', synced: 'Sincronizado',
  offline: 'Sem conexão: salvo no aparelho', error: 'Erro ao sincronizar', locked: 'Bloqueado',
};

export default function App() {
  const [state, dispatch] = useReducer(reducer, null, emptyState);
  const [mode, setMode] = useState('boot'); // boot | local | cloud | locked | login
  const [view, setView] = useState({ name: 'map', bedId: null });
  const [hoje, setHoje] = useState(todayISO());
  const [modal, setModal] = useState(null);
  const [printDlg, setPrintDlg] = useState(null);
  const [printJob, setPrintJob] = useState(null);
  const [toastMsg, setToastMsg] = useState('');
  const [sync, setSync] = useState({ state: 'idle', detail: '' });
  const [busy, setBusy] = useState(false);
  const [update, setUpdate] = useState(false);
  const cloudRef = useRef(null);
  const dirty = useRef(new Set());
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastActivity = useRef(Date.now());

  const toast = useCallback((m) => { setToastMsg(m); setTimeout(() => setToastMsg(''), 2200); }, []);

  const makeCloud = useCallback(() => {
    const c = new Cloud({
      onRemote: (docKey, value, at) => dispatch({ type: 'remote', docKey, value, at }),
      onStatus: (s) => setSync(s),
    });
    cloudRef.current = c;
    return c;
  }, []);

  // Abre os dados da nuvem (cache cifrado + o que mudou no servidor).
  const openCloud = useCallback(async (cloud, { merge } = {}) => {
    await cloud.pull();
    let st = stateFromDocs(await cloud.readCache());
    if (merge && hasPlainData()) {
      const res = mergeLocal(st, loadPlain().state);
      st = res.state;
      for (const k of res.dirty) {
        if (k === 'settings') await cloud.save('settings', st.settings, st.settingsUpdatedAt);
        else { const id = k.slice(4); await cloud.save(k, st.beds[id].patient, st.beds[id].updatedAt); }
      }
      clearPlain(); // a cópia sem criptografia sai do aparelho
    }
    dispatch({ type: 'load', state: st });
    setMode('cloud');
    cloud.subscribe();
    cloud.push();
  }, []);

  // Início: com conta neste aparelho, abre a nuvem; sem conta, usa os dados locais.
  useEffect(() => {
    (async () => {
      const acc = getAccount();
      if (!acc) {
        const { state: st, migrated } = loadPlain();
        dispatch({ type: 'load', state: st });
        if (migrated) savePlain(st);
        setMode('local');
        return;
      }
      const cloud = makeCloud();
      try {
        if (await cloud.autoUnlock()) { await openCloud(cloud); return; }
      } catch { /* cai para a tela de bloqueio */ }
      setMode('locked');
    })();
  }, [makeCloud, openCloud]);

  // Grava as mudanças: sem conta, em texto no aparelho; com conta, cifradas e enviadas.
  useEffect(() => {
    if (mode === 'local') {
      const t = setTimeout(() => savePlain(state), 250);
      return () => clearTimeout(t);
    }
    if (mode === 'cloud' && dirty.current.size) {
      const t = setTimeout(() => {
        const keys = [...dirty.current];
        dirty.current.clear();
        const st = stateRef.current;
        for (const k of keys) {
          if (k === 'settings') cloudRef.current.save('settings', st.settings, st.settingsUpdatedAt);
          else { const id = k.slice(4); const b = st.beds[id]; if (b) cloudRef.current.save(k, b.patient, b.updatedAt); }
        }
      }, 400);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [state, mode]);

  // Virada do dia e atualização do app.
  useEffect(() => {
    const t = setInterval(() => setHoje(todayISO()), 60000);
    const onUpd = () => setUpdate(true);
    window.addEventListener('ronda-update', onUpd);
    return () => { clearInterval(t); window.removeEventListener('ronda-update', onUpd); };
  }, []);

  // Com conta: ao voltar para o app busca novidades; sem uso por 15 min (aparelho não lembrado), bloqueia.
  useEffect(() => {
    if (mode !== 'cloud') return undefined;
    const mark = () => { lastActivity.current = Date.now(); };
    const onVis = async () => {
      if (document.visibilityState === 'visible' && cloudRef.current && cloudRef.current.unlocked) {
        const changed = await cloudRef.current.pull();
        for (const r of changed) dispatch({ type: 'remote', docKey: r.docKey, value: r.value, at: r.updatedAt });
        cloudRef.current.push();
      }
    };
    const onOnline = () => cloudRef.current && cloudRef.current.push();
    ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, mark, { passive: true }));
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => {
      const acc = getAccount();
      if (acc && !acc.remember && Date.now() - lastActivity.current > AUTO_LOCK_MIN * 60000) lock();
    }, 30000);
    return () => {
      ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.removeEventListener(e, mark));
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- ações ----
  const changeBed = useCallback((id, fn) => {
    dirty.current.add('bed:' + id);
    dispatch({ type: 'bed', id, fn, at: Date.now() });
  }, []);

  const changeSettings = (settings) => {
    dirty.current.add('settings');
    dispatch({ type: 'settings', settings, at: Date.now() });
  };

  function admitir(id) {
    const l = state.settings.leitos.find((x) => x.id === id);
    if (!window.confirm(`Admitir paciente no leito ${l ? l.label : ''}?`)) return;
    changeBed(id, () => newPatient(hoje));
    setView({ name: 'bed', bedId: id });
  }

  function saida(id, tipo) {
    changeBed(id, () => null);
    setView({ name: 'map', bedId: null });
    toast(`${tipo} registrada. Leito liberado.`);
  }

  function iniciarRound(ids) {
    for (const id of ids) changeBed(id, (p) => (p ? novoDia(p, hoje) : p));
    toast('Round de hoje iniciado');
  }

  function importar(st) {
    const now = Date.now();
    const norm = normalizeState(st);
    norm.settingsUpdatedAt = now;
    for (const id of Object.keys(norm.beds)) { norm.beds[id].updatedAt = now; dirty.current.add('bed:' + id); }
    dirty.current.add('settings');
    dispatch({ type: 'load', state: norm });
  }

  async function login(form) {
    setBusy(true);
    try {
      const cloud = cloudRef.current || makeCloud();
      const r = await cloud.unlock(form);
      if (!r.ok) return r;
      await openCloud(cloud, { merge: true });
      lastActivity.current = Date.now();
      setView({ name: 'map', bedId: null });
      return { ok: true };
    } catch (e) {
      return { error: traduz(e) };
    } finally {
      setBusy(false);
    }
  }

  async function lock() {
    if (cloudRef.current) await cloudRef.current.lock();
    cloudRef.current = null;
    dirty.current.clear();
    dispatch({ type: 'load', state: emptyState() });
    setModal(null);
    setView({ name: 'map', bedId: null });
    setMode('locked');
  }

  async function logout() {
    if (!window.confirm('Sair deste aparelho? A chave e a cópia local são apagadas daqui; os dados continuam na nuvem.')) return;
    const c = cloudRef.current || makeCloud();
    await c.logout();
    cloudRef.current = null;
    dirty.current.clear();
    dispatch({ type: 'load', state: emptyState() });
    setView({ name: 'map', bedId: null });
    setMode('local');
  }

  // ---- telas ----
  if (mode === 'boot') return <div className="lockwrap"><div className="lockcard">Abrindo...</div></div>;
  if (mode === 'locked' || mode === 'login') {
    const acc = getAccount();
    return (
      <Login
        email={acc ? acc.email : ''}
        locked={mode === 'locked'}
        busy={busy}
        onSubmit={login}
        onCancel={mode === 'login' ? () => setMode('local') : null}
        onForget={mode === 'locked' ? async () => { const c = cloudRef.current || makeCloud(); await c.logout(); cloudRef.current = null; dispatch({ type: 'load', state: emptyState() }); setMode('local'); } : null}
      />
    );
  }

  const leitos = state.settings.leitos;
  const ocupados = leitos.filter((l) => state.beds[l.id] && state.beds[l.id].patient);
  const stale = ocupados.filter((l) => state.beds[l.id].patient.diaRound !== hoje);
  const staleDates = [...new Set(stale.map((l) => ddmm(state.beds[l.id].patient.diaRound)))].join(', ');
  const bedId = view.bedId;
  const bed = bedId ? state.beds[bedId] : null;
  const leitoLabel = (id) => (leitos.find((l) => l.id === id) || {}).label || '';
  const syncCls = sync.state === 'synced' ? 'ok' : sync.state === 'saving' || sync.state === 'working' ? 'saving' : sync.state === 'error' ? 'err' : '';

  const tabs = (
    <div className="bedtabs">
      {leitos.map((l) => {
        const p = state.beds[l.id] && state.beds[l.id].patient;
        const dx = p && ((p.diagnosticos.find((d) => d.texto) || {}).texto || '');
        return (
          <button key={l.id} className={'bedtab' + (l.id === bedId ? ' on' : '') + (p ? '' : ' vago')}
            onClick={() => (p ? setView({ name: 'bed', bedId: l.id }) : admitir(l.id))}>
            <b>{l.label}</b><span>{p ? (dx ? dx.slice(0, 14) : 'ocupado') : 'vago'}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      <header className="topbar">
        <button className="brand" onClick={() => setView({ name: 'map', bedId: null })} aria-label="Mapa de leitos">
          <img src="icons/icon-192.png" alt="" />
          <span style={{ minWidth: 0, textAlign: 'left' }}>
            <span className="t" style={{ display: 'block' }}>Ronda CTI</span>
            <span className="s" style={{ display: 'block' }}>{state.settings.unidade} - {diaSemana(hoje)}, {ddmm(hoje)}</span>
          </span>
        </button>
        <span className="spacer" />
        {mode === 'cloud' && <span className={'sync ' + syncCls} title={sync.detail}><span className="dot" /><span className="lbl-txt">{STATUS_TXT[sync.state] || ''}</span></span>}
        {view.name !== 'map' && <button className="tb-btn" onClick={() => setView({ name: 'map', bedId: null })}><Icon name="grid" /><span className="lbl-txt">Mapa</span></button>}
        <button className="tb-btn" onClick={() => setView({ name: 'calc', bedId: null })} aria-label="Calculadora"><Icon name="calc" /><span className="lbl-txt">Calculadora</span></button>
        <button className="tb-btn" onClick={() => setView({ name: 'settings', bedId: null })} aria-label="Ajustes"><Icon name="gear" /><span className="lbl-txt">Ajustes</span></button>
      </header>

      {update && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="banner"><span className="grow">Nova versão do app instalada.</span><button className="btn sm primary" onClick={() => window.location.reload()}>Recarregar</button></div>
        </div>
      )}
      {sync.state === 'error' && mode === 'cloud' && (
        <div className="wrap" style={{ paddingBottom: 0 }}>
          <div className="banner amber"><span className="grow">Não foi possível sincronizar ({sync.detail}). As alterações estão salvas, cifradas, neste aparelho e serão enviadas quando der.</span></div>
        </div>
      )}

      {view.name === 'map' && (
        <BedMap state={state} hoje={hoje}
          onOpen={(id) => setView({ name: 'bed', bedId: id })}
          onAdmit={admitir}
          staleCount={stale.length} roundDates={staleDates}
          onRollover={() => iniciarRound(stale.map((l) => l.id))}
          onPassagem={() => setModal({ title: 'Passagem de plantão', text: buildPassagem(leitos.map((l) => ({ leito: l.label, patient: state.beds[l.id] && state.beds[l.id].patient })), { hoje, unidade: state.settings.unidade, drugConc: state.settings.drugConc }) })}
          localOnly={mode === 'local'}
          onSetupSync={() => setMode('login')}
          onPrint={() => setPrintDlg({ inicial: [] })}
        />
      )}

      {view.name === 'bed' && bed && bed.patient && (
        <BedView
          key={bedId}
          leito={leitoLabel(bedId)}
          patient={bed.patient}
          hoje={hoje}
          drugConc={state.settings.drugConc}
          tabs={tabs}
          onChange={(fn) => changeBed(bedId, (p) => fn(p))}
          onRollover={() => iniciarRound([bedId])}
          onToast={toast}
          onPrint={() => setPrintDlg({ inicial: [bedId] })}
          onSaida={(tipo) => saida(bedId, tipo)}
          onEvolucao={() => setModal({ title: `Evolução - leito ${leitoLabel(bedId)}`, text: buildEvolucao(bed.patient, { hoje, unidade: state.settings.unidade, leito: leitoLabel(bedId), drugConc: state.settings.drugConc }) })}
        />
      )}
      {view.name === 'bed' && (!bed || !bed.patient) && (
        <div className="wrap"><div className="banner">Este leito está vago. <button className="btn sm" onClick={() => setView({ name: 'map', bedId: null })}>Voltar ao mapa</button></div></div>
      )}

      {view.name === 'calc' && <Calc state={state} />}
      {view.name === 'settings' && (
        <Settings state={state} mode={mode} email={cloudRef.current ? cloudRef.current.email : ''}
          syncStatus={STATUS_TXT[sync.state] || '-'} version={VERSION} toast={toast}
          onSettings={changeSettings} onImport={importar}
          onSetupSync={() => setMode('login')} onLock={lock} onLogout={logout} />
      )}

      <div className="footer">{AUTORIA}</div>
      {modal && <TextModal title={modal.title} text={modal.text} onClose={() => setModal(null)} />}
      {toastMsg && <div className="toast">{toastMsg}</div>}
      {printDlg && (
        <PrintDialog ocupados={ocupados.map((l) => ({ id: l.id, label: l.label }))} inicial={printDlg.inicial}
          onClose={() => setPrintDlg(null)}
          onPrint={(ids, porFolha) => { setPrintDlg(null); setPrintJob({ ids, porFolha, n: Date.now() }); }} />
      )}
      {printJob && (
        <PrintSheets key={printJob.n} job={printJob}
          beds={leitos.map((l) => ({ id: l.id, label: l.label, patient: state.beds[l.id] && state.beds[l.id].patient }))}
          ctx={{ hoje, unidade: state.settings.unidade, drugConc: state.settings.drugConc }}
          onDone={() => setPrintJob(null)} />
      )}
    </div>
  );
}
