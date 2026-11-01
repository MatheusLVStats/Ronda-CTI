// Formatação de números (pt-BR) e limpeza de texto para colar no TI MED.

// Converte o que o usuário digitou ("37,8", "2.100", " 7.4 ") em número.
export function toNum(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return NaN;
  // "2.100" (milhar) vira 2100; "7.4" e "0.125" (decimal com ponto) ficam; "37,8" vira 37.8
  if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function has(v) {
  return v !== null && v !== undefined && String(v).trim() !== '';
}

function stripZeros(s) {
  return s.includes(',') ? s.replace(/0+$/, '').replace(/,$/, '') : s;
}

function withThousands(intStr) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Número com vírgula decimal; casas decimais conforme a grandeza.
export function fmtNum(n, maxDp) {
  if (!Number.isFinite(n)) return '';
  let dp = maxDp;
  if (dp === undefined) {
    const a = Math.abs(n);
    dp = a >= 100 ? 0 : a >= 10 ? 1 : a >= 0.1 ? 2 : 3;
  }
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(dp);
  const [i, d] = fixed.split('.');
  const out = stripZeros(withThousands(i) + (d ? ',' + d : ''));
  return (neg && out !== '0' ? '-' : '') + out;
}

// Inteiro com separador de milhar: 2100 -> "2.100".
export function fmtInt(n) {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n);
  return (r < 0 ? '-' : '') + withThousands(String(Math.abs(r)));
}

// Volume com sinal para o balanço: +640, -1.200.
export function fmtSigned(n) {
  if (!Number.isFinite(n)) return '';
  const r = Math.round(n);
  return (r > 0 ? '+' : '') + fmtInt(r);
}

// Valor digitado mostrado como digitado, só trocando ponto decimal por vírgula.
export function show(v) {
  if (!has(v)) return '';
  const s = String(v).trim();
  if (/^-?[1-9]\d{0,2}(\.\d{3})+$/.test(s)) return s; // "14.200" é milhar
  return /^-?\d+\.\d+$/.test(s) ? s.replace('.', ',') : s;
}

// ---------------------------------------------------------------------------
// TI MED: símbolos como o ponto médio viram "?" ao colar. Acentos funcionam.
// O texto gerado pelo app usa só letras, números, acentos e / - : > < + % , . ( )
// O que o médico digitou passa por aqui também: símbolos fora do ASCII são
// trocados pelo equivalente simples ou removidos.
// ---------------------------------------------------------------------------
const SUBST = {
  '·': '-', '•': '-', '‧': '-', '∙': '-',
  '—': '-', '–': '-', '‒': '-', '−': '-', '‐': '-', '‑': '-',
  '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4',
  '¹': '1', '²': '2', '³': '3',
  '°': '', 'º': 'o', 'ª': 'a',
  '≥': '>=', '≤': '<=', '→': '>', '←': '<', '⇒': '>',
  '×': 'x', '…': '...', '±': '+/-',
  '“': '"', '”': '"', '‘': "'", '’': "'", '´': "'", '`': "'",
  'µ': 'u', 'μ': 'u', 'Δ': 'delta', 'α': 'alfa', 'β': 'beta',
  ' ': ' ', '\t': ' ',
};
const ACENTOS = 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
const allowedChar = (ch) => ch === '\n' || (ch >= ' ' && ch <= '~') || ACENTOS.includes(ch);

export function tiMedSafe(text) {
  if (!text) return '';
  let out = '';
  for (const ch of String(text).normalize('NFC')) {
    const sub = SUBST[ch];
    const c = sub !== undefined ? sub : ch;
    for (const cc of c) if (allowedChar(cc)) out += cc;
  }
  // Sem espaços sobrando no fim das linhas e no máximo uma linha em branco seguida.
  return out
    .split('\n')
    .map((l) => l.replace(/ +$/g, '').replace(/ {2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Caracteres que o próprio app usa nos textos gerados (verificado nos testes).
export const TEMPLATE_CHARS = /^[A-Za-z0-9áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ \n/\-:><+%,.()]*$/;

// Linhas de um campo de texto livre ("uma por linha").
export function lines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
