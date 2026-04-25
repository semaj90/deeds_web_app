#!/usr/bin/env python3
import sys
from tensorrt_llm import Builder, BuildConfig
from tensorrt_llm.models.modeling_utils import (
    TransformerConfig,
    TransformerForCausalLM,
)


if __name__ == "__main__":
    cfg_json, out_dir = sys.argv[1], sys.argv[2]

    cfg = TransformerConfig.from_json_file(cfg_json)
    build_cfg = BuildConfig.from_json_file(cfg_json)

    model = TransformerForCausalLM(cfg)
    builder = Builder()
    engine = builder.build_engine(model, build_cfg)
    builder.save_engine(engine, out_dir)

    print(f"🔥 Engine saved to {out_dir}")
