#!/usr/bin/env node
/*
 * 数据发布前处理脚本：
 * 1. 把 act01/act02 剧情 JSON 压缩为紧凑格式（减少页面下载体积）
 * 2. 按周目拆分 voice-map.json，生成 voice-map.act01.json / voice-map.act02.json
 *
 * 用法：node tools/minify-data.mjs
 * 每次用构建脚本重新生成剧情数据后，都要再跑一次本脚本再提交。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(here, '..', 'data');

function readJson(name) {
  return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8'));
}

function writeJson(name, obj) {
  fs.writeFileSync(path.join(DATA, name), JSON.stringify(obj));
}

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(2) + 'MB';
}

function collectLabels(act) {
  const labels = new Set();
  for (const node of act.nodes || []) {
    for (const d of node.dialogue || []) {
      if (d && d.label) labels.add(d.label);
    }
  }
  return labels;
}

let failed = false;
function assert(cond, msg) {
  if (!cond) {
    console.error('✗ ' + msg);
    failed = true;
  }
}

for (const name of ['act01.json', 'act02.json']) {
  const act = readJson(name);
  const ids = new Set();
  for (const node of act.nodes || []) {
    assert(node && typeof node.id === 'string' && node.id, `${name}: 节点缺少 id`);
    assert(!ids.has(node.id), `${name}: 重复节点 id「${node.id}」`);
    ids.add(node.id);
  }
  writeJson(name, act);
  const size = fs.statSync(path.join(DATA, name)).size;
  console.log(`✓ ${name}: ${(act.nodes || []).length} 个节点 → ${mb(size)}（紧凑格式）`);
}

const voiceMap = readJson('voice-map.json');
const fullKeys = new Set(Object.keys(voiceMap));
for (const actName of ['act01', 'act02']) {
  const act = readJson(`${actName}.json`);
  const labels = collectLabels(act);
  const subset = {};
  for (const label of labels) {
    if (fullKeys.has(label)) subset[label] = voiceMap[label];
  }
  assert(Object.keys(subset).every((k) => fullKeys.has(k)),
    `voice-map.${actName}.json 包含了全量映射之外的键`);
  writeJson(`voice-map.${actName}.json`, subset);
  const size = fs.statSync(path.join(DATA, `voice-map.${actName}.json`)).size;
  console.log(`✓ voice-map.${actName}.json: ${Object.keys(subset).length} 条 → ${mb(size)}`);
}

if (failed) {
  console.error('校验未通过，已中止（数据文件可能已被改写，请检查后重跑）。');
  process.exit(1);
}
console.log('完成：剧情数据已压缩，语音映射已按周目拆分。');
