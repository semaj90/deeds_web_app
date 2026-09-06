from __future__ import annotations

from atlas_gemma_rank_standalone_shape_proof_v1 import derive_standalone_config, prove_shape_contract


def upstream_config() -> dict:
    return {
        "architectures": ["Gemma4AssistantForCausalLM"],
        "model_type": "gemma4_assistant",
        "use_ordered_embeddings": True,
        "text_config": {
            "hidden_size": 256,
            "num_hidden_layers": 2,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_kv_shared_layers": 2,
            "head_dim": 256,
            "global_head_dim": 512,
            "intermediate_size": 2048,
            "layer_types": ["sliding_attention", "full_attention"],
        },
    }


def test_derived_config_disables_target_kv_sharing_without_mutating_upstream():
    upstream = upstream_config()
    derived = derive_standalone_config(upstream)

    assert upstream["text_config"]["num_kv_shared_layers"] == 2
    assert upstream["use_ordered_embeddings"] is True
    assert derived["model_type"] == "atlas_gemma_rank"
    assert derived["num_kv_shared_layers"] == 0
    assert derived["use_bidirectional_attention"] == "all"
    assert derived["use_cache"] is False
    assert derived["rankHead"] == {"inFeatures": 256, "outFeatures": 1, "bias": True}


def test_shape_contract_requires_config_derived_kv_and_knorm_tensors():
    config = upstream_config()
    result = prove_shape_contract(config, {})

    assert result["status"] == "STANDALONE_SHAPE_CONTRACT_PROVEN"
    assert result["configInvariants"]["kvSharingDisabled"] is True
    assert result["configInvariants"]["bidirectionalEncoding"] is True
    assert len(result["expectedNewTrainableAttentionTensors"]) == 6
    assert len(result["missingNewTrainableAttentionTensors"]) == 6
    assert result["newTrainableAttentionState"] == "UNINITIALIZED_REQUIRED"
    assert result["shapeMismatches"] == []
    assert result["weightsMutated"] is False
