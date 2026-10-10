#!/usr/bin/env python3
"""Scaffold a compliant adaptation brief from a high-level description.

The caller (an Agent or a human) supplies ONLY:
  - pack id@version (or directory)
  - per-segment: sceneId, text, optional durationFrames, and `inputs`
    (the real copy + media paths + counts as plain arrays/dicts)

This tool fills the fragile parts from the pack's frozen manifest +
adaptation profile, so the caller never has to memorize exact intent
strings, phase order, cardinality ranges, or cue timings:

  intent      <- profile intents[0]
  phases      <- profile requiredPhases (in order)
  counts      <- lengths of the supplied inputs arrays/dicts
  anchors     <- manifest cue 'at' minus source.start (local seconds)
  slots       <- grainTexture (auto-generated) + presenter "@talk"

Usage:
  python3 scripts/scaffold_brief.py <pack> <high-level.json> <output.json> [--grain <path>]
"""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pack_catalog import resolve
from adaptation import load_profile, BRIEF_SCHEMA, _semantic_rejections, candidate_segment
from adapt_project import read_json, require

ROOT = Path(__file__).resolve().parents[1]

def _make_grain(out_dir: Path) -> str:
    """Generate a subtle grayscale noise texture with zero third-party deps."""
    out_dir.mkdir(parents=True, exist_ok=True)
    p = out_dir / "grain.png"
    if p.exists():
        return str(p.resolve())
    import random
    import struct
    import zlib
    rnd = random.Random(7)
    w = h = 512
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter type 0 (none)
        for x in range(w):
            raw.append(max(0, min(255, 128 + rnd.randint(-10, 10))))
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 6))
    png += chunk(b"IEND", b"")
    p.write_bytes(png)
    return str(p.resolve())


def scaffold(pack_dir: Path, high: dict, out_dir: Path, grain_override: str | None = None) -> tuple[dict, list[str]]:
    manifest = read_json(pack_dir / "manifest.json")
    profile = load_profile(manifest, ROOT / "adaptation-profiles")
    sources = {s["id"]: s for s in manifest["scenes"]}
    pscenes = {s["sceneId"]: s for s in profile["scenes"]}
    grain = grain_override or _make_grain(out_dir)
    segments, issues = [], []
    for seg in high["segments"]:
        sid = seg["sceneId"]
        require(sid in sources, f"{seg.get('id')}: unknown scene {sid}")
        source = sources[sid]
        contract = pscenes[sid]
        inputs = seg.get("inputs", {})
        intent = contract["intents"][0]
        phases = list(contract["requiredPhases"])
        counts = {}
        for name, limits in contract.get("cardinality", {}).items():
            val = inputs.get(name)
            counts[name] = len(val) if isinstance(val, (list, dict)) else None
        start = source["source"]["start"]
        anchors = {c["id"]: {"at": round((c["at"] - start) * 1000) / 1000} for c in source.get("cues", [])}
        dur = seg.get("durationFrames", source["minFrames"])
        candidate = {"inputs": inputs, "slots": {"grainTexture": grain, "presenter": "@talk"}}
        segment = {
            "id": seg["id"],
            "text": seg["text"],
            "intent": intent,
            "phases": phases,
            "counts": counts,
            "durationFrames": dur,
            "candidates": {sid: candidate},
            "candidateInterpretations": {sid: {"anchors": anchors}},
        }
        segments.append(segment)
        merged = candidate_segment(segment, sid)
        for reason in _semantic_rejections(contract, merged):
            issues.append(f"{seg['id']}: {reason}")
    brief = {
        "schema": BRIEF_SCHEMA,
        "fps": high.get("fps", manifest.get("fps", 60)),
        "layout": high.get("layout", "portrait"),
        "brand": high.get("brand", ""),
        "music": high.get("music", {"mode": "none"}),
        "segments": segments,
    }
    return brief, issues


def main():
    ap = argparse.ArgumentParser(description="Scaffold a compliant adaptation brief from a high-level description.")
    ap.add_argument("pack")
    ap.add_argument("high_level")
    ap.add_argument("output")
    ap.add_argument("--grain", default=None)
    args = ap.parse_args()
    pack_dir = resolve(args.pack, ROOT / "packs")
    high = read_json(Path(args.high_level))
    out_path = Path(args.output)
    brief, issues = scaffold(pack_dir, high, out_path.parent, args.grain)
    if args.grain:
        for seg in brief["segments"]:
            seg["candidates"][list(seg["candidates"])[0]]["slots"]["grainTexture"] = str(Path(args.grain).resolve())
    out_path.write_text(json.dumps(brief, ensure_ascii=False, indent=2), encoding="utf-8")
    if issues:
        print("SCAFFOLD WARNINGS (fix the inputs, not the framework):", file=sys.stderr)
        for i in issues:
            print("  - " + i, file=sys.stderr)
    else:
        print(f"OK: scaffolded {len(brief['segments'])} segments -> {out_path}")
    print(json.dumps({"issues": issues, "output": str(out_path)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
