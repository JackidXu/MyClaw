#!/usr/bin/env python3
"""Single-entry video builder for external Agents/automation.

This is the *only* command an external AI tool should use to make a video.
It removes the fragile "write a correct brief" step entirely:

  The caller supplies ONLY:
    - pack id@version (or directory)
    - a high-level description (sceneId + copy + media paths + counts)
    - the talk (口播/旁白) video
    - an output mp4 path

  This tool then:
    1. scaffold a compliant brief from the pack's frozen manifest
       (intent/phases/counts/anchors/slots are filled by the framework,
        NOT by the caller — so intent typos / phase-order / cardinality
        mistakes are impossible)
    2. validate the brief against the profile (hard stop if anything is off)
    3. plan -> build -> audio -> mix -> render

If plan/validate fails, it prints a structured diagnostic and exits non-zero,
so the caller gets actionable feedback instead of a silent broken video.

Usage:
  python3 scripts/make_video.py <pack> <high-level.json> <talk.mp4> <output.mp4> [--workdir DIR]
"""
from __future__ import annotations
import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(HERE))

from pack_catalog import resolve as resolve_pack
from scaffold_brief import scaffold
from validate_brief import validate

ENV = dict(__import__("os").environ)
ENV["PYTHONDONTWRITEBYTECODE"] = "1"


def _run(cmd: list[str], step: str) -> subprocess.CompletedProcess:
    print(f"\n[make-video] ▶ {step}", flush=True)
    print("    $ " + " ".join(str(c) for c in cmd), flush=True)
    r = subprocess.run(cmd, cwd=str(ROOT), env=ENV, capture_output=True, text=True)
    if r.stdout.strip():
        for line in r.stdout.strip().splitlines():
            print("    " + line, flush=True)
    if r.returncode != 0:
        print(f"[make-video] ✗ {step} failed (exit {r.returncode})", file=sys.stderr, flush=True)
        if r.stderr.strip():
            for line in r.stderr.strip().splitlines()[-25:]:
                print("    " + line, file=sys.stderr, flush=True)
        raise SystemExit(f"{step} failed")
    return r


def main():
    ap = argparse.ArgumentParser(description="Single-entry video builder (scaffold -> validate -> plan -> build -> render).")
    ap.add_argument("pack", help="Pack id@version (e.g. vivid-sticker-performance@0.2.0-candidate) or pack directory")
    ap.add_argument("high_level", help="High-level description JSON (sceneId + copy + media + counts)")
    ap.add_argument("talk", help="Talk / narration video (mp4)")
    ap.add_argument("output", help="Final output mp4 path")
    ap.add_argument("--workdir", default=None, help="Working directory for intermediate artifacts (default: a temp dir)")
    args = ap.parse_args()

    pack_dir = Path(resolve_pack(args.pack, ROOT / "packs"))
    high = json.loads(Path(args.high_level).read_text(encoding="utf-8"))
    talk = Path(args.talk).resolve()
    output = Path(args.output).resolve()
    require_msg = f"talk video not found: {talk}"
    if not talk.is_file():
        raise SystemExit(require_msg)

    workdir = Path(args.workdir).resolve() if args.workdir else (ROOT / "builds" / f"mv-{pack_dir.name}-{abs(hash(str(high))%100000)}")
    workdir.mkdir(parents=True, exist_ok=True)
    brief_path = workdir / "brief.json"
    plan_dir = workdir / "plan"
    project_dir = workdir / "project"

    # 1) scaffold — framework fills fragile fields from manifest
    print("[make-video] ▶ scaffold brief", flush=True)
    brief, scaffold_issues = scaffold(pack_dir, high, brief_path.parent)
    brief_path.write_text(json.dumps(brief, ensure_ascii=False, indent=2), encoding="utf-8")
    if scaffold_issues:
        print("[make-video] scaffold warnings (fix inputs, not the framework):", file=sys.stderr)
        for i in scaffold_issues:
            print("  - " + i, file=sys.stderr)

    # 2) validate — hard gate
    print("[make-video] ▶ validate brief", flush=True)
    issues, has_issues = validate(pack_dir, brief_path)
    if issues:
        print("校验未通过 —— 请修正高层描述后重试：", file=sys.stderr)
        for i in issues:
            print("  - " + i, file=sys.stderr)
        raise SystemExit(2)
    print("  OK：brief 合规", flush=True)

    # 3) plan
    if plan_dir.exists():
        shutil.rmtree(plan_dir)
    _run([sys.executable, "-B", str(HERE / "plan_macro_project.py"), args.pack, str(brief_path), str(plan_dir)], "plan")
    report = json.loads((plan_dir / "report.json").read_text(encoding="utf-8"))
    if report.get("status") != "ready":
        print("规划未通过（plan status != ready）：", file=sys.stderr)
        for rsn in report.get("blockedReasons", []):
            print("  - " + str(rsn), file=sys.stderr)
        raise SystemExit("macro-plan blocked; see blockedReasons above")
    print(f"  plan ready：{report.get('selectedScenes')}", flush=True)

    # 4) build
    if project_dir.exists():
        shutil.rmtree(project_dir)
    spec = plan_dir / "spec.json"
    _run([sys.executable, "-B", str(HERE / "build_macro_project.py"), "build", args.pack, str(spec), str(talk), str(project_dir)], "build")
    print(f"  built project: {project_dir}", flush=True)

    # 5) audio + mix
    _run([sys.executable, "-B", str(HERE / "pipeline.py"), "audio", str(project_dir)], "audio")
    _run([sys.executable, "-B", str(HERE / "pipeline.py"), "mix", str(project_dir)], "mix")

    # 6) render (refuses to overwrite — clear first)
    for stale in (output, Path(str(output) + ".manifest.json")):
        if stale.exists():
            stale.unlink()
    _run([sys.executable, "-B", str(HERE / "pipeline.py"), "render", str(project_dir), str(output)], "render")

    # 7) quick integrity check
    _run([sys.executable, "-B", str(HERE / "pipeline.py"), "check", str(output)], "check")

    print(f"\n[make-video] ✓ 完成：{output}", flush=True)
    print(json.dumps({
        "output": str(output),
        "brief": str(brief_path),
        "plan": str(plan_dir),
        "project": str(project_dir),
        "scenes": report.get("selectedScenes"),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
