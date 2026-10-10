#!/usr/bin/env python3
"""Pre-flight validation of an adaptation brief before macro-plan.

Reports every semantic/structural issue with an actionable fix, so an Agent can
correct the brief without running the full planner. Mirrors the planner's
_semantic_rejections plus required-slot and transcript-misuse checks.

Usage:
  python3 scripts/validate_brief.py <pack> <brief.json>
Exit code 0 = compliant, 2 = hard issue, 1 = invalid input.
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pack_catalog import resolve
from adaptation import load_profile, BRIEF_SCHEMA, _semantic_rejections, candidate_segment
from adapt_project import read_json, transcript_rows, AdaptError, require

ROOT = Path(__file__).resolve().parents[1]

_VIDEO_SUFFIXES = (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi")


def validate(pack_dir: Path, brief_path: Path) -> tuple[list[str], bool]:
    manifest = read_json(pack_dir / "manifest.json")
    profile = load_profile(manifest, ROOT / "adaptation-profiles")
    pscenes = {s["sceneId"]: s for s in profile["scenes"]}
    sources = {s["id"]: s for s in manifest["scenes"]}
    brief = read_json(brief_path)
    issues: list[str] = []
    require(brief.get("schema") == BRIEF_SCHEMA, f"schema must be {BRIEF_SCHEMA}")
    for seg in brief["segments"]:
        sids = list(seg.get("candidateInterpretations", {}).keys()) or list(seg.get("candidates", {}).keys())
        if not sids:
            issues.append(f"{seg['id']}: no candidateInterpretations/candidates sceneId declared")
            continue
        for sid in sids:
            if sid not in pscenes:
                issues.append(f"{seg['id']}: scene {sid} not in adaptation profile")
                continue
            contract = pscenes[sid]
            try:
                merged = candidate_segment(seg, sid)
            except AdaptError as exc:
                issues.append(f"{seg['id']}->{sid}: {exc}")
                continue
            for reason in _semantic_rejections(contract, merged):
                issues.append(f"{seg['id']}->{sid}: {reason}")
            cand = seg.get("candidates", {}).get(sid, {})
            slots = cand.get("slots", {})
            for slot in sources[sid].get("slots", []):
                if slot.get("required", True) and slot.get("inputPath") is None and slot["id"] not in slots:
                    issues.append(f"{seg['id']}->{sid}: missing required slot {slot['id']}")
    tr = brief.get("transcript")
    if isinstance(tr, str):
        p = Path(tr)
        if p.exists() and p.suffix.lower() in _VIDEO_SUFFIXES:
            issues.append(f"transcript 字段看起来是视频文件（{p.name}）；transcript 应为 SRT 字幕文本，口播/旁白视频请通过 macro-build 的 talk 参数传入")
    return issues, bool(issues)


def main():
    ap = argparse.ArgumentParser(description="Validate an adaptation brief before macro-plan.")
    ap.add_argument("pack")
    ap.add_argument("brief")
    args = ap.parse_args()
    pack_dir = resolve(args.pack, ROOT / "packs")
    issues, has_issues = validate(pack_dir, Path(args.brief))
    if issues:
        print("校验未通过：" if has_issues else "校验有提示：")
        for i in issues:
            print("  - " + i)
        sys.exit(2 if has_issues else 0)
    print("OK：brief 合规，可以运行 macro-plan")
    sys.exit(0)


if __name__ == "__main__":
    main()
