#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
通用剧本导入工具（日常剧情 + Bad End）

把 Naninovel 的 .bytes 本地化剧本（或带标注标记的 .txt）转换为
Manosaba-Library 的 data/actXX.json 节点数据，覆盖：
  - 章节节点（level 0, type=chapter）
  - 日常剧情节点（Adv，level 1, type=adv）
  - 选择点（isChoice + choices，含 Bad End 跳转）
  - Bad End 节点（Bad，level 1, type=bd, route=badXX）

Trial 审判节点不在此工具范围内：请用 Manosaba Trial Tagger 标注后，
把导出的 annotations.actXX.json 放进 data/ 目录。

用法：
  python tools/import_story.py <剧本目录> <输出.json> [--act N] [--title 标题]

剧本目录内文件命名（官方格式）：
  Act01_Chapter01_Adv05.bytes   → 0101Adv05 日常剧情节点
  Act01_Chapter01_Bad01.bytes   → 0101Bad01 Bad End 节点
  Act01_Chapter01_Trial01.bytes → 跳过（审判节点走 Trial Tagger）

也支持 .txt 已标注文本，`<choice NN> <badend BadXX>` 会覆盖默认的
Bad End 映射；其余标注标记（证物/证人分支等）仅供审判场景使用，本工具忽略。
"""

import argparse
import datetime
import json
import os
import re
import sys


# ── 解析器（与 Manosaba Trial Tagger 的 _test_parser.js 保持一致）──
LINK_REGEX = re.compile(r'<link=((?:"[^"]+"(?:,"[^"]+")*))>([^<]*)</link>', re.I)
LINK_IDS_REGEX = re.compile(r'"([^"]+)"')


def parse_links(text):
    links = []
    for m in LINK_REGEX.finditer(text):
        ids = LINK_IDS_REGEX.findall(m.group(1))
        links.append({"ids": ids, "text": m.group(2), "fullMatch": m.group(0)})
    return links


def strip_links(text):
    return LINK_REGEX.sub(lambda m: m.group(2), text)


def speaker_from_label(label):
    m = re.search(r'Trial\d+_([A-Za-z]+)\d*$', label)
    if m:
        return m.group(1)
    m = re.match(r'^([A-Za-z]+)_', label)
    return m.group(1) if m else None


def parse_command(cmd_line):
    result = {
        "cmd": None, "speaker": None, "pos": None, "roll": None,
        "buttonType": None, "handler": None, "label": None,
    }
    m = re.search(r'\|#([^\]|]+)\|', cmd_line)
    if m:
        result["label"] = m.group(1)
    m = re.match(r'^([A-Za-z][A-Za-z0-9]*)\s*:\s*\|', cmd_line)
    if m:
        result["speaker"] = m.group(1)
        result["cmd"] = "printDebate"
        pos = re.search(r'pos:(\d+),(\d+)', cmd_line)
        if pos:
            result["pos"] = [int(pos.group(1)), int(pos.group(2))]
        roll = re.search(r'roll:(-?\d+)', cmd_line)
        if roll:
            result["roll"] = int(roll.group(1))
        return result
    m = re.match(r'^@(\w+)', cmd_line)
    if not m:
        return result
    result["cmd"] = m.group(1)
    if result["cmd"] == "choice":
        btn = re.search(r'button:ChoiceButtons/(?:Trial|TrialHiro|Adv)/(\w+)', cmd_line)
        if btn:
            result["buttonType"] = btn.group(1)
        handler = re.search(r'handler:(\w+)', cmd_line)
        if handler:
            result["handler"] = handler.group(1)
        if result["label"] == "Common_Return" and not result["buttonType"]:
            result["buttonType"] = "Cancel"
    return result


def parse_block(label, lines):
    command_line = None
    cmd_parts = None
    japanese = []
    chinese = []
    for ln in lines:
        if ln.startswith("; >"):
            cand = ln[3:].strip()
            # 跳过纯注释/演出提示行（如「; > ＠角色名」「; > 息を呑む」），
            # 只取真正的命令行（@command 或 Speaker: |#label|）
            if re.match(r'^@\w+', cand) or re.match(r'^[A-Za-z][A-Za-z0-9]*\s*:\s*\|', cand):
                command_line = cand
                cmd_parts = parse_command(command_line)
                break
    for ln in lines:
        if ln.startswith("; >"):
            continue
        if ln.startswith(";"):
            japanese.append(ln[1:].lstrip(" "))
        elif ln.strip() != "":
            chinese.append(ln)

    chinese_text = "\n".join(chinese).strip()
    japanese_text = "\n".join(japanese).strip()
    links = parse_links(chinese_text) if chinese_text else []
    text = strip_links(chinese_text) if chinese_text else japanese_text

    kind = "dialogue"
    speaker = "Narrative"
    button_type = None
    handler = None
    if cmd_parts:
        if cmd_parts["cmd"] == "printDebate":
            speaker = cmd_parts["speaker"] or speaker_from_label(label) or "Narrative"
        elif cmd_parts["cmd"] == "choice":
            kind = "choice"
            button_type = cmd_parts["buttonType"]
            handler = cmd_parts["handler"]
        elif cmd_parts["cmd"] == "toast":
            kind = "dialogue"  # toast 也并入对话流，speaker 记作 Narrative
        # 其它命令（@print/@hide/@camera 等）按普通叙述块处理
    else:
        # 无命令的纯叙述块（如 Narrative001）也作为对话
        speaker = speaker_from_label(label) or "Narrative"

    if kind == "dialogue":
        return {
            "kind": "dialogue",
            "label": label,
            "speaker": speaker,
            "text": text,
            "objectionLinks": links,
        }
    if kind == "choice":
        return {
            "kind": "choice",
            "label": label,
            "buttonType": button_type,
            "handler": handler,
            "text": chinese_text or japanese_text,
        }
    return None


def parse_marker_line(line):
    t = line.strip()
    m = re.match(r'^<choice\s*(\d+)\s*>(?:\s*<correct>)?\s*$', t, re.I)
    if m:
        return ("choice-start", m.group(1).zfill(2))
    m = re.match(r'^<choice\s*(\d+)\s*>\s*<badend\s+(Bad\d{2})>\s*$', t, re.I)
    if m:
        return ("choice-start", m.group(1).zfill(2), m.group(2))
    m = re.match(r'^<end\s*choice\s*(\d*)\s*>$', t, re.I)
    if m:
        return ("choice-end", m.group(1).zfill(2) if m.group(1) else None)
    m = re.match(r'^<badend\s+(Bad\d{2})>\s*$', t, re.I)
    if m:
        return ("badend", m.group(1))
    return None


def parse_script(text):
    text = text.lstrip("\ufeff").replace("\r\n", "\n")
    lines = text.split("\n")
    blocks = []
    markers = []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip() == "":
            i += 1
            continue
        marker = parse_marker_line(line)
        if marker:
            markers.append(marker)
            i += 1
            continue
        if line.startswith("# "):
            label = line[2:].strip()
            block_lines = []
            i += 1
            while i < len(lines) and lines[i].strip() != "" and not lines[i].startswith("# "):
                marker = parse_marker_line(lines[i])
                if marker:
                    markers.append(marker)
                    i += 1
                    continue
                block_lines.append(lines[i])
                i += 1
            block = parse_block(label, block_lines)
            if block:
                blocks.append(block)
            continue
        # 其它杂行（命令、注释等）跳过
        i += 1
    return blocks, markers


# ── 文件名解析 ──
FILENAME_REGEX = re.compile(r'Act(\d+)_Chapter(\d+)_(Adv|Bad|Trial)(\d+)$', re.I)


def parse_filename(path):
    base = os.path.splitext(os.path.basename(path))[0]
    m = FILENAME_REGEX.search(base)
    if m:
        return {
            "act": int(m.group(1)),
            "chapter": int(m.group(2)),
            "kind": m.group(3).lower(),
            "num": int(m.group(4)),
        }
    return None


# ── 节点构建 ──
def media_null():
    return {"cg": None, "bgm": None, "sfx": None}


def first_text(dialogue):
    for d in dialogue:
        t = re.sub(r'<br>\n?', ' ', d["text"]).strip()
        if t:
            return t
    return ""


def make_summary(dialogue, limit=60):
    parts = []
    for d in dialogue:
        t = re.sub(r'\s+', ' ', re.sub(r'<br>\n?', ' ', d["text"])).strip()
        if t:
            parts.append(t)
    s = " ".join(parts)
    if len(s) > limit:
        s = s[:limit] + "…"
    return s


def make_text(dialogue):
    return "\n\n".join(
        "[%s]\n%s" % (d["speaker"] or "Narrative", d["text"]) for d in dialogue
    )


def choice_num(block):
    m = re.search(r'_Choice(\d+)$', block["label"])
    if m:
        return int(m.group(1))
    m = re.search(r'(\d+)$', block["label"])
    return int(m.group(1)) if m else None


def build_act(scripts_dir, act_override=None):
    files = sorted(
        os.path.join(scripts_dir, f)
        for f in os.listdir(scripts_dir)
        if os.path.isfile(os.path.join(scripts_dir, f))
        and os.path.splitext(f)[1].lower() in (".bytes", ".txt")
    )
    if not files:
        sys.exit("错误：目录中没有 .bytes / .txt 剧本文件：%s" % scripts_dir)

    parsed = []  # (info, blocks, markers)
    skipped_trials = []
    for path in files:
        info = parse_filename(path)
        if not info:
            print("⚠ 文件名无法识别，跳过：%s" % os.path.basename(path))
            continue
        if act_override is not None:
            info["act"] = act_override
        if info["kind"] == "trial":
            skipped_trials.append(os.path.basename(path))
            continue
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            blocks, markers = parse_script(fh.read())
        parsed.append((info, blocks, markers))

    if skipped_trials:
        print("⚠ 已跳过 Trial 文件（审判节点请用 Manosaba Trial Tagger）：")
        for name in skipped_trials:
            print("    " + name)

    if not parsed:
        sys.exit("错误：没有可导入的 Adv / Bad 剧本文件。")

    parsed.sort(key=lambda p: (p[0]["chapter"], 0 if p[0]["kind"] == "adv" else 1, p[0]["num"]))

    acts = {}
    for info, blocks, markers in parsed:
        acts.setdefault(info["act"], {}).setdefault(info["chapter"], []).append(
            (info, blocks, markers)
        )

    nodes = []
    for act in sorted(acts):
        chapters = acts[act]
        for chapter in sorted(chapters):
            items = chapters[chapter]
            chapter_id = "A%dC%d" % (act, chapter)
            adv_items = [it for it in items if it[0]["kind"] == "adv"]
            bad_items = [it for it in items if it[0]["kind"] == "bad"]

            # Bad End 文件 → 节点骨架
            bad_nodes = {}
            for info, blocks, markers in bad_items:
                bad_id = "%02d%02dBad%02d" % (act, chapter, info["num"])
                dialogue = [b for b in blocks if b["kind"] == "dialogue"]
                bad_nodes[info["num"]] = {
                    "id": bad_id,
                    "title": "Bad%02d %s" % (info["num"], first_text(dialogue)),
                    "level": 1,
                    "x": 0, "y": 0,
                    "route": "bad%02d" % info["num"],
                    "type": "bd",
                    "parentId": chapter_id,
                    "nextId": None,
                    "summary": make_summary(dialogue),
                    "text": make_text(dialogue),
                    "character": None,
                    "isChoice": False,
                    "choices": [],
                    "media": media_null(),
                    "dialogue": dialogue,
                }

            def get_bad_node(num):
                if num not in bad_nodes:
                    bad_id = "%02d%02dBad%02d" % (act, chapter, num)
                    bad_nodes[num] = {
                        "id": bad_id,
                        "title": "Bad%02d" % num,
                        "level": 1,
                        "x": 0, "y": 0,
                        "route": "bad%02d" % num,
                        "type": "bd",
                        "parentId": chapter_id,
                        "nextId": None,
                        "summary": "",
                        "text": "",
                        "character": None,
                        "isChoice": False,
                        "choices": [],
                        "media": media_null(),
                        "dialogue": [],
                    }
                return bad_nodes[num]

            # 收集章节内所有 Bad 选择使用的 Bad 编号（默认按顺序分配）
            bad_pool = sorted(bad_nodes.keys())
            used_bads = set()

            scene_nodes = []
            scene_ids = []
            for info, blocks, markers in adv_items:
                scene_id = "%02d%02dAdv%02d" % (act, chapter, info["num"])
                dialogue = [b for b in blocks if b["kind"] == "dialogue"]
                choice_blocks = [b for b in blocks if b["kind"] == "choice"]

                # 标注标记：<choice NN> <badend BadXX> → choice 编号 → Bad 编号
                marker_bad = {}
                for marker in markers:
                    if marker and marker[0] == "choice-start" and len(marker) == 3:
                        marker_bad[marker[1]] = marker[2]

                choices = []
                for block in choice_blocks:
                    num = choice_num(block)
                    key = "%02d" % num if num is not None else None
                    is_bad = block["buttonType"] == "Bad"
                    bad_num = None
                    if key in marker_bad:
                        bad_num = int(marker_bad[key][3:])
                        is_bad = True
                    elif is_bad:
                        # 默认按章节内 Bad 文件编号顺序分配
                        for candidate in bad_pool:
                            if candidate not in used_bads:
                                bad_num = candidate
                                break
                        if bad_num is None:
                            bad_num = max(bad_pool + [0]) + 1
                    if bad_num is not None:
                        used_bads.add(bad_num)
                        get_bad_node(bad_num)
                        bad_id = "%02d%02dBad%02d" % (act, chapter, bad_num)
                        get_bad_node(bad_num)["parentId"] = scene_id
                        choices.append({
                            "text": block["text"],
                            "leadsTo": bad_id,
                            "isBadEnd": True,
                            "result": "Bad%02d" % bad_num,
                        })
                    else:
                        choices.append({
                            "text": block["text"],
                            "leadsTo": "continue",
                            "isBadEnd": False,
                            "result": "→继续",
                        })

                scene_nodes.append({
                    "id": scene_id,
                    "title": "Adv%02d %s" % (info["num"], first_text(dialogue)),
                    "level": 1,
                    "x": 0, "y": 0,
                    "route": "normal",
                    "type": "adv",
                    "parentId": chapter_id,
                    "nextId": None,
                    "summary": make_summary(dialogue),
                    "text": make_text(dialogue),
                    "character": None,
                    "isChoice": len(choices) > 0,
                    "choices": choices,
                    "media": media_null(),
                    "dialogue": dialogue,
                })
                scene_ids.append(scene_id)

            # 场景 nextId 链
            for idx, node in enumerate(scene_nodes):
                node["nextId"] = scene_ids[idx + 1] if idx + 1 < len(scene_ids) else None

            chapter_node = {
                "id": chapter_id,
                "title": "第%d章" % chapter,
                "level": 0,
                "x": 0, "y": 0,
                "route": "normal",
                "type": "chapter",
                "parentId": None,
                "nextId": scene_ids[0] if scene_ids else None,
                "summary": "",
                "text": "",
                "character": None,
                "isChoice": False,
                "choices": [],
                "media": media_null(),
            }
            nodes.append(chapter_node)
            nodes.extend(scene_nodes)
            nodes.extend(bad_nodes[num] for num in sorted(bad_nodes))

    return nodes


def main():
    parser = argparse.ArgumentParser(description="导入 Naninovel 剧本为 actXX.json（日常剧情 + Bad End）")
    parser.add_argument("scripts_dir", help="剧本目录（包含 ActXX_ChapterYY_AdvNN/BadNN .bytes 或 .txt）")
    parser.add_argument("out", help="输出 JSON 路径（如 data/act01.json）")
    parser.add_argument("--act", type=int, default=None, help="强制指定周目编号（默认从文件名识别）")
    parser.add_argument("--title", default="魔女审判文本查询器", help="meta.title")
    args = parser.parse_args()

    if not os.path.isdir(args.scripts_dir):
        sys.exit("错误：剧本目录不存在：%s" % args.scripts_dir)

    nodes = build_act(args.scripts_dir, args.act)
    acts = sorted({n["id"][:2] for n in nodes if n["type"] != "chapter"})
    act_label = args.act if args.act is not None else (int(acts[0]) if acts else 1)

    data = {
        "meta": {
            "title": args.title,
            "version": "0.7-act%02d" % act_label,
            "generated": datetime.date.today().isoformat(),
            "note": "Act%02d（日常剧情 + Bad End，由 import_story.py 生成）" % act_label,
        },
        "nodes": nodes,
    }

    ids = [n["id"] for n in nodes]
    if len(ids) != len(set(ids)):
        dup = {x for x in ids if ids.count(x) > 1}
        sys.exit("错误：生成的节点 id 重复：%s" % sorted(dup))

    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, separators=(",", ":"))

    print("✓ 已生成 %s：%d 个节点（章节 %d / 日常 %d / BadEnd %d）" % (
        args.out,
        len(nodes),
        sum(1 for n in nodes if n["type"] == "chapter"),
        sum(1 for n in nodes if n["type"] == "adv"),
        sum(1 for n in nodes if n["type"] == "bd"),
    ))


if __name__ == "__main__":
    main()
