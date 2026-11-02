import { drenosDoBH, nomeDreno } from './devices.js';
// Cálculos clínicos a partir do que o médico informou. Sem sugestão de conduta ou dose.
import { toNum, has } from './format.js';

// CKD-EPI 2021, sem termo de raça. Creatinina em mg/dL.
export function ckdEpi2021(cr, idade, sexo) {
  const c = toNum(cr), a = toNum(idade);
  if (!(c > 0) || !(a > 0) || (sexo !== 'F' && sexo !== 'M')) return null;
  const fem = sexo === 'F';
  const k = fem ? 0.7 : 0.9;
  const alpha = fem ? -0.241 : -0.302;
  const r = c / k;
  const tfg = 142 * Math.pow(Math.min(r, 1), alpha) * Math.pow(Math.max(r, 1), -1.2) *
    Math.pow(0.9938, a) * (fem ? 1.012 : 1);
  let classe;
  if (tfg >= 90) classe = 'G1';
  else if (tfg >= 60) classe = 'G2';
  else if (tfg >= 45) classe = 'G3a';
  else if (tfg >= 30) classe = 'G3b';
  else if (tfg >= 15) classe = 'G4';
  else classe = 'G5';
  return { tfg: Math.round(tfg), classe };
}

const num0 = (v) => { const x = toNum(v); return Number.isFinite(x) ? x : 0; };

// Perdas por dreno: débito de cada dispositivo que conta no balanço + "outros drenos" digitado à mão.
// Retorna null quando nenhum foi preenchido.
export function drenosTotal(h, devs) {
  const itens = drenosDoBH(devs).filter((d) => has(d.debito)).map((d) => ({ nome: nomeDreno(d), v: num0(d.debito) }));
  if (h && has(h.drenos)) itens.push({ nome: 'outros', v: num0(h.drenos) });
  if (!itens.length) return null;
  return { total: Math.round(itens.reduce((a, x) => a + x.v, 0)), itens };
}

// Balanço hídrico 24 h: ganhos - drenos - diurese - UF.
// Campo vazio = sem informação (não entra); 0 digitado entra como zero.
export function calcBH(h, devs = []) {
  if (!h) return null;
  const dr = drenosTotal(h, devs);
  if (!['entradas', 'du', 'uf'].some((k) => has(h[k])) && !dr) return null;
  return Math.round(num0(h.entradas) - (dr ? dr.total : 0) - num0(h.du) - num0(h.uf));
}

// Diurese em ml/kg/h no período de 24 h.
export function diureseMlKgH(du, peso) {
  const d = toNum(du), w = toNum(peso);
  if (!(d >= 0) || !(w > 0) || !has(du)) return null;
  return d / w / 24;
}

// PPC = PAM - PIC (só quando os dois foram informados).
export function ppc(pam, pic) {
  const a = toNum(pam), b = toNum(pic);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(a - b);
}
