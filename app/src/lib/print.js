// Folha do round impresso (modelo CriticalEye): só o que foi preenchido, na ordem da tela.
import { ddmm, ddmmyyyy, diaSemana, horaAtual } from './dates.js';
import { has, lines } from './format.js';
import { infusionLine } from './drugs.js';
import { deviceLine, isDVE } from './devices.js';
import { CHECK_DEFS } from './model.js';
import {
  diasCTI, diasInternacao, idLine, diagLines, atbLines, culturaLines, ventLines, neuroLines,
  h24Lines, labLines, gasoLines, exameLines, profilaxiaLines, nutricaoLines, vitaisLine, pendenciaLines,
} from './text.js';

const CHECK_TXT = { ok: 'OK', pend: 'pendência', na: 'N/A' };

export function fichaLeito(p, { hoje, leito, drugConc }) {
  const dias = [];
  const di = diasInternacao(p, hoje);
  if (di !== null) dias.push(`D${di} de internação (${ddmm(p.internacao)})`);
  const dc = diasCTI(p, hoje);
  if (dc !== null) dias.push(`D${dc} de CTI (${ddmm(p.admissao)})`);

  const diag = diagLines(p, hoje);
  if (has(p.comorbidades)) diag.push(`Comorbidades: ${lines(p.comorbidades).join(', ')}`);
  if (has(p.medicacoes)) diag.push(`Uso contínuo: ${lines(p.medicacoes).join('; ')}`);
  const vit = vitaisLine(p);

  const secoes = [
    { t: 'Checklist da ronda', checklist: CHECK_DEFS.map((c) => ({ t: c.s, v: p.check[c.k] || '', txt: CHECK_TXT[p.check[c.k]] || '', nota: (p.checkNote[c.k] || '').trim() })) },
    { t: 'Diagnósticos', items: diag },
    { t: 'Dispositivos', items: p.dispositivos.map((d) => deviceLine(d, hoje)), alerta: (l) => / - rever$/.test(l) },
    { t: 'Infusões', items: p.infusoes.map((i) => infusionLine(i, p.peso, drugConc)).filter(Boolean) },
    { t: 'Ventilação', items: ventLines(p, hoje) },
    { t: 'Neurológico', items: neuroLines(p) },
    { t: 'Antimicrobianos', items: atbLines(p, hoje) },
    { t: 'Culturas', items: culturaLines(p) },
    { t: 'Profilaxias', items: profilaxiaLines(p) },
    { t: 'Sinais vitais agora', items: vit ? [vit] : [] },
    { t: 'Últimas 24 h e balanço', items: h24Lines(p) },
    { t: labTitle('Laboratório', p.labs, p.labsAnt), items: labLines(p) },
    { t: labTitle('Gasometria', p.gaso, p.gasoAnt), items: gasoLines(p) },
    { t: 'Imagem e outros exames', items: exameLines(p) },
    { t: 'Nutrição e TGI', items: nutricaoLines(p) },
    { t: 'Pele', items: lines(p.pele) },
    { t: 'Plano', items: lines(p.plano), sempre: true, vazias: lines(p.plano).length ? 0 : 3 },
    { t: 'Pendências', pendencias: pendenciaLines(p), sempre: true },
    { t: 'Anotações do plantão', anotacoes: true, sempre: true },
  ].filter((s) => s.sempre || s.checklist || (s.items && s.items.length));

  return {
    leito,
    id: idLine(p),
    dias,
    alergias: lines(p.alergias),
    isolamento: lines(p.isolamento),
    dve: p.dispositivos.some((d) => isDVE(d.nome) && d.questionarRetirada),
    secoes,
  };
}

function labTitle(t, atual, ant) {
  const a = atual && atual.data ? ddmm(atual.data) : '';
  const b = ant && ant.data ? ddmm(ant.data) : '';
  if (a && b && a !== b) return `${t} (${b} > ${a})`;
  return a ? `${t} (${a})` : t;
}

export function cabecalho(unidade, hoje, now = new Date()) {
  return `${unidade || 'CTI'} - Round de ${diaSemana(hoje).toLowerCase()}, ${ddmmyyyy(hoje)} - impresso às ${horaAtual(now)}`;
}

export const folhas = (n, porFolha) => Math.ceil(n / porFolha);
