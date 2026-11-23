import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('web');
const DEST = path.resolve('android/src/main/assets/web');
const CFG = path.resolve('assets/config.js');
const check = process.argv.includes('--check');
const SKIP = new Set(['.DS_Store', 'Thumbs.db', '.git']);

async function walk(dir, base = dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(full, base)));
    else out.push(path.relative(base, full));
  }
  return out;
}

const hash = async (f) => createHash('sha256').update(await readFile(f)).digest('hex');

if (!existsSync(SRC)) {
  console.error('pasta web/ nao encontrada');
  process.exit(1);
}

const files = (await walk(SRC)).sort();
const diffs = [];

for (const rel of files) {
  if (rel === 'config.js' && existsSync(CFG)) continue;
  const target = path.join(DEST, rel);
  if (!existsSync(target) || (await hash(path.join(SRC, rel))) !== (await hash(target))) diffs.push(rel);
}

if (check) {
  const destFiles = existsSync(DEST) ? (await walk(DEST)).sort() : [];
  const extra = destFiles.filter((f) => !files.includes(f));
  if (diffs.length || extra.length) {
    console.error('assets/web dessincronizado:');
    diffs.forEach((f) => console.error('  divergente: ' + f));
    extra.forEach((f) => console.error('  sobrando:   ' + f));
    process.exit(1);
  }
  console.log(`ok: ${files.length} arquivos identicos`);
} else {
  await rm(DEST, { recursive: true, force: true });
  for (const rel of files) {
    const target = path.join(DEST, rel);
    await mkdir(path.dirname(target), { recursive: true });
    await cp(path.join(SRC, rel), target);
  }
  if (existsSync(CFG)) {
    const raw = await readFile(CFG, 'utf8');
    if (raw.includes('10.0.2.2')) {
      console.warn('AVISO: assets/config.js aponta para 10.0.2.2 (so funciona no emulador)');
    }
    await cp(CFG, path.join(DEST, 'config.js'));
  }
  console.log(`sincronizados ${files.length} arquivos de web/ para assets/web/`);
}