// fetch-chara.mjs — 把立绘工坊所需角色部件快照到 promo-standalone/assets/chara
// 用法: node tools/fetch-chara.mjs [all|ema|hiro|list]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = 'https://r2.manosaba-library.com/web';
const DATA_DIR = path.join(ROOT, 'data');
const OUT_DIR = path.join(ROOT, 'assets', 'chara');
const CHARS = ['ema', 'hiro'];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function getJSON(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'manosaba-promo-fetch/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(file, buf);
  return buf.length;
}

async function main() {
  ensureDir(DATA_DIR);
  ensureDir(OUT_DIR);

  const arg = process.argv[2] || 'all';
  const indexUrl = `${WEB}/chara/index.json?v=2`;
  const index = await getJSON(indexUrl);
  fs.writeFileSync(path.join(DATA_DIR, 'chara-index-remote.json'), JSON.stringify(index, null, 2));
  console.log('index:', index.length, 'characters');

  if (arg === 'list') {
    console.log(index.map((c) => `${c.name}\t${c.label}\t${c.mode || 'parts'}`).join('\n'));
    return;
  }

  const pick = arg === 'all' ? CHARS : [arg];
  for (const name of pick) {
    const meta = index.find((c) => c.name === name);
    if (!meta) {
      console.warn(`!! not found: ${name}`);
      continue;
    }
    if (meta.mode === 'frames') {
      console.warn(`!! ${name} is frames mode, skipping`);
      continue;
    }
    const base = `${WEB}/chara/${name}`;
    const manifest = await getJSON(`${base}/manifest.json?v=2`);
    const dir = path.join(OUT_DIR, name);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    const parts = manifest.parts || [];
    console.log(`== ${name} (${meta.label}) mode=${manifest.mode} parts=${parts.length}`);

    let total = 0;
    for (const p of parts) {
      const file = path.join(dir, p.file);
      ensureDir(path.dirname(file));
      try {
        const size = await download(`${base}/${p.file}?v=2`, file);
        total += size;
        console.log(`  ${p.category || 'other'}/${p.name} ${p.file} ${(size / 1024).toFixed(0)}KB`);
      } catch (e) {
        console.warn(`  !! ${p.file}: ${e.message}`);
      }
    }
    console.log(`  total: ${(total / 1024 / 1024).toFixed(1)}MB`);
  }
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
