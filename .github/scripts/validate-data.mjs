#!/usr/bin/env node
/*
 * 数据合法性校验（CI 使用）：
 * - data/ 下所有 JSON 必须可解析
 * - act01/act02 节点 id 必须存在且唯一
 * - 按周目拆分的 voice-map 键必须全部来自 voice-map.json
 * - 标注与清单文件结构必须符合预期
 *
 * 用法：node .github/scripts/validate-data.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '..', '..', 'data');

let failed = false;
function assert(cond, msg) {
  if (!cond) {
    console.error('✗ ' + msg);
    failed = true;
  }
}

const files = fs.readdirSync(DATA).filter((f) => f.endsWith('.json')).sort();
function readJson(file) {
  // 兼容带 UTF-8 BOM 的文件（浏览器 fetch 会自动忽略 BOM，Node 直接 JSON.parse 不会）
  return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8').replace(/^\uFEFF/, ''));
}
for (const file of files) {
  try {
    readJson(file);
  } catch (err) {
    assert(false, `${file}: JSON 无法解析（${err.message}）`);
  }
}

for (const name of ['act01.json', 'act02.json']) {
  const act = readJson(name);
  assert(Array.isArray(act.nodes), `${name}: 缺少 nodes 数组`);
  const ids = new Set();
  for (const node of act.nodes || []) {
    assert(node && typeof node.id === 'string' && node.id, `${name}: 存在缺少 id 的节点`);
    assert(!ids.has(node.id), `${name}: 节点 id 重复「${node && node.id}」`);
    ids.add(node.id);
  }
}

for (const name of ['annotations.act01.json', 'annotations.act02.json']) {
  const ann = readJson(name);
  assert(ann && typeof ann === 'object' && !Array.isArray(ann), `${name}: 应为对象`);
}

const voiceMap = readJson('voice-map.json');
const fullKeys = new Set(Object.keys(voiceMap));
for (const name of ['voice-map.act01.json', 'voice-map.act02.json']) {
  if (!files.includes(name)) continue;
  const subset = readJson(name);
  for (const key of Object.keys(subset)) {
    assert(fullKeys.has(key), `${name}: 键「${key}」不在全量 voice-map.json 中`);
  }
}

for (const name of ['evidence.json', 'gallery-manifest.json', 'audio-manifest.json', 'records.json']) {
  const data = readJson(name);
  assert(data && typeof data === 'object', `${name}: 应为对象`);
}

if (failed) {
  console.error('数据校验未通过。');
  process.exit(1);
}
console.log('✓ 全部数据校验通过：' + files.join(', '));
