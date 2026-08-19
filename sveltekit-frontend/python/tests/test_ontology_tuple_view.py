from parent_atlas_policy.ontology_tuple_view import (
    build_networkx_view,
    tuple_from_mapping,
)


def test_tuple_normalization_preserves_host_identity_and_evidence():
    item = tuple_from_mapping(
        {
            "tuple_id": "tuple:1",
            "subject_id": "packet:a",
            "predicate": "CALLS",
            "object_id": "packet:b",
            "workspace_revision": "742",
            "source_revision": "src-r19",
            "evidence_refs": ["evidence:call:1"],
            "hyperedge_id": "hyperedge:call:1",
            "subject_role": "caller",
            "object_role": "callee",
        }
    )

    assert item.tuple_id == "tuple:1"
    assert item.predicate == "CALLS"
    assert item.evidence_refs == ("evidence:call:1",)
    assert item.hyperedge_id == "hyperedge:call:1"


def test_networkx_view_is_projection_not_identity_owner():
    graph = build_networkx_view(
        [
            tuple_from_mapping(
                {
                    "tuple_id": "tuple:1",
                    "subject_id": "packet:a",
                    "predicate": "IMPORTS",
                    "object_id": "packet:b",
                    "workspace_revision": "742",
                    "source_revision": "src-r19",
                    "evidence_refs": ["evidence:import:1"],
                }
            )
        ]
    )

    assert graph.has_edge("packet:a", "packet:b", key="tuple:1")
    edge = graph["packet:a"]["packet:b"]["tuple:1"]
    assert edge["relation_type"] == "IMPORTS"
    assert edge["workspace_revision"] == "742"
