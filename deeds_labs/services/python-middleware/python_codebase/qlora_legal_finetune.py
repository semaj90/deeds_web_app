#!/usr/bin/env python3
"""
QLoRA Training Script for Gemma3-Legal Tool Selection

This script trains a small QLoRA adapter on logged query-tool usage data
to help Gemma3-legal make better decisions about which tools to use for
legal research queries.

Usage:
    python qlora_legal_finetune.py --data-path /path/to/query-training-data.jsonl --output-dir ./qlora-adapter
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict, Any
import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import Dataset
import jsonlines


def load_training_data(data_path: str) -> List[Dict[str, Any]]:
    """Load training data from JSONL file."""
    data = []
    with jsonlines.open(data_path) as reader:
        for obj in reader:
            data.append(obj)
    return data


def format_training_example(entry: Dict[str, Any]) -> Dict[str, str]:
    """Format a log entry into a training example."""
    query = entry.get('userQuery', '')
    tools = entry.get('toolsUsed', [])
    context = entry.get('contextUsed', [])
    answer = entry.get('finalAnswer', '')

    # Create a conversational format
    system_prompt = """You are a legal research assistant. Based on the user's query, select the most appropriate tools to gather relevant legal information.

Available tools:
- kb.search_web: Search web-indexed legal documents and statutes
- rag.search_documents: Search case law and legal precedents
- kag.related_cases: Find similar cases and legal opinions
- context7.search_docs: Search internal documentation and procedures

Respond with the tool name and parameters."""

    user_message = f"Query: {query}"

    if context:
        user_message += f"\nRelevant context: {'; '.join(context[:3])}"  # Limit context

    assistant_message = f"Use: {', '.join(tools)}"

    if answer:
        assistant_message += f"\nFinal answer: {answer}"

    return {
        "system": system_prompt,
        "user": user_message,
        "assistant": assistant_message
    }


def create_instruction_format(example: Dict[str, str]) -> str:
    """Convert to instruction format for training."""
    return f"""<s>[INST] <<SYS>>
{example['system']}
<</SYS>>

{example['user']} [/INST] {example['assistant']} </s>"""


def main():
    parser = argparse.ArgumentParser(description='Train QLoRA adapter for legal tool selection')
    parser.add_argument('--data-path', required=True, help='Path to JSONL training data')
    parser.add_argument('--output-dir', default='./qlora-legal-adapter', help='Output directory')
    parser.add_argument('--model-name', default='google/gemma-3-4b-it', help='Base model name')
    parser.add_argument('--lora-r', type=int, default=8, help='LoRA rank')
    parser.add_argument('--lora-alpha', type=int, default=16, help='LoRA alpha')
    parser.add_argument('--batch-size', type=int, default=4, help='Training batch size')
    parser.add_argument('--epochs', type=int, default=2, help='Number of training epochs')
    parser.add_argument('--learning-rate', type=float, default=2e-4, help='Learning rate')

    args = parser.parse_args()

    # Load and format data
    print(f"Loading training data from {args.data_path}")
    raw_data = load_training_data(args.data_path)

    if len(raw_data) < 10:
        print(f"Warning: Only {len(raw_data)} training examples. Consider collecting more data.")

    formatted_data = [format_training_example(entry) for entry in raw_data]
    instruction_data = [create_instruction_format(ex) for ex in formatted_data]

    # Create dataset
    dataset = Dataset.from_dict({"text": instruction_data})

    # Load model and tokenizer
    print(f"Loading model: {args.model_name}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        args.model_name,
        torch_dtype=torch.float16,
        device_map="auto",
        load_in_4bit=True
    )

    # Prepare for QLoRA
    model = prepare_model_for_kbit_training(model)

    lora_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )

    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # Tokenize dataset
    def tokenize_function(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            max_length=512,
            padding="max_length"
        )

    tokenized_dataset = dataset.map(tokenize_function, batched=True)

    # Training arguments
    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=4,
        learning_rate=args.learning_rate,
        fp16=True,
        logging_steps=10,
        save_steps=100,
        save_total_limit=2,
        load_best_model_at_end=True,
        metric_for_best_model="loss",
        greater_is_better=False,
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset,
        data_collator=DataCollatorForLanguageModeling(tokenizer, mlm=False),
    )

    # Train
    print("Starting training...")
    trainer.train()

    # Save adapter
    trainer.save_model(args.output_dir)
    print(f"Adapter saved to {args.output_dir}")

    # Test inference
    print("\nTesting inference...")
    test_query = "What are the legal requirements for employment contracts?"
    inputs = tokenizer(f"<s>[INST] {test_query} [/INST]", return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(**inputs, max_new_tokens=100, do_sample=True, temperature=0.7)
        response = tokenizer.decode(outputs[0], skip_special_tokens=True)

    print(f"Test query: {test_query}")
    print(f"Response: {response}")


if __name__ == "__main__":
    main()