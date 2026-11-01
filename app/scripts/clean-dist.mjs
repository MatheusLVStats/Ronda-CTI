// Apaga a versão compilada anterior na raiz do repositório antes de um novo build.
// Só remove o que o build gera; app/, .git e README ficam intactos.
import { rmSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const generated = ['index.html', 'assets', 'icons', 'sw.js', 'manifest.webmanifest', 'version.json'];

for (const name of generated) {
  const p = root + name;
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
console.log('limpo:', generated.join(', '));
