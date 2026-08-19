"""Derived feature propagation across canonical N-ary incidence projections.

The support matrix is the exact 0/1 entity↔relationship incidence projection.
Optional logits only weight already-existing memberships. Propagation therefore
interpolates feature values without inventing entity/relationship membership.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
import hashlib
from typing import Any, Literal, Sequence

import numpy as np

from .sparse_relations import build_binary_incidence, sparse_relation_softmax


@dataclass(frozen=True)
class NaryFeaturePropagationReceipt:
    schema: str
    direction: str
    entity_count: int
    relationship_count: int
    feature_dimensions: int
    incidence_nnz: int
    weighting: str
    support_checksum: str
    output_checksum: str
    unsupported_membership_created: bool
    canonical_authority: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _checksum(value: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def propagate_nary_features(
    entity_ids: Sequence[str],
    relationship_ids: Sequence[str],
    memberships: Sequence[tuple[str, str]],
    source_features: Sequence[Sequence[float]] | np.ndarray,
    *,
    direction: Literal["relationship_to_entity", "entity_to_relationship"],
    membership_logits: Sequence[Sequence[float]] | np.ndarray | None = None,
    temperature: float = 1.0,
    device: str | None = None,
):
    """Propagate row features across exact N-ary incidence support.

    For relationship→entity, source_features is [R,D] and each entity receives
    a softmax-normalized combination of incident relationship rows. For
    entity→relationship, source_features is [E,D] and the transposed incidence
    performs the analogous aggregation.
    """

    import torch

    incidence, incidence_receipt = build_binary_incidence(
        entity_ids,
        relationship_ids,
        memberships,
        device=device,
    )
    resolved_device = incidence.device
    source = torch.as_tensor(np.asarray(source_features, dtype=np.float32), dtype=torch.float32, device=resolved_device)
    if source.ndim != 2:
        raise ValueError("source_features must be rank-2")

    if direction == "relationship_to_entity":
        support = incidence.coalesce()
        expected_rows = len(relationship_ids)
    else:
        support = incidence.transpose(0, 1).coalesce()
        expected_rows = len(entity_ids)
    if int(source.shape[0]) != expected_rows:
        raise ValueError(f"source_features rows must equal {expected_rows} for direction {direction}")

    if membership_logits is None:
        weighted_support, softmax_receipt = sparse_relation_softmax(support, dim=1, temperature=temperature)
        weighting = "uniform_softmax_over_binary_incidence"
    else:
        logits = np.asarray(membership_logits, dtype=np.float32)
        dense_support = support.to_dense().detach().cpu().numpy() != 0
        if logits.shape != dense_support.shape:
            raise ValueError("membership_logits must match propagation support shape")
        if not np.isfinite(logits).all():
            raise ValueError("membership_logits contain non-finite values")
        indices = support.indices()
        values = torch.as_tensor(logits[dense_support], dtype=torch.float32, device=resolved_device)
        sparse_logits = torch.sparse_coo_tensor(indices, values, support.shape, device=resolved_device).coalesce()
        weighted_support, softmax_receipt = sparse_relation_softmax(sparse_logits, dim=1, temperature=temperature)
        weighting = "logit_softmax_over_binary_incidence"

    output = torch.sparse.mm(weighted_support, source)
    host = output.detach().cpu().numpy().astype(np.float32, copy=False)
    receipt = NaryFeaturePropagationReceipt(
        schema="atlas.nary-feature-propagation-receipt.v1",
        direction=direction,
        entity_count=len(entity_ids),
        relationship_count=len(relationship_ids),
        feature_dimensions=int(source.shape[1]),
        incidence_nnz=incidence_receipt.nnz,
        weighting=weighting,
        support_checksum=incidence_receipt.binary_mask_checksum,
        output_checksum=_checksum(host),
        unsupported_membership_created=softmax_receipt.unspecified_probability != 0.0,
        canonical_authority=False,
    )
    return output, receipt
