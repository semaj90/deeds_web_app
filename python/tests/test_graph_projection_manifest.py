import pytest

from atlas_graph_runtime.graph_projection_manifest import (
    graph_ordinal_checksum_from_manifest_v1,
    graph_ordinal_map_checksum_v1,
    validate_graph_projection_ordinal_checksum_v1,
)


ROWS = [
    {"graphOrdinal": 0, "graphNodeKey": "packet:a"},
    {"graphOrdinal": 1, "graphNodeKey": "packet:b"},
]


def test_graph_ordinal_checksum_matches_typescript_graph_ordinal_map_golden():
    # Golden emitted by JSON.stringify({graphRevision,workspaceRevision,rows})
    # in graph-ordinal-map-v1.ts for this fixture.
    assert graph_ordinal_map_checksum_v1("graph:r1", "workspace:w1", ROWS) == (
        "a7aa01cfb3fcb7bef4230428af11377e318fd407c2ba88e81b5c4f08bd5369e4"
    )


def test_projection_manifest_requires_explicit_graph_ordinal_checksum():
    manifest = {
        "schema": "atlas.graph-projection-artifact.v1",
        "graphRevision": "graph:r1",
        "workspaceRevision": "workspace:w1",
        "candidateOrdinalMapChecksum": "0" * 64,
        "graphOrdinalMapChecksum": graph_ordinal_map_checksum_v1("graph:r1", "workspace:w1", ROWS),
    }
    assert validate_graph_projection_ordinal_checksum_v1(manifest, ROWS) == manifest["graphOrdinalMapChecksum"]
    with pytest.raises(ValueError, match="GRAPH_ORDINAL_MAP_CHECKSUM_REQUIRED"):
        validate_graph_projection_ordinal_checksum_v1(
            {key: value for key, value in manifest.items() if key != "graphOrdinalMapChecksum"},
            ROWS,
        )


@pytest.mark.parametrize(
    "rows, error",
    [
        ([{"graphOrdinal": 1, "graphNodeKey": "packet:a"}], "GRAPH_ORDINAL_SEQUENCE_INVALID"),
        ([{"graphOrdinal": 0, "graphNodeKey": "packet:a"}, {"graphOrdinal": 1, "graphNodeKey": "packet:a"}], "GRAPH_ORDINAL_DUPLICATE_NODE_KEY"),
    ],
)
def test_graph_ordinal_checksum_rejects_non_dense_or_duplicate_rows(rows, error):
    with pytest.raises(ValueError, match=error):
        graph_ordinal_map_checksum_v1("graph:r1", "workspace:w1", rows)


def test_projection_manifest_detects_mapping_tamper():
    manifest = {
        "graphRevision": "graph:r1",
        "workspaceRevision": "workspace:w1",
        "graphOrdinalMapChecksum": graph_ordinal_map_checksum_v1("graph:r1", "workspace:w1", ROWS),
    }
    tampered = [ROWS[0], {"graphOrdinal": 1, "graphNodeKey": "packet:changed"}]
    with pytest.raises(ValueError, match="GRAPH_ORDINAL_MAP_CHECKSUM_MISMATCH"):
        validate_graph_projection_ordinal_checksum_v1(manifest, tampered)


def test_v1_artifact_requires_explicit_checksum_and_rejects_ambiguous_legacy_field():
    with pytest.raises(ValueError, match="GRAPH_ORDINAL_MAP_CHECKSUM_REQUIRED"):
        graph_ordinal_checksum_from_manifest_v1({"schema": "atlas.graph-projection-artifact.v1"})
    with pytest.raises(ValueError, match="GRAPH_ORDINAL_MAP_CHECKSUM_AMBIGUOUS"):
        graph_ordinal_checksum_from_manifest_v1({
            "schema": "atlas.current-structural-graph-artifact-v1",
            "ordinalMapChecksum": "0" * 64,
        })
    assert graph_ordinal_checksum_from_manifest_v1({
        "schema": "atlas.graph-projection-artifact.v1",
        "graphOrdinalMapChecksum": "a" * 64,
        "candidateOrdinalMapChecksum": "b" * 64,
    }) == "a" * 64
