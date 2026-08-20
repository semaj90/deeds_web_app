"""Probe the Parent Atlas observation runtime without mutating project state.

The probe verifies imports and optionally verifies that the configured Stanza
English models can be loaded. It intentionally does not install or download
anything; installation remains an explicit operator step.
"""

from __future__ import annotations

import argparse
import importlib
import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any


@dataclass
class ProbeResult:
    package: str
    imported: bool
    version: str | None
    detail: str | None = None


def package_version(module: Any) -> str | None:
    return getattr(module, "__version__", None)


def probe_import(name: str) -> ProbeResult:
    try:
        module = importlib.import_module(name)
    except Exception as exc:  # pragma: no cover - runtime/environment dependent
        return ProbeResult(name, False, None, f"{type(exc).__name__}: {exc}")
    return ProbeResult(name, True, package_version(module))


def probe_stanza_models() -> dict[str, Any]:
    try:
        stanza = importlib.import_module("stanza")
        pipeline = stanza.Pipeline(
            "en",
            processors="tokenize,pos,lemma,depparse",
            use_gpu=False,
            verbose=False,
        )
        doc = pipeline("Atlas validates grounded observations.")
        word_count = sum(len(sentence.words) for sentence in doc.sentences)
        return {"ready": word_count > 0, "word_count": word_count, "error": None}
    except Exception as exc:  # pragma: no cover - runtime/environment dependent
        return {"ready": False, "word_count": 0, "error": f"{type(exc).__name__}: {exc}"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-stanza-models", action="store_true")
    parser.add_argument("--json-out", type=Path)
    args = parser.parse_args()

    packages = [probe_import("langextract"), probe_import("stanza")]
    payload: dict[str, Any] = {
        "schema": "atlas.observation-runtime-probe.v1",
        "python": sys.version.split()[0],
        "packages": [asdict(item) for item in packages],
        "stanza_models": probe_stanza_models() if args.check_stanza_models else None,
        "ready": all(item.imported for item in packages),
    }
    if args.check_stanza_models:
        payload["ready"] = bool(payload["ready"] and payload["stanza_models"]["ready"])

    encoded = json.dumps(payload, indent=2, sort_keys=True)
    print(encoded)
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(encoded + "\n", encoding="utf-8")
    return 0 if payload["ready"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
