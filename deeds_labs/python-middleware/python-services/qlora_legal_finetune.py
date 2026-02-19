#!/usr/bin/env python3
"""
QLoRA Fine-tuning for Legal AI Assistant
Fine-tunes Gemma3 or similar models on legal chat + RAG transcripts using PEFT/QLoRA.

Features:
- 4-bit quantization with QLoRA
- Legal-specific instruction tuning
- RAG context integration
- Tool-calling optimization
- Cosine similarity search integration
"""

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    TrainingArguments,
    Trainer,
    DataCollatorForLanguageModeling
)
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
import bitsandbytes as bnb
from datasets import Dataset
import json
import logging
from typing import List, Dict, Any, Optional
import os

logger = logging.getLogger(__name__)

class LegalQLoRAFinetuner:
    """QLoRA fine-tuning for legal AI assistants"""

    def __init__(
        self,
        model_name: str = "google/gemma-2b",  # or your Gemma3 checkpoint
        output_dir: str = "./legal-qlora-checkpoint"
    ):
        self.model_name = model_name
        self.output_dir = output_dir
        self.model = None
        self.tokenizer = None
        self.peft_model = None

    def load_model_and_tokenizer(self):
        """Load model with 4-bit quantization"""
        logger.info(f"Loading model: {self.model_name}")

        # Load tokenizer
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token

        # Load model with 4-bit quantization
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            load_in_4bit=True,
            device_map="auto",
            quantization_config=bnb.BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_use_double_quant=True,
                bnb_4bit_quant_type="nf4"
            ),
            torch_dtype=torch.float16,
        )

        # Prepare for k-bit training
        self.model = prepare_model_for_kbit_training(self.model)

        logger.info("Model loaded successfully")

    def setup_lora_config(self, r: int = 16, alpha: int = 32):
        """Setup LoRA configuration"""
        # Target modules for Gemma-style models
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"]

        lora_config = LoraConfig(
            r=r,
            lora_alpha=alpha,
            target_modules=target_modules,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM"
        )

        self.peft_model = get_peft_model(self.model, lora_config)
        self.peft_model.print_trainable_parameters()

    def prepare_legal_dataset(self, data_path: str) -> Dataset:
        """
        Prepare dataset from legal chat transcripts and RAG examples

        Expected format: JSONL with conversations including RAG context
        """
        conversations = []

        with open(data_path, 'r') as f:
            for line in f:
                if line.strip():
                    conversations.append(json.loads(line))

        # Format conversations for instruction tuning
        formatted_data = []
        for conv in conversations:
            text = self.format_conversation(conv)
            formatted_data.append({"text": text})

        return Dataset.from_list(formatted_data)

    def format_conversation(self, conv: Dict[str, Any]) -> str:
        """Format conversation for training"""
        system_prompt = """You are a legal assistant that uses retrieved context and picks appropriate tools.
You have access to legal documents, case law, and analytical tools."""

        user_msg = conv.get("user", conv.get("question", ""))
        context = conv.get("context", conv.get("retrieved_chunks", ""))
        assistant_response = conv.get("assistant", conv.get("response", ""))

        # Handle tool calls if present
        tools_used = conv.get("tools", [])

        formatted = f"<|system|>\n{system_prompt}\n\n"
        formatted += f"<|user|>\nQuestion: {user_msg}\n\n"
        if context:
            formatted += f"Context:\n{context}\n\n"
        formatted += f"<|assistant|>\n{assistant_response}"

        if tools_used:
            formatted += f"\n\nTools used: {', '.join(tools_used)}"

        return formatted

    def tokenize_function(self, examples):
        """Tokenize examples for training"""
        return self.tokenizer(
            examples["text"],
            truncation=True,
            padding="max_length",
            max_length=2048,
        )

    def train(
        self,
        train_dataset: Dataset,
        num_epochs: int = 3,
        batch_size: int = 4,
        gradient_accumulation_steps: int = 4,
        learning_rate: float = 2e-4,
        save_steps: int = 500
    ):
        """Run QLoRA training"""
        # Tokenize dataset
        tokenized_dataset = train_dataset.map(
            self.tokenize_function,
            batched=True,
            remove_columns=["text"]
        )

        # Training arguments
        training_args = TrainingArguments(
            output_dir=self.output_dir,
            num_train_epochs=num_epochs,
            per_device_train_batch_size=batch_size,
            gradient_accumulation_steps=gradient_accumulation_steps,
            learning_rate=learning_rate,
            fp16=True,
            logging_steps=10,
            save_steps=save_steps,
            save_total_limit=3,
            load_best_model_at_end=True,
            evaluation_strategy="steps",
            eval_steps=save_steps,
            warmup_steps=100,
            report_to="none",  # Disable wandb/tensorboard
        )

        # Data collator
        data_collator = DataCollatorForLanguageModeling(
            tokenizer=self.tokenizer,
            mlm=False
        )

        # Trainer
        trainer = Trainer(
            model=self.peft_model,
            args=training_args,
            train_dataset=tokenized_dataset,
            data_collator=data_collator,
        )

        logger.info("Starting QLoRA training...")
        trainer.train()

        # Save the fine-tuned model
        trainer.save_model(self.output_dir)
        self.tokenizer.save_pretrained(self.output_dir)

        logger.info(f"Model saved to {self.output_dir}")

    def generate_legal_response(
        self,
        question: str,
        context: str = "",
        tools_available: List[str] = None,
        max_length: int = 512
    ) -> str:
        """Generate response using fine-tuned model"""
        if tools_available is None:
            tools_available = ["search_legal_docs", "analyze_contract", "check_case_law"]

        prompt = f"""<|system|>
You are a legal assistant with access to retrieved documents and analytical tools.
Available tools: {', '.join(tools_available)}

<|user|>
Question: {question}
{f'Context: {context}' if context else ''}

<|assistant|>"""

        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.peft_model.device)

        with torch.no_grad():
            outputs = self.peft_model.generate(
                **inputs,
                max_length=max_length,
                temperature=0.7,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id
            )

        response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        return response.split("<|assistant|>")[-1].strip()

    def save_adapter(self, path: str):
        """Save only the LoRA adapter weights"""
        self.peft_model.save_pretrained(path)
        logger.info(f"LoRA adapter saved to {path}")

    def load_adapter(self, path: str):
        """Load LoRA adapter weights"""
        from peft import PeftModel
        self.peft_model = PeftModel.from_pretrained(self.model, path)
        logger.info(f"LoRA adapter loaded from {path}")


def create_legal_training_data_example(output_file: str = "legal_training_data.jsonl"):
    """Create example training data for legal QLoRA fine-tuning"""
    examples = [
        {
            "user": "What are the key elements of a valid contract?",
            "context": "A contract is a legally binding agreement between two or more parties...",
            "assistant": "A valid contract requires: 1) Offer and acceptance, 2) Consideration, 3) Legal capacity, 4) Legal purpose, and 5) Mutual assent.",
            "tools": ["search_legal_docs"]
        },
        {
            "user": "Can an employee be fired for discussing wages with coworkers?",
            "context": "Under the National Labor Relations Act, employees have the right to discuss wages...",
            "assistant": "No, employees cannot be fired for discussing wages with coworkers. This is protected concerted activity under Section 7 of the NLRA.",
            "tools": ["check_case_law", "analyze_contract"]
        },
        {
            "user": "What is the statute of limitations for breach of contract in California?",
            "context": "California Civil Code section 339 states that actions for breach of contract must be brought within 4 years...",
            "assistant": "In California, the statute of limitations for breach of contract is generally 4 years from the date the contract was breached (Civil Code §339).",
            "tools": ["search_legal_docs"]
        }
    ]

    with open(output_file, 'w') as f:
        for example in examples:
            f.write(json.dumps(example) + '\n')

    logger.info(f"Example training data saved to {output_file}")


if __name__ == "__main__":
    # Example usage
    finetuner = LegalQLoRAFinetuner(
        model_name="google/gemma-2b",  # Replace with your Gemma3 checkpoint
        output_dir="./legal-gemma-qlora"
    )

    # Load model and setup LoRA
    finetuner.load_model_and_tokenizer()
    finetuner.setup_lora_config(r=16, alpha=32)

    # Create example training data
    create_legal_training_data_example()

    # Load and prepare dataset
    dataset = finetuner.prepare_legal_dataset("legal_training_data.jsonl")

    # Train (uncomment when you have real data)
    # finetuner.train(dataset, num_epochs=3, batch_size=2)

    # Example inference
    response = finetuner.generate_legal_response(
        "What are the requirements for a valid will?",
        "A will is a legal document that expresses a person's wishes..."
    )
    print("Generated response:", response)

    # Save adapter
    # finetuner.save_adapter("./legal-qlora-adapter")