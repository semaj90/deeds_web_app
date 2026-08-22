"""Fail-closed proof gates for the frozen domain rerank ablation."""

from __future__ import annotations

import re
from typing import Sequence

from .domain_rerank_ablation import (
    DomainRerankAblationReceipt,
    FrozenDomainAblationRow,
    run_domain_rerank_ablation,
    split_qids,
)

_SHA256 = re.compile(r"^[a-f0-9]{64}$")


def validate_ablation_proof_input(
    rows: Sequence[FrozenDomainAblationRow],
    *,
    seed: int,
    validation_fraction: float,
) -> tuple[set[str], set[str]]:
    for row in rows:
        if not _SHA256.fullmatch(row.comparison_checksum):
            raise ValueError(
                f"comparison_checksum must be sha256 for {row.qid}/{row.packet_key}"
            )

    train_qids, validation_qids = split_qids(
        rows,
        seed=seed,
        validation_fraction=validation_fraction,
    )
    train_eligible = sum(
        1 for row in rows if row.qid in train_qids and row.domain_match_eligible
    )
    validation_eligible = sum(
        1 for row in rows if row.qid in validation_qids and row.domain_match_eligible
    )
    if train_eligible == 0:
        raise ValueError("training qid partition has no lineage-qualified domain match rows")
    if validation_eligible == 0:
        raise ValueError("validation qid partition has no lineage-qualified domain match rows")
    return train_qids, validation_qids


def run_gated_domain_rerank_ablation(
    rows: Sequence[FrozenDomainAblationRow],
    *,
    eval_k: int = 10,
    seed: int = 42,
    validation_fraction: float = 0.2,
    device: str = "cpu",
) -> DomainRerankAblationReceipt:
    validate_ablation_proof_input(
        rows,
        seed=seed,
        validation_fraction=validation_fraction,
    )
    return run_domain_rerank_ablation(
        rows,
        eval_k=eval_k,
        seed=seed,
        validation_fraction=validation_fraction,
        device=device,
    )
