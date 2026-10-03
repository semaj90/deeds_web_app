"""Optional DSPy GEPA shadow adapter for Parent Atlas.

Contract boundary:
- DSPy/GEPA is a shadow optimizer, never canonical authority.
- Tool names are stable identifiers.
- Local/OpenAI-compatible endpoints are configured through dspy.LM.
- No Postgres/Qdrant/Valkey writes occur in this module.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Mapping


@dataclass(frozen=True)
class GepaShadowConfig:
    model: str
    api_base: str
    api_key: str = ""
    model_type: str = "chat"
    auto: str = "medium"
    candidate_selection_strategy: str = "pareto"
    enable_tool_optimization: bool = True
    track_stats: bool = True
    num_threads: int = 1
    log_dir: str | None = None

    def validate(self) -> None:
        if not self.model.strip():
            raise ValueError("model is required")
        if not self.api_base.strip():
            raise ValueError("api_base is required")
        if self.model_type not in {"chat", "text", "responses"}:
            raise ValueError("unsupported model_type")
        if self.auto not in {"light", "medium", "heavy"}:
            raise ValueError("unsupported GEPA auto budget")
        if self.candidate_selection_strategy not in {"pareto", "current_best"}:
            raise ValueError("unsupported GEPA candidate selection strategy")
        if self.num_threads < 1:
            raise ValueError("num_threads must be >= 1")


def validate_stable_tool_names(tool_descriptions: Mapping[str, str]) -> None:
    """Fail closed on unstable/ambiguous GEPA tool identities."""
    if not tool_descriptions:
        raise ValueError("at least one tool is required for tool optimization")

    normalized: set[str] = set()
    for name, description in tool_descriptions.items():
        stable = name.strip()
        if not stable:
            raise ValueError("tool name must be non-empty")
        if stable == "finish":
            raise ValueError("'finish' is reserved by dspy.ReAct")
        if stable in normalized:
            raise ValueError(f"duplicate tool name: {stable}")
        if not description.strip():
            raise ValueError(f"tool description must be non-empty: {stable}")
        normalized.add(stable)


def require_dspy() -> Any:
    try:
        import dspy  # type: ignore
    except ImportError as exc:
        raise RuntimeError(
            "DSPy is not installed in this Python environment. "
            "Install it in an isolated optimizer environment before enabling GEPA shadow runs."
        ) from exc
    return dspy


def build_local_lm(config: GepaShadowConfig) -> Any:
    """Build a DSPy LM against an OpenAI-compatible endpoint."""
    config.validate()
    dspy = require_dspy()
    model = config.model if "/" in config.model else f"openai/{config.model}"
    return dspy.LM(
        model,
        api_base=config.api_base,
        api_key=config.api_key,
        model_type=config.model_type,
    )


def build_gepa_optimizer(
    *,
    metric: Callable[..., Any],
    config: GepaShadowConfig,
    reflection_lm: Any | None = None,
) -> Any:
    """Instantiate GEPA using the current documented API surface.

    The returned optimizer remains shadow-only. The caller must emit a
    tournament/evaluation receipt before any policy can become eligible.
    """
    config.validate()
    dspy = require_dspy()
    return dspy.GEPA(
        metric=metric,
        reflection_lm=reflection_lm,
        auto=config.auto,
        candidate_selection_strategy=config.candidate_selection_strategy,
        enable_tool_optimization=config.enable_tool_optimization,
        track_stats=config.track_stats,
        num_threads=config.num_threads,
        log_dir=config.log_dir,
    )
