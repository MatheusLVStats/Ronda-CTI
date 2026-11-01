// Leitura de PDF de laboratório (painel, outros exames e gasometria) e de laudo de imagem.
// Tudo vira sugestão para a tela de conferência; nada entra no leito sem o médico marcar.
import { strip, clean, findDate } from './importer.js';
import { emptyLabs, emptyGaso, uid } from './model.js';
import { has, toNum, fmtInt } from './format.js';
import { addDays } from './dates.js';

// ---------- laboratório ----------
// Nome do exame no começo da linha (ou da coluna), valor logo depois. A faixa plausível evita pegar o valor de referência.
export const LAB_DEFS = [
  { k: 'hb', alvo: 'labs', re: /^(hemoglobina|hb)\b(?!\s*(corpuscular|glicada|glicosilada|a1c|fetal|s\b))/, faixa: [2, 25] },
  { k: 'leuc', alvo: 'labs', re: /^(leucocitos( totais)?|leucometria|global de leucocitos|globulos brancos|wbc)\b/, faixa: [50, 500000], milhar: true },
  { k: 'plaq', alvo: 'labs', re: /^(plaquetas|contagem de plaquetas|plaquetometria|plt)\b/, faixa: [1000, 3000000], milhar: true },
  { k: 'pcr', alvo: 'labs', re: /^(proteina c reativa|pcr)\b(?!.*(sars|covid|rt-|pcr para))/, faixa: [0, 1000] },
  { k: 'inr', alvo: 'labs', inr: true, faixa: [0.5, 20] },
  { k: 'na', alvo: 'labs', re: /^(sodio|na\+?)(\s|:|\(|$)/, faixa: [100, 190] },
  { k: 'k', alvo: 'labs', re: /^(potassio|k\+?)(\s|:|\(|$)/, faixa: [1, 10] },
  { k: 'mg', alvo: 'labs', re: /^(magnesio|mg\+{0,2})(\s|:|\(|$)/, faixa: [0.3, 8] },
  { k: 'ur', alvo: 'labs', re: /^(ureia|ur)\b/, faixa: [2, 600] },
  { k: 'cr', alvo: 'labs', re: /^(creatinina|cr)\b(?!.*(clearance|depuracao))/, faixa: [0.1, 25] },
  { k: 'ph', alvo: 'gaso', re: /^ph\b/, faixa: [6.5, 8] },
  { k: 'pco2', alvo: 'gaso', re: /^(pa?co2|pa? co2|pa?co 2)\b/, faixa: [5, 160] },
  { k: 'po2', alvo: 'gaso', re: /^(pa?o2|pa? o2|pa?o 2)\b(?!\s*\/\s*fio)/, faixa: [10, 700] },
  { k: 'hco3', alvo: 'gaso', re: /^(c?hco3|bicarbonato)\b/, faixa: [1, 60] },
  { k: 'be', alvo: 'gaso', re: /^(be|beecf|be ecf|beb|be b|abe|sbe|cbase|excesso de bases?|base excess)\b/, faixa: [-40, 40] },
  { k: 'sao2', alvo: 'gaso', re: /^(so2|sao2|sato2|sat o2|o2 ?sat|saturacao( de o2| de oxigenio| de oxi-hemoglobina)?)\b/, faixa: [10, 100] },
  { k: 'lac', alvo: 'gaso', re: /^(lactato|c?lac|acido latico)\b/, faixa: [0, 40] },
];

const OUTROS_DEFS = [
  ['Ht', /^(hematocrito|ht)\b/], ['Glicose', /^(glicose|glicemia)\b(?!.*capilar)/],
  ['Ca iônico', /^(calcio ionico|calcio ionizado|cai)\b/], ['Ca', /^calcio(?! ion)( total)?\b/], ['Cl', /^(cloro|cloreto)\b/], ['P', /^(fosforo|fosfato)\b/],
  ['TGO', /^(tgo|ast|aspartato aminotransferase)\b/], ['TGP', /^(tgp|alt|alanina aminotransferase)\b/],
  ['BT', /^(bilirrubina total|bt)\b/], ['BD', /^bilirrubina direta\b/], ['Albumina', /^albumina\b/],
  ['TTPA', /^(ttpa|tempo de tromboplastina parcial ativad[ao])\b/], ['Fibrinogênio', /^fibrinogenio\b/],
  ['Troponina', /^troponina\b/], ['Procalcitonina', /^procalcitonina\b/], ['CK', /^(cpk|ck|creatinoquinase|creatina quinase)\b(?!\s*-?\s*mb)/],
  ['Amilase', /^amilase\b/], ['Lipase', /^lipase\b/], ['DHL', /^(dhl|ldh|desidrogenase latica)\b/],
];
// Exames que só existem no sangue: quando aparecem, acabou o bloco da urina (EAS).
const SO_SANGUE = new Set(['na', 'k', 'mg', 'ur', 'cr', 'pcr', 'inr', 'pco2', 'po2', 'hco3', 'be', 'lac', 'plaq', 'sao2',
  'Ht', 'Ca iônico', 'Ca', 'Cl', 'P', 'TGO', 'TGP', 'Albumina', 'TTPA', 'Fibrinogênio', 'Troponina', 'Procalcitonina', 'CK', 'Amilase', 'Lipase', 'DHL']);

const NUM = '([-+]?\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?|[-+]?\\d+(?:[.,]\\d+)?)';
const NUM_RE = new RegExp(NUM);
const NUM_INICIO = new RegExp('^(?:resultado\\s*:?\\s*)?[<>]?\\s*' + NUM);
const INR_RE = /\b(?:inr|rni)\b\s*:?\s*(\d+[.,]\d+)?\s*$|\b(?:inr|rni)\b\s*:?\s*(\d+[.,]\d+)/;
const URINA_HDR = /^(eas|urina\b|urinalise|exame (sumario )?de urina|sumario de urina|elementos anormais|urocultura|parcial de urina|qualitativo de urina)/;
const SANGUE_HDR = /^(gasometria|hemograma|bioquimica|coagulograma|eletrolitos|funcao renal|funcao hepatica|marcadores|ionograma|leucograma|eritrograma|plaquetograma)\b/;
const IGNORAR = /^(valor(es)? de refer|referencia|vr\b|metodo|unidade|nota\b|obs\b|observac)/;
const COLETA_RE = /(?:data\s+d[ae]\s+coleta|coletad[oa]\s+em|coleta|data\s+do\s+exame|data\s+de\s+realiza[cç][aã]o)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)(?:\s*(?:as|às|-)?\s*(\d{1,2}:\d{2}))?/i;

// Sinal de menos tipográfico (−, ‐, –) vira "-" para não perder o sinal do BE.
const norm = (s) => strip(String(s || '').normalize('NFKC').replace(/[\u2212\u2010\u2011\u2012\u2013]/g, '-'));
const junta = (s) => String(s || '').replace(/\s+/g, ' ').trim(); // como clean(), mas sem tirar o "-" do começo
const virgula = (v) => String(v).replace(/^\+/, '').replace(/^(-?\d+)\.(\d{1,2})$/, '$1,$2');

function valueAfter(line, m) {
  const rest = line.slice(m.index + m[0].length);
  const n = rest.match(NUM_RE);
  if (!n || n.index > 45) return '';
  return n[1];
}
const numInicio = (s) => { const m = String(s || '').match(NUM_INICIO); return m ? m[1] : ''; };

function inFaixa(v, faixa) {
  if (!faixa) return true;
  const x = toNum(v);
  return Number.isFinite(x) && x >= faixa[0] && x <= faixa[1];
}

// Data do documento quando não há "coleta" escrita: a primeira data recente que não seja nascimento.
export function dataRecente(linhas, hoje) {
  const min = addDays(hoje, -400);
  for (const l of linhas) {
    const n = norm(l);
    if (/nasc|\bd\.?\s?n\.?\s*:|\bidade\b/.test(n)) continue;
    const d = findDate(l, hoje);
    if (d && d >= min && d <= hoje) return d;
  }
  return '';
}

// Procura exames em cada coluna da linha. Sem valor na coluna do nome, usa o começo da coluna seguinte.
function achar(segs) {
  const hits = [];
  segs.forEach((seg, i) => {
    const n = norm(clean(seg)); // nome do exame: tira marcador de lista
    const prox = segs[i + 1] ? norm(segs[i + 1]) : ''; // valor: mantém o sinal
    for (const def of LAB_DEFS) {
      if (hits.some((h) => h.def === def)) continue;
      let v = '';
      if (def.inr) {
        const m = n.match(INR_RE);
        if (!m) continue;
        v = m[2] || m[1] || (/\d/.test(n.slice(m.index + 3)) ? '' : numInicio(prox));
      } else {
        const m = n.match(def.re);
        if (!m) continue;
        v = valueAfter(n, m) || (/\d/.test(n.slice(m.index + m[0].length)) ? '' : numInicio(prox));
      }
      hits.push({ def, k: def.k, valor: v, sangue: SO_SANGUE.has(def.k) });
      break;
    }
    for (const [label, re] of OUTROS_DEFS) {
      const m = n.match(re);
      if (!m) continue;
      const v = valueAfter(n, m) || (/\d/.test(n.slice(m.index + m[0].length)) ? '' : numInicio(prox));
      hits.push({ label, valor: v, sangue: SO_SANGUE.has(label) });
      break;
    }
  });
  return hits;
}

export function parseLab(text, hoje) {
  const t = String(text || '');
  const linhas = t.split('\n').map((l) => l.trim()).filter((l) => clean(l));
  const coleta = t.normalize('NFKC').match(COLETA_RE);
  const data = coleta ? findDate(coleta[1], hoje) : dataRecente(linhas, hoje);
  let hora = coleta && coleta[2] ? coleta[2] : '';
  if (!hora) { const h = t.match(/hora\s+d[ae]\s+coleta\s*:?\s*(\d{1,2}:\d{2})/i); if (h) hora = h[1]; }
  const venosa = /gasometria\s+venosa/.test(norm(t));
  const candidatos = {};
  const outros = [];

  const registrar = (h, v, fonte) => {
    let valor = virgula(v);
    if (h.label) {
      if (!outros.some((x) => x.label === h.label)) outros.push({ label: h.label, valor, fonte });
      return;
    }
    let nota = '';
    if (h.def.milhar) {
      const x = toNum(valor);
      if (Number.isFinite(x) && x < 1000 && /(\bmil\b|x\s*10\s*(\^|e)?\s*[39³⁹]|10\s*\^\s*[39]|10[³⁹]|\/\s*nl\b|k\s*\/\s*[uµμ]l\b)/i.test(fonte)) {
        nota = `Convertido de ${valor} mil.`;
        valor = fmtInt(x * 1000);
      }
    }
    if (h.k === 'pcr' && /mg\s*\/\s*l\b/i.test(fonte) && !/mg\s*\/\s*dl/i.test(fonte)) nota = 'No PDF a unidade é mg/L.';
    (candidatos[h.k] = candidatos[h.k] || []).push({ k: h.k, alvo: h.def.alvo, valor, suspeito: !inFaixa(valor, h.def.faixa), fonte, nota });
  };

  let secao = '';
  let pend = null; // nome do exame sozinho na linha: o valor vem na linha de baixo
  for (const raw of linhas) {
    const segs = raw.split('\t').map(junta).filter(Boolean);
    const full = clean(raw.replace(/\t/g, ' '));
    const n = norm(full);
    if (pend) {
      const v = numInicio(norm(junta(raw)));
      if (v) { registrar(pend.hit, v, `${pend.fonte} ${full}`); pend = null; continue; }
      if (!/^material\b/.test(n) && !IGNORAR.test(n)) pend = null; // "Material: soro" pode vir entre o nome e o resultado
    }
    if (/^material\b/.test(n)) { secao = /urin/.test(n) ? 'urina' : 'sangue'; continue; }
    if (URINA_HDR.test(n)) { secao = 'urina'; continue; }
    if (SANGUE_HDR.test(n)) { secao = n.split(' ')[0]; continue; }
    if (IGNORAR.test(n) || /urin/.test(n)) continue; // sódio urinário, creatinina urinária...
    let hits = achar(segs.length > 1 ? segs : [full]);
    if (!hits.length && segs.length > 1) hits = achar([full]);
    if (!hits.length) continue;
    if (secao === 'urina') {
      const titulo = hits.length === 1 && segs.length <= 1;
      if (!hits.some((h) => h.sangue && (has(h.valor) || titulo))) continue; // pH, glicose, hemoglobina e leucócitos da urina não entram
      secao = '';
    }
    for (const h of hits) {
      if (has(h.valor)) registrar(h, h.valor, full);
      else if (hits.length === 1 && segs.length <= 1) pend = { hit: h, fonte: full };
    }
  }
  // Para cada exame, o primeiro valor plausível; se nenhum for, o primeiro (marcado para conferir).
  const itens = LAB_DEFS.map((d) => {
    const c = candidatos[d.k];
    return c ? (c.find((x) => !x.suspeito) || c[0]) : null;
  }).filter(Boolean);
  return { data, hora, venosa, itens, outros };
}

// Coloca um painel no lugar certo: o mais novo é o "atual"; o atual anterior passa a "anterior".
export function placePanel(cur, ant, data, values, emptyFn) {
  const filled = (o) => Object.entries(o || {}).some(([k, v]) => !['data', 'hora'].includes(k) && has(v));
  if (!filled(cur)) return { cur: { ...emptyFn(), ...values, data }, ant, destino: 'atual' };
  if (data && cur.data === data) return { cur: { ...cur, ...values }, ant, destino: 'atual' };
  if (!cur.data || !data || data > cur.data) return { cur: { ...emptyFn(), ...values, data }, ant: { ...cur }, destino: 'novo' };
  if (ant && ant.data === data) return { cur, ant: { ...ant, ...values }, destino: 'anterior' };
  return { cur, ant: { ...emptyFn(), ...values, data }, destino: 'anterior' };
}

export function destinoTexto(cur, data) {
  const filled = Object.entries(cur || {}).some(([k, v]) => !['data', 'hora'].includes(k) && has(v));
  if (!filled || (data && cur.data === data)) return 'entra como atual';
  if (!cur.data || !data || data > cur.data) return 'entra como atual; o de antes passa a anterior';
  return 'é mais antigo que o atual: entra como anterior';
}

export function applyLab(p, sel) {
  const n = { ...p };
  const labVals = {};
  const gasoVals = {};
  for (const it of sel.itens || []) (it.alvo === 'gaso' ? gasoVals : labVals)[it.k] = it.valor;
  const outrosLinhas = (sel.outros || []).map((o) => `${o.label} ${o.valor}`);
  if (Object.keys(labVals).length || outrosLinhas.length) {
    const r = placePanel(p.labs, p.labsAnt, sel.data, labVals, emptyLabs);
    n.labs = r.cur; n.labsAnt = r.ant;
    if (outrosLinhas.length) {
      const alvo = r.destino === 'anterior' ? 'labsAnt' : 'labs';
      const atuais = String(n[alvo].outros || '').split('\n').filter(Boolean);
      const base = atuais.filter((l) => !outrosLinhas.some((o) => strip(o.split(' ')[0]) === strip(l.split(' ')[0])));
      n[alvo] = { ...n[alvo], outros: [...base, ...outrosLinhas].join('\n') };
    }
  }
  if (Object.keys(gasoVals).length) {
    const dataG = sel.gasoData || sel.data;
    const r = placePanel(p.gaso, p.gasoAnt, dataG, { ...gasoVals, hora: sel.gasoHora || '' }, emptyGaso);
    n.gaso = r.cur; n.gasoAnt = r.ant;
  }
  return n;
}

// ---------- laudos de imagem ----------
const EXAME_RE = /^(tomografia|tc\b|angiotomografia|angio-?tc|radiografia|rx\b|raio-?x|ultrassonografia|ultrassom|usg\b|us\b|ressonancia|rm\b|angiorressonancia|angio-?rm|ecocardiograma|ecocardiografia|eco\b|doppler|dtc\b|ultrassonografia doppler|arteriografia|angiografia|cintilografia|pet\b|pet-?ct|eletroencefalograma|eeg\b|endoscopia|colonoscopia|broncoscopia)/;
const CONCL_RE = /^(conclusao diagnostica|conclusao|conclusoes|impressao diagnostica|impressao|opiniao|parecer|diagnostico)\b\s*:?\s*/;
const OUTRA_SECAO = /^(tecnica|metodo|analise|achados|relatorio|descricao|comentarios?|observac|indicacao|informacoes clinicas|dados clinicos|exame realizado|comparacao)\b/;
const ASSINATURA = /^(dr\.?|dra\.?|medic[oa]|crm|laudo (assinado|liberado|emitido)|assinado|responsavel|radiologista|data da liberacao|liberado em)/;

const ABREV = [[/^tomografia computadorizada\b/i, 'TC'], [/^angiotomografia\b/i, 'Angio-TC'], [/^radiografia\b/i, 'RX'], [/^raio-?x\b/i, 'RX'],
  [/^ultrassonografia\b/i, 'USG'], [/^ressonancia magnetica\b|^ressonância magnética\b/i, 'RM'], [/^angiorressonancia\b|^angiorressonância\b/i, 'Angio-RM'],
  [/^ecocardiograma\b/i, 'Ecocardiograma'], [/^doppler transcraniano\b/i, 'DTC']];

function nomeExame(raw) {
  let s = clean(raw).replace(/^exame\s*:\s*/i, '').replace(/\s+[-–]\s*$/, '');
  // Caixa alta vira frase: "TOMOGRAFIA COMPUTADORIZADA DE CRÂNIO" -> "TC de crânio"
  if (s === s.toUpperCase()) s = s.charAt(0) + s.slice(1).toLowerCase();
  for (const [re, ab] of ABREV) if (re.test(s)) { s = s.replace(re, ab); break; }
  s = s.replace(/\b(tc|rx|usg|rm|dtc|eeg|ap)\b/gi, (x) => x.toUpperCase());
  return s.slice(0, 90);
}

export function parseLaudos(text, hoje) {
  const linhas = String(text || '').split('\n').map(clean).filter(Boolean);
  const docData = (() => {
    const m = String(text || '').match(/(?:data\s+do\s+exame|realizad[oa]\s+em|data\s+de\s+realiza[cç][aã]o|data\s*:)\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
    return m ? findDate(m[1], hoje) : dataRecente(linhas, hoje);
  })();
  const blocos = [];
  let cur = null;
  for (const raw of linhas) {
    const n = strip(raw);
    const lm = n.match(/^(exame|procedimento|estudo)\s*:\s*(.+)$/);
    const label = lm && /[a-z]{3,}/.test(lm[2]) ? lm : null;
    const isTitulo = label || (EXAME_RE.test(n) && raw.length < 120 && !/[.;]$/.test(raw) && !CONCL_RE.test(n));
    if (isTitulo && (!cur || cur.conclusao.length || cur.linhas.length > 2)) {
      cur = { titulo: label ? raw.replace(/^(exame|procedimento|estudo)\s*:\s*/i, '') : raw, linhas: [], conclusao: [], emConcl: false, fim: false };
      blocos.push(cur);
      continue;
    }
    if (!cur) continue;
    cur.linhas.push(raw);
    if (cur.fim) continue;
    const c = n.match(CONCL_RE);
    if (c) {
      cur.emConcl = true;
      const resto = raw.slice(raw.length - (n.length - c[0].length)).trim();
      if (resto) cur.conclusao.push(resto);
      continue;
    }
    if (cur.emConcl) {
      if (ASSINATURA.test(n) || OUTRA_SECAO.test(n)) { cur.emConcl = false; cur.fim = true; continue; }
      cur.conclusao.push(raw);
    }
  }
  return blocos.map((b) => {
    const recente = (d) => d && d >= addDays(hoje, -400) && d <= hoje;
    const dataLinha = b.linhas.find((l) => /data|realizad|exame em/i.test(l) && !/nasc/i.test(l) && recente(findDate(l, hoje)));
    return {
      id: uid(),
      exame: nomeExame(b.titulo),
      data: dataLinha ? findDate(dataLinha, hoje) : docData,
      resultado: b.conclusao.join(' ').replace(/\s+/g, ' ').replace(/^[-•]\s*/, '').trim(),
    };
  }).filter((e) => has(e.exame));
}

// Mesmo exame = mesma data e nome compatível ("TC crânio" = "TC de crânio sem contraste").
const STOP = new Set(['de', 'do', 'da', 'dos', 'das', 'e']);
const nomeChave = (s) => strip(s).replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w)).join(' ');
export function acharExame(lista, e) {
  const k = nomeChave(e.exame);
  if (!k) return null;
  return (lista || []).find((x) => {
    const kx = nomeChave(x.exame);
    return x.data === e.data && kx && (kx === k || k.startsWith(kx + ' ') || kx.startsWith(k + ' '));
  }) || null;
}

// Como o laudo entra no leito: novo, completa um exame que aguardava laudo, repetido ou com outra conclusão.
export function situacaoLaudo(lista, e) {
  const ex = acharExame(lista, e);
  if (!ex) return { tipo: 'novo', ex: null };
  if (!has(ex.resultado)) return { tipo: 'completa', ex };
  if (clean(ex.resultado) === clean(e.resultado) || !has(e.resultado)) return { tipo: 'igual', ex };
  return { tipo: 'outra', ex };
}

export function applyLaudos(p, laudos) {
  let exames = [...p.exames];
  for (const e of laudos) {
    const { tipo, ex } = situacaoLaudo(exames, e);
    if (tipo === 'novo') exames.push({ id: e.id || uid(), exame: e.exame, data: e.data, resultado: e.resultado });
    else if (tipo === 'completa' || tipo === 'outra') exames = exames.map((x) => (x.id === ex.id ? { ...x, resultado: e.resultado } : x));
  }
  return { ...p, exames };
}
