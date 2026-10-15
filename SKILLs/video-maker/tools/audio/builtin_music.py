"""Built-in fallback background music — zero-dependency last resort.

Ships one royalty-safe track inside the skill package
(``assets/默认背景音.m4a``, ~170s AAC). When every other music channel is
unavailable (no stock-music API key, no network, no user library), this
provider still lets a video ship with background music.

Two operations:
- default / ``inspect``: report the built-in track (path, duration).
- ``prepare``: loop-stitch the track to a target duration with a tail
  fade-out via FFmpeg, writing a ready-to-mix file.
"""

from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

# Repository root: tools/audio/builtin_music.py -> parents[2]
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
BUILTIN_TRACK = _PROJECT_ROOT / "assets" / "默认背景音.m4a"

# Extra bundled tracks can be dropped into assets/music/ later.
_EXTRA_DIR = _PROJECT_ROOT / "assets" / "music"

_TAIL_FADE_SECONDS = 1.5


class BuiltinMusic(BaseTool):
    name = "builtin_music"
    version = "0.1.0"
    tier = ToolTier.SOURCE
    capability = "music_library"
    provider = "builtin"
    stability = ToolStability.PRODUCTION
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.LOCAL

    dependencies = ["cmd:ffmpeg"]
    install_instructions = (
        "FFmpeg is required for the 'prepare' operation "
        "(inspect works without it)."
    )

    agent_skills = ["music"]

    capabilities = [
        "list_builtin_music_tracks",
        "loop_stitch_to_duration",
    ]
    supports = {
        "local_offline": True,
        "free": True,
        "always_available": True,
    }
    best_for = [
        "zero-config background music fallback",
        "offline workflows with no music API key",
        "guaranteed music option when every other channel fails",
    ]
    not_good_for = [
        "variety or genre matching (only bundled tracks)",
        "fresh custom music (use music_gen / suno_music)",
        "catalog search (use pixabay_music / freesound_music)",
    ]

    input_schema = {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["inspect", "prepare"],
                "default": "inspect",
                "description": (
                    "inspect: report bundled tracks. "
                    "prepare: loop-stitch a track to target_duration."
                ),
            },
            "target_duration": {
                "type": "number",
                "minimum": 0.5,
                "description": "Final music length in seconds for 'prepare'. The bundled track loops until this length is reached.",
            },
            "fade_out": {
                "type": "number",
                "minimum": 0,
                "maximum": 10,
                "description": f"Tail fade-out length in seconds. Default {_TAIL_FADE_SECONDS}.",
            },
            "volume_db": {
                "type": "number",
                "minimum": -40,
                "maximum": 6,
                "description": "Optional gain adjustment in dB (e.g. -12 to sit under narration). Default 0 (unchanged).",
            },
            "output_path": {
                "type": "string",
                "description": "Output file for 'prepare' (m4a/mp3). Default: builtin_bgm_<duration>s.m4a in the working directory.",
            },
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=128, vram_mb=0, disk_mb=50, network_required=False
    )
    side_effects = ["writes a stitched audio file for 'prepare'"]
    user_visible_verification = [
        "Listen to the stitched track: no click at loop points, clean fade-out",
    ]

    # ---- helpers ----

    @classmethod
    def _ensure_builtin_track(cls) -> bool:
        if BUILTIN_TRACK.is_file() and BUILTIN_TRACK.stat().st_size > 0:
            return True
        cdn_url = "https://scrm0.cdn.banchengyun.com/heyclaw/assets/content-template-pack/default_v1/bgm.m4a"
        try:
            import urllib.request
            BUILTIN_TRACK.parent.mkdir(parents=True, exist_ok=True)
            temp_path = BUILTIN_TRACK.with_suffix(".tmp")
            req = urllib.request.Request(
                cdn_url,
                headers={"User-Agent": "HeyClaw/VideoMaker"},
            )
            with urllib.request.urlopen(req, timeout=30) as resp, open(temp_path, "wb") as f:
                shutil.copyfileobj(resp, f)
            temp_path.replace(BUILTIN_TRACK)
            return True
        except Exception:
            return False

    @classmethod
    def _bundled_tracks(cls) -> list[Path]:
        tracks: list[Path] = []
        if BUILTIN_TRACK.is_file() or cls._ensure_builtin_track():
            if BUILTIN_TRACK.is_file() and BUILTIN_TRACK.stat().st_size > 0:
                tracks.append(BUILTIN_TRACK)
        if _EXTRA_DIR.is_dir():
            tracks.extend(
                sorted(
                    p
                    for p in _EXTRA_DIR.rglob("*")
                    if p.is_file() and p.suffix.lower() in {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"}
                )
            )
        return tracks

    @staticmethod
    def _probe_duration(path: Path) -> Optional[float]:
        if shutil.which("ffprobe") is None:
            return None
        try:
            out = subprocess.run(
                [
                    "ffprobe", "-v", "error",
                    "-show_entries", "format=duration",
                    "-of", "default=noprint_wrappers=1:nokey=1",
                    str(path),
                ],
                capture_output=True,
                text=True,
                timeout=15,
                check=True,
            )
            value = out.stdout.strip()
            return round(float(value), 2) if value else None
        except (subprocess.SubprocessError, ValueError):
            return None

    # ---- status ----

    def get_status(self) -> ToolStatus:
        return ToolStatus.AVAILABLE if self._bundled_tracks() else ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    # ---- execution ----

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        start = time.time()
        operation = inputs.get("operation", "inspect")
        if operation == "prepare":
            result = self._prepare(inputs)
        else:
            result = self._inspect()
        result.duration_seconds = round(time.time() - start, 2)
        return result

    def _inspect(self) -> ToolResult:
        tracks = self._bundled_tracks()
        if not tracks:
            return ToolResult(
                success=False,
                error="No bundled music tracks found in assets/. This should not happen in a healthy install.",
            )
        payload = []
        for path in tracks:
            payload.append(
                {
                    "name": path.stem,
                    "path": str(path),
                    "size_bytes": path.stat().st_size,
                    "duration_seconds": self._probe_duration(path),
                }
            )
        return ToolResult(
            success=True,
            data={
                "provider": self.provider,
                "track_count": len(payload),
                "tracks": payload,
                "note": (
                    "Zero-config fallback music. Use 'prepare' with target_duration "
                    "to loop-stitch a track to the exact video length."
                ),
            },
        )

    def _prepare(self, inputs: dict[str, Any]) -> ToolResult:
        tracks = self._bundled_tracks()
        if not tracks:
            return ToolResult(success=False, error="No bundled music tracks found.")

        target_duration = inputs.get("target_duration")
        if not target_duration or float(target_duration) <= 0:
            return ToolResult(
                success=False,
                error="'prepare' requires target_duration (seconds, > 0).",
            )
        target_duration = float(target_duration)

        if shutil.which("ffmpeg") is None:
            return ToolResult(
                success=False,
                error="FFmpeg is required for loop stitching. " + self.install_instructions,
            )

        source = tracks[0]
        output_path = Path(
            inputs.get("output_path") or f"builtin_bgm_{target_duration:.0f}s.m4a"
        )
        output_path.parent.mkdir(parents=True, exist_ok=True)

        fade_out = float(inputs.get("fade_out", _TAIL_FADE_SECONDS))
        fade_out = min(fade_out, target_duration / 2)

        filters: list[str] = []
        volume_db = inputs.get("volume_db")
        if volume_db is not None and float(volume_db) != 0:
            filters.append(f"volume={float(volume_db)}dB")
        if fade_out > 0:
            fade_start = max(target_duration - fade_out, 0)
            filters.append(f"afade=t=out:st={fade_start:.3f}:d={fade_out:.3f}")

        args = [
            "ffmpeg", "-y",
            "-stream_loop", "-1",       # loop the source indefinitely
            "-i", str(source),
            "-t", f"{target_duration:.3f}",  # cut at exact target length
        ]
        if filters:
            args += ["-af", ",".join(filters)]
        args += [
            "-c:a", "aac",
            "-b:a", "192k",
            str(output_path),
        ]

        try:
            proc = subprocess.run(args, capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, error="FFmpeg loop stitching timed out.")
        except OSError as exc:
            return ToolResult(success=False, error=f"FFmpeg failed to launch: {exc}")

        if proc.returncode != 0:
            return ToolResult(
                success=False,
                error=f"FFmpeg loop stitching failed: {proc.stderr.strip()[-500:]}",
            )
        if not output_path.exists() or output_path.stat().st_size == 0:
            return ToolResult(success=False, error=f"Output file missing: {output_path}")

        return ToolResult(
            success=True,
            data={
                "provider": self.provider,
                "source": str(source),
                "output": str(output_path),
                "target_duration": target_duration,
                "fade_out": fade_out,
                "volume_db": volume_db,
                "actual_duration": self._probe_duration(output_path),
                "free": True,
            },
            artifacts=[str(output_path)],
            model="builtin:default_bgm",
        )
