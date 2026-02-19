# Phase 70: QLoRA Training Script
# Fine-tunes Gemma3-Legal using QLoRA with existing data
# Uses cached NVIDIA container with pre-installed PyTorch

import os
import sys
import json
import logging
import argparse
from pathlib import Path

# PyTorch and training libraries (pre-installed in NVIDIA container)
try:
    import torch
    from torch.utils.data import Dataset, DataLoader
    import transformers
    from transformers import (
        AutoTokenizer,
        AutoModelForCausalLM,
        TrainingArguments,
        Trainer,
        DataCollatorForLanguageModeling
    )
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    import bitsandbytes as bnb
    TRAINING_AVAILABLE = True
except ImportError:
    TRAINING_AVAILABLE = False

def setup_logging():
    logging.basicConfig(level=logging.INFO)
    return logging.getLogger(__name__)

class QLoRADataset(Dataset):
    """Dataset for QLoRA training"""

    def __init__(self, data_path: str, tokenizer, max_length: int = 512):
        self.tokenizer = tokenizer
        self.max_length = max_length
        self.data = []

        # Load JSONL data
        with open(data_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    self.data.append(json.loads(line))

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]

        # Format as instruction tuning
        instruction = item.get('instruction', '')
        input_text = item.get('input', '')
        output_text = item.get('output', '')

        if input_text:
            prompt = f"Instruction: {instruction}\nInput: {input_text}\nOutput: {output_text}"
        else:
            prompt = f"Instruction: {instruction}\nOutput: {output_text}"

        # Tokenize
        tokenized = self.tokenizer(
            prompt,
            truncation=True,
            padding='max_length',
            max_length=self.max_length,
            return_tensors='pt'
        )

        return {
            'input_ids': tokenized['input_ids'].flatten(),
            'attention_mask': tokenized['attention_mask'].flatten(),
            'labels': tokenized['input_ids'].flatten()  # For causal LM
        }

def setup_qlora_model(model_path: str, logger):
    """Setup model with QLoRA configuration"""

    if not TRAINING_AVAILABLE:
        logger.error("Training libraries not available")
        return None, None

    try:
        logger.info(f"Loading model: {model_path}")

        # Load tokenizer
        tokenizer = AutoTokenizer.from_pretrained(model_path)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token

        # Load model with 4-bit quantization
        model = AutoModelForCausalLM.from_pretrained(
            model_path,
            load_in_4bit=True,
            torch_dtype=torch.float16,
            device_map="auto"
        )

        # Prepare model for k-bit training
        model = prepare_model_for_kbit_training(model)

        # Configure LoRA
        lora_config = LoraConfig(
            r=64,  # Rank
            lora_alpha=16,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # Gemma attention modules
            lora_dropout=0.1,
            bias="none",
            task_type="CAUSAL_LM"
        )

        # Get PEFT model
        model = get_peft_model(model, lora_config)

        logger.info("✅ Model prepared for QLoRA training")
        logger.info(f"Trainable parameters: {sum(p.numel() for p in model.parameters() if p.requires_grad)}")

        return model, tokenizer

    except Exception as e:
        logger.error(f"Model setup failed: {e}")
        return None, None

def train_qlora(model, tokenizer, dataset_path: str, output_path: str, config: dict, logger):
    """Run QLoRA training"""

    try:
        # Create dataset
        dataset = QLoRADataset(dataset_path, tokenizer, config.get('max_length', 512))

        # Data collator
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=tokenizer,
            mlm=False  # Causal LM
        )

        # Training arguments
        training_args = TrainingArguments(
            output_dir=output_path,
            num_train_epochs=config.get('epochs', 3),
            per_device_train_batch_size=config.get('batch_size', 4),
            gradient_accumulation_steps=config.get('gradient_accumulation', 2),
            learning_rate=config.get('learning_rate', 2e-4),
            fp16=True,
            logging_steps=10,
            save_steps=500,
            save_total_limit=2,
            load_best_model_at_end=True,
            evaluation_strategy="steps",
            eval_steps=500,
            warmup_steps=100,
            weight_decay=0.01,
            report_to="none"  # Disable wandb/tensorboard
        )

        # Create trainer
        trainer = Trainer(
            model=model,
            args=training_args,
            train_dataset=dataset,
            data_collator=data_collator
        )

        logger.info("🚀 Starting QLoRA training...")

        # Train
        trainer.train()

        # Save model
        trainer.save_model(output_path)
        logger.info(f"✅ Model saved to {output_path}")

        return True

    except Exception as e:
        logger.error(f"Training failed: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Phase 70 QLoRA Training")
    parser.add_argument("--model-path", required=True, help="Base model path")
    parser.add_argument("--dataset", required=True, help="Training dataset JSONL file")
    parser.add_argument("--output", required=True, help="Output directory for trained model")
    parser.add_argument("--config", default="qlora_config.json", help="Training configuration")

    args = parser.parse_args()

    logger = setup_logging()

    logger.info("🚀 Phase 70 QLoRA Training")
    logger.info("=========================")

    # Load config
    config = {
        "epochs": 3,
        "batch_size": 4,
        "gradient_accumulation": 2,
        "learning_rate": 2e-4,
        "max_length": 512
    }

    if os.path.exists(args.config):
        with open(args.config, 'r') as f:
            config.update(json.load(f))
        logger.info(f"Loaded config: {config}")

    # Setup model
    model, tokenizer = setup_qlora_model(args.model_path, logger)
    if not model or not tokenizer:
        return 1

    # Train
    success = train_qlora(model, tokenizer, args.dataset, args.output, config, logger)

    if success:
        logger.info("✅ QLoRA training completed successfully")
        return 0
    else:
        logger.error("❌ QLoRA training failed")
        return 1

if __name__ == "__main__":
    sys.exit(main())