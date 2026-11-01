// Modelo de dados do Ronda CTI v2 e migração do app anterior (v1).
import { todayISO, addDays } from './dates.js';
import { DRUGS } from './drugs.js';
import { toNum, has } from './format.js';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export const CHECK_DEFS = [
  { k: 'inv', n: 1, t: 'Invasões e drippings', s: 'Invasões e drippings' },
  { k: 'prof', n: 2, t: 'Profilaxias: TEV e LAMG', s: 'Profilaxias' },
  { k: 'analg', n: 3, t: 'Analgesia', s: 'Analgesia' },
  { k: 'atb', n: 4, t: 'ATB (dose batendo?)', s: 'ATB' },
  { k: 'lab', n: 5, t: 'Laboratórios', s: 'Laboratórios' },
  { k: 'rx', n: 6, t: 'Radiologias', s: 'Radiologias' },
];

// Ventilação: modos e os parâmetros que cada um mostra.
export const MODOS = ['VCV', 'PCV', 'PSV', 'VNI', 'CNAF', 'Máscara/cateter O2', 'Ar ambiente', 'Extubado'];
export function ventFields(modo) {
  switch (modo) {
    case 'VCV': return ['vc', 'fr', 'peep', 'fio2'];
    case 'PCV': return ['pi', 'vc', 'fr', 'peep', 'fio2'];
    case 'PSV': return ['psup', 'vc', 'fr', 'peep', 'fio2'];
    case 'VNI': return ['psup', 'peep', 'fio2'];
    case 'CNAF': return ['fluxo', 'fio2'];
    case 'Máscara/cateter O2': return ['fluxo'];
    default: return [];
  }
}
export const VENT_LABELS = { vc: 'VC (ml)', fr: 'FR', peep: 'PEEP', fio2: 'FiO2 (%)', pi: 'PI', psup: 'Psup', fluxo: 'Fluxo (L/min)' };

const emptyChecks = () => ({ inv: '', prof: '', analg: '', atb: '', lab: '', rx: '' });
export const emptyH24 = () => ({
  taxMax: '', taxPicos: '', pasMin: '', pasMax: '', padMin: '', padMax: '',
  fcMin: '', fcMax: '', frMin: '', frMax: '', gliMin: '', gliMax: '', insulina: '',
  entradas: '', drenos: '', du: '', uf: '',
});
export const LAB_KEYS = [
  ['hb', 'Hb'], ['leuc', 'Leuc'], ['plaq', 'Plaq'], ['pcr', 'PCR'], ['inr', 'INR'],
  ['na', 'Na'], ['k', 'K'], ['mg', 'Mg'], ['ur', 'Ur'], ['cr', 'Creat'],
];
export const GASO_KEYS = [
  ['ph', 'pH'], ['pco2', 'pCO2'], ['po2', 'pO2'], ['hco3', 'HCO3'], ['be', 'BE'],
  ['sao2', 'SatO2'], ['lac', 'Lactato'], ['pf', 'P/F'],
];
export const emptyLabs = () => ({ data: '', hb: '', leuc: '', plaq: '', pcr: '', inr: '', na: '', k: '', mg: '', ur: '', cr: '', outros: '' });
export const emptyGaso = () => ({ data: '', hora: '', ph: '', pco2: '', po2: '', hco3: '', be: '', sao2: '', lac: '', pf: '' });

export function newPatient(hoje = todayISO()) {
  return {
    admissao: hoje,
    idade: '', sexo: '', peso: '', origem: '',
    diagnosticos: [],
    comorbidades: '', medicacoes: '', alergias: '', isolamento: '',
    neuro: { escala: '', valor: '', pupilas: '', picMin: '', picMax: '', obs: '' },
    dispositivos: [],
    atbs: [],
    culturas: [],
    infusoes: [],
    vent: { modo: '', fio2: '', peep: '', fr: '', vc: '', pi: '', psup: '', fluxo: '' },
    vitais: { pa: '', fc: '', sat: '', tax: '' },
    h24: emptyH24(),
    evacuacao: '',
    bhAcumulado: 0, // soma dos balanços dos dias anteriores
    labs: emptyLabs(), labsAnt: emptyLabs(),
    gaso: emptyGaso(), gasoAnt: emptyGaso(),
    exames: [],
    profilaxias: { tev: '', tevObs: '', lamg: '', lamgObs: '' },
    nutricao: { via: '', vazao: '', meta: '', obs: '' },
    pele: '',
    plano: '', planoOntem: '',
    pendencias: [],
    check: emptyChecks(), checkNote: emptyChecks(),
    conferir: {}, // seções copiadas do dia anterior que ainda não foram conferidas
    diaRound: hoje,
  };
}

// Garante que um registro antigo ou parcial tenha todos os campos atuais.
export function normalizePatient(p, hoje = todayISO()) {
  if (!p) return null;
  const base = newPatient(p.diaRound || hoje);
  const out = { ...base, ...p };
  for (const k of ['neuro', 'vent', 'vitais', 'profilaxias', 'nutricao']) out[k] = { ...base[k], ...(p[k] || {}) };
  out.h24 = { ...emptyH24(), ...(p.h24 || {}) };
  out.labs = { ...emptyLabs(), ...(p.labs || {}) };
  out.labsAnt = { ...emptyLabs(), ...(p.labsAnt || {}) };
  out.gaso = { ...emptyGaso(), ...(p.gaso || {}) };
  out.gasoAnt = { ...emptyGaso(), ...(p.gasoAnt || {}) };
  out.check = { ...emptyChecks(), ...(p.check || {}) };
  out.checkNote = { ...emptyChecks(), ...(p.checkNote || {}) };
  for (const k of ['diagnosticos', 'dispositivos', 'atbs', 'culturas', 'infusoes', 'exames', 'pendencias']) {
    out[k] = Array.isArray(p[k]) ? p[k].map((x) => ({ id: x.id || uid(), ...x })) : [];
  }
  out.conferir = p.conferir || {};
  return out;
}

export function defaultSettings() {
  return {
    unidade: 'CTI',
    leitos: Array.from({ length: 10 }, (_, i) => ({ id: `b${i + 1}`, label: String(i + 1).padStart(2, '0') })),
    drugConc: {},
  };
}

export function emptyState() {
  const settings = defaultSettings();
  const beds = {};
  for (const l of settings.leitos) beds[l.id] = { patient: null, updatedAt: 0 };
  return { version: 2, settings, settingsUpdatedAt: 0, beds };
}

// ---------------------------------------------------------------------------
// Migração do app anterior (chave "ronda_cti_v1": lista de 10 leitos).
// ---------------------------------------------------------------------------
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function matchDrug(nome) {
  const n = norm(nome);
  if (!n) return null;
  const alias = { nora: 'nora', noradrenalina: 'nora', norepinefrina: 'nora', vasopressina: 'vaso', vaso: 'vaso', dobuta: 'dobuta', dobutamina: 'dobuta', dopamina: 'dopa', nipride: 'nipride', nitroprussiato: 'nipride', tridil: 'tridil', nitroglicerina: 'tridil', amiodarona: 'amio', fentanil: 'fenta', fentanila: 'fenta', fenta: 'fenta', morfina: 'morfina', midazolam: 'mida', mida: 'mida', propofol: 'propofol', dexmedetomidina: 'dexme', precedex: 'dexme', cisatracurio: 'cisa', rocuronio: 'rocu' };
  for (const [k, id] of Object.entries(alias)) if (n === k || n.startsWith(k + ' ')) return id;
  const byName = DRUGS.find((d) => norm(d.nome) === n);
  return byName ? byName.id : null;
}

export function migrateV1(v1, hoje = todayISO()) {
  const state = emptyState();
  if (!Array.isArray(v1)) return state;
  state.settings.leitos = v1.map((b, i) => ({ id: `b${i + 1}`, label: String(b.num ?? i + 1).padStart(2, '0') }));
  state.beds = {};
  v1.forEach((b, i) => {
    const id = `b${i + 1}`;
    if (!b || !b.occupied) { state.beds[id] = { patient: null, updatedAt: 0 }; return; }
    const p = newPatient(hoje);
    p.admissao = '';
    p.idade = b.idade || ''; p.sexo = b.sexo || ''; p.peso = b.peso || '';
    if (has(b.diagnostico)) p.diagnosticos = [{ id: uid(), texto: b.diagnostico, data: '', cirurgia: false }];
    p.neuro.escala = b.neuroEscala || ''; p.neuro.valor = b.neuroValor || '';
    const modo = /O₂|O2/.test(b.modo || '') && /scara|ateter/i.test(b.modo || '') ? 'Máscara/cateter O2' : (b.modo || '');
    p.vent = { ...p.vent, modo, fio2: b.fio2 || '', peep: b.peep || '', fr: b.fr || '', vc: b.vc || '', pi: b.pi || '', psup: b.psup || '', fluxo: b.fluxo || '' };
    p.vitais = { ...p.vitais, ...(b.vitais || {}) };
    p.infusoes = (b.infusoes || []).filter((x) => x && (x.nome || x.vazao)).map((x) => {
      const drugId = matchDrug(x.nome);
      return { id: uid(), drugId: drugId || '', outra: !drugId, nome: drugId ? '' : (x.nome || ''), vazao: x.vazao || '' };
    });
    p.dispositivos = (b.invasoes || []).map((x) => ({
      id: uid(), nome: x.nome, data: x.data || '', origem: '', sitio: x.sitio || '', sitios: x.sitios || [],
      montagem: x.montagem || '', altura: x.altura || '', estado: x.estado || '', debito: x.debito || '',
      aspecto: x.aspecto || '', questionarRetirada: !!x.questionarRetirada,
    }));
    p.atbs = (b.atbs || []).filter((a) => a && a.nome).map((a) => {
      const dia = toNum(a.dia);
      return { id: uid(), nome: a.nome, inicio: Number.isFinite(dia) ? addDays(hoje, -dia) : '', duracao: a.total || '', foco: '', fim: '' };
    });
    const h = b.h24 || {};
    p.h24 = {
      ...emptyH24(), taxMax: h.tax || '', taxPicos: h.taxObs || '', pasMin: h.pasMin || '', pasMax: h.pasMax || '',
      padMin: h.padMin || '', padMax: h.padMax || '', frMin: h.frMin || '', frMax: h.frMax || '',
      gliMin: h.gliMin || '', gliMax: h.gliMax || '', insulina: h.gliObs || '',
      entradas: h.entradas || '', drenos: h.drenos || '', du: h.du || '', uf: h.uf || '',
    };
    p.evacuacao = h.evac || '';
    p.gaso = { ...emptyGaso(), ...(b.gaso || {}) };
    p.labs = { ...emptyLabs(), cr: b.creat || '' };
    p.check = { ...emptyChecks(), ...(b.check || {}) };
    p.checkNote = { ...emptyChecks(), ...(b.checkNote || {}) };
    p.pendencias = String(b.pend || '').split('\n').map((t) => t.trim()).filter(Boolean)
      .map((t) => ({ id: uid(), texto: t, feita: false }));
    state.beds[id] = { patient: p, updatedAt: Date.now() };
  });
  return state;
}
