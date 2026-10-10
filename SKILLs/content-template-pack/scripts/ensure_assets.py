#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
content-template-pack 静态资源按需拉取模块
用于自动从云端 CDN 下载模板包中的大体积静态资产（BGM 音频、草稿 JSON 等）。
纯 Python 标准库实现，零外部依赖，跨平台兼容。
"""

import os
import sys
import json
import urllib.request
import urllib.error
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "templates"))
REMOTE_ASSETS_FILE = os.path.join(TEMPLATES_DIR, "remote_assets.json")


def load_remote_assets_manifest(templates_dir=None):
    """读取 remote_assets.json 资产清单"""
    manifest_path = os.path.join(templates_dir or TEMPLATES_DIR, "remote_assets.json")
    if not os.path.isfile(manifest_path):
        return {}
    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data.get("assets", {})
    except Exception as e:
        print(f"[template-assets] 读取 remote_assets.json 失败: {e}", file=sys.stderr)
        return {}


def download_file(url, target_path, retries=3, timeout=60):
    """使用标准库下载文件，先落临时文件后原子替换"""
    os.makedirs(os.path.dirname(target_path), exist_ok=True)
    temp_path = f"{target_path}.tmp"
    
    headers = {
        "User-Agent": "HeyClaw-TemplateDownloader/1.0"
    }
    
    for attempt in range(1, retries + 1):
        try:
            print(f">>> [template-assets] 正在拉取云端资源: {os.path.basename(target_path)} (尝试 {attempt}/{retries})...")
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                with open(temp_path, "wb") as out_file:
                    total_bytes = 0
                    while True:
                        chunk = response.read(64 * 1024)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        total_bytes += len(chunk)
            
            if os.path.exists(temp_path) and os.path.getsize(temp_path) > 0:
                os.replace(temp_path, target_path)
                size_mb = total_bytes / (1024 * 1024)
                print(f">>> [template-assets] 下载成功: {os.path.basename(target_path)} ({size_mb:.2f} MB)")
                return True
        except Exception as e:
            print(f"[template-assets] 下载失败 (尝试 {attempt}/{retries}): {e}", file=sys.stderr)
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except OSError:
                    pass
            if attempt < retries:
                time.sleep(1.5)
    
    return False


def ensure_template_assets(template_path):
    """
    检查并补齐指定模板目录中缺失的云端静态资源。
    template_path 可以是：
      - 模板根目录（例如 .../templates/default_v1）
      - template.draft 子目录（例如 .../templates/default_v1/template.draft）
    """
    if not template_path:
        return True

    # 规整到模板根目录与 templates 总目录
    abs_template_path = os.path.abspath(template_path)
    if os.path.basename(abs_template_path.rstrip("/\\")) == "template.draft":
        template_root = os.path.dirname(abs_template_path.rstrip("/\\"))
    else:
        template_root = abs_template_path

    templates_dir = os.path.dirname(template_root)
    template_name = os.path.basename(template_root)

    # 尝试加载清单
    assets_manifest = load_remote_assets_manifest(templates_dir)
    if not assets_manifest:
        # 回退尝试默认路径
        assets_manifest = load_remote_assets_manifest(TEMPLATES_DIR)

    if not assets_manifest:
        return True

    all_success = True
    prefix = f"{template_name}/"
    for rel_path, cdn_url in assets_manifest.items():
        if rel_path.startswith(prefix):
            sub_path = rel_path[len(prefix):]
            local_file = os.path.join(template_root, sub_path)
            
            # 若文件不存在或大小为0，则按需下载
            if not os.path.isfile(local_file) or os.path.getsize(local_file) == 0:
                success = download_file(cdn_url, local_file)
                if not success:
                    all_success = False

    return all_success


def ensure_all_assets():
    """下载清单中的全部资源（全量预热/离线化时使用）"""
    manifest = load_remote_assets_manifest()
    if not manifest:
        print("[template-assets] 未找到资产清单", file=sys.stderr)
        return False
    
    print(f"[template-assets] 开始检查全量模板资源 (共 {len(manifest)} 项)...")
    success_count = 0
    for rel_path, url in manifest.items():
        target = os.path.join(TEMPLATES_DIR, rel_path)
        if not os.path.isfile(target) or os.path.getsize(target) == 0:
            if download_file(url, target):
                success_count += 1
        else:
            success_count += 1
            
    print(f"[template-assets] 检查完成: {success_count}/{len(manifest)} 项就绪")
    return success_count == len(manifest)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--all":
        ok = ensure_all_assets()
        sys.exit(0 if ok else 1)
    elif len(sys.argv) > 1:
        target = sys.argv[1]
        ok = ensure_template_assets(target)
        sys.exit(0 if ok else 1)
    else:
        print("用法:")
        print("  python3 ensure_assets.py <模板路径>   # 按需检查下载单个模板资源")
        print("  python3 ensure_assets.py --all        # 检查下载全量模板资源")
        sys.exit(0)
