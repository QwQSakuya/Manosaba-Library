#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""同步本站文件到 Cloudflare R2（web/ 前缀）。

用法:
    sync_r2.py [--force] [--include-promo] [--workers N]

默认同步范围:
    - 仓库根目录的网页与站点图片 / robots.txt
    - .well-known/            -> web/.well-known/
    - assets/                 -> web/assets/
    - data/                   -> web/data/
    - promo-standalone/       -> web/promo-standalone/（需 --include-promo）

环境变量:
    R2_ACCOUNT_ID / R2_ACCESS_KEY / R2_SECRET_KEY / R2_BUCKET

比对策略:
    先比较大小；大小相同再比较 MD5 与远端 ETag，避免“文件改了但大小没变
    导致被跳过、网页没更新”的问题。
"""

import argparse
import hashlib
import os
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

import boto3
from botocore.config import Config


ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUCKET = os.environ.get("R2_BUCKET", "manosaba-raw")

ROOT_EXTS = {
    ".html", ".png", ".webp", ".jpg", ".jpeg", ".ico",
    ".txt", ".svg", ".xml", ".json", ".js", ".css",
    ".woff", ".woff2",
}


def make_client():
    account = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY"],
        aws_secret_access_key=os.environ["R2_SECRET_KEY"],
        region_name="auto",
        config=Config(
            max_pool_connections=32,
            connect_timeout=60,
            read_timeout=300,
            retries={"max_attempts": 8, "mode": "standard"},
        ),
    )


def build_file_list(include_promo):
    items = []

    def add(local, key):
        items.append((local, key, os.path.getsize(local)))

    # 仓库根目录的网页与站点图片
    for name in os.listdir(ROOT):
        if name.startswith("."):
            continue
        full = os.path.join(ROOT, name)
        if not os.path.isfile(full):
            continue
        ext = os.path.splitext(name)[1].lower()
        if ext in ROOT_EXTS or name == "robots.txt":
            add(full, "web/" + name)

    # .well-known（如 security.txt）
    wk = os.path.join(ROOT, ".well-known")
    if os.path.isdir(wk):
        for base, _dirs, files in os.walk(wk):
            for fn in files:
                full = os.path.join(base, fn)
                rel = os.path.relpath(full, ROOT).replace("\\", "/")
                add(full, "web/" + rel)

    # assets/ 与 data/
    for sub in ("assets", "data"):
        base = os.path.join(ROOT, sub)
        if not os.path.isdir(base):
            continue
        for walk_base, _dirs, files in os.walk(base):
            for fn in files:
                full = os.path.join(walk_base, fn)
                rel = os.path.relpath(full, base).replace("\\", "/")
                add(full, f"web/{sub}/{rel}")

    # 独立演示站（默认不上传）
    if include_promo:
        base = os.path.join(ROOT, "promo-standalone")
        if os.path.isdir(base):
            for walk_base, _dirs, files in os.walk(base):
                for fn in files:
                    full = os.path.join(walk_base, fn)
                    rel = os.path.relpath(full, base).replace("\\", "/")
                    add(full, "web/promo-standalone/" + rel)

    return items


def file_md5(path):
    h = hashlib.md5()
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def classify(client, item, force):
    """返回 None=已同步；返回 item=需要上传；返回 (\"error\", key, msg)=失败。"""
    full, key, size = item
    if force:
        return item
    try:
        r = client.head_object(Bucket=BUCKET, Key=key)
    except client.exceptions.ClientError as e:
        if e.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return item
        return ("error", key, f"head error: {e}")
    if r.get("ContentLength") != size:
        return item
    etag = (r.get("ETag") or "").strip('"')
    if not re.fullmatch(r"[0-9a-f]{32}", etag):
        # 多段上传的 ETag 不是 MD5，沿用旧逻辑（大小相同即跳过）
        return None
    try:
        if etag == file_md5(full):
            return None
    except OSError as e:
        return ("error", key, f"md5 error: {e}")
    return item


def _ctype(key):
    ext = os.path.splitext(key)[1].lower()
    return {
        ".webp": "image/webp",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".ico": "image/x-icon",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".ogg": "audio/ogg",
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".mp4": "video/mp4",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".txt": "text/plain",
        ".css": "text/css",
        ".js": "application/javascript",
        ".html": "text/html",
        ".xml": "application/xml",
    }.get(ext, "application/octet-stream")


def upload_one(client, item):
    full, key, size = item
    last_err = None
    for attempt in range(6):
        try:
            with open(full, "rb") as f:
                client.put_object(
                    Bucket=BUCKET,
                    Key=key,
                    Body=f,
                    ContentType=_ctype(key),
                )
            return None
        except Exception as e:  # noqa: BLE001
            last_err = str(e)
            time.sleep(2 + attempt * 3)
    return (key, last_err)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true", help="无视比对，全部重新上传")
    ap.add_argument("--include-promo", action="store_true", help="同时上传 promo-standalone/")
    ap.add_argument("--workers", type=int, default=12)
    args = ap.parse_args()

    items = build_file_list(args.include_promo)
    if not items:
        print("没有找到可同步的文件")
        return

    client = make_client()
    lock = threading.Lock()
    skip = 0
    todo = []
    errors = []

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(classify, client, it, args.force) for it in items]
        for fut in as_completed(futs):
            res = fut.result()
            if res is None:
                with lock:
                    skip += 1
            elif res[0] == "error":
                errors.append((res[1], res[2]))
            else:
                todo.append(res)

    total_size = sum(it[2] for it in todo)
    print(
        f"total={len(items)} already-synced={skip} to-upload={len(todo)} "
        f"({total_size / 1024 / 1024:.1f} MiB)"
    )

    if errors:
        for k, e in errors[:20]:
            print(f"  ! {k}: {e}")
        sys.exit(1)
    if not todo:
        return

    done = 0
    upload_errors = []

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(upload_one, client, it) for it in todo]
        for fut in as_completed(futs):
            err = fut.result()
            if err:
                upload_errors.append(err)
            else:
                with lock:
                    done += 1
                    if done % 25 == 0 or done == len(todo):
                        print(f"  {done}/{len(todo)} uploaded")

    print(f"done: {done}/{len(todo)} uploaded")
    if upload_errors:
        print(f"errors: {len(upload_errors)}")
        for k, e in upload_errors[:20]:
            print(f"  ! {k}: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
