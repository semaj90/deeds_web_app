#!/usr/bin/env python3
"""
Simple QLoRA Training Pipeline for Legal AI
PyTorch → TensorRT-LLM Export
"""

import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    BitsAndBytesConfig
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from datasets import Dataset
import json

def setup_qlora_model(model_name="google/gemma-2-2b"):
    """Setup Q4 quantized model with LoRA adapters"""

    # 4-bit quantization config
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    # Load quantized model
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=bnb_config,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True
    )

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    # Prepare for QLoRA
    model = prepare_model_for_kbit_training(model)

    # LoRA config for legal domain
    lora_config = LoraConfig(
        r=16,                    # Low rank
        lora_alpha=32,           # LoRA scaling
        target_modules=[         # Target attention layers
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj"
        ],
        lora_dropout=0.1,
        bias="none",
        task_type="CAUSAL_LM"
    )

    # Apply LoRA
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    return model, tokenizer

def create_legal_dataset():
    """Create sample legal training data"""

    legal_examples = [
        {
            "instruction": "Analyze this contract clause for potential risks",
            "input": "The contractor shall deliver all work product no later than December 31, 2024, time being of the essence.",
            "output": "This clause contains a hard deadline with 'time being of the essence' language, making timely delivery a material condition. Risk: Any delay, however minor, could constitute a material breach allowing termination and damages claims."
        },
        {
            "instruction": "Summarize the key legal precedent",
            "input": "In Smith v. Jones (2023), the court held that software licensing agreements must clearly specify usage restrictions to be enforceable.",
            "output": "Smith v. Jones establishes that software license enforceability requires explicit usage restrictions. Precedent: Vague or implied restrictions are unenforceable. Impact: Software licenses must contain clear, specific usage terms."
        },
        {
            "instruction": "Identify legal issues in this document",
            "input": "Employment Agreement: Employee agrees to work exclusively for Company and shall not compete for 5 years post-termination in any industry.",
            "output": "Issues identified: 1) Overly broad non-compete (5 years, any industry) likely unenforceable, 2) Lack of geographic limitation, 3) No consideration for restriction, 4) Potential restraint of trade violation. Recommendation: Narrow scope, time, and geography."
        }
    ]

    def format_prompt(example):
        return f"""### Instruction:
{example['instruction']}

### Input:
{example['input']}

### Response:
{example['output']}<|endoftext|>"""

    formatted_data = [{"text": format_prompt(ex)} for ex in legal_examples]
    return Dataset.from_list(formatted_data)

def train_qlora_model():
    """Main training function"""

    print("🚀 Setting up QLoRA model...")
    model, tokenizer = setup_qlora_model()

    print("📚 Creating legal dataset...")
    dataset = create_legal_dataset()

    def tokenize_function(examples):
        return tokenizer(
            examples["text"],
            truncation=True,
            padding="max_length",
            max_length=512,
            return_tensors="pt"
        )

    tokenized_dataset = dataset.map(tokenize_function, batched=True)

    # Training arguments optimized for RTX 3060 Ti
    training_args = TrainingArguments(
        output_dir="./qlora_legal_model",
        per_device_train_batch_size=1,      # Small batch for 8GB VRAM
        gradient_accumulation_steps=4,       # Effective batch size = 4
        num_train_epochs=3,
        learning_rate=2e-4,
        fp16=True,                          # Mixed precision
        logging_steps=10,
        save_strategy="epoch",
        dataloader_pin_memory=False,        # Reduce memory usage
        remove_unused_columns=False,
    )

    # Trainer
    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized_dataset,
        tokenizer=tokenizer,
    )

    print("🔥 Starting QLoRA training...")
    trainer.train()

    print("💾 Saving LoRA adapters...")
    model.save_pretrained("./qlora_legal_adapters")
    tokenizer.save_pretrained("./qlora_legal_adapters")

    return model, tokenizer

def merge_and_export_for_tensorrt():
    """Merge LoRA weights and prepare for TensorRT-LLM export"""

    print("🔧 Loading trained model for export...")

    # Load base model
    base_model = AutoModelForCausalLM.from_pretrained(
        "google/gemma-2-2b",
        torch_dtype=torch.float16,
        device_map="auto"
    )

    # Load LoRA adapters
    from peft import PeftModel
    model = PeftModel.from_pretrained(base_model, "./qlora_legal_adapters")

    # Merge LoRA weights into base model
    print("🔀 Merging LoRA weights...")
    merged_model = model.merge_and_unload()

    # Save merged model for TensorRT-LLM conversion
    print("💾 Saving merged model...")
    merged_model.save_pretrained(
        "./merged_legal_model",
        save_adapter=False,
        save_config=True
    )

    tokenizer = AutoTokenizer.from_pretrained("./qlora_legal_adapters")
    tokenizer.save_pretrained("./merged_legal_model")

    print("✅ Model ready for TensorRT-LLM conversion!")
    print("📂 Location: ./merged_legal_model")

    return merged_model

if __name__ == "__main__":
    # Step 1: Train with QLoRA
    model, tokenizer = train_qlora_model()

    # Step 2: Merge and export
    merged_model = merge_and_export_for_tensorrt()

    print("\n🎯 Next steps:")
    print("1. Convert to TensorRT-LLM: python convert_checkpoint.py")
    print("2. Build engine: trtllm-build")
    print("3. Serve with TensorRT-LLM: 2-3x faster inference!")