// build-demo-data.mjs — 从项目 data/ 提取宣传片所需最小数据快照到 promo-standalone/data
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STANDALONE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.resolve(STANDALONE, '..', 'data');
const OUT = path.join(STANDALONE, 'data');

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(SOURCE, name), 'utf8'));
}
function write(name, obj) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
  console.log('write', name);
}

// ── 节点：搜索“魔女化” ──
const act01 = read('act01.json');
const act02 = read('act02.json');
function pickNodes(act, actName, needle, max) {
  const hits = [];
  for (const n of act.nodes || []) {
    const hay = `${n.title || ''} ${n.summary || ''} ${n.text || ''}`;
    if (hay.includes(needle)) hits.push(n);
  }
  hits.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const keep = hits.slice(0, max).map((n) => ({
    id: n.id,
    act: actName,
    title: n.title || '',
    character: n.character || '',
    type: n.type || '',
    level: n.level ?? 2,
    route: n.route || '',
    parentId: n.parentId || '',
    nextId: n.nextId || '',
    summary: (n.summary || (n.text || '').slice(0, 60)),
    isChoice: !!n.isChoice,
  }));
  return { hits: hits.length, keep };
}
const emaNodes = pickNodes(act01, 'act01', '魔女化', 9);
const hiroNodes = pickNodes(act02, 'act02', '魔女化', 6);
const nodes = [...emaNodes.keep, ...hiroNodes.keep];
// 补几个章节节点作为图谱锚点
for (const act of [act01, act02]) {
  const actName = act.meta?.title ? (act01 === act ? 'act01' : 'act02') : '';
}
write('nodes-demo.json', {
  meta: { query: '魔女化', note: '用于宣传片图谱演示的节点子集', generated: new Date().toISOString() },
  stats: { act01Hits: emaNodes.hits, act02Hits: hiroNodes.hits },
  nodes,
});

// ── 记录：魔女相关词条 + 规则 ──
const records = read('records.json');
const lorePick = (records.lore || [])
  .filter((r) => /魔女|监牢|规定|因子|审判/.test(`${r.title} ${r.aliases?.join(' ')}`))
  .slice(0, 6)
  .map((r) => ({
    id: r.id, title: r.title, category: r.category,
    aliases: (r.aliases || []).slice(0, 3),
    paragraphs: (r.paragraphs || []).slice(0, 2),
    source: r.source || [],
    characters: r.characters || [],
    relatedTerms: r.relatedTerms || [],
  }));
write('records-demo.json', { lore: lorePick, rules: (records.rules || []).slice(0, 3) });

// ── 证物：独立图鉴，取 24 件有名称/描述的 ──
const evidence = read('evidence.json').evidence || [];
const evidenceNamed = evidence.filter((e) => e.nameZh && e.nameZh !== '未知证物');
const evidencePick = evidenceNamed.slice(0, 24).map((e) => ({
  id: e.id, nameZh: e.nameZh, sprite: e.sprite, category: e.category,
  chapter: e.chapter, scene: e.scene, description: (e.description || '').slice(0, 42),
  relatedNodes: (e.relatedNodes || []).slice(0, 4),
}));
write('evidence-demo.json', {
  total: evidence.length,
  named: evidenceNamed.length,
  evidence: evidencePick,
});

// ── 画廊：分类 + 每类取 1–2 个 ──
const gallery = read('gallery-manifest.json');
const galleryPick = (gallery.categories || []).map((c) => ({
  ...c,
  items: (gallery.items || []).filter((i) => i.category === c.id).slice(0, 2).map((i) => ({
    id: i.id, file: i.file, label: i.label || '',
  })),
})).filter((c) => c.items.length > 0);
write('gallery-demo.json', { categories: galleryPick });

// ── 音频：BGM / SFX / Voice 各取少量 ──
const audio = read('audio-manifest.json');
const audioPick = {
  bgm: (audio.bgm || []).filter((b) => /^(Bgm_001|Bgm_002|Song_001)/.test(b.id)).slice(0, 4),
  sfx: (audio.sfx || []).filter((s) => /^(Sfx_Common_001|Sfx_Common_003|Sfx_Scenario_043|Sfx_Scenario_033)/.test(s.id)).slice(0, 4),
  voice: (audio.voice || []).filter((v) => ['Ema', 'Hiro'].includes(v.character)).slice(0, 4),
};
write('audio-demo.json', audioPick);

// ── 角色索引：艾玛 + 希罗 ──
const charaIndex = read('chara-index.json');
const charaDemo = charaIndex.filter((c) => ['ema', 'hiro'].includes(c.name));
write('chara-demo.json', charaDemo);

// ── 内嵌数据 JS（file:// 下也能直接运行） ──
const jsDir = path.join(STANDALONE, 'assets', 'js');
if (!fs.existsSync(jsDir)) fs.mkdirSync(jsDir, { recursive: true });
// ── 立绘工坊 manifest（已快照到 assets/chara） ──
const portraits = {};
for (const name of ['ema', 'hiro']) {
  const mPath = path.join(STANDALONE, 'assets', 'chara', name, 'manifest.json');
  if (fs.existsSync(mPath)) {
    const m = JSON.parse(fs.readFileSync(mPath, 'utf8'));
    portraits[name] = { character: m.character, parts: m.parts || [] };
  }
}

const bundle = {
  nodes: nodes,
  records: { lore: lorePick, rules: (records.rules || []).slice(0, 3) },
  evidence: {
    total: evidence.length,
    named: evidenceNamed.length,
    items: evidencePick,
  },
  gallery: galleryPick,
  audio: audioPick,
  chara: charaDemo,
  portraits,
};
fs.writeFileSync(
  path.join(jsDir, 'demo-data.js'),
  'window.PROMO_DATA = ' + JSON.stringify(bundle) + ';\n'
);
console.log('write assets/js/demo-data.js');

console.log('nodes', nodes.length, 'lore', lorePick.length, 'evidence', evidencePick.length);
