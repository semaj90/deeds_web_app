from __future__ import annotations

import json
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
import pytest

from atlas_pagerank_vector_artifact import (
    normalize_full_pagerank_rows,
    projection_ordinal_map_checksum,
    write_pagerank_vector_artifact,
)


def _scores() -> pd.DataFrame:
    # Intentionally unsorted: writer must normalize by projectionOrdinal.
    return pd.DataFrame({"vertex": [2, 0, 1], "pagerank": [0.2, 0.5, 0.3]})


def _identity():
    return {
        0: {"nodeKey": "node:a", "packetKey": "packet:a"},
        1: {"nodeKey": "node:b", "packetKey": "packet:b"},
        2: {"nodeKey": "node:c", "packetKey": "packet:c"},
    }


def test_projection_ordinal_rows_are_dense_deterministic_and_packet_free() -> None:
    rows = normalize_full_pagerank_rows(_scores(), _identity(), 3)
    assert rows == [
        {"projectionOrdinal": 0, "nodeKey": "node:a", "score": 0.5},
        {"projectionOrdinal": 1, "nodeKey": "node:b", "score": 0.3},
        {"projectionOrdinal": 2, "nodeKey": "node:c", "score": 0.2},
    ]
    assert all("packetKey" not in row for row in rows)
    assert projection_ordinal_map_checksum(rows) == projection_ordinal_map_checksum(list(reversed(rows)))


def test_rejects_sparse_projection_ordinals() -> None:
    sparse = pd.DataFrame({"vertex": [0, 2], "pagerank": [0.6, 0.4]})
    identity = {0: {"nodeKey": "a"}, 2: {"nodeKey": "c"}}
    with pytest.raises(ValueError, match="ROW_COUNT_MISMATCH|NOT_DENSE"):
        normalize_full_pagerank_rows(sparse, identity, 3)


def test_writes_arrow_file_and_memory_map_readback(tmp_path: Path) -> None:
    receipt = write_pagerank_vector_artifact(
        scores_df=_scores(),
        gpu_id_to_identity=_identity(),
        artifact_root=tmp_path,
        graph_revision="graph:fixture-v1",
        projection_revision="projection:fixture-v1",
        node_table_hash="sha256:nodes",
        edge_table_hash="sha256:edges",
        algorithm_revision="atlas.cugraph-pagerank.v1",
        alpha=0.85,
        tol=1e-6,
        max_iter=100,
        did_converge=True,
        vertex_count=3,
        kernel_ms=1.25,
    )

    assert receipt["selectionMode"] == "FULL_VECTOR"
    assert receipt["rowCount"] == receipt["vertexCount"] == 3
    assert receipt["canonicalAuthority"] is False
    assert receipt["writesPerformed"] is False
    assert receipt["graphOrdinalMapChecksum"] is None
    assert receipt["projectionToGraphOrdinalBridgeChecksum"] is None
    assert receipt["projectionOrdinalMapChecksum"].startswith("sha256:")
    assert receipt["artifactChecksum"].startswith("sha256:")
    assert receipt["receiptChecksum"].startswith("sha256:")

    artifact = tmp_path / receipt["artifactPath"]
    assert artifact.is_file()
    with pa.memory_map(str(artifact), "r") as source:
        table = ipc.open_file(source).read_all()
    assert table.column_names == ["projectionOrdinal", "nodeKey", "score"]
    assert table.column("projectionOrdinal").to_pylist() == [0, 1, 2]
    assert table.column("nodeKey").to_pylist() == ["node:a", "node:b", "node:c"]
    assert table.column("score").to_pylist() == [0.5, 0.3, 0.2]
    metadata = {key.decode(): value.decode() for key, value in table.schema.metadata.items()}
    assert metadata["selectionMode"] == "FULL_VECTOR"
    assert metadata["projectionOrdinalMapChecksum"] == receipt["projectionOrdinalMapChecksum"]

    # Useful invariant for receipt serialization: it stays plain JSON.
    json.dumps(receipt)
