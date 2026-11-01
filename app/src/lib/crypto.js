// Criptografia de ponta a ponta. Da senha saem duas coisas independentes (PBKDF2):
// - a chave AES-GCM, que nunca sai do aparelho;
// - a senha de login do Supabase, que não permite recuperar a chave.
// O servidor só recebe texto cifrado.

const enc = new TextEncoder();
const dec = new TextDecoder();
export const PBKDF2_ITER = 600000;

function subtle() {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new Error('Este navegador não oferece criptografia (é preciso abrir pelo endereço https).');
  return s;
}

function toHex(bytes) {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}

export function bytesToB64(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function deriveKeys(email, password, iterations = PBKDF2_ITER) {
  const salt = enc.encode('ronda-cti/v1/' + String(email).trim().toLowerCase());
  const base = await subtle().importKey('raw', enc.encode(String(password).normalize('NFC')), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 512));
  const encKey = await subtle().importKey('raw', bits.slice(0, 32), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const authSecret = toHex(bits.slice(32));
  bits.fill(0);
  return { encKey, authSecret };
}

// O nome do documento entra como dado autenticado: um leito cifrado não pode ser trocado por outro.
export async function encryptDoc(key, docKey, value) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const data = enc.encode(JSON.stringify({ v: 1, value }));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('ronda-cti:' + docKey) }, key, data));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToB64(out);
}

export async function decryptDoc(key, docKey, b64) {
  const all = b64ToBytes(b64);
  const iv = all.subarray(0, 12);
  const ct = all.subarray(12);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('ronda-cti:' + docKey) }, key, ct);
  return JSON.parse(dec.decode(pt)).value;
}
