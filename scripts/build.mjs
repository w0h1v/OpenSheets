import { build } from 'esbuild';
import { rm, copyFile, readFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Library build. Produces, from src/:
 *
 *   dist/types/**            declarations (tsc, emit-only)
 *   dist/index.{mjs,cjs}     the package (ESM + CommonJS)
 *   dist/index.css           every component stylesheet, class names hashed
 *   dist/excel.{mjs,cjs}     `opensheets/excel` (peer: xlsx)
 *   dist/hyperformula.{mjs,cjs}  `opensheets/hyperformula` (peer: hyperformula)
 *   dist/tokens.css          `opensheets/styles/tokens.css`
 *
 * Bundling (rather than tsc's per-file output) is what makes the package
 * loadable from Node as well as bundlers: relative imports are resolved at
 * build time, and CSS modules are compiled into one stylesheet instead of
 * being left as runtime `import './x.module.css'` statements. Everything
 * in dependencies/peerDependencies stays external.
 */

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const external = [
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.peerDependencies || {}),
  'react/jsx-runtime',
];

const entries = {
  index: 'src/index.ts',
  excel: 'src/excel.ts',
  hyperformula: 'src/hyperformula.ts',
};

await rm(join(root, 'dist'), { recursive: true, force: true });

console.log('build: declarations (tsc)');
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', join(root, 'tsconfig.build.json')], {
  stdio: 'inherit',
});

for (const format of ['esm', 'cjs']) {
  console.log(`build: ${format} bundles (esbuild)`);
  await build({
    absWorkingDir: root,
    entryPoints: Object.fromEntries(Object.entries(entries).map(([name, file]) => [name, join(root, file)])),
    outdir: join(root, 'dist'),
    bundle: true,
    format,
    platform: 'browser',
    target: 'es2020',
    outExtension: { '.js': format === 'esm' ? '.mjs' : '.cjs' },
    external,
    sourcemap: true,
    jsx: 'transform',
    legalComments: 'none',
    logLevel: 'warning',
  });
}

await copyFile(join(root, 'src/spreadsheet/styles/tokens.css'), join(root, 'dist/tokens.css'));

const expected = [
  'types/index.d.ts', 'types/excel.d.ts', 'types/hyperformula.d.ts',
  'index.mjs', 'index.cjs', 'index.css', 'excel.mjs', 'excel.cjs', 'hyperformula.mjs', 'hyperformula.cjs', 'tokens.css',
];
for (const file of expected) {
  const info = await stat(join(root, 'dist', file)).catch(() => null);
  if (!info || !info.size) {
    console.error(`build: missing or empty output dist/${file}`);
    process.exit(1);
  }
}
console.log(`build: ok (${expected.length} outputs checked)`);
