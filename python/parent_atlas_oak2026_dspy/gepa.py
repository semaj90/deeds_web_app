from __future__ import annotations

from typing import Any

from .program import require_dspy


def build_oak2026_gepa_optimizer_v1(
    metric: Any,
    *,
    reflection_lm: Any,
    log_dir: str,
    seed: int = 0,
    auto: str = "light",
) -> Any:
    """Build GEPA for offline OaK-program optimization only.

    Parent Atlas owns the train/validation/test split and promotion gate. This
    helper only constructs DSPy's optimizer. Callers must never compile against
    the held-out test split or auto-promote the result into production.
    """
    if not log_dir:
        raise ValueError("OAK_2026_GEPA_LOG_DIR_REQUIRED")
    dp = require_dspy()
    return dp.GEPA(
        metric=metric,
        reflection_lm=reflection_lm,
        auto=auto,
        log_dir=log_dir,
        track_stats=True,
        track_best_outputs=True,
        seed=seed,
    )
