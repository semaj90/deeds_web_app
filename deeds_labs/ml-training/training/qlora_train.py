#!/usr/bin/env python3
"""
Phase 70: QLoRA Training Pipeline
Fine-tunes Gemma3 for legal document analysis using QLoRA
"""

import os
import sys
import json
import torch
import logging
from pathlib import Path
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import load_dataset

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class QLoRATrainer:
    def __init__(self):
        self.base_model = "google/gemma-3-4b-it"  # Will use local cache
        self.output_dir = Path("/app/models/gemma3-legal-qlora")
        self.output_dir.mkdir(parents=True, exist_ok=True)

        # QLoRA configuration
        self.lora_config = LoraConfig(
            r=64,
            lora_alpha=16,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
            lora_dropout=0.1,
            bias="none",
            task_type="CAUSAL_LM"
        )

    def load_model_and_tokenizer(self):
        """Load model and tokenizer"""
        logger.info(f"Loading model: {self.base_model}")

        tokenizer = AutoTokenizer.from_pretrained(
            self.base_model,
            trust_remote_code=True
        )

        model = AutoModelForCausalLM.from_pretrained(
            self.base_model,
            torch_dtype=torch.float16,
            device_map="auto",
            trust_remote_code=True,
            load_in_8bit=True
        )

        # Prepare model for QLoRA
        model = prepare_model_for_kbit_training(model)
        model = get_peft_model(model, self.lora_config)

        logger.info(f"Model loaded with {sum(p.numel() for p in model.parameters())} parameters")
        logger.info(f"Trainable parameters: {sum(p.numel() for p in model.parameters() if p.requires_grad)}")

        return model, tokenizer

    def load_training_data(self):
        """Load and prepare training data"""
        logger.info("Loading training data...")

        # Use synthetic legal data for demonstration
        # In practice, this would be real legal documents
        data = [
            {
                "text": "Legal Document Analysis: This contract establishes the terms between parties A and B for service provision. Key clauses include payment terms, liability limitations, and termination conditions."
            },
            {
                "text": "Contract Review: The agreement contains standard indemnification language protecting both parties from third-party claims arising from performance of contracted services."
            }
        ]

        # Convert to dataset format
        from datasets import Dataset
        dataset = Dataset.from_list(data)

        return dataset

    def tokenize_function(self, examples, tokenizer):
        """Tokenize the input text"""
        return tokenizer(
            examples["text"],
            truncation=True,
            padding="max_length",
            max_length=512
        )

    def train(self):
        """Execute QLoRA training"""
        logger.info("🚀 Starting QLoRA Training Pipeline")
        logger.info("===================================")

        # Load model and tokenizer
        model, tokenizer = self.load_model_and_tokenizer()

        # Load and prepare data
        dataset = self.load_training_data()
        tokenized_dataset = dataset.map(
            lambda x: self.tokenize_function(x, tokenizer),
            batched=True,
            remove_columns=["text"]
        )

        # Training arguments
        training_args = TrainingArguments(
            output_dir=str(self.output_dir),
            num_train_epochs=3,
            per_device_train_batch_size=4,
            gradient_accumulation_steps=2,
            learning_rate=2e-4,
            weight_decay=0.01,
            logging_steps=10,
            save_steps=100,
            save_total_limit=2,
            fp16=True,
            dataloader_pin_memory=False,
            report_to="none"  # Disable wandb/tensorboard
        )

        # Data collator
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=tokenizer,
            mlm=False
        )

        # Trainer
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=tokenized_dataset,
            data_collator=data_collator
        )

        # Train
        logger.info("Starting training...")
        trainer.train()

        # Save the fine-tuned model
        trainer.save_model()
        tokenizer.save_pretrained(self.output_dir)

        logger.info(f"✅ Training completed! Model saved to: {self.output_dir}")
        return True

def main():
    trainer = QLoRATrainer()
    success = trainer.train()

    if success:
        logger.info("🎉 QLoRA training pipeline completed successfully!")
        return 0
    else:
        logger.error("❌ QLoRA training failed!")
        return 1

if __name__ == "__main__":
    sys.exit(main())