from __future__ import annotations

import numpy as np
import pytest

from atlas_compute.lexical_ast_cst_ml_langgraph_bridge_v1 import (
    QUERY_FEATURE_ORDER_V1,
    RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,
    assert_xgboost_softprob_output_v2,
    build_retrieval_router_tensor_v2,
    classify_query_router_softprob_v2,
    extract_ast_cst_structural_signals_v1,
    extract_query_svelte_signals_v1,
    get_retrieval_router_tensor_manifest_v2,
    project_lexical_query_features_v1,
    run_lexical_ast_cst_langgraph_helper_v1,
)


def test_project_lexical_query_features_and_234_router_tensor() -> None:
    query = "Fix Svelte 5 $state and {#snippet} in src/routes/api/search/+server.ts with SELECT * FROM atlas_packets"
    lex = project_lexical_query_features_v1(query)
    assert lex["schema"] == "atlas.query-feature-projection.v1"
    assert lex["evidenceAuthority"] is False
    assert lex["pathLikeCount"] >= 1.0
    assert lex["extensionCount"] >= 1.0
    assert lex["hasSqlShape"] == 1.0

    tensor_234 = build_retrieval_router_tensor_v2(
        classification_mrl_128=[0.1] * 128,
        ontology_mask_32=[1.0] + [0.0] * 31,
        query_features=lex,
        operation_flags_16=[1.0] * 16,
        runtime_resource_16=[0.5] * 16,
        graph_tool_structure_16=[0.25] * 16,
    )
    assert tensor_234.shape == (RETRIEVAL_ROUTER_TENSOR_WIDTH_V2,)
    assert tensor_234.dtype == np.float32

    ast_cst = extract_ast_cst_structural_signals_v1(
        query,
        extensions=["svelte", "ts", "sql"],
        ast_grep_symbols=[{"symbolName": "RequestHandler"}],
        nlp_concepts=["svelte_5_runes", "postgres_18"],
    )
    assert ast_cst["svelte5RunesDetected"] >= 1
    assert ast_cst["svelte5SnippetsDetected"] >= 1
    assert ast_cst["sqlDrizzlePatternsDetected"] >= 1
    assert 0.05 <= ast_cst["astAffinityScore"] <= 1.0

    router = classify_query_router_softprob_v2(tensor_234, ast_cst, lex)
    assert router["schema"] == "atlas.xgboost-query-router.v2"
    assert router["canonicalWritesAllowed"] is False
    assert router["retrievalVoteAdded"] is False
    assert len(router["probabilities"]) == 5


def test_xgboost_softprob_negative_guards() -> None:
    with pytest.raises(ValueError, match="XGBOOST_ROUTER_PROBABILITY_SUM_INVALID"):
        assert_xgboost_softprob_output_v2([0.2, 0.2, 0.2], 3)

    with pytest.raises(ValueError, match="XGBOOST_ROUTER_PROBABILITY_WIDTH_MISMATCH"):
        assert_xgboost_softprob_output_v2([0.5, 0.5], 3)


def test_run_lexical_ast_cst_langgraph_helper_v1_end_to_end() -> None:
    candidates = [
        {
            "canonicalId": f"crime-scene-reconstruction:CASE-SCENE-LIVE-0{i}:{850 + i}",
            "taskId": f"CASE-SCENE-LIVE-0{i}",
            "domainId": "candidate:domain.scene_3d" if i % 2 == 0 else "candidate:domain.gpu_cuda_tensor",
            "state": "partial" if i <= 2 else "open",
            "extensions": ["svelte", "ts"] if i % 2 == 0 else ["py", "cu", "cpp"],
            "summary": "Wire Svelte 5 $state {#snippet} export const GET RequestHandler"
            if i % 2 == 0
            else "Verify torch.cuda PYBIND11_MODULE radix_sort and SELECT jsonb_set",
            "kmeansCentroidSim": 0.78,
            "pagerankCuda": 0.042,
            "combinedScore": 0.65 + i * 0.03,
            "predictedTangScore": 0.28 + i * 0.02,
            "nlp8095": {"concepts": ["svelte5", "cuda", "radix_sort"]},
            "astGrepSymbolRefs": [{"symbolName": f"Symbol_{i}"}],
            "topKOkfDocs": [{"chunkId": f"doc:okf:{i}"}],
        }
        for i in range(1, 7)
    ]
    out = run_lexical_ast_cst_langgraph_helper_v1(
        run_id="test-langgraph-run-v1",
        workspace_revision="rev:test-v1",
        candidate_tasks=candidates,
        top_k=4,
    )
    assert out["schema"] == "atlas.lexical-ast-cst-ml-langgraph-helper.v1"
    assert out["canonicalAuthority"] is False
    assert out["writesPerformed"] is False
    assert out["retrievalVoteAdded"] is False
    assert len(out["langGraphNodeTransitions"]) == 4
    assert all(n["status"] == "COMPLETED" for n in out["langGraphNodeTransitions"])
    assert out["xgboostGroupedDatasetReceipt"]["rowCount"] == 6
    assert out["xgboostGroupedDatasetReceipt"]["featureCount"] == 5
    assert out["cppRadixPackingReceipt"]["backend"] == "cpp_pybind11_native"
    assert len(out["recommendations"]) == 4
    assert len(QUERY_FEATURE_ORDER_V1) == 26
    assert out["routerTensorContract"]["pinnedDimensionCount"] == 234


def test_234_router_manifest_and_query_vs_source_svelte_separation() -> None:
    manifest = get_retrieval_router_tensor_manifest_v2()
    assert manifest["width"] == 234
    assert manifest["dimensionCount"] == 234
    assert len(manifest["dimensions"]) == 234
    assert manifest["dimensions"][0]["name"] == "mrl128_dim_000"
    assert manifest["dimensions"][160]["name"] == "tokenCount"
    assert manifest["dimensions"][233]["name"] == "gtSignal15"

    # Natural language query token vs structural Svelte 5 source declaration
    q_only = extract_query_svelte_signals_v1("How do I use {#snippet} and $state in Svelte 5?")
    assert q_only["svelte5SnippetsDetected"] == 1
    assert q_only["svelte5RunesDetected"] == 1
    assert q_only["svelte5SnippetSourceDeclarations"] == 0

    src_decl = extract_query_svelte_signals_v1("{#snippet row(item)}<span>{item.name}</span>{/snippet}")
    assert src_decl["svelte5SnippetsDetected"] == 1
    assert src_decl["svelte5SnippetSourceDeclarations"] == 1

