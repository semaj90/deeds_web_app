#!/usr/bin/env python3
"""
Minimal LoRA fine-tuning runner using PEFT. This script demonstrates safely
how to fine-tune a base causal LM with LoRA and save the adapter under
`adapters/<adapter_name>`.

Env vars used:
- BASE_MODEL (default: google/gemma-2b) -- a causal LM that supports PEFT
- ADAPTER_NAME (required) -- name of adapter to output
- DATA_FILE (required) -- jsonl or json file with 'prompt' and 'completion' fields

This script is intentionally minimal and expects CUDA-enabled host or
accelerator where appropriate. Use at your own risk and test with small data first.
"""
import os
import logging
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from peft import LoraConfig, get_peft_model

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")

BASE = os.environ.get("BASE_MODEL", "google/gemma-2b")
ADAPTER_NAME = os.environ.get("ADAPTER_NAME")
DATA_FILE = os.environ.get("DATA_FILE")

if not ADAPTER_NAME or not DATA_FILE:
    logging.error("ADAPTER_NAME and DATA_FILE must be set in environment")
    raise SystemExit(1)

logging.info("Loading base model: %s", BASE)
model = AutoModelForCausalLM.from_pretrained(BASE, load_in_8bit=True, device_map="auto")
logging.info("Loading tokenizer")
tokenizer = AutoTokenizer.from_pretrained(BASE)

config = LoraConfig(
    r=8,
    lora_alpha=16,
    target_modules=["q_proj", "v_proj"],
    lora_dropout=0.05,
    bias="none",
    task_type="CAUSAL_LM",
)

model = get_peft_model(model, config)

logging.info("Loading dataset: %s", DATA_FILE)
data = load_dataset("json", data_files={"train": DATA_FILE})["train"]


def tokenize_fn(batch):
    text = [p + "\n" + c for p, c in zip(batch["prompt"], batch["completion"]) ]
    tokenized = tokenizer(text, truncation=True, padding="max_length", max_length=1024)
    tokenized["labels"] = tokenized["input_ids"]
    return tokenized

logging.info("Tokenizing dataset")
tok_data = data.map(tokenize_fn, batched=True, remove_columns=data.column_names)

args = TrainingArguments(
    per_device_train_batch_size=2,
    gradient_accumulation_steps=4,
    num_train_epochs=3,
    learning_rate=1e-4,
    output_dir=f"adapters/{ADAPTER_NAME}",
    bf16=True,
)

trainer = Trainer(model=model, args=args, train_dataset=tok_data)
logging.info("Starting training")
trainer.train()
logging.info("Saving adapter to adapters/%s", ADAPTER_NAME)
model.save_pretrained(f"adapters/{ADAPTER_NAME}")
