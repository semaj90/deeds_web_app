#!/usr/bin/env python3
"""Train/evaluate a Parent Atlas tool CrossEncoder from verified JSONL rows.

This is intentionally isolated from the RAPIDS sidecar environment. It consumes
`atlas.encoder-jsonl-row.v1` rows exported by the TypeScript neural-routing
contracts and never reads canonical truth directly from Postgres/Qdrant/Neo4j.

The first production target is ordinary fine-tuning or LoRA. QLoRA is optional
and must be admitted by GPU/resource measurements before use.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, TaskType, get_peft_model
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    Trainer,
    TrainingArguments,
)


def load_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    for line_no, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        row = json.loads(line)
        if row.get("schemaVersion") != "atlas.encoder-jsonl-row.v1":
            raise ValueError(f"line {line_no}: unexpected schemaVersion")
        if not isinstance(row.get("queryText"), str) or not isinstance(row.get("toolId"), str):
            raise ValueError(f"line {line_no}: queryText/toolId required")
        if row.get("label") not in (0, 1, 0.0, 1.0):
            raise ValueError(f"line {line_no}: binary label required")
        rows.append(row)
    if not rows:
        raise ValueError("dataset is empty")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-jsonl", type=Path, required=True)
    parser.add_argument("--eval-jsonl", type=Path, required=True)
    parser.add_argument("--model", default="cross-encoder/ms-marco-MiniLM-L-6-v2")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--max-length", type=int, default=384)
    parser.add_argument("--batch-size", type=int, default=16)
    parser.add_argument("--epochs", type=float, default=2.0)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--lora", action="store_true")
    args = parser.parse_args()

    train_rows = load_rows(args.train_jsonl)
    eval_rows = load_rows(args.eval_jsonl)

    tokenizer = AutoTokenizer.from_pretrained(args.model)
    model = AutoModelForSequenceClassification.from_pretrained(args.model, num_labels=1)

    if args.lora:
        model = get_peft_model(
            model,
            LoraConfig(
                task_type=TaskType.SEQ_CLS,
                r=8,
                lora_alpha=16,
                lora_dropout=0.05,
                bias="none",
            ),
        )

    def encode(batch: dict) -> dict:
        pairs = [f"tool: {tool}" for tool in batch["toolId"]]
        encoded = tokenizer(
            batch["queryText"],
            pairs,
            truncation=True,
            padding="max_length",
            max_length=args.max_length,
        )
        encoded["labels"] = [float(label) for label in batch["label"]]
        return encoded

    train_ds = Dataset.from_list(train_rows).map(encode, batched=True)
    eval_ds = Dataset.from_list(eval_rows).map(encode, batched=True)

    training_args = TrainingArguments(
        output_dir=str(args.output),
        learning_rate=args.learning_rate,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        num_train_epochs=args.epochs,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        fp16=torch.cuda.is_available(),
        report_to=[],
        seed=17,
    )

    trainer = Trainer(model=model, args=training_args, train_dataset=train_ds, eval_dataset=eval_ds)
    trainer.train()
    metrics = trainer.evaluate()
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "evaluation.json").write_text(json.dumps(metrics, indent=2, sort_keys=True), encoding="utf-8")
    trainer.save_model(str(args.output / "model"))
    tokenizer.save_pretrained(str(args.output / "model"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
