from __future__ import annotations

import hashlib
import json
from collections import Counter
from io import BytesIO
from pathlib import Path
from typing import Literal

from pydantic import Field

from .structural_observation_v1 import StrictModel


class QloraTrainingSampleV1(StrictModel):
    query_group_id: str = Field(min_length=1)
    query: str = Field(min_length=1)
    candidate_packet_key: str = Field(min_length=8)
    source_ref: str = Field(min_length=1)
    source_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    workspace_revision: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    evidence_ref: str = Field(min_length=1)
    grade: int = Field(ge=0, le=3)
    reviewer_kind: Literal["HUMAN"]
    reviewer_id: str = Field(min_length=1)


class FrozenCorpusValidationReceiptV1(StrictModel):
    schema_id: Literal["atlas.frozen-qlora-corpus-receipt.v1"] = Field(
        default="atlas.frozen-qlora-corpus-receipt.v1", alias="schema", serialization_alias="schema"
    )
    corpus_sha256: str = Field(pattern=r"^sha256:[a-f0-9]{64}$")
    sample_count: int = Field(ge=0)
    per_grade_counts: dict[int, int]
    minimum_total_required: int = 200
    minimum_per_grade_required: int = 30
    ready_for_shadow_training: bool
    status: Literal["READY_FOR_SHADOW_TRAINING", "BLOCKED_LABEL_FLOOR"]


def _canonicalize_samples(samples: list[dict]) -> tuple[list[dict], list[str], str, Counter, bool]:
    validated = [QloraTrainingSampleV1.model_validate(sample) for sample in samples]
    serialized = [sample.model_dump(mode="json") for sample in validated]
    serialized.sort(key=lambda sample: (sample["query_group_id"], sample["candidate_packet_key"], sample["grade"], sample["reviewer_id"]))
    canonical_lines = [json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) for row in serialized]
    corpus_digest = hashlib.sha256(("\n".join(canonical_lines) + ("\n" if canonical_lines else "")).encode("utf-8")).hexdigest()
    counts = Counter(row["grade"] for row in serialized)
    ready = len(serialized) >= 200 and all(counts[grade] >= 30 for grade in range(4))
    return serialized, canonical_lines, corpus_digest, counts, ready


def _encode_canonical_rows_arrow(serialized: list[dict], corpus_digest: str) -> bytes:
    try:
        import pyarrow as pa
    except ImportError as error:
        raise RuntimeError("PYARROW_REQUIRED_FOR_ARROW_EXPORT; install atlas-corpus-lib[arrow]") from error

    fields = [
        pa.field("query_group_id", pa.string(), nullable=False),
        pa.field("query", pa.string(), nullable=False),
        pa.field("candidate_packet_key", pa.string(), nullable=False),
        pa.field("source_ref", pa.string(), nullable=False),
        pa.field("source_revision", pa.string(), nullable=False),
        pa.field("workspace_revision", pa.string(), nullable=False),
        pa.field("evidence_ref", pa.string(), nullable=False),
        pa.field("grade", pa.int8(), nullable=False),
        pa.field("reviewer_kind", pa.string(), nullable=False),
        pa.field("reviewer_id", pa.string(), nullable=False),
    ]
    schema = pa.schema(fields, metadata={
        b"atlas.schema": b"atlas.qlora-training-samples.v1",
        b"atlas.corpus_sha256": f"sha256:{corpus_digest}".encode("ascii"),
    })
    arrays = [pa.array([row[field.name] for row in serialized], type=field.type) for field in fields]
    table = pa.Table.from_arrays(arrays, schema=schema)
    sink = pa.BufferOutputStream()
    options = pa.ipc.IpcWriteOptions(compression=None, use_threads=False)
    with pa.ipc.new_file(sink, schema, options=options) as writer:
        writer.write_table(table, max_chunksize=max(1, len(serialized)))
    return sink.getvalue().to_pybytes()


def encode_qlora_corpus_arrow(samples: list[dict]) -> bytes:
    serialized, _, corpus_digest, _, ready = _canonicalize_samples(samples)
    if not ready:
        raise ValueError("QLORA_ARROW_EXPORT_REFUSED_LABEL_FLOOR")
    return _encode_canonical_rows_arrow(serialized, corpus_digest)


def validate_and_export_qlora_corpus(
    samples: list[dict],
    output_path: str | Path | None = None,
    arrow_output_path: str | Path | None = None,
) -> FrozenCorpusValidationReceiptV1:
    serialized, canonical_lines, corpus_digest, counts, ready = _canonicalize_samples(samples)
    receipt = FrozenCorpusValidationReceiptV1(
        corpus_sha256=f"sha256:{corpus_digest}",
        sample_count=len(serialized),
        per_grade_counts={grade: counts[grade] for grade in range(4)},
        ready_for_shadow_training=ready,
        status="READY_FOR_SHADOW_TRAINING" if ready else "BLOCKED_LABEL_FLOOR",
    )
    if output_path is not None or arrow_output_path is not None:
        if not ready:
            raise ValueError("QLORA_EXPORT_REFUSED_LABEL_FLOOR")
    if output_path is not None:
        target = Path(output_path)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(canonical_lines) + "\n", encoding="utf-8", newline="\n")
    if arrow_output_path is not None:
        arrow_target = Path(arrow_output_path)
        arrow_target.parent.mkdir(parents=True, exist_ok=True)
        arrow_target.write_bytes(_encode_canonical_rows_arrow(serialized, corpus_digest))
    return receipt
