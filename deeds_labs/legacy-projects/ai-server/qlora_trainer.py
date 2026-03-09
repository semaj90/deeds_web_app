"""
QLoRA (Quantized Low-Rank Adaptation) Trainer for Legal Domain

Fine-tunes gemma3:270m on legal evidence corpus using 4-bit quantization
and LoRA adapters for parameter-efficient training.

Features:
- 4-bit quantization with bitsandbytes
- LoRA (Low-Rank Adaptation) for efficient fine-tuning
- Legal domain dataset support
- Training monitoring with TensorBoard
- Automatic checkpoint saving

Requirements:
- transformers 4.35.2+
- peft 0.8.0+
- bitsandbytes 0.42.0+
- trl 0.7.10+
- torch 2.1.1+
"""

import os
import json
import torch
from pathlib import Path
from typing import List, Dict, Optional
from dataclasses import dataclass, field
import logging

from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
    TrainingArguments,
    Trainer,
)
from peft import (
    LoraConfig,
    get_peft_model,
    prepare_model_for_kbit_training,
    PeftModel,
)
from datasets import Dataset
import asyncpg

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class QLoRAConfig:
    """QLoRA training configuration"""

    # Model config
    base_model: str = "google/gemma-2b"  # Base Gemma model (closest to gemma3:270m)
    model_max_length: int = 2048

    # LoRA config
    lora_r: int = 16  # LoRA rank
    lora_alpha: int = 32  # LoRA scaling factor
    lora_dropout: float = 0.05
    target_modules: List[str] = field(
        default_factory=lambda: ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]
    )

    # Quantization config
    load_in_4bit: bool = True
    bnb_4bit_compute_dtype: str = "bfloat16"
    bnb_4bit_quant_type: str = "nf4"  # Normal Float 4-bit
    bnb_4bit_use_double_quant: bool = True  # Nested quantization

    # Training config
    output_dir: str = "./qlora_checkpoints/gemma3-legal"
    num_train_epochs: int = 3
    per_device_train_batch_size: int = 1  # Reduced for 12GB VRAM
    gradient_accumulation_steps: int = 4  # Effective batch size = 4
    learning_rate: float = 2e-4
    warmup_steps: int = 100
    logging_steps: int = 10
    save_steps: int = 500
    max_grad_norm: float = 0.3
    weight_decay: float = 0.01

    # Dataset config
    dataset_path: Optional[str] = None
    max_samples: Optional[int] = None


class QLoRATrainer:
    """Fine-tune Gemma models on legal domain using QLoRA"""

    def __init__(self, config: QLoRAConfig):
        self.config = config
        self.tokenizer = None
        self.model = None
        self.peft_model = None

    def load_model(self):
        """Load base model with 4-bit quantization"""
        logger.info(f"📦 Loading base model: {self.config.base_model}")

        # 4-bit quantization config
        bnb_config = BitsAndBytesConfig(
            load_in_4bit=self.config.load_in_4bit,
            bnb_4bit_compute_dtype=getattr(torch, self.config.bnb_4bit_compute_dtype),
            bnb_4bit_quant_type=self.config.bnb_4bit_quant_type,
            bnb_4bit_use_double_quant=self.config.bnb_4bit_use_double_quant,
        )

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.config.base_model,
            model_max_length=self.config.model_max_length,
            padding_side="right",
            use_fast=False,
        )
        self.tokenizer.pad_token = self.tokenizer.eos_token

        # Load model with quantization
        self.model = AutoModelForCausalLM.from_pretrained(
            self.config.base_model,
            quantization_config=bnb_config,
            device_map="auto",  # Automatically distribute across GPUs
            trust_remote_code=True,
        )

        logger.info(f"✅ Model loaded with 4-bit quantization")
        logger.info(f"   Memory footprint: {self.model.get_memory_footprint() / 1e9:.2f} GB")

    def prepare_for_training(self):
        """Prepare model for QLoRA training"""
        logger.info("🔧 Preparing model for k-bit training")

        # Prepare for k-bit training
        self.model = prepare_model_for_kbit_training(self.model)

        # LoRA config
        lora_config = LoraConfig(
            r=self.config.lora_r,
            lora_alpha=self.config.lora_alpha,
            target_modules=self.config.target_modules,
            lora_dropout=self.config.lora_dropout,
            bias="none",
            task_type="CAUSAL_LM",
        )

        # Apply LoRA
        self.peft_model = get_peft_model(self.model, lora_config)
        self.peft_model.print_trainable_parameters()

        logger.info("✅ LoRA adapters applied")

    async def load_legal_dataset_from_postgres(self, limit: Optional[int] = None) -> Dataset:
        """
        Load legal evidence dataset from PostgreSQL

        Returns:
            Dataset: HuggingFace dataset with legal evidence
        """
        logger.info("📚 Loading legal evidence dataset from PostgreSQL")

        db_url = os.getenv("DATABASE_URL", "postgresql://legal_admin:123456@localhost:5432/legal_ai_db")

        conn = await asyncpg.connect(db_url)

        query = """
            SELECT
                title,
                content,
                analysis,
                tags
            FROM evidence
            WHERE content IS NOT NULL
            AND analysis IS NOT NULL
        """

        if limit:
            query += f" LIMIT {limit}"

        rows = await conn.fetch(query)
        await conn.close()

        # Format as instruction-response pairs
        data = []
        for row in rows:
            instruction = f"Analyze the following legal evidence:\n\n{row['content'][:500]}"
            response = row['analysis'] or "Legal analysis pending."

            data.append({
                "instruction": instruction,
                "response": response,
                "input": "",
            })

        logger.info(f"✅ Loaded {len(data)} legal evidence samples")

        return Dataset.from_list(data)

    def format_prompt(self, example: Dict) -> str:
        """Format example as prompt for instruction tuning"""
        return f"""### Instruction:
{example['instruction']}

### Input:
{example.get('input', '')}

### Response:
{example['response']}"""

    def tokenize_dataset(self, dataset: Dataset) -> Dataset:
        """Tokenize dataset for training"""
        logger.info("🔤 Tokenizing dataset")

        def tokenize_function(examples):
            prompts = [self.format_prompt(ex) for ex in examples]
            tokenized = self.tokenizer(
                prompts,
                truncation=True,
                max_length=self.config.model_max_length,
                padding="max_length",
            )
            tokenized["labels"] = tokenized["input_ids"].copy()
            return tokenized

        # Convert single dict to list format
        dataset_list = [{"instruction": ex["instruction"], "response": ex["response"], "input": ex.get("input", "")}
                        for ex in dataset]

        tokenized_dataset = self.tokenizer(
            [self.format_prompt(ex) for ex in dataset_list],
            truncation=True,
            max_length=self.config.model_max_length,
            padding="max_length",
        )

        # Add labels
        tokenized_dataset["labels"] = tokenized_dataset["input_ids"]

        logger.info(f"✅ Tokenized {len(tokenized_dataset['input_ids'])} samples")

        return Dataset.from_dict(tokenized_dataset)

    def train(self, train_dataset: Dataset):
        """Train model with QLoRA"""
        logger.info("🚀 Starting QLoRA training")

        training_args = TrainingArguments(
            output_dir=self.config.output_dir,
            num_train_epochs=self.config.num_train_epochs,
            per_device_train_batch_size=self.config.per_device_train_batch_size,
            gradient_accumulation_steps=self.config.gradient_accumulation_steps,
            learning_rate=self.config.learning_rate,
            warmup_steps=self.config.warmup_steps,
            logging_steps=self.config.logging_steps,
            save_steps=self.config.save_steps,
            max_grad_norm=self.config.max_grad_norm,
            weight_decay=self.config.weight_decay,
            fp16=False,
            bf16=True,  # Use bfloat16 for RTX 3060 Ti
            optim="paged_adamw_8bit",  # Memory-efficient optimizer
            logging_dir=f"{self.config.output_dir}/logs",
            save_total_limit=3,
            report_to="tensorboard",
        )

        trainer = Trainer(
            model=self.peft_model,
            args=training_args,
            train_dataset=train_dataset,
            tokenizer=self.tokenizer,
        )

        logger.info(f"📊 Training configuration:")
        logger.info(f"   Epochs: {self.config.num_train_epochs}")
        logger.info(f"   Batch size: {self.config.per_device_train_batch_size}")
        logger.info(f"   Gradient accumulation: {self.config.gradient_accumulation_steps}")
        logger.info(f"   Learning rate: {self.config.learning_rate}")

        # Train!
        trainer.train()

        logger.info("✅ Training complete!")

        # Save final model
        self.peft_model.save_pretrained(f"{self.config.output_dir}/final")
        self.tokenizer.save_pretrained(f"{self.config.output_dir}/final")

        logger.info(f"💾 Model saved to: {self.config.output_dir}/final")

    def merge_and_save(self, output_dir: str):
        """Merge LoRA adapters with base model and save"""
        logger.info("🔀 Merging LoRA adapters with base model")

        merged_model = self.peft_model.merge_and_unload()
        merged_model.save_pretrained(output_dir)
        self.tokenizer.save_pretrained(output_dir)

        logger.info(f"✅ Merged model saved to: {output_dir}")


# CLI usage
if __name__ == "__main__":
    import argparse
    import asyncio

    parser = argparse.ArgumentParser(description="QLoRA training for legal domain")
    parser.add_argument("--base-model", default="google/gemma-2b", help="Base model")
    parser.add_argument("--output-dir", default="./qlora_checkpoints/gemma3-legal", help="Output directory")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=1, help="Batch size")
    parser.add_argument("--max-samples", type=int, help="Max dataset samples")
    parser.add_argument("--merge", action="store_true", help="Merge adapters after training")

    args = parser.parse_args()

    config = QLoRAConfig(
        base_model=args.base_model,
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        max_samples=args.max_samples,
    )

    trainer = QLoRATrainer(config)

    # Load model
    trainer.load_model()
    trainer.prepare_for_training()

    # Load dataset
    async def load_data():
        return await trainer.load_legal_dataset_from_postgres(limit=config.max_samples)

    dataset = asyncio.run(load_data())
    tokenized_dataset = trainer.tokenize_dataset(dataset)

    # Train
    trainer.train(tokenized_dataset)

    # Merge adapters if requested
    if args.merge:
        merge_dir = f"{args.output_dir}/merged"
        trainer.merge_and_save(merge_dir)

    logger.info("🎉 QLoRA training complete!")
