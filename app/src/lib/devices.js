// Dispositivos: catálogo, sítios, limites de dias e a linha no formato do CriticalEye.
import { diasDesde, ddmm } from './dates.js';
import { has, show } from './format.js';

export const CATALOG = [
  { cat: 'Via aérea', items: ['TOT', 'TQT'] },
  { cat: 'Vascular', items: ['CVC', 'PICC', 'CDL', 'PAI', 'Acesso periférico'] },
  { cat: 'Neuro', items: ['DVE', 'Cateter de PIC', 'DVP/DLP'] },
  { cat: 'Drenos', items: ['Hemovac', 'Dreno de cavidade', 'Dreno tubular/laminar', 'Dreno torácico'] },
  { cat: 'Urinário / digestivo', items: ['SVD', 'SNE/SNG', 'SNG em sifonagem', 'Ostomia'] },
];

export const ORIGENS = ['CTI', 'CC', 'Emergência', 'Enfermaria', 'Outro hospital'];

export const VASC_SITES = ['VSCE', 'VSCD', 'VJID', 'VJIE', 'VFE', 'VFD'];
export const SITE_OPTS = {
  CVC: VASC_SITES,
  CDL: VASC_SITES,
  PICC: ['Braço D', 'Braço E'],
  PAI: ['ARE', 'ARD', 'Braquial E', 'Braquial D', 'AFE', 'AFD'],
};
export const ABD_REGIOES = ['Hipocôndrio D', 'Epigástrio', 'Hipocôndrio E', 'Flanco D', 'Mesogástrio', 'Flanco E', 'Fossa ilíaca D', 'Hipogástrio', 'Fossa ilíaca E'];
export const ABD_CIRURGICAS = ['Subhepático', 'Subfrênico D', 'Subfrênico E', 'Pélvico/fundo de saco', 'Leito cirúrgico', 'Parietocólica D', 'Parietocólica E'];
export const TORAX_SITIOS = ['Hemitórax D', 'Hemitórax E', 'Anterior', 'Posterior', 'Basal', 'Apical'];
export const SITE_AMPLO = [...TORAX_SITIOS, ...ABD_REGIOES, ...ABD_CIRURGICAS];
export const MONTAGENS = ["Selo d'água", 'Pigtail', 'Aspiração contínua', 'Bolsa/gravidade'];
// No texto para o TI MED o apóstrofo fica de fora.
const MONTAGEM_TEXTO = { "Selo d'água": 'selo de água', Pigtail: 'pigtail', 'Aspiração contínua': 'aspiração contínua', 'Bolsa/gravidade': 'bolsa/gravidade' };

const ABD_DRAINS = ['Hemovac', 'Dreno de cavidade', 'Dreno tubular/laminar'];
const KNOWN = new Set(CATALOG.flatMap((g) => g.items));

export const isDVE = (n) => n === 'DVE';
export const isThorax = (n) => n === 'Dreno torácico';
export const isAbdDrain = (n) => ABD_DRAINS.includes(n);
export const isOstomia = (n) => n === 'Ostomia';
export const isSngSifon = (n) => n === 'SNG em sifonagem';
export const isOutro = (n) => !KNOWN.has(n);
export const hasDebito = (n) => isAbdDrain(n) || isThorax(n) || isDVE(n) || isSngSifon(n);
export const isViaAereaInvasiva = (n) => n === 'TOT' || n === 'TQT';

// Dispositivos que entram no balanço como dreno (perda). DVE e SNG em sifonagem contam; ostomia não (fezes).
// Cada dispositivo pode ser ligado ou desligado à mão (campo "balanco"); sem escolha, vale o tipo.
export const DRENO_PADRAO = new Set(['Hemovac', 'Dreno de cavidade', 'Dreno tubular/laminar', 'Dreno torácico', 'DVE', 'SNG em sifonagem']);
const NUNCA_DRENO = new Set(['TOT', 'TQT', 'CVC', 'PICC', 'CDL', 'PAI', 'Acesso periférico', 'Cateter de PIC', 'SVD', 'SNE/SNG']);
export const podeSerDreno = (n) => !NUNCA_DRENO.has(n);
export const contaNoBH = (d) => podeSerDreno(d.nome) && (typeof d.balanco === 'boolean' ? d.balanco : DRENO_PADRAO.has(d.nome));
export const drenosDoBH = (devs) => (devs || []).filter(contaNoBH);
export const nomeDreno = (d) => [d.nome, sitioTexto(d)].filter(Boolean).join(' ');

export function catOf(name) {
  for (const g of CATALOG) if (g.items.includes(name)) return g.cat;
  return 'Outro';
}

// Limites de dias (os mesmos do app anterior): TOT > 10 e punção venosa profunda > 14.
// CDL fica de fora: retirada guiada por sinais flogísticos, não por tempo.
export const LIMITES = { TOT: 10, CVC: 14, PICC: 14 };

export function statusDispositivo(d, hoje) {
  const dias = diasDesde(d.data, hoje);
  if (dias === null || dias < 0) return null;
  const lim = LIMITES[d.nome];
  return { dias, alerta: lim !== undefined && dias > lim };
}

export function sitioTexto(d) {
  const partes = [];
  if (has(d.sitio)) partes.push(d.sitio);
  if (d.sitios && d.sitios.length) partes.push(d.sitios.join('/'));
  return partes.join(' ');
}

// "D7 (D0 20/10 - CC) CVC VJID" (+ dados do dreno). A DVE detalhada vai para o Neurológico.
export function deviceLine(d, hoje) {
  const st = statusDispositivo(d, hoje);
  let prefix = '';
  if (st) prefix = `D${st.dias} (D0 ${ddmm(d.data)}${has(d.origem) ? ' - ' + d.origem : ''}) `;
  else if (has(d.origem)) prefix = `(${d.origem}) `;
  let s = prefix + d.nome;
  const sit = sitioTexto(d);
  if (sit) s += ' ' + sit;
  const extra = [];
  if (!isDVE(d.nome)) {
    if (has(d.montagem)) extra.push(MONTAGEM_TEXTO[d.montagem] || d.montagem);
    if (has(d.debito)) extra.push(`${show(d.debito)} ml/24 h`);
    if (has(d.aspecto)) extra.push(d.aspecto.trim());
  }
  if (extra.length) s += ' - ' + extra.join(' - ');
  if (st && st.alerta) s += ' - rever';
  return s;
}

// Linha da DVE no Neurológico: "DVE a 15 cmH2O - aberta - débito 180 ml/24 h - claro"
export function dveLine(d) {
  const parts = ['DVE' + (has(d.altura) ? ` a ${show(d.altura)} cmH2O` : '')];
  if (has(d.estado)) parts.push(d.estado);
  if (has(d.debito)) parts.push(`débito ${show(d.debito)} ml/24 h`);
  if (has(d.aspecto)) parts.push(d.aspecto.trim());
  return parts.join(' - ');
}
