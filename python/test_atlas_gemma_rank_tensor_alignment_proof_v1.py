from __future__ import annotations

from atlas_gemma_rank_tensor_alignment_proof_v1 import prove_tensor_alignment


def config() -> dict:
    return {
        "model_type": "atlas_gemma_rank",
        "hidden_size": 256,
        "num_kv_shared_layers": 0,
        "use_bidirectional_attention": "all",
        "use_cache": False,
        "use_ordered_embeddings": False,
        "text_config": {
            "hidden_size": 256,
            "num_hidden_layers": 1,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "head_dim": 256,
            "global_head_dim": 512,
            "intermediate_size": 2048,
            "layer_types": ["sliding_attention"],
        },
    }


def test_allow_list_and_gemm_alignment_are_deterministic():
    shapes = {
        "model.embed_tokens.weight": [262144, 256],
        "model.norm.weight": [256],
        "model.layers.0.input_layernorm.weight": [256],
        "model.layers.0.layer_scalar": [1],
        "model.layers.0.post_attention_layernorm.weight": [256],
        "model.layers.0.post_feedforward_layernorm.weight": [256],
        "model.layers.0.pre_feedforward_layernorm.weight": [256],
        "model.layers.0.self_attn.o_proj.weight": [256, 1024],
        "model.layers.0.self_attn.q_norm.weight": [256],
        "model.layers.0.self_attn.q_proj.weight": [1024, 256],
        "model.layers.0.mlp.down_proj.weight": [256, 2048],
        "model.layers.0.mlp.gate_proj.weight": [2048, 256],
        "model.layers.0.mlp.up_proj.weight": [2048, 256],
        "pre_projection.weight": [256, 256],
        "post_projection.weight": [256, 256],
    }
    result = prove_tensor_alignment(config(), shapes, {name: "BF16" for name in shapes})

    assert result["status"] == "INHERITED_TENSOR_ALIGNMENT_PROVEN"
    assert result["inheritedTensorCount"] == 13
    assert len(result["excludedTargetCoupledTensorNames"]) == 2
    assert result["unexpectedTensorNames"] == []
    assert result["shapeMismatches"] == []
    assert result["cudaGemmAlignment"]["gemmExecuted"] is False
    assert result["rerankerScoreContract"]["normalization"] == "sigmoid_once"
    assert result["weightsMutated"] is False


def test_unexpected_tensor_or_shape_fails_closed():
    shapes = {
        "model.embed_tokens.weight": [262144, 256],
        "model.norm.weight": [256],
        "model.layers.0.input_layernorm.weight": [256],
        "model.layers.0.layer_scalar": [1],
        "model.layers.0.post_attention_layernorm.weight": [256],
        "model.layers.0.post_feedforward_layernorm.weight": [256],
        "model.layers.0.pre_feedforward_layernorm.weight": [256],
        "model.layers.0.self_attn.o_proj.weight": [256, 1024],
        "model.layers.0.self_attn.q_norm.weight": [128],
        "model.layers.0.self_attn.q_proj.weight": [1024, 256],
        "model.layers.0.mlp.down_proj.weight": [256, 2048],
        "model.layers.0.mlp.gate_proj.weight": [2048, 256],
        "model.layers.0.mlp.up_proj.weight": [2048, 256],
        "unexpected.weight": [8, 8],
    }
    result = prove_tensor_alignment(config(), shapes)

    assert result["status"] == "BLOCKED_TENSOR_ALIGNMENT"
    assert result["unexpectedTensorNames"] == ["unexpected.weight"]
    assert result["shapeMismatches"][0]["tensor"] == "model.layers.0.self_attn.q_norm.weight"
