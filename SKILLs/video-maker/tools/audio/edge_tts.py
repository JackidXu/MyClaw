"""Edge TTS provider — free Microsoft Edge text-to-speech (no API key).

Uses the `edge-tts` Python package which talks to Microsoft's public
read-aloud endpoint. Free, no key required, reachable from mainland China
without a VPN in most cases. This is the recommended zero-config TTS
fallback when no other TTS provider is configured.
"""

from __future__ import annotations

import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

from tools.base_tool import (
    BaseTool,
    Determinism,
    ExecutionMode,
    ResourceProfile,
    RetryPolicy,
    ToolResult,
    ToolRuntime,
    ToolStability,
    ToolStatus,
    ToolTier,
)

DEFAULT_VOICE_ZH = "zh-CN-XiaoxiaoNeural"
DEFAULT_VOICE_EN = "en-US-AriaNeural"


def _default_voice(text: str) -> str:
    has_cjk = any("\u4e00" <= ch <= "\u9fff" for ch in text)
    return DEFAULT_VOICE_ZH if has_cjk else DEFAULT_VOICE_EN


class EdgeTTS(BaseTool):
    name = "edge_tts"
    version = "0.1.0"
    tier = ToolTier.VOICE
    capability = "tts"
    provider = "edge"
    stability = ToolStability.BETA
    execution_mode = ExecutionMode.SYNC
    determinism = Determinism.DETERMINISTIC
    runtime = ToolRuntime.HYBRID

    dependencies = ["pip:edge-tts"]
    install_instructions = (
        "Install Edge TTS (free, no API key):\n"
        "  pip install edge-tts"
    )
    agent_skills = ["text-to-speech"]

    capabilities = [
        "text_to_speech",
        "free_zero_config_generation",
    ]
    supports = {
        "voice_cloning": False,
        "multilingual": True,
        "offline": False,
        "native_audio": True,
    }
    best_for = [
        "zero-config free narration",
        "no API key workflows",
        "Chinese and English narration fallback",
    ]
    not_good_for = [
        "voice cloning",
        "expressive emotional performance",
        "fully offline workflows",
    ]

    input_schema = {
        "type": "object",
        "required": ["text"],
        "properties": {
            "text": {"type": "string"},
            "voice": {
                "type": "string",
                "description": (
                    "Edge voice name, e.g. zh-CN-XiaoxiaoNeural (female), "
                    "zh-CN-YunxiNeural (male), en-US-AriaNeural, en-US-GuyNeural. "
                    "Defaults to auto: Chinese text -> zh-CN-XiaoxiaoNeural, "
                    "otherwise en-US-AriaNeural."
                ),
            },
            "rate": {
                "type": "string",
                "description": "Speaking rate as a percentage, e.g. '+10%' or '-10%'.",
            },
            "pitch": {
                "type": "string",
                "description": "Pitch adjustment, e.g. '+5Hz' or '-5Hz'.",
            },
            "speed": {
                "type": "number",
                "minimum": 0.5,
                "maximum": 2.0,
                "description": "Alias converted to rate percentage (1.0 -> +0%).",
            },
            "output_path": {"type": "string"},
            "proxy": {
                "type": "string",
                "description": (
                    "Optional HTTP proxy for restricted networks, e.g. "
                    "'http://127.0.0.1:7890'. Pass through to edge-tts --proxy."
                ),
            },
        },
    }

    resource_profile = ResourceProfile(
        cpu_cores=1, ram_mb=256, vram_mb=0, disk_mb=50, network_required=True
    )
    retry_policy = RetryPolicy(max_retries=2, retryable_errors=["timeout", "network"])
    idempotency_key_fields = ["text", "voice", "rate", "pitch"]
    side_effects = ["writes audio file to output_path"]
    user_visible_verification = ["Listen to generated audio for intelligibility"]

    def _edge_tts_cmd(self) -> list[str] | None:
        """Find edge-tts CLI: current interpreter first, then PATH."""
        import sys

        candidates: list[list[str]] = [[sys.executable, "-m", "edge_tts"]]
        python3 = shutil.which("python3")
        if python3 and python3 != sys.executable:
            candidates.append([python3, "-m", "edge_tts"])
        edge_bin = shutil.which("edge-tts")
        if edge_bin:
            candidates.append([edge_bin])
        for candidate in candidates:
            try:
                proc = subprocess.run(
                    candidate + ["--list-voices"],
                    capture_output=True,
                    timeout=20,
                )
                if proc.returncode == 0:
                    return candidate
            except (OSError, subprocess.TimeoutExpired):
                continue
        return None

    def get_status(self) -> ToolStatus:
        if self._edge_tts_cmd() is not None:
            return ToolStatus.AVAILABLE
        return ToolStatus.UNAVAILABLE

    def estimate_cost(self, inputs: dict[str, Any]) -> float:
        return 0.0

    def execute(self, inputs: dict[str, Any]) -> ToolResult:
        cmd = self._edge_tts_cmd()
        if cmd is None:
            return ToolResult(
                success=False,
                error="Edge TTS not available. " + self.install_instructions,
            )

        start = time.time()
        text = inputs["text"]
        voice = inputs.get("voice") or _default_voice(text)
        output_path = Path(inputs.get("output_path", f"edge_tts_{int(start)}.mp3"))
        output_path.parent.mkdir(parents=True, exist_ok=True)

        rate = inputs.get("rate")
        if rate is None and inputs.get("speed") is not None:
            percent = round((float(inputs["speed"]) - 1.0) * 100)
            rate = f"{percent:+d}%"

        args = cmd + [
            "--voice", voice,
            "--text", text,
            "--write-media", str(output_path),
        ]
        if rate:
            args += ["--rate", rate]
        if inputs.get("pitch"):
            args += ["--pitch", str(inputs["pitch"])]
        if inputs.get("proxy"):
            args += ["--proxy", str(inputs["proxy"])]

        try:
            proc = subprocess.run(args, capture_output=True, text=True, timeout=600)
        except subprocess.TimeoutExpired:
            return ToolResult(success=False, error="Edge TTS timed out after 600s.")
        except OSError as exc:
            return ToolResult(success=False, error=f"Edge TTS failed to launch: {exc}")

        if proc.returncode != 0:
            stderr_tail = proc.stderr.strip()[-500:]
            hint = ""
            if "403" in proc.stderr:
                hint = (
                    " (Hint: 403 means Microsoft rejected this network exit. "
                    "Try the 'proxy' input, or run from a different network. "
                    "Most home/office direct connections work fine.)"
                )
            return ToolResult(
                success=False,
                error=f"Edge TTS failed (exit {proc.returncode}): {stderr_tail}{hint}",
            )
        if not output_path.exists() or output_path.stat().st_size == 0:
            return ToolResult(success=False, error=f"Edge TTS output missing: {output_path}")

        return ToolResult(
            success=True,
            data={
                "provider": self.provider,
                "voice": voice,
                "rate": rate,
                "text_length": len(text),
                "output": str(output_path),
                "format": "mp3",
                "free": True,
            },
            artifacts=[str(output_path)],
            model=f"edge-tts:{voice}",
        )
