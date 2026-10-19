import pytest
import torch
from atlas_spatial_mcts_pipeline_v1 import (
    AtlasSpatialMctsPipeline,
    PipelineState,
    AstEdgeSchema,
)


@pytest.fixture
def mock_pipeline_data():
    dim = 32
    num_nodes = 5

    nodes = [
        {
            "symbol_id": f"sym_{i}",
            "workspace_id": "ws_alpha",
            "source_revision": "rev_20261018",
            "start_byte": i * 100,
            "end_byte": (i + 1) * 100,
            "qualification": "STRUCTURAL_PROVEN",
            "fan_out_cap": 16,
        }
        for i in range(num_nodes)
    ]

    # 3 qualified edges, 1 unqualified edge (PROPOSED), 1 edge with empty revision
    raw_edges = [
        {
            "source_symbol_id": "sym_0",
            "target_symbol_id": "sym_1",
            "edge_key": "edge_0_1",
            "source_revision": "rev_20261018",
            "qualification": "STRUCTURAL_PROVEN",
            "weight": 1.0,
        },
        {
            "source_symbol_id": "sym_1",
            "target_symbol_id": "sym_2",
            "edge_key": "edge_1_2",
            "source_revision": "rev_20261018",
            "qualification": "HUMAN_REVIEWED",
            "weight": 1.0,
        },
        {
            "source_symbol_id": "sym_0",
            "target_symbol_id": "sym_3",
            "edge_key": "edge_0_3",
            "source_revision": "rev_20261018",
            "qualification": "STRUCTURAL_PROVEN",
            "weight": 0.8,
        },
        {
            "source_symbol_id": "sym_2",
            "target_symbol_id": "sym_4",
            "edge_key": "edge_2_4",
            "source_revision": "rev_20261018",
            "qualification": "PROPOSED",  # UNQUALIFIED -> must be filtered out
            "weight": 1.0,
        },
        {
            "source_symbol_id": "sym_3",
            "target_symbol_id": "sym_4",
            "edge_key": "edge_3_4",
            "source_revision": "   ",  # EMPTY REVISION -> must be filtered out
            "qualification": "STRUCTURAL_PROVEN",
            "weight": 1.0,
        },
    ]

    torch.manual_seed(42)
    node_embeddings = torch.randn(num_nodes, dim)
    query_embedding = torch.randn(dim)

    state: PipelineState = {
        "nodes": nodes,
        "raw_edges": raw_edges,
        "node_embeddings": node_embeddings,
        "query_embedding": query_embedding,
    }
    return state


def test_pipeline_execution_end_to_end(mock_pipeline_data):
    pipeline = AtlasSpatialMctsPipeline(
        dim=32,
        j_bits=16,
        max_fanout=8,
        fanout_penalty=0.5,
        num_mcts_sims=16,
        c_puct=1.414,
        device="cpu",
    )

    final_state = pipeline.run(mock_pipeline_data)

    # 1. State history follows strict FSM progression
    expected_history = [
        "PARSE_AST",
        "RESOLVE_SYMBOL",
        "CHECK_DB_SCHEMA",
        "FANOUT_PAGERANK",
        "MCTS_SIMULATE",
    ]
    assert final_state["state_history"] == expected_history
    assert final_state["current_state"] == "MCTS_SIMULATE"

    # 2. Schema gate: 5 nodes validated, exactly 3 edges qualified (PROPOSED and empty revision filtered out)
    assert len(final_state["validated_nodes"]) == 5
    assert len(final_state["qualified_edges"]) == 3
    adj = final_state["adj_matrix"]
    assert adj.shape == (5, 5)
    # Check that unqualified edges (sym_2 -> sym_4 and sym_3 -> sym_4) are 0 in adj matrix
    assert adj[2, 4] == 0.0
    assert adj[3, 4] == 0.0
    # Check that qualified edges exist
    assert adj[0, 1] == 1.0
    assert adj[1, 2] == 1.0
    assert adj[0, 3] == 0.8

    # 3. Spatial indexing & Ewin Tang outputs
    assert final_state["l2_normalized"].shape == (5, 32)
    assert final_state["hamming_bits"].shape == (5, 16)
    assert final_state["hilbert_keys"].shape == (5,)
    assert final_state["ewin_tang_scores"].shape == (5,)

    # 4. Fan-out PageRank priors sum to 1.0
    priors = final_state["pagerank_priors"]
    assert priors.shape == (5,)
    assert torch.allclose(priors.sum(), torch.tensor(1.0), atol=1e-4)

    # 5. MCTS rollouts and receipt
    ranked = final_state["ranked_rollouts"]
    assert len(ranked) > 0

    receipt = final_state["receipt"]
    assert receipt["schema"] == "atlas.spatial-mcts-pipeline-receipt.v1"
    assert receipt["writes_performed"] is False
    assert receipt["num_validated_nodes"] == 5
    assert receipt["num_qualified_edges"] == 3
    assert len(receipt["rollouts_digest"]) == 64
