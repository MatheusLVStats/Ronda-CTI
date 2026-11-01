// Depois do build: carimba a versão no service worker (para o navegador trocar o cache)
// e grava version.json, que o app consulta para avisar que há atualização.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
const build = `${pkg.version}-${stamp}`;

const swPath = root + 'sw.js';
const sw = readFileSync(swPath, 'utf8').replaceAll('__BUILD__', build);
writeFileSync(swPath, sw);
writeFileSync(root + 'version.json', JSON.stringify({ build }) + '\n');

// O index.html também carrega o número da versão, mostrado em Ajustes.
const indexPath = root + 'index.html';
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replaceAll('__BUILD__', build));
console.log('versão', build);
