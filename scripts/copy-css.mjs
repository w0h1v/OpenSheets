import { readdir, copyFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Ship CSS alongside the tsc output: mirrors every *.css file under
 * src/spreadsheet into dist/spreadsheet, preserving relative paths so the
 * compiled JS's `import './X.module.css'` statements resolve for package
 * consumers using webpack/vite.
 */

const SRC = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src', 'spreadsheet');
const DEST = join(SRC, '..', '..', 'dist', 'spreadsheet');

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

let copied = 0;
for (const file of await walk(SRC)) {
  const target = join(DEST, relative(SRC, file));
  await mkdir(dirname(target), { recursive: true });
  await copyFile(file, target);
  copied++;
}
console.log(`copy-css: ${copied} stylesheets -> dist/spreadsheet`);
