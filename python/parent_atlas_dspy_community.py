"""DSPy labeling layer for already-computed graph communities.

Community partitioning remains deterministic graph computation owned by Neo4j
GDS or the RAPIDS challenger. DSPy is used only after membership is frozen, to
label/summarize a community from exact evidence. It cannot alter membership,
invent graph edges, or directly promote canonical taxonomy assignments.

The module stays import-safe when DSPy is unavailable so contract tests do not
force the optimization/training environment into the RAPIDS environment.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

try:
    import dspy  # type: ignore
except ImportError:  # pragma: no cover
    dspy = None


@dataclass(frozen=True, slots=True)
class CommunityEvidenceV1:
    community_fingerprint: str
    algorithm_id: str
    graph_revision: str
    member_ids: tuple[str, ...]
    representative_source_refs: tuple[str, ...]
    representative_symbols: tuple[str, ...]
    evidence_refs: tuple[str, ...]

    @classmethod
    def build(
        cls,
        *,
        community_fingerprint: str,
        algorithm_id: str,
        graph_revision: str,
        member_ids: Iterable[str],
        representative_source_refs: Iterable[str],
        representative_symbols: Iterable[str],
        evidence_refs: Iterable[str],
    ) -> "CommunityEvidenceV1":
        members = tuple(sorted(set(member_ids)))
        refs = tuple(sorted(set(evidence_refs)))
        if not community_fingerprint or not algorithm_id or not graph_revision:
            raise ValueError("community fingerprint, algorithm id, and graph revision are required")
        if not members:
            raise ValueError("community evidence requires at least one member")
        if not refs:
            raise ValueError("community evidence requires evidence refs")
        return cls(
            community_fingerprint=community_fingerprint,
            algorithm_id=algorithm_id,
            graph_revision=graph_revision,
            member_ids=members,
            representative_source_refs=tuple(sorted(set(representative_source_refs))),
            representative_symbols=tuple(sorted(set(representative_symbols))),
            evidence_refs=refs,
        )


def require_dspy() -> Any:
    if dspy is None:
        raise RuntimeError("DSPy is not installed in this Python environment")
    return dspy


def build_community_label_program_v1() -> Any:
    """Build a DSPy program that labels a frozen partition without changing it."""
    dp = require_dspy()

    class LabelCommunity(dp.Signature):
        """Label a frozen code community using only supplied exact evidence."""

        community_fingerprint = dp.InputField(desc="Stable membership fingerprint")
        algorithm_id = dp.InputField(desc="Exact partition algorithm/backend identity")
        graph_revision = dp.InputField(desc="Frozen graph revision")
        member_ids = dp.InputField(desc="Frozen canonical member ids; do not add or remove members")
        representative_source_refs = dp.InputField(desc="Exact source refs sampled from the frozen membership")
        representative_symbols = dp.InputField(desc="Exact representative symbols")
        evidence_refs = dp.InputField(desc="Exact evidence refs that support the label")

        label = dp.OutputField(desc="Short subsystem/community label")
        summary = dp.OutputField(desc="Evidence-grounded 2-3 sentence description")
        tags = dp.OutputField(desc="Small list of evidence-grounded taxonomy tags")
        confidence = dp.OutputField(desc="0..1 confidence based only on supplied evidence")
        cited_evidence_refs = dp.OutputField(desc="Subset of supplied evidence refs used for the label")

    class CommunityLabelProgramV1(dp.Module):
        def __init__(self) -> None:
            super().__init__()
            self.labeler = dp.Predict(LabelCommunity)

        def forward(self, evidence: CommunityEvidenceV1) -> Any:
            return self.labeler(
                community_fingerprint=evidence.community_fingerprint,
                algorithm_id=evidence.algorithm_id,
                graph_revision=evidence.graph_revision,
                member_ids=list(evidence.member_ids),
                representative_source_refs=list(evidence.representative_source_refs),
                representative_symbols=list(evidence.representative_symbols),
                evidence_refs=list(evidence.evidence_refs),
            )

    return CommunityLabelProgramV1()


def validate_community_label_output_v1(
    evidence: CommunityEvidenceV1,
    *,
    confidence: float,
    cited_evidence_refs: Iterable[str],
) -> tuple[float, tuple[str, ...]]:
    """Fail closed if a label cites evidence outside the frozen community packet."""
    confidence = float(confidence)
    if confidence != confidence or confidence in (float("inf"), float("-inf")):
        raise ValueError("confidence must be finite")
    confidence = max(0.0, min(1.0, confidence))

    cited = tuple(sorted(set(cited_evidence_refs)))
    allowed = set(evidence.evidence_refs)
    unknown = [ref for ref in cited if ref not in allowed]
    if unknown:
        raise ValueError(f"community label cited unknown evidence refs: {unknown}")
    return confidence, cited
