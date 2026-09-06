from __future__ import annotations

from atlas_gemma_rank_checkpoint_inventory_v1 import classify_inventory


def test_inventory_detects_target_coupled_assistant_and_missing_kv():
    config = {
        "architectures": ["Gemma4AssistantForCausalLM"],
        "model_type": "gemma4_assistant",
        "use_ordered_embeddings": True,
        "text_config": {
            "hidden_size": 256,
            "num_hidden_layers": 2,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_kv_shared_layers": 2,
            "use_bidirectional_attention": None,
            "head_dim": 256,
            "global_head_dim": 512,
            "layer_types": ["sliding_attention", "full_attention"],
        },
    }
    result = classify_inventory(config, {
        "model.embed_tokens.weight": [262144, 256],
        "model.layers.0.self_attn.q_proj.weight": [1024, 256],
        "model.layers.1.self_attn.q_proj.weight": [1024, 256],
    })

    assert result["status"] == "BLOCKED_TARGET_COUPLED_ASSISTANT"
    assert len(result["missingStandaloneAttentionTensors"]) == 6
    assert len(result["missingStandaloneKvTensors"]) == 4
    assert len(result["missingStandaloneKNormTensors"]) == 2
    assert result["standaloneAttentionShapePlan"][0]["kProjShape"] == [512, 256]
    assert result["standaloneAttentionShapePlan"][1]["kProjShape"] == [1024, 256]
    assert "TARGET_KV_SHARED_LAYERS_CONFIGURED" in result["blockers"]
    assert "STANDALONE_KV_TENSORS_ABSENT" in result["blockers"]
    assert result["weightsMutated"] is False


def test_inventory_accepts_explicit_standalone_config_only_when_kv_exists():
    config = {
        "architectures": ["AtlasGemmaRankV1"],
        "model_type": "gemma4_text",
        "use_ordered_embeddings": False,
        "text_config": {
            "hidden_size": 256,
            "num_hidden_layers": 1,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_kv_shared_layers": 0,
            "use_bidirectional_attention": "all",
            "head_dim": 256,
            "global_head_dim": 512,
            "layer_types": ["sliding_attention"],
        },
    }
    result = classify_inventory(config, {
        "model.embed_tokens.weight": [262144, 256],
        "model.layers.0.self_attn.k_proj.weight": [512, 256],
        "model.layers.0.self_attn.v_proj.weight": [512, 256],
        "model.layers.0.self_attn.k_norm.weight": [256],
    })

    assert result["status"] == "STANDALONE_CANDIDATE_CONFIGURED"
    assert result["missingStandaloneKvTensors"] == []
    assert result["missingStandaloneAttentionTensors"] == []
    assert result["standaloneAttentionShapeMismatches"] == []
    assert result["weightsMutated"] is False
