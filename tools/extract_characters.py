#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从游戏角色 bundle 提取立绘部件 PNG + 合成清单 (manifest.json)。

供网站「立绘工坊」使用：用户选角色后，前端按 manifest 从 R2 拉取部件图并拼装。

用法:
    python tools/extract_characters.py [角色名...]
    缺省时提取 characters 目录下全部 bundle。

环境变量:
    MANOSABA_GAME  游戏根目录 (默认自动查找常见 Steam 路径)
    CHARA_OUT      输出目录 (默认 E:/project/.r2tool/chara_out)
"""

import json
import os
import re
import sys
from pathlib import Path

import UnityPy


DEFAULT_GAME = (
    r"E:\SteamLibrary\steamapps\common\manosaba_game"
    r"\manosaba_Data\StreamingAssets\aa\StandaloneWindows64"
    r"\naninovel-characters_assets_naninovel\characters"
)
DEFAULT_OUT = Path(r"E:\project\.r2tool\chara_out")


def _clean(name: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', "_", name)


def categorize(name: str) -> str:
    n = name.lower()
    if "clippingmask" in n or n.startswith("mask"):
        return "mask"
    if "eye" in n:
        return "eyes"
    if "mouth" in n:
        return "mouth"
    if "cheek" in n:
        return "cheeks"
    if n.startswith("body"):
        return "body"
    if "sweat" in n or "pale" in n:
        return "facial"
    if "effect" in n:
        return "effect"
    if "arm" in n or "hand" in n or "leg" in n or "foot" in n or "shoulder" in n:
        return "limb"
    if n.startswith("option"):
        return "option"
    return "other"


def extract_character(bundle: Path, out_dir: Path):
    env = UnityPy.load(str(bundle))
    gos = {}
    transforms = {}
    renderers = []
    sprites = {}

    for obj in env.objects:
        try:
            data = obj.read()
            t = obj.type.name
            if t == "GameObject":
                gos[obj.path_id] = getattr(data, "m_Name", f"GO_{obj.path_id}")
            elif t == "Transform":
                go = getattr(getattr(data, "m_GameObject", None), "m_PathID", 0)
                p = getattr(data, "m_LocalPosition", None)
                transforms[obj.path_id] = {
                    "go": go,
                    "pos": {"x": getattr(p, "x", 0.0), "y": getattr(p, "y", 0.0), "z": getattr(p, "z", 0.0)},
                }
            elif t == "SpriteRenderer":
                go = getattr(getattr(data, "m_GameObject", None), "m_PathID", 0)
                sid = getattr(getattr(data, "m_Sprite", None), "m_PathID", 0)
                c = getattr(data, "m_Color", None)
                renderers.append(
                    {
                        "go": go,
                        "sprite": sid,
                        "order": getattr(data, "m_SortingOrder", 0),
                        "color": [getattr(c, "r", 1.0), getattr(c, "g", 1.0), getattr(c, "b", 1.0), getattr(c, "a", 1.0)],
                    }
                )
            elif t == "Sprite":
                sprites[obj.path_id] = data
        except Exception:
            continue

    parts_dir = out_dir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    used_names = set()
    parts = []
    go_pos = {v["go"]: v["pos"] for v in transforms.values()}

    for r in sorted(renderers, key=lambda x: x["order"]):
        sp = sprites.get(r["sprite"])
        if sp is None or sp.image is None:
            continue
        rect = getattr(sp, "m_Rect", None)
        rw = getattr(rect, "width", 1) if rect else 1
        rh = getattr(rect, "height", 1) if rect else 1
        if rw <= 0 or rh <= 0:
            # 零尺寸占位精灵（宽高为 0），对合成无贡献
            continue
        pos = go_pos.get(r["go"], {"x": 0.0, "y": 0.0})
        name = gos.get(r["go"], f"GO_{r['go']}")
        safe = _clean(name)
        n = 2
        while safe in used_names:
            safe = f"{_clean(name)}_{n}"
            n += 1
        used_names.add(safe)
        png = parts_dir / f"{safe}.png"
        try:
            sp.image.save(str(png))
        except Exception:
            # 部分精灵矩形超出纹理边界，PIL 保存会报 tile 越界，复制后转 RGBA 可规避
            sp.image.copy().convert("RGBA").save(str(png), "PNG")
        pivot = getattr(sp, "m_Pivot", None)
        parts.append(
            {
                "name": name,
                "file": f"parts/{safe}.png",
                "size": {"w": sp.image.width, "h": sp.image.height},
                "pivot": [getattr(pivot, "x", 0.5), getattr(pivot, "y", 0.5)],
                "pos": {"x": pos["x"], "y": pos["y"]},
                "order": r["order"],
                "color": [round(v, 4) for v in r["color"]],
                "category": categorize(name),
            }
        )

    manifest = {
        "character": bundle.stem,
        "parts": parts,
    }
    with open(out_dir / "manifest.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    total = sum((out_dir / p["file"]).stat().st_size for p in parts)
    cats = {}
    for p in parts:
        cats[p["category"]] = cats.get(p["category"], 0) + 1
    print(
        f"{bundle.stem}: parts={len(parts)} bytes={total / 1024 / 1024:.1f} MiB "
        f"categories={cats} orders={parts[0]['order'] if parts else '-'}..{parts[-1]['order'] if parts else '-'}"
    )


def main():
    char_dir = Path(os.environ.get("MANOSABA_GAME", DEFAULT_GAME))
    out_root = Path(os.environ.get("CHARA_OUT", DEFAULT_OUT))
    if not char_dir.exists():
        sys.exit(f"角色目录不存在: {char_dir}")

    targets = sys.argv[1:]
    bundles = []
    for b in sorted(char_dir.glob("*.bundle")):
        if not targets or b.stem in targets:
            bundles.append(b)
    if not bundles:
        sys.exit("没有匹配的角色包")

    for b in bundles:
        out_dir = out_root / b.stem
        extract_character(b, out_dir)


if __name__ == "__main__":
    main()
