from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from parent_atlas_policy.semantic_arrow_snapshot import (
    SEMANTIC_DIM,
    open_semantic_arrow_snapshot_mmap,
    write_semantic_arrow_snapshot,
)

pytestmark = pytest.mark.skipif(importlib.util.find_spec("pyarrow") is None, reason="pyarrow not installed")


def row(ordinal: int) -> dict:
    return {
        "ordinal": ordinal,
        "packet_key": f"sha256:{ordinal:064x}",
        "source_ref": f"src/file{ordinal}.ts",
        "canonical_id": f"C{ordinal}",
        "workspace_revision": "742",
        "source_revision": "19",
        "representation_revision": "semantic-768-r7",
        "semantic_768": [float(ordinal)] * SEMANTIC_DIM,
    }


def test_writes_revision_frozen_mmap_readable_snapshot(tmp_path: Path):
    path = tmp_path / "semantic.arrow"
    receipt = write_semantic_arrow_snapshot(
        [row(2), row(1)],
        output_path=path,
        snapshot_id="semantic-fixture",
        producer_revision="test-r1",
    )

    assert receipt.row_count == 2
    assert receipt.semantic_dimension == 768
    assert receipt.workspace_revision == "742"
    assert receipt.file_checksum.startswith("sha256:")
    assert receipt.canonical_order_checksum.startswith("sha256:")

    source, reader = open_semantic_arrow_snapshot_mmap(path)
    try:
        table = reader.read_all()
        assert table.column("ordinal").to_pylist() == [1, 2]
        assert table.schema.metadata[b"atlas.snapshot_id"] == b"semantic-fixture"
    finally:
        source.close()


def test_rejects_mixed_revision_snapshot(tmp_path: Path):
    other = row(2)
    other["source_revision"] = "20"
    with pytest.raises(ValueError, match="one revision tuple"):
        write_semantic_arrow_snapshot(
            [row(1), other],
            output_path=tmp_path / "bad.arrow",
            snapshot_id="bad",
            producer_revision="test-r1",
        )


def test_rejects_wrong_vector_dimension(tmp_path: Path):
    bad = row(1)
    bad["semantic_768"] = [0.0] * 767
    with pytest.raises(ValueError, match="768"):
        write_semantic_arrow_snapshot(
            [bad],
            output_path=tmp_path / "bad.arrow",
            snapshot_id="bad",
            producer_revision="test-r1",
        )
