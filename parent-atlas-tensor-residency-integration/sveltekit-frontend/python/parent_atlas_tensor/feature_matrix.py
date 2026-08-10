from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
from typing import Iterable

import numpy as np

FEATURES = ("entropy_norm", "ast_signal", "domain_fit", "authority_norm", "execution_utility")


def load_jsonl(path: str | Path) -> tuple[list[str], np.ndarray, np.ndarray]:
    keys: list[str] = []
    features: list[list[float]] = []
    topology: list[list[float]] = []
    with Path(path).open("r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            row = json.loads(line)
            keys.append(str(row["packet_key"]))
            features.append([float(row[name]) for name in FEATURES])
            topology.append([
                float(row["som_x"]), float(row["som_y"]),
                float(row["authority_norm"]), float(row["entropy_utility_norm"])
            ])
    return keys, np.asarray(features, dtype=np.float32), np.asarray(topology, dtype=np.float32)
