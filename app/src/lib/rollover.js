// Round diário (regra do CriticalEye): o dia novo copia o anterior.
// Fica: identificação, diagnósticos, alertas, dispositivos, antibióticos (dias contam sozinhos),
// culturas, exames, profilaxias, nutrição, pele e pendências abertas.
// Neurológico, infusões e ventilação vêm marcados "conferir".
// Laboratório e gasometria de hoje passam a "anterior"; 24 h, sinais vitais, checklist e plano recomeçam.
import { calcBH } from './clinical.js';
import { emptyH24, emptyLabs, emptyGaso, normalizePatient } from './model.js';
import { has } from './format.js';

const filled = (o) => Object.entries(o || {}).some(([k, v]) => k !== 'data' && k !== 'hora' && has(v));

export function novoDia(patient, hoje) {
  const p = normalizePatient(patient, hoje);
  if (!p || p.diaRound === hoje) return p;
  const bh = calcBH(p.h24);
  const n = { ...p };
  n.bhAcumulado = (Number(p.bhAcumulado) || 0) + (bh === null ? 0 : bh);
  n.h24 = emptyH24();
  n.vitais = { pa: '', fc: '', sat: '', tax: '' };
  if (filled(p.labs)) { n.labsAnt = { ...p.labs }; n.labs = { ...emptyLabs() }; }
  if (filled(p.gaso)) { n.gasoAnt = { ...p.gaso }; n.gaso = { ...emptyGaso() }; }
  n.dispositivos = p.dispositivos.map((d) => ({ ...d, debito: '' }));
  n.check = { inv: '', prof: '', analg: '', atb: '', lab: '', rx: '' };
  n.checkNote = { inv: '', prof: '', analg: '', atb: '', lab: '', rx: '' };
  n.planoOntem = p.plano || p.planoOntem || '';
  n.plano = '';
  n.pendencias = p.pendencias.filter((x) => !x.feita);
  n.conferir = {
    neuro: has(p.neuro.escala) || has(p.neuro.valor) || has(p.neuro.pupilas),
    infusoes: p.infusoes.length > 0,
    vent: has(p.vent.modo),
  };
  n.diaRound = hoje;
  return n;
}

export function precisaNovoDia(patient, hoje) {
  return !!patient && patient.diaRound !== hoje;
}
