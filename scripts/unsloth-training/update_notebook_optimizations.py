#!/usr/bin/env python
"""Update Gemma3_12B_Legal_Production.ipynb with A100 optimizations"""

import json
from pathlib import Path

notebook_path = Path("Gemma3_12B_Legal_Production.ipynb")

with open(notebook_path, 'r', encoding='utf-8') as f:
    notebook = json.load(f)

# Cell 17: LoRA config - add rank-stabilized LoRA
cell_17_new_source = '''print("Adding LoRA adapters...\\n")

model = FastVisionModel.get_peft_model(
    model,
    r=LORA_R,
    lora_alpha=LORA_ALPHA,
    lora_dropout=LORA_DROPOUT,
    finetune_vision_layers=FINETUNE_VISION_LAYERS,
    finetune_language_layers=FINETUNE_LANGUAGE_LAYERS,
    finetune_attention_modules=FINETUNE_ATTENTION_MODULES,
    finetune_mlp_modules=FINETUNE_MLP_MODULES,
    use_gradient_checkpointing="unsloth",
    random_state=42,

    # A100 optimizations
    use_rslora=True,  # Rank-stabilized LoRA (prevents collapse in 12B)
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",  # Attention
        "gate_proj", "up_proj", "down_proj",     # MLP
    ],
)

print(f"LoRA rank: {LORA_R}")
print(f"Vision: {FINETUNE_VISION_LAYERS}")
print(f"Rank-stabilized: True")
print()
model.print_trainable_parameters()'''

# Cell 19: Training args - add BF16 + A100 optimizations
cell_19_new_source = '''training_args = TrainingArguments(
    output_dir="./gemma3-12b-legal-outputs",
    num_train_epochs=3,
    per_device_train_batch_size=1,  # 12B needs batch=1
    gradient_accumulation_steps=16,  # Effective batch still 16
    learning_rate=1e-4,  # Lower LR for larger model

    # A100: Force BF16 (native support, better than FP16)
    fp16=False,
    bf16=True,
    bf16_full_eval=True,  # BF16 for evaluation too

    # Checkpointing
    logging_steps=10,
    save_strategy="steps",
    save_steps=200,  # Less frequent (checkpoints are ~24GB)
    save_total_limit=2,  # Keep only 2
    warmup_steps=100,  # More warmup

    # Optimizer
    optim="adamw_8bit",
    weight_decay=0.01,
    lr_scheduler_type="cosine",
    max_grad_norm=1.0,

    # Memory optimizations
    gradient_checkpointing=True,  # CRITICAL for 12B
    gradient_checkpointing_kwargs={"use_reentrant": False},  # PyTorch 2.0+

    # A100 performance
    dataloader_num_workers=4,  # A100 has PCIe Gen4
    dataloader_pin_memory=True,  # Faster CPU→GPU transfers
    group_by_length=True,  # Pack similar-length samples

    # Misc
    seed=42,
    report_to="none",
)

print("Training config (A100-optimized):")
print(f"  Batch: {training_args.per_device_train_batch_size}")
print(f"  Grad accum: {training_args.gradient_accumulation_steps}")
print(f"  Effective batch: {training_args.per_device_train_batch_size * training_args.gradient_accumulation_steps}")
print(f"  LR: {training_args.learning_rate}")
print(f"  BF16: {training_args.bf16} (A100 native)")
print(f"  Gradient checkpointing: {training_args.gradient_checkpointing}")
print(f"  Group-by-length: {training_args.group_by_length}")'''

# Update cells
notebook['cells'][17]['source'] = cell_17_new_source
notebook['cells'][19]['source'] = cell_19_new_source

# Save
with open(notebook_path, 'w', encoding='utf-8') as f:
    json.dump(notebook, f, indent=2, ensure_ascii=False)

print("Updated Gemma3_12B_Legal_Production.ipynb")
print("  - Cell 17: Added rank-stabilized LoRA + expanded target_modules")
print("  - Cell 19: BF16 forced, PyTorch 2.0+ checkpointing, group-by-length, pinned memory")
