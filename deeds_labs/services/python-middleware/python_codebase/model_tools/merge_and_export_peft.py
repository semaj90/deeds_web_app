"""
merge_and_export.py
- Usage:
  # Install requirements (Colab):
  pip install -U transformers accelerate bitsandbytes peft torch onnx onnxruntime

  # Run (adjust paths):
  python merge_and_export.py \
    --base_model /path/to/merged-legal-gemma-base \
    --lora_adapter /path/to/lora_adapter \
    --output_dir ./merged_for_export \
    --onnx_path ./legal_gemma.onnx \
    --max_seq_len 128
"""

import argparse
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel, PeftConfig, PeftModelForCausalLM

def merge_lora_and_save(base_model_path: str, lora_path: str, output_dir: str, device='cpu'):
    # Load base model on CPU first to avoid GPU OOM during merge
    print("Loading base model (cpu)...")
    base = AutoModelForCausalLM.from_pretrained(base_model_path, torch_dtype=torch.float16, device_map=None)
    print("Loading LoRA adapter (PEFT)...")
    peft_model = PeftModel.from_pretrained(base, lora_path, is_trainable=False)

    # Merge LoRA weights into the base model and unload PEFT wrapper
    print("Merging LoRA into base model (this will modify base weights)...")
    merged = peft_model.merge_and_unload() if hasattr(peft_model, 'merge_and_unload') else peft_model.merge_and_unload(base)
    # Some PEFT versions return base when merging; ensure `merged` is a transformers model object
    if merged is None:
        merged = base

    # Save merged model
    print(f"Saving merged model to {output_dir} ...")
    merged.save_pretrained(output_dir)
    print("Merged model saved.")
    return output_dir

def export_onnx(merged_model_dir: str, onnx_path: str, max_seq_len:int = 128):
    print("Loading merged model (cpu) for ONNX export...")
    model = AutoModelForCausalLM.from_pretrained(merged_model_dir, torch_dtype=torch.float16).eval().to('cpu')
    tokenizer = AutoTokenizer.from_pretrained(merged_model_dir)

    # Create dummy input (batch_size=1, seq_len=max_seq_len)
    dummy_input = torch.randint(0, tokenizer.vocab_size, (1, max_seq_len), dtype=torch.long)

    print(f"Exporting ONNX to {onnx_path} (opset 17) ...")
    torch.onnx.export(
        model,
        (dummy_input,),
        onnx_path,
        opset_version=17,
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"}
        },
        do_constant_folding=True,
        use_external_data_format=False
    )
    print("ONNX export complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", type=str, required=True, help="Path or HF id of base model")
    parser.add_argument("--lora_adapter", type=str, required=True, help="Path to LoRA adapter (PEFT)")
    parser.add_argument("--output_dir", type=str, default="./merged_for_export", help="Where to save merged model")
    parser.add_argument("--onnx_path", type=str, default="./legal_gemma.onnx", help="ONNX output path")
    parser.add_argument("--max_seq_len", type=int, default=128)
    args = parser.parse_args()

    merged_dir = merge_lora_and_save(args.base_model, args.lora_adapter, args.output_dir)
    export_onnx(merged_dir, args.onnx_path, max_seq_len=args.max_seq_len)
- Usage:
  # Install requirements (Colab):
  pip install -U transformers accelerate bitsandbytes peft torch onnx onnxruntime

  # Run (adjust paths):
  python merge_and_export.py \
    --base_model /path/to/merged-legal-gemma-base \
    --lora_adapter /path/to/lora_adapter \
    --output_dir ./merged_for_export \
    --onnx_path ./legal_gemma.onnx \
    --max_seq_len 128
"""

import argparse
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel, PeftConfig, PeftModelForCausalLM

def merge_lora_and_save(base_model_path: str, lora_path: str, output_dir: str, device='cpu'):
    # Load base model on CPU first to avoid GPU OOM during merge
    print("Loading base model (cpu)...")
    base = AutoModelForCausalLM.from_pretrained(base_model_path, torch_dtype=torch.float16, device_map=None)
    print("Loading LoRA adapter (PEFT)...")
    peft_model = PeftModel.from_pretrained(base, lora_path, is_trainable=False)

    # Merge LoRA weights into the base model and unload PEFT wrapper
    print("Merging LoRA into base model (this will modify base weights)...")
    merged = peft_model.merge_and_unload() if hasattr(peft_model, 'merge_and_unload') else peft_model.merge_and_unload(base)
    # Some PEFT versions return base when merging; ensure `merged` is a transformers model object
    if merged is None:
        merged = base

    # Save merged model
    print(f"Saving merged model to {output_dir} ...")
    merged.save_pretrained(output_dir)
    print("Merged model saved.")
    return output_dir

def export_onnx(merged_model_dir: str, onnx_path: str, max_seq_len:int = 128):
    print("Loading merged model (cpu) for ONNX export...")
    model = AutoModelForCausalLM.from_pretrained(merged_model_dir, torch_dtype=torch.float16).eval().to('cpu')
    tokenizer = AutoTokenizer.from_pretrained(merged_model_dir)

    # Create dummy input (batch_size=1, seq_len=max_seq_len)
    dummy_input = torch.randint(0, tokenizer.vocab_size, (1, max_seq_len), dtype=torch.long)

    print(f"Exporting ONNX to {onnx_path} (opset 17) ...")
    torch.onnx.export(
        model,
        (dummy_input,),
        onnx_path,
        opset_version=17,
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch", 1: "seq"},
            "logits": {0: "batch", 1: "seq"}
        },
        do_constant_folding=True,
        use_external_data_format=False
    )
    print("ONNX export complete.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--base_model", type=str, required=True, help="Path or HF id of base model")
    parser.add_argument("--lora_adapter", type=str, required=True, help="Path to LoRA adapter (PEFT)")
    parser.add_argument("--output_dir", type=str, default="./merged_for_export", help="Where to save merged model")
    parser.add_argument("--onnx_path", type=str, default="./legal_gemma.onnx", help="ONNX output path")
    parser.add_argument("--max_seq_len", type=int, default=128)
    args = parser.parse_args()

    merged_dir = merge_lora_and_save(args.base_model, args.lora_adapter, args.output_dir)
    export_onnx(merged_dir, args.onnx_path, max_seq_len=args.max_seq_len)