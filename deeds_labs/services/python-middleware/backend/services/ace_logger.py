from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any, Literal, Mapping

LogLevel = Literal["debug", "info", "warn", "error"]


def log_event(
    phase: str,
    scope: str,
    message: str,
    *,
    level: LogLevel = "info",
    session_id: str | None = None,
    tool: str | None = None,
    action: str | None = None,
    meta: Mapping[str, Any] | None = None,
    jsonl_path: str = "logs/ace-events.jsonl",
) -> None:
    """
    Write an ACE event to console (Vite-style) and append JSONL for downstream agents.
    This is intentionally dependency-light so it can run inside agents or services.
    """

    ts = datetime.now(timezone.utc)
    obj = {
        "ts": ts.isoformat(),
        "phase": phase,
        "scope": scope,
        "level": level,
        "session_id": session_id,
        "tool": tool,
        "action": action,
        "message": message,
        "meta": meta or {},
    }

    # Console line (Vite-style timestamp)
    local_ts = ts.astimezone().strftime("%I:%M:%S %p").lstrip("0")
    prefix = f"[Phase{phase}] {local_ts} [{scope}]"
    console_line = f"{prefix} {message}"
    if tool:
        console_line += f" (tool={tool})"
    if action:
        console_line += f" (action={action})"
    print(console_line, file=sys.stdout)

    # Append JSONL for RAG/context ingestion
    try:
        with open(jsonl_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(obj, ensure_ascii=False) + "\n")
    except Exception as exc:  # pragma: no cover - logging failures should not crash callers
        print(f"[ACE-LOGGER] failed to write log file: {exc}", file=sys.stderr)
