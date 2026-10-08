"""Candidate feature layout V2: explicit missing-mask tensor and revision metadata.

The numeric row is 8 float32 values; mask is 8 uint8 values. GPU sidecars
may concatenate masks into a 16-column float32 scoring tensor ONLY after
the canonical per-field layout has been verified. ANN vectors are separate.
"""
from __future__ import annotations
from dataclasses import dataclass
from typing import Sequence
from .ranking_alignment_v1 import AlignedCandidate, FEATURES

SCHEMA = "atlas.ranking-feature-layout.v2"
VECTOR_DIM = 768

@dataclass(frozen=True)
class FeatureLayoutV2:
    feature_names: tuple[str, ...]
    numeric_dtype: str
    missing_dtype: str
    scoring_width: int
    semantic_dim: int
    mask_semantics: str

LAYOUT = FeatureLayoutV2(
    FEATURES, "float32", "uint8", 2 * len(FEATURES),
    VECTOR_DIM, "1=missing;0=present",
)

def encode_cpu(rows: Sequence[AlignedCandidate]):
    import numpy as np
    values = np.ascontiguousarray([r.values for r in rows], dtype="<f4").reshape((-1, len(FEATURES)))
    mask = np.ascontiguousarray([r.missing for r in rows], dtype=np.uint8).reshape((-1, len(FEATURES)))
    scoring = np.concatenate((values, mask.astype(np.float32)), axis=1).astype(np.float32, copy=False)
    if not np.isfinite(values).all() or not np.isfinite(scoring).all():
        raise ValueError("RANK_MATRIX_NONFINITE")
    if not values.flags.c_contiguous or not scoring.flags.c_contiguous:
        raise ValueError("RANK_MATRIX_NOT_CONTIGUOUS")
    return values, mask, scoring

def validate_semantic_vectors(vectors, *, expected_rows: int):
    import numpy as np
    arr = np.asarray(vectors, dtype=np.float32)
    if arr.shape != (expected_rows, VECTOR_DIM):
        raise ValueError("RANK_SEMANTIC_768_REQUIRED")
    if not np.isfinite(arr).all():
        raise ValueError("RANK_SEMANTIC_NONFINITE")
    return np.ascontiguousarray(arr)
