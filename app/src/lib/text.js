// Textos para colar no prontuário (TI MED): evolução padrão e passagem de plantão.
// Modelo do CriticalEye: um item por linha, linha em branco entre seções,
// só letras, números, acentos e / - : > < + % , . ( )
import { ddmm, ddmmyyyy, diasDesde, horaAtual } from './dates.js';
import { has, show, fmtNum, fmtInt, fmtSigned, toNum, lines, tiMedSafe } from './format.js';
import { calcBH, drenosTotal, ckdEpi2021, diureseMlKgH } from './clinical.js';
import { infusionLine } from './drugs.js';
import { deviceLine, dveLine, isDVE, isViaAereaInvasiva, statusDispositivo } from './devices.js';
import { LAB_KEYS, GASO_KEYS, CHECK_DEFS } from './model.js';

const VM_MODES = ['VCV', 'PCV', 'PSV'];
const SEXO = { M: 'masculino', F: 'feminino' };

export function diasCTI(p, hoje) {
  const d = diasDesde(p.admissao, hoje);
  return d === null || d < 0 ? null : d;
}

export function diasInternacao(p, hoje) {
  const d = diasDesde(p.internacao, hoje);
  return d === null || d < 0 ? null : d;
}

export function idLine(p) {
  const parts = [];
  if (has(p.idade)) parts.push(`${show(p.idade)} anos`);
  if (SEXO[p.sexo]) parts.push(SEXO[p.sexo]);
  if (has(p.peso)) parts.push(`${show(p.peso)} kg`);
  return parts.join(' - ');
}

export function diagLines(p, hoje) {
  return p.diagnosticos.filter((d) => has(d.texto)).map((d, i) => {
    let s = `${i + 1}. ${d.texto.trim()}`;
    if (has(d.data)) {
      s += ` (${ddmm(d.data)})`;
      if (d.cirurgia) {
        const po = diasDesde(d.data, hoje);
        if (po !== null && po >= 0) s += ` - PO D${po}`;
      }
    }
    return s;
  });
}

export function atbLines(p, hoje) {
  const out = [];
  for (const a of p.atbs.filter((x) => has(x.nome) && !has(x.fim))) {
    const d = diasDesde(a.inicio, hoje);
    let s = d !== null && d >= 0 ? `D${d} (D0 ${ddmm(a.inicio)}) ${a.nome.trim()}` : a.nome.trim();
    if (has(a.foco)) s += ` - foco ${a.foco.trim()}`;
    if (has(a.duracao)) s += ` - previsto ${show(a.duracao)} dias`;
    out.push(s);
  }
  const previos = p.atbs.filter((x) => has(x.nome) && has(x.fim));
  for (const a of previos) {
    out.push(`Prévio: ${a.nome.trim()}` + (has(a.inicio) ? ` (${ddmm(a.inicio)} a ${ddmm(a.fim)})` : ` (até ${ddmm(a.fim)})`));
  }
  return out;
}

export function culturaLines(p) {
  return [...p.culturas]
    .filter((c) => has(c.material) || has(c.resultado))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
    .map((c) => {
      let s = (c.material || 'Cultura').trim();
      if (has(c.data)) s += ` ${ddmm(c.data)}`;
      s += `: ${has(c.resultado) ? c.resultado.trim() : 'pendente'}`;
      return s;
    });
}

export function ventLines(p, hoje) {
  const v = p.vent;
  const out = [];
  if (!has(v.modo)) return out;
  const via = p.dispositivos.find((d) => isViaAereaInvasiva(d.nome));
  if (via && VM_MODES.includes(v.modo)) {
    const st = statusDispositivo(via, hoje);
    out.push((st ? `D${st.dias} (D0 ${ddmm(via.data)}) ` : '') + `${via.nome} + VM`);
  }
  const p2 = [];
  const add = (label, val, unit = '') => { if (has(val)) p2.push(`${label} ${show(val)}${unit}`); };
  switch (v.modo) {
    case 'VCV': case 'PCV': case 'PSV':
      p2.push(v.modo);
      if (v.modo === 'PCV') add('Pinsp', v.pi);
      if (v.modo === 'PSV') add('Psup', v.psup);
      add('PEEP', v.peep); add('FiO2', v.fio2, '%'); add('FR', v.fr); add('VC', v.vc, ' ml');
      break;
    case 'VNI':
      p2.push('VNI'); add('Psup', v.psup); add('PEEP', v.peep); add('FiO2', v.fio2, '%');
      break;
    case 'CNAF':
      p2.push('CNAF'); add('fluxo', v.fluxo, ' L/min'); add('FiO2', v.fio2, '%');
      break;
    case 'Máscara/cateter O2':
      p2.push('O2 suplementar'); add('', v.fluxo, ' L/min');
      break;
    default:
      p2.push(v.modo);
  }
  out.push(p2.map((x) => x.trim()).join(' / '));
  return out;
}

export function neuroLines(p) {
  const n = p.neuro;
  const out = [];
  if (has(n.escala) && has(n.valor)) out.push(`${n.escala} ${show(n.valor)}`);
  else if (has(n.valor)) out.push(show(n.valor));
  if (has(n.pupilas)) out.push(`Pupilas: ${n.pupilas.trim()}`);
  if (has(n.picMin) || has(n.picMax)) {
    const r = [n.picMin, n.picMax].filter(has).map(show).join('-');
    out.push(`PIC ${r} mmHg`);
  }
  for (const d of p.dispositivos.filter((x) => isDVE(x.nome))) out.push(dveLine(d));
  out.push(...lines(n.obs));
  return out;
}

const faixa = (a, b) => [a, b].filter(has).map(show).join('-');

export function h24Lines(p) {
  const h = p.h24;
  const out = [];
  if (has(h.taxMax)) out.push(`Tax máx ${show(h.taxMax)}` + (has(h.taxPicos) ? ` (${h.taxPicos.trim()})` : ''));
  const pas = faixa(h.pasMin, h.pasMax), pad = faixa(h.padMin, h.padMax);
  if (pas || pad) out.push([pas && `PAS ${pas}`, pad && `PAD ${pad}`].filter(Boolean).join(' / '));
  const fc = faixa(h.fcMin, h.fcMax); if (fc) out.push(`FC ${fc}`);
  const fr = faixa(h.frMin, h.frMax); if (fr) out.push(`FR ${fr}`);
  const gli = faixa(h.gliMin, h.gliMax);
  if (gli || has(h.insulina)) out.push(`Glicemia ${gli || '-'}` + (has(h.insulina) ? ` (${h.insulina.trim()})` : ''));
  if (has(h.entradas)) out.push(`Ganhos ${fmtInt(toNum(h.entradas))} ml`);
  if (has(h.du)) {
    const mk = diureseMlKgH(h.du, p.peso);
    out.push(`Diurese ${fmtInt(toNum(h.du))} ml` + (mk !== null ? ` (${fmtNum(mk, 1)} ml/kg/h)` : ''));
  }
  const dr = drenosTotal(h, p.dispositivos);
  if (dr) {
    const det = dr.itens.length > 1 || dr.itens[0].nome !== 'outros' ? ` (${dr.itens.map((x) => `${x.nome} ${fmtInt(x.v)}`).join(' / ')})` : '';
    out.push(`Drenos ${fmtInt(dr.total)} ml${det}`);
  }
  if (has(h.uf)) out.push(`UF ${fmtInt(toNum(h.uf))} ml`);
  const bh = calcBH(h, p.dispositivos);
  if (bh !== null) {
    const acum = (Number(p.bhAcumulado) || 0) + bh;
    out.push(`BH ${fmtSigned(bh)} ml` + (Number(p.bhAcumulado) ? ` / acumulado ${fmtSigned(acum)} ml` : ''));
  }
  return out;
}

function compareBlock(atual, ant, keys, extra = []) {
  const out = [];
  for (const [k, label] of keys) {
    const a = ant[k], b = atual[k];
    if (has(a) && has(b)) out.push(`${label} ${show(a)} > ${show(b)}`);
    else if (has(b)) out.push(`${label} ${show(b)}`);
    else if (has(a)) out.push(`${label} ${show(a)} (anterior)`);
  }
  return out.concat(extra);
}

function headerDates(atual, ant) {
  const a = has(ant.data) ? ddmm(ant.data) : '';
  const b = has(atual.data) ? ddmm(atual.data) : '';
  if (a && b) return ` (${a} > ${b})`;
  if (b) return ` (${b})`;
  if (a) return ` (${a})`;
  return '';
}

export function labLines(p) {
  const extra = [];
  const t1 = ckdEpi2021(p.labs.cr, p.idade, p.sexo);
  const t0 = ckdEpi2021(p.labsAnt.cr, p.idade, p.sexo);
  if (t0 && t1) extra.push(`TFG (CKD-EPI 2021) ${t0.tfg} > ${t1.tfg}`);
  else if (t1) extra.push(`TFG (CKD-EPI 2021) ${t1.tfg} - ${t1.classe}`);
  extra.push(...lines(p.labs.outros));
  return compareBlock(p.labs, p.labsAnt, LAB_KEYS, extra);
}

export function gasoLines(p) {
  return compareBlock(p.gaso, p.gasoAnt, GASO_KEYS);
}

export function exameLines(p) {
  return [...p.exames]
    .filter((e) => has(e.exame) || has(e.resultado))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')))
    .map((e) => `${(e.exame || 'Exame').trim()}${has(e.data) ? ' ' + ddmm(e.data) : ''}: ${has(e.resultado) ? e.resultado.trim() : 'aguarda laudo'}`);
}

export function profilaxiaLines(p) {
  const f = p.profilaxias;
  const out = [];
  if (has(f.tev) || has(f.tevObs)) out.push(`TEV: ${[f.tev, f.tevObs].filter(has).map((x) => x.trim()).join(' - ')}`);
  if (has(f.lamg) || has(f.lamgObs)) out.push(`LAMG: ${[f.lamg, f.lamgObs].filter(has).map((x) => x.trim()).join(' - ')}`);
  return out;
}

export function nutricaoLines(p) {
  const n = p.nutricao;
  const out = [];
  if (has(n.via)) {
    let s = n.via;
    if (has(n.vazao)) s += ` ${show(n.vazao)} ml/h`;
    if (has(n.meta)) s += ` - ${show(n.meta)}% da meta`;
    out.push(s);
  }
  out.push(...lines(n.obs));
  if (has(p.evacuacao)) out.push(`Última evacuação: ${/^\d{4}-\d{2}-\d{2}$/.test(p.evacuacao) ? ddmm(p.evacuacao) : p.evacuacao.trim()}`);
  return out;
}

export function vitaisLine(p) {
  const v = p.vitais;
  const parts = [];
  if (has(v.pa)) parts.push(`PA ${show(v.pa)} mmHg`);
  if (has(v.fc)) parts.push(`FC ${show(v.fc)} bpm`);
  if (has(v.sat)) parts.push(`SatO2 ${show(v.sat)}%`);
  if (has(v.tax)) parts.push(`Tax ${show(v.tax)}`);
  return parts.join(' - ');
}

// Pendências abertas + itens do checklist marcados como pendência + DVE a questionar.
export function pendenciaLines(p) {
  const out = p.pendencias.filter((x) => !x.feita && has(x.texto)).map((x) => x.texto.trim());
  for (const c of CHECK_DEFS) {
    if (p.check[c.k] === 'pend') out.push(`${c.s}: ${has(p.checkNote[c.k]) ? p.checkNote[c.k].trim() : 'pendência'}`);
  }
  if (p.dispositivos.some((d) => isDVE(d.nome) && d.questionarRetirada)) out.push('Questionar retirada da DVE');
  return out;
}

function section(title, items, opts = {}) {
  if (!items.length && !opts.always) return [];
  return [`${title}:`, ...items, ''];
}

export function buildEvolucao(p, ctx) {
  const { hoje, unidade, leito, drugConc } = ctx;
  const head = [`EVOLUÇÃO MÉDICA - ${(unidade || 'CTI').toUpperCase()} - LEITO ${leito} - ${ddmmyyyy(hoje)}`];
  const id = idLine(p);
  if (id) head.push(id);
  const di = diasInternacao(p, hoje);
  if (di !== null) head.push(`D${di} de internação hospitalar (${ddmm(p.internacao)})`);
  const dc = diasCTI(p, hoje);
  if (dc !== null) head.push(`D${dc} de CTI (admissão em ${ddmm(p.admissao)})`);
  head.push('');

  const infs = p.infusoes.map((i) => infusionLine(i, p.peso, drugConc)).filter(Boolean);
  const devs = p.dispositivos.map((d) => deviceLine(d, hoje));
  const vit = vitaisLine(p);

  const out = [
    ...head,
    ...section('DIAGNÓSTICOS', diagLines(p, hoje)),
    ...section('HDA', lines(p.hda)),
    ...section('COMORBIDADES', lines(p.comorbidades)),
    ...section('MEDICAÇÕES DE USO CONTÍNUO', lines(p.medicacoes)),
    ...section('ALERGIAS', lines(p.alergias)),
    ...section('ISOLAMENTO', lines(p.isolamento)),
    ...section('DISPOSITIVOS', devs),
    ...section('ANTIMICROBIANOS', atbLines(p, hoje)),
    ...section('CULTURAS', culturaLines(p)),
    ...section('INFUSÕES', infs),
    ...section('VENTILAÇÃO', ventLines(p, hoje)),
    ...section('NEUROLÓGICO', neuroLines(p)),
    ...section('ÚLTIMAS 24 H', h24Lines(p)),
    ...section(`LABORATÓRIO${headerDates(p.labs, p.labsAnt)}`, labLines(p)),
    ...section(`GASOMETRIA${headerDates(p.gaso, p.gasoAnt)}`, gasoLines(p)),
    ...section('IMAGEM E OUTROS EXAMES', exameLines(p)),
    ...section('PROFILAXIAS', profilaxiaLines(p)),
    ...section('NUTRIÇÃO E TGI', nutricaoLines(p)),
    ...section('PELE', lines(p.pele)),
    'EXAME FÍSICO:',
    ...(vit ? [vit] : []),
    '',
    '',
    ...section('PLANO', lines(p.plano), { always: true }),
    ...section('PENDÊNCIAS', pendenciaLines(p)),
  ];
  return tiMedSafe(out.join('\n'));
}

// Passagem de plantão: todos os leitos ocupados, condensado.
// Linhas principais sempre aparecem; sem dado, "sem registro".
export function buildPassagem(entries, ctx) {
  const { hoje, unidade, drugConc, now = new Date() } = ctx;
  const out = [`PASSAGEM DE PLANTÃO - ${(unidade || 'CTI').toUpperCase()} - ${ddmmyyyy(hoje)} ${horaAtual(now)}`, ''];
  const sr = 'sem registro';
  for (const { leito, patient: p } of entries) {
    if (!p) continue;
    const head = [`LEITO ${leito}`];
    const id = idLine(p);
    if (id) head.push(id);
    const di = diasInternacao(p, hoje);
    if (di !== null) head.push(`D${di} de internação`);
    const dc = diasCTI(p, hoje);
    if (dc !== null) head.push(`D${dc} de CTI`);
    out.push(head.join(' - '));
    const dx = diagLines(p, hoje).map((l) => l.replace(/^\d+\. /, ''));
    out.push(`Dx: ${dx.length ? dx.join('; ') : sr}`);
    if (has(p.alergias)) out.push(`Alergias: ${lines(p.alergias).join('; ')}`);
    if (has(p.isolamento)) out.push(`Isolamento: ${lines(p.isolamento).join('; ')}`);
    const neuro = neuroLines(p);
    out.push(`Neuro: ${neuro.length ? neuro.join('; ') : sr}`);
    const vent = ventLines(p, hoje);
    out.push(`Ventilação: ${vent.length ? vent.join(' - ') : sr}`);
    const infs = p.infusoes.map((i) => infusionLine(i, p.peso, drugConc)).filter(Boolean);
    out.push(`Infusões: ${infs.length ? infs.join('; ') : sr}`);
    const devs = p.dispositivos.map((d) => deviceLine(d, hoje));
    out.push(`Dispositivos: ${devs.length ? devs.join('; ') : sr}`);
    const atb = atbLines(p, hoje).filter((l) => !l.startsWith('Prévio'));
    out.push(`ATB: ${atb.length ? atb.join('; ') : sr}`);
    const bh = calcBH(p.h24, p.dispositivos);
    out.push(`BH: ${bh === null ? sr : fmtSigned(bh) + ' ml' + (Number(p.bhAcumulado) ? ` / acumulado ${fmtSigned((Number(p.bhAcumulado) || 0) + bh)} ml` : '')}`);
    const pend = pendenciaLines(p);
    out.push(`Pendências: ${pend.length ? pend.join('; ') : sr}`);
    out.push('');
  }
  return tiMedSafe(out.join('\n'));
}
