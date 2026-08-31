"""DSPy runtime helpers for the Parent Atlas OaK 2026 integration.

DSPy is consumed through public APIs only. GEPA is an offline optimizer; this
module does not permit live program mutation.
"""

from __future__ import annotations

import inspect
from typing import Any

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover - optional runtime capability
    dspy = None


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


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
