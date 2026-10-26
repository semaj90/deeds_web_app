import pytest
import torch
from spatial_search_engine_v1 import (
    OkfAstNodeSchema,
    SpatialCodebaseIndex,
    ewin_tang_low_rank_recommend,
    HmmFsmRouter,
    custom_fanout_pagerank,
    run_alphago_mcts_code_search,
)


def test_okf_ast_node_schema():
    valid_node = OkfAstNodeSchema(
        symbol_id="sym_123",
        workspace_id="ws_456",
        source_revision="sha256:abc",
        start_byte=10,
        end_byte=50,
        qualification="STRUCTURAL_PROVEN",
        fan_out_cap=32,
    )
    assert valid_node.symbol_id == "sym_123"
    assert valid_node.qualification == "STRUCTURAL_PROVEN"

    with pytest.raises(Exception):
        OkfAstNodeSchema(
            symbol_id="sym_123",
            workspace_id="ws_456",
            source_revision="sha256:abc",
            start_byte=10,
            end_byte=50,
            qualification="UNVERIFIED_LITERAL",  # forbidden by schema
        )


def test_spatial_codebase_index_cpu():
    dim = 64
    index = SpatialCodebaseIndex(dim=dim, j_bits=32, num_voronoi_cells=4, device="cpu")
    embeddings = torch.randn(10, dim)

    x_l2, hamming_bits, hilbert_keys = index.normalize_and_hash(embeddings)

    # Check L2 norm = 1.0
    norms = torch.norm(x_l2, p=2, dim=-1)
    assert torch.allclose(norms, torch.ones_like(norms), atol=1e-5)

    # Check Hamming bits shape and binary values
    assert hamming_bits.shape == (10, 32)
    assert ((hamming_bits == 0) | (hamming_bits == 1)).all()

    # Check Hilbert keys shape
    assert hilbert_keys.shape == (10,)

    # Check Voronoi search fallback
    query = torch.randn(1, dim)
    query_l2 = torch.nn.functional.normalize(query, p=2.0, dim=-1)
    neighbors = index.search_voronoi_cuvs(x_l2, query_l2, top_k=3)
    assert neighbors.shape == (1, 3)


def test_ewin_tang_recommendation():
    num_items, dim = 20, 16
    affinity = torch.randn(num_items, dim).abs()
    query = torch.randn(dim)

    scores = ewin_tang_low_rank_recommend(affinity, query, sample_size=8, rank_k=4)
    assert scores.shape == (num_items,)
    assert torch.isfinite(scores).all()


def test_hmm_fsm_router():
    router = HmmFsmRouter()
    # Sequence of 3 steps
    T, S = 3, len(router.STATES)
    nb_priors = torch.randn(T, S)
    lr_weights = torch.randn(T, S)

    path = router.viterbi_decode(nb_priors, lr_weights)
    assert len(path) == T
    for state in path:
        assert state in router.STATES


def test_custom_fanout_pagerank():
    N = 5
    # Node 0 has high fanout (connects to all), others connect to 0
    adj = torch.zeros(N, N)
    adj[0, 1:] = 1.0
    adj[1:, 0] = 1.0

    personalization = torch.ones(N)
    r = custom_fanout_pagerank(adj, personalization, max_fanout=2, fanout_penalty=1.0)
    assert r.shape == (N,)
    assert torch.allclose(r.sum(), torch.tensor(1.0), atol=1e-4)


def test_alphago_mcts_code_search():
    N = 4
    # Fully connected test graph
    adj = torch.ones(N, N) - torch.eye(N)
    priors = torch.tensor([0.4, 0.3, 0.2, 0.1])

    ranked = run_alphago_mcts_code_search(
        root_state=0,
        adj_matrix=adj,
        pagerank_priors=priors,
        num_simulations=32,
        c_puct=1.414,
    )
    assert len(ranked) > 0
    top_cid, visits, q_val = ranked[0]
    assert visits > 0
    assert isinstance(q_val, float)
