// Biblioteca de infusões com as diluições padrão do CTI (concentração final).
// A concentração é editável em Ajustes; o valor salvo lá substitui o padrão.
import { toNum, fmtNum } from './format.js';

export const DRUGS = [
  { id: 'nora', nome: 'Noradrenalina', conc: 200, unit: 'mcg/mL', doses: ['mcg/kg/min'], diluicao: '20 mL + SG5% 80 mL' },
  { id: 'vaso', nome: 'Vasopressina', conc: 0.2, unit: 'UI/mL', doses: ['UI/min'], diluicao: '1 mL (20 UI) + SF 99 mL' },
  { id: 'dobuta', nome: 'Dobutamina', conc: 12.5, unit: 'mg/mL', doses: ['mcg/kg/min'], diluicao: '60 mL puro' },
  { id: 'dopa', nome: 'Dopamina', conc: 5, unit: 'mg/mL', doses: ['mcg/kg/min'], diluicao: '60 mL puro' },
  { id: 'nipride', nome: 'Nipride', conc: 200, unit: 'mcg/mL', doses: ['mcg/kg/min'], diluicao: '1 amp (50 mg) + SG5% 248 mL' },
  { id: 'tridil', nome: 'Nitroglicerina', conc: 100, unit: 'mcg/mL', doses: ['mcg/kg/min'], diluicao: '5 mL + SG5% 245 mL' },
  { id: 'amio', nome: 'Amiodarona', conc: 3.6, unit: 'mg/mL', doses: ['mg/h'], diluicao: '18 mL + SG5% 232 mL' },
  { id: 'fenta', nome: 'Fentanila', conc: 50, unit: 'mcg/mL', doses: ['mcg/h', 'mcg/kg/h'], diluicao: '60 mL puro' },
  { id: 'morfina', nome: 'Morfina', conc: 1, unit: 'mg/mL', doses: ['mg/h', 'mcg/kg/h'], diluicao: '10 mL + SF 90 mL' },
  { id: 'mida', nome: 'Midazolam', conc: 5, unit: 'mg/mL', doses: ['mg/h', 'mg/kg/h'], diluicao: '60 mL puro' },
  { id: 'propofol', nome: 'Propofol', conc: 10, unit: 'mg/mL', doses: ['mcg/kg/min', 'mg/kg/h'], diluicao: '60 mL puro (1%)' },
  { id: 'dexme', nome: 'Dexmedetomidina', conc: 4, unit: 'mcg/mL', doses: ['mcg/kg/h'], diluicao: '4 mL + SF 96 mL' },
  { id: 'cisa', nome: 'Cisatracúrio', conc: 2, unit: 'mg/mL', doses: ['mcg/kg/min'], diluicao: '60 mL puro' },
  { id: 'rocu', nome: 'Rocurônio', conc: 5, unit: 'mg/mL', doses: ['mcg/kg/min'], diluicao: '30 mL + SG5% 30 mL' },
];

export const DOSE_UNITS = ['mcg/kg/min', 'mcg/kg/h', 'mcg/h', 'mcg/min', 'mg/h', 'mg/kg/h', 'UI/min', 'UI/h'];

export function drugById(id) {
  return DRUGS.find((d) => d.id === id) || null;
}

// Concentração em uso: a de Ajustes, se houver, senão a padrão.
export function concFor(drug, overrides) {
  if (!drug) return NaN;
  const o = overrides && toNum(overrides[drug.id]);
  return Number.isFinite(o) && o > 0 ? o : drug.conc;
}

// Vazão (mL/h) + concentração -> dose na unidade pedida.
export function computeDose(mlh, conc, concUnit, doseU, peso) {
  const r = toNum(mlh), c = toNum(conc), w = toNum(peso);
  if (!(r > 0) || !(c > 0)) return null;
  if (concUnit === 'UI/mL') {
    const uiH = r * c;
    if (doseU === 'UI/min') return uiH / 60;
    if (doseU === 'UI/h') return uiH;
    return null;
  }
  let mcgH;
  if (concUnit === 'mcg/mL') mcgH = r * c;
  else if (concUnit === 'mg/mL') mcgH = r * c * 1000;
  else return null;
  const kg = w > 0 ? w : null;
  switch (doseU) {
    case 'mcg/kg/min': return kg ? mcgH / 60 / kg : null;
    case 'mcg/kg/h': return kg ? mcgH / kg : null;
    case 'mcg/h': return mcgH;
    case 'mcg/min': return mcgH / 60;
    case 'mg/h': return mcgH / 1000;
    case 'mg/kg/h': return kg ? mcgH / 1000 / kg : null;
    default: return null;
  }
}

export function needsWeight(doseU) {
  return /\/kg\//.test(doseU);
}

// Doses de uma infusão do leito, já formatadas: ["0,14 mcg/kg/min"].
export function infusionDoses(inf, peso, overrides) {
  const drug = drugById(inf.drugId);
  if (!drug) return [];
  const conc = concFor(drug, overrides);
  const out = [];
  for (const u of drug.doses) {
    const v = computeDose(inf.vazao, conc, drug.unit, u, peso);
    if (v !== null && Number.isFinite(v)) out.push(`${fmtNum(v)} ${u.replace('mL', 'ml')}`);
  }
  return out;
}

export function infusionName(inf) {
  const drug = drugById(inf.drugId);
  return drug ? drug.nome : (inf.nome || '').trim();
}

// "Noradrenalina 3 ml/h (0,14 mcg/kg/min)" - formato do CriticalEye.
export function infusionLine(inf, peso, overrides) {
  const nome = infusionName(inf);
  const r = toNum(inf.vazao);
  if (!nome && !(r > 0)) return '';
  let s = nome || 'Infusão';
  if (r > 0) s += ` ${fmtNum(r, 1)} ml/h`;
  const doses = r > 0 ? infusionDoses(inf, peso, overrides) : [];
  if (doses.length) s += ` (${doses.join(' - ')})`;
  return s;
}
