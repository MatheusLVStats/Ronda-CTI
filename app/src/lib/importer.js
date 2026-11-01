// Leitura de evolução médica ou sumário de transferência (texto extraído do PDF).
// Tudo vira sugestão: nada entra no leito sem o médico conferir na tela de importação.
import { addDays, isoFromDate, parseISO } from './dates.js';
import { uid } from './model.js';
import { has } from './format.js';

const strip = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clean = (s) => String(s || '').replace(/^[\s\-•*·>]+/, '').replace(/^\d{1,2}[.)]\s+/, '').replace(/\s+/g, ' ').trim();

// ---------- datas ----------
const DATE_RE = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
export function findDate(text, hoje) {
  const m = String(text || '').match(DATE_RE);
  if (!m) return '';
  const d = Number(m[1]), mo = Number(m[2]);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return '';
  const ref = parseISO(hoje) || new Date();
  let y = m[3] ? Number(m[3]) : ref.getFullYear();
  if (y < 100) y += 2000;
  let dt = new Date(y, mo - 1, d);
  if (!m[3] && dt > ref) dt = new Date(y - 1, mo - 1, d); // "28/12" lido em janeiro é do ano anterior
  return isoFromDate(dt);
}
// "D7" sem data: D0 = hoje - 7
function dFromNumber(text, hoje) {
  const m = String(text || '').match(/\bD\s?(\d{1,3})\b/);
  return m ? addDays(hoje, -Number(m[1])) : '';
}

// ---------- títulos de seção ----------
const HEADINGS = [
  ['diag', /^(hd|hds|hipoteses? diagnosticas?|diagnosticos?( principais?| atuais| secundarios)?|impressao diagnostica|problemas( ativos)?|lista de problemas)\b/],
  ['comorb', /^(comorbidades?|hpp|antecedentes( pessoais)?( patologicos)?|historia patologica pregressa|doencas previas)\b/],
  ['meds', /^(medicac(oes|ao)( de)?( uso)? (continuo|domiciliar(es)?|previas?)|uso continuo|medicamentos de uso continuo|mud)\b/],
  ['alergia', /^alergias?\b/],
  ['atb', /^(atb|antibioticos?|antibioticoterapia|antimicrobianos?)\b/],
  ['culturas', /^(culturas?|microbiologia)\b/],
  ['disp', /^(dispositivos?( invasivos)?|invasoes|acessos?( venosos)?)\b/],
  ['exames', /^(exames( complementares| de imagem| laboratoriais)?|imagem|laboratorio|labs?|resultados)\b/],
  ['vent', /^(suporte ventilatorio|ventilacao( mecanica)?|vm|parametros( ventilatorios| da vm)?)\b/],
  ['ignore', /^(hda|historia( da doenca atual)?|resumo|exame fisico|ef|conduta|condutas|plano|evolucao|subjetivo|objetivo|avaliacao|prescricao|sinais vitais|ssvv|neurologico|neuro|cardiovascular|cardio|hemodinamico|hemodinamica|renal|tgi|gastrointestinal|metabolico|infeccioso|infeccao|hematologico|pele|respiratorio|identificacao|dados do paciente|assinatura)\b/],
];

function headingOf(line) {
  const raw = clean(line);
  if (!raw) return null;
  const n = strip(raw);
  for (const [key, re] of HEADINGS) {
    const m = n.match(re);
    if (!m) continue;
    const rest = raw.slice(m[0].length).replace(/^\s*[:\-–]\s*/, '').trim();
    // Título de verdade: termina em ":" ou ocupa a linha toda (curto) - evita frases comuns.
    const afterTitle = n.slice(m[0].length);
    if (/^\s*[:\-–]/.test(afterTitle) || afterTitle.trim() === '' || (raw === raw.toUpperCase() && raw.length < 50)) {
      return { key, rest };
    }
  }
  return null;
}

export function splitSections(text) {
  const sections = {};
  let cur = null;
  for (const line of String(text || '').split('\n')) {
    const h = headingOf(line);
    if (h) {
      cur = h.key;
      sections[cur] = sections[cur] || [];
      if (h.rest) sections[cur].push(h.rest);
      continue;
    }
    const t = clean(line);
    if (cur && t) sections[cur].push(t);
  }
  delete sections.ignore;
  return sections;
}

// ---------- identificação ----------
function header(text, hoje) {
  const t = String(text || '');
  const out = {};
  const nome = t.match(/(?:paciente|nome(?: do paciente)?)\s*:\s*([A-Za-zÀ-ÿ'.\- ]{4,70})/i);
  if (nome) out.nome = nome[1].replace(/\s+(idade|sexo|prontu[aá]rio|registro|data|leito|dn|nasc).*$/i, '').trim();
  const idade = t.match(/idade\s*:?\s*(\d{1,3})/i) || t.match(/\b(\d{1,3})\s*anos\b/i);
  if (idade && Number(idade[1]) < 120) out.idade = idade[1];
  const sexo = t.match(/sexo\s*:?\s*(masculino|feminino|masc|fem|m|f)\b/i);
  if (sexo) out.sexo = /^m/i.test(sexo[1]) ? 'M' : 'F';
  const peso = t.match(/peso\s*:?\s*(\d{2,3}(?:[.,]\d)?)\s*kg/i);
  if (peso) out.peso = peso[1].replace('.', ',');
  const intern = t.match(/(?:data\s+d[ae]\s+interna[cç][aã]o|internad[oa]\s+em|interna[cç][aã]o(?:\s+hospitalar)?|admiss[aã]o\s+hospitalar|data\s+de\s+admiss[aã]o)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/i);
  if (intern) out.internacao = findDate(intern[1], hoje);
  const origem = t.match(/(?:setor(?: de origem)?|proced[eê]ncia|procedente d[eao]|unidade de origem)\s*:?\s*([^\n]{2,40})/i);
  if (origem) out.origem = origem[1].replace(/\s+(leito|data|idade).*$/i, '').trim();
  return out;
}

// ---------- dispositivos ----------
const DEVICE_RULES = [
  ['TOT', /\b(tot|tubo orotraqueal|iot)\b/],
  ['TQT', /\b(tqt|traqueostomia)\b/],
  ['CDL', /\b(cdl|shilley|cateter (de )?(hemo)?dialise)\b/],
  ['PICC', /\bpicc\b/],
  ['CVC', /\b(cvc|pvp|cateter venoso central|puncao venosa profunda|acesso (venoso )?central)\b/],
  ['PAI', /\b(pai|pressao arterial invasiva|cateter arterial|pam invasiva)\b/],
  ['DVE', /\b(dve|derivacao ventricular externa)\b/],
  ['Cateter de PIC', /\b(cateter|monitor(izacao)?) de pic\b/],
  ['SVD', /\b(svd|cvd|sonda vesical|cateter vesical)\b/],
  ['SNG em sifonagem', /\b(sng|sonda nasogastrica)\b.*\b(sifonagem|aberta|drenagem)\b/],
  ['SNE/SNG', /\b(sne|sng|sonda nasoenteral|sonda nasogastrica)\b/],
  ['Hemovac', /\bhemovac\b/],
  ['Dreno torácico', /\bdreno( de)? torax|dreno toracico|drenagem pleural\b/],
  ['Dreno de cavidade', /\bdreno( de)? (cavidade|abdominal|penrose|tubular|laminar)\b/],
  ['Ostomia', /\b(colostomia|ileostomia|urostomia|gastrostomia|jejunostomia|ostomia)\b/],
  ['Acesso periférico', /\b(avp|acesso venoso periferico|jelco)\b/],
];
const SITE_RE = /\b(VJID|VJIE|VSCD|VSCE|VFD|VFE|ARD|ARE|AFD|AFE)\b/i;
const ORIGEM_RE = [['CTI', /\b(cti|uti)\b/], ['CC', /\b(cc|centro cirurgico)\b/], ['Emergência', /\bemergencia\b/], ['Enfermaria', /\benfermaria\b/], ['Outro hospital', /\boutro hospital|externo\b/]];

function devicesFrom(lines, hoje, requireDate) {
  const out = [];
  for (const line of lines) {
    const n = strip(line);
    if (/\b(retirad|sacad|removid|extubad|decanulad)/.test(n)) continue; // dispositivo que já saiu
    const data = findDate(line, hoje) || dFromNumber(line, hoje);
    if (requireDate && !data) continue;
    for (const [nome, re] of DEVICE_RULES) {
      if (!re.test(n)) continue;
      if (out.some((d) => d.nome === nome) || (nome === 'SNE/SNG' && out.some((d) => d.nome === 'SNG em sifonagem'))) break;
      const site = line.match(SITE_RE);
      const orig = ORIGEM_RE.find(([, r]) => r.test(n));
      out.push({ id: uid(), nome, data, origem: orig ? orig[0] : '', sitio: site ? site[1].toUpperCase() : '', sitios: [], montagem: '', altura: '', estado: '', debito: '', aspecto: '', questionarRetirada: false, fonte: line });
      break;
    }
  }
  return out;
}

// ---------- antimicrobianos ----------
const ATB = ['meropenem', 'imipenem', 'ertapenem', 'cefepime', 'ceftriaxona', 'cefazolina', 'ceftazidima-avibactam', 'ceftazidima', 'ceftolozano', 'cefuroxima', 'cefalotina',
  'piperacilina', 'tazocin', 'amoxicilina', 'ampicilina', 'oxacilina', 'penicilina', 'vancomicina', 'teicoplanina', 'linezolida', 'daptomicina', 'polimixina',
  'colistina', 'amicacina', 'gentamicina', 'ciprofloxacino', 'levofloxacino', 'moxifloxacino', 'azitromicina', 'claritromicina', 'clindamicina', 'metronidazol',
  'sulfametoxazol', 'bactrim', 'doxiciclina', 'tigeciclina', 'fluconazol', 'voriconazol', 'anfotericina', 'micafungina', 'caspofungina', 'anidulafungina',
  'aciclovir', 'ganciclovir', 'oseltamivir', 'rhze', 'rifampicina'];
const ATB_NOMES = { tazocin: 'Piperacilina-tazobactam', piperacilina: 'Piperacilina-tazobactam', bactrim: 'Sulfametoxazol-trimetoprima', sulfametoxazol: 'Sulfametoxazol-trimetoprima', 'ceftazidima-avibactam': 'Ceftazidima-avibactam', rhze: 'RHZE' };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function atbsFrom(lines, hoje) {
  const out = [];
  for (const line of lines) {
    const n = strip(line);
    if (/alerg/.test(n)) continue;
    for (const a of ATB) {
      if (!new RegExp(`\\b${a}`).test(n)) continue;
      const nome = ATB_NOMES[a] || cap(a);
      if (out.some((x) => x.nome === nome)) continue;
      const previo = /\b(previo|suspens|encerrad|finalizad|ate \d{1,2}\/)/.test(n);
      const d0 = n.match(/\bd0\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/) || n.match(/\b(?:inicio|iniciad[oa] em|desde)\s*:?\s*(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
      let inicio = d0 ? findDate(d0[1], hoje) : '';
      let fim = '';
      if (!inicio) {
        const dates = [...line.matchAll(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g)].map((m) => findDate(m[0], hoje));
        if (dates[0]) inicio = dates[0];
        if (previo && dates[1]) fim = dates[1];
      }
      if (!inicio && !previo) inicio = dFromNumber(line, hoje);
      if (previo && !fim) fim = hoje;
      out.push({ id: uid(), nome, inicio, duracao: '', foco: '', fim: previo ? fim : '', fonte: line });
    }
  }
  return out;
}

// ---------- itens com data e resultado (culturas, exames) ----------
function datedItems(lines, hoje, kind) {
  return lines.map((line) => {
    const data = findDate(line, hoje);
    const idx = line.indexOf(':');
    let nome = idx > 0 ? line.slice(0, idx) : line;
    const resultado = idx > 0 ? line.slice(idx + 1).trim() : '';
    nome = nome.replace(DATE_RE, '').replace(/\(\s*\)/g, '').replace(/\s+[-–]\s*$/, '').trim();
    return kind === 'cultura'
      ? { id: uid(), material: nome, data, resultado }
      : { id: uid(), exame: nome, data, resultado };
  }).filter((x) => has(x.material || x.exame));
}

function splitList(lines, seps) {
  const out = [];
  for (const l of lines) for (const p of l.split(seps)) { const t = clean(p); if (t && !/^nega\b/i.test(strip(t))) out.push(t); }
  return [...new Set(out)];
}

function ventFrom(text) {
  const t = String(text || '');
  const n = strip(t);
  const v = {};
  const modo = n.match(/\b(pcv|vcv|psv|cnaf|vni)\b/);
  if (modo) v.modo = modo[1].toUpperCase();
  else if (/\bar ambiente\b/.test(n)) v.modo = 'Ar ambiente';
  else if (/\b(cateter (nasal|de o2)|mascara)\b/.test(n)) v.modo = 'Máscara/cateter O2';
  if (!v.modo) return null;
  const num = (re) => { const m = n.match(re); return m ? m[1].replace('.', ',') : ''; };
  v.peep = num(/\bpeep\s*:?\s*(\d{1,2})/);
  v.fio2 = num(/\bfio2\s*:?\s*(\d{2,3})/);
  v.fr = num(/\bfr\s*:?\s*(\d{1,2})\b/);
  v.vc = num(/\bvc\s*:?\s*(\d{3,4})/);
  v.pi = num(/\b(?:pinsp|pi|pc)\s*:?\s*(\d{1,2})\b/);
  v.psup = num(/\b(?:psup|ps)\s*:?\s*(\d{1,2})\b/);
  v.fluxo = num(/\b(\d{1,2}(?:[.,]\d)?)\s*l\s*\/?\s*min/);
  return v;
}

// Resultado: sugestões para a tela de conferência.
export function parseEvolucao(text, hoje) {
  const sec = splitSections(text);
  const allLines = String(text || '').split('\n').map(clean).filter(Boolean);
  const diagnosticos = (sec.diag || []).map((l) => {
    const data = findDate(l, hoje);
    const cirurgia = /^(po|pos[- ]?op|pos-operatorio|pos operatorio)\b/.test(strip(l)) || /\bpo d\d/.test(strip(l));
    // A data vai para o campo próprio; no texto ficaria repetida na evolução.
    let texto = clean(l);
    if (data) texto = texto.replace(/\s*[(\[]?\s*(?:em\s+)?\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\s*[)\]]?/, '');
    texto = texto.replace(/\s*[-–,]\s*$/, '').trim();
    return { id: uid(), texto, data, cirurgia };
  }).filter((d) => d.texto.length > 2);
  const devLines = sec.disp && sec.disp.length ? sec.disp : allLines;
  const atbLines = sec.atb && sec.atb.length ? sec.atb : allLines;
  return {
    paciente: header(text, hoje),
    diagnosticos,
    comorbidades: splitList(sec.comorb || [], /[;,]/),
    medicacoes: splitList(sec.meds || [], /;/),
    alergias: splitList(sec.alergia || [], /[;,]/),
    dispositivos: devicesFrom(devLines, hoje, !(sec.disp && sec.disp.length)),
    atbs: atbsFrom(atbLines, hoje),
    culturas: datedItems(sec.culturas || [], hoje, 'cultura'),
    exames: datedItems(sec.exames || [], hoje, 'exame'),
    vent: ventFrom((sec.vent || []).join('\n')),
  };
}

// Aplica ao leito só o que o médico deixou marcado. Listas são somadas; campos já preenchidos
// só mudam se o médico marcou explicitamente a substituição.
export function applyImport(p, sel) {
  const n = { ...p };
  for (const k of ['idade', 'sexo', 'peso', 'internacao', 'origem']) {
    if (sel.paciente && has(sel.paciente[k])) n[k] = sel.paciente[k];
  }
  const addLines = (field, items) => {
    if (!items || !items.length) return;
    const cur = String(n[field] || '').split('\n').map((x) => x.trim()).filter(Boolean);
    const low = new Set(cur.map(strip));
    for (const it of items) if (!low.has(strip(it))) { cur.push(it); low.add(strip(it)); }
    n[field] = cur.join('\n');
  };
  addLines('comorbidades', sel.comorbidades);
  addLines('medicacoes', sel.medicacoes);
  addLines('alergias', sel.alergias);
  const strip2 = (o) => { const { fonte, ...rest } = o; return rest; };
  if (sel.diagnosticos) n.diagnosticos = [...p.diagnosticos, ...sel.diagnosticos.map(strip2)];
  if (sel.dispositivos) n.dispositivos = [...p.dispositivos, ...sel.dispositivos.map(strip2)];
  if (sel.atbs) n.atbs = [...p.atbs, ...sel.atbs.map(strip2)];
  if (sel.culturas) n.culturas = [...p.culturas, ...sel.culturas];
  if (sel.exames) n.exames = [...p.exames, ...sel.exames];
  if (sel.vent) n.vent = { ...p.vent, ...Object.fromEntries(Object.entries(sel.vent).filter(([, v]) => has(v))) };
  return n;
}
