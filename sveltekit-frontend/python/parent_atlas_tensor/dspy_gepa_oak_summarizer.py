# python/parent_atlas_tensor/dspy_gepa_oak_summarizer.py
from typing import Tuple, NamedTuple

class SummarizationTupleHyperparams(NamedTuple):
    """
    Immutable Tuple Hyperparameters for LLM Summarization + Claude/Codex ACE JSON + DSPy GEPA + OaK
    """
    model_dim: int = 4096
    max_ace_tokens: int = 8192
    compression_ratio_target: float = 0.15
    pagerank_damping: float = 0.85
    svd_explained_variance_min: float = 0.92
    gepa_population_size: int = 12
    gepa_pareto_objectives: Tuple[str, ...] = (
        "faithfulness_to_qualified_source",
        "latency_ms_inverse",
        "verification_receipt_pass_rate",
    )
    oak_option_horizon: int = 4          # Max sub-actions per OaK option policy
    oak_knowledge_gvfs: int = 8          # General Value Functions predicting compiler/test pass

def evaluate_gepa_oak_candidate(
    handoff_envelope: dict,
    summary_packet: dict,
    svd_retained_variance: float,
    hyp: SummarizationTupleHyperparams = SummarizationTupleHyperparams(),
) -> Tuple[float, float, float]:
    """
    Pareto Fitness Evaluator for DSPy GEPA:
    Rejects any LLM output or OaK option that is not tied to an independent verification receipt.
    """
    receipts = handoff_envelope.get("verificationReceiptIds") or []
    has_verified_receipt = len(receipts) > 0 and bool(handoff_envelope.get("actionExecutionId"))

    if not has_verified_receipt:
        # Hard gate: unverified actions cannot enter the GEPA Pareto frontier
        return (0.0, 0.0, 0.0)

    faithfulness = min(1.0, svd_retained_variance / hyp.svd_explained_variance_min)
    compression_score = 1.0 - abs(summary_packet.get("compression_ratio", 0.5) - hyp.compression_ratio_target)
    receipt_score = 1.0

    return (round(faithfulness, 4), round(compression_score, 4), receipt_score)
