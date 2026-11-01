// Datas sempre no fuso local do aparelho, no formato ISO curto (aaaa-mm-dd).

const pad = (n) => String(n).padStart(2, '0');

export function isoFromDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now = new Date()) {
  return isoFromDate(now);
}

export function parseISO(iso) {
  if (!iso || typeof iso !== 'string') return null;
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  if (!d) return '';
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

// Dia contado a partir do D0 (dia da inserção/início = D0).
export function diasDesde(iso, refISO = todayISO()) {
  const a = parseISO(iso);
  const b = parseISO(refISO);
  if (!a || !b) return null;
  // Date.UTC evita o erro de uma hora no horário de verão.
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

export function ddmm(iso) {
  const d = parseISO(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}` : '';
}

export function ddmmyyyy(iso) {
  const d = parseISO(iso);
  return d ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '';
}

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export function diaSemana(iso) {
  const d = parseISO(iso);
  return d ? DIAS[d.getDay()] : '';
}

export function horaAtual(now = new Date()) {
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}
