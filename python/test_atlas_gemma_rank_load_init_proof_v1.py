from __future__ import annotations

import torch

from atlas_gemma_rank_load_init_proof_v1 import derived_text_config, initialize_parameter


def test_derived_config_detaches_assistant_kv_and_enables_bidirectional_mode():
    config = derived_text_config({
        "text_config": {
            "hidden_size": 256,
            "intermediate_size": 2048,
            "num_hidden_layers": 4,
            "num_attention_heads": 4,
            "num_key_value_heads": 2,
            "num_kv_shared_layers": 4,
            "use_bidirectional_attention": None,
        }
    })

    assert config.num_kv_shared_layers == 0
    assert config.use_bidirectional_attention == "all"
    assert config.use_cache is False
    assert config.num_key_value_heads == 2


def test_new_attention_initializers_are_finite_and_deterministic_in_shape():
    projection = torch.empty(8, 8, dtype=torch.bfloat16)
    norm = torch.empty(8, dtype=torch.bfloat16)

    assert initialize_parameter("model.layers.0.self_attn.k_proj.weight", projection) == "XAVIER_UNIFORM"
    assert initialize_parameter("model.layers.0.self_attn.k_norm.weight", norm) == "ONES"
    assert bool(torch.isfinite(projection).all().item())
    assert bool(torch.isfinite(norm).all().item())
    assert torch.equal(norm, torch.ones_like(norm))
