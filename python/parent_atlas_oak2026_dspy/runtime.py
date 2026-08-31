"""DSPy runtime helpers for the Parent Atlas OaK 2026 integration.

DSPy is consumed through public APIs only. GEPA is an offline optimizer; this
module does not permit live program mutation.
"""

from __future__ import annotations

import inspect
import math
from typing import Any, Callable

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover - optional runtime capability
    dspy = None


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


def build_oak2026_gepa_feedback_metric_v1(
    *,
    observation_factory: Callable[[Any, Any, Any, Any, Any], Any],
    score_fn: Callable[[Any], tuple[float, str]],
) -> Callable[[Any, Any, Any, Any, Any], dict[str, float | str]]:
    """Adapt Parent Atlas receipt scoring to DSPy's current GEPA metric API.

    DSPy GEPA currently calls metrics as
    ``(gold, pred, trace, pred_name, pred_trace)``. Parent Atlas retains
    ownership of how those execution/eval objects become a typed observation;
    callers provide ``observation_factory`` rather than this helper guessing.
    """

    def metric(
        gold: Any,
        pred: Any,
        trace: Any,
        pred_name: Any,
        pred_trace: Any,
    ) -> dict[str, float | str]:
        observation = observation_factory(gold, pred, trace, pred_name, pred_trace)
        score, feedback = score_fn(observation)
        score = float(score)
        if not math.isfinite(score) or not 0.0 <= score <= 1.0:
            raise ValueError("OAK2026_GEPA_SCORE_OUT_OF_RANGE")
        feedback = str(feedback).strip()
        if not feedback:
            raise ValueError("OAK2026_GEPA_FEEDBACK_REQUIRED")
        return {"score": score, "feedback": feedback}

    return metric


def build_oak2026_gepa_optimizer_v1(
    metric: Any,
    *,
    reflection_lm: Any,
    auto: str = "light",
    log_dir: str | None = None,
    seed: int = 0,
) -> Any:
    """Construct GEPA for offline OaK program optimization.

    Parent Atlas requires an explicit reflection LM for normal GEPA operation.
    Keyword compatibility is filtered against the installed DSPy constructor so
    a minor upstream API change does not silently force a vendored DSPy fork.
    """
    if reflection_lm is None:
        raise ValueError("OAK2026_GEPA_REFLECTION_LM_REQUIRED")

    dp = require_dspy()
    requested: dict[str, Any] = {
        "metric": metric,
        "reflection_lm": reflection_lm,
        "auto": auto,
        "seed": seed,
        "track_stats": True,
        "track_best_outputs": True,
    }
    if log_dir is not None:
        requested["log_dir"] = log_dir

    parameters = inspect.signature(dp.GEPA).parameters
    supported = {key: value for key, value in requested.items() if key in parameters}
    required = {"metric", "reflection_lm", "auto"}
    missing = sorted(required.difference(supported))
    if missing:
        raise RuntimeError(
            "Installed DSPy GEPA constructor is missing required parameters: "
            + ",".join(missing)
        )
    return dp.GEPA(**supported)
