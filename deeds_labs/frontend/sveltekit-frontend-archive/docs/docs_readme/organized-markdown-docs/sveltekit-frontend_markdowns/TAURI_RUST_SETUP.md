# Tauri + Rust Configuration for Local LLM Integration

# Example configuration files for setting up rust-bert with legal-bert models

## 1. Cargo.toml Configuration

```toml
[package]
name = "legal-ai-backend"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2.0", features = ["api-all"] }
tauri-build = { version = "2.0", features = ["shell-scope"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1.0", features = ["full"] }
once_cell = "1.19"
anyhow = "1.0"

# ML/AI Dependencies
rust-bert = "0.22.0"
tch = "0.14.0"
candle-core = "0.4.1"
candle-nn = "0.4.1"
candle-transformers = "0.4.1"

# Async runtime
async-trait = "0.1"

# Logging
log = "0.4"
env_logger = "0.10"

[build-dependencies]
tauri-build = { version = "2.0", features = ["shell-scope"] }
```

## 2. Rust Main File (src-tauri/src/main.rs)

```rust
// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use rust_bert::pipelines::sentence_embeddings::{
    SentenceEmbeddingsBuilder, SentenceEmbeddingsModel,
};
use rust_bert::pipelines::text_classification::{
    TextClassificationModel, TextClassificationBuilder,
};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use anyhow::Result;

// Model registry for managing multiple models
type ModelRegistry = Arc<Mutex<HashMap<String, ModelWrapper>>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalModel {
    pub id: String,
    pub name: String,
    pub model_type: String, // "embedding", "chat", "classification"
    pub domain: String,     // "general", "legal", "medical"
    pub architecture: String, // "bert", "legal-bert", "llama"
    pub dimensions: Option<usize>,
    pub max_tokens: Option<usize>,
    pub is_loaded: bool,
    pub memory_usage: Option<usize>,
}

pub enum ModelWrapper {
    Embedding(SentenceEmbeddingsModel),
    Classification(TextClassificationModel),
    // Add other model types as needed
}

// Global model registry
static MODEL_REGISTRY: Lazy<ModelRegistry> = Lazy::new(|| {
    Arc::new(Mutex::new(HashMap::new()))
});

// Available models configuration
static AVAILABLE_MODELS: Lazy<Vec<LocalModel>> = Lazy::new(|| {
    vec![
        LocalModel {
            id: "legal-bert-embedding".to_string(),
            name: "Legal BERT Embeddings".to_string(),
            model_type: "embedding".to_string(),
            domain: "legal".to_string(),
            architecture: "legal-bert".to_string(),
            dimensions: Some(768),
            max_tokens: Some(512),
            is_loaded: false,
            memory_usage: None,
        },
        LocalModel {
            id: "legal-bert-classifier".to_string(),
            name: "Legal Document Classifier".to_string(),
            model_type: "classification".to_string(),
            domain: "legal".to_string(),
            architecture: "legal-bert".to_string(),
            dimensions: None,
            max_tokens: Some(512),
            is_loaded: false,
            memory_usage: None,
        },
        // Add more models as needed
    ]
});

#[derive(Serialize, Deserialize)]
pub struct EmbeddingOptions {
    pub batch_size: Option<usize>,
    pub normalize: Option<bool>,
    pub pooling_strategy: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct InferenceOptions {
    pub temperature: Option<f32>,
    pub max_tokens: Option<usize>,
    pub top_p: Option<f32>,
    pub top_k: Option<usize>,
}

#[derive(Serialize, Deserialize)]
pub struct BatchDocument {
    pub id: String,
    pub text: String,
}

#[derive(Serialize, Deserialize)]
pub struct BatchResult {
    pub id: String,
    pub embedding: Option<Vec<f32>>,
    pub classification: Option<serde_json::Value>,
    pub summary: Option<String>,
    pub error: Option<String>,
}

// Tauri commands
#[tauri::command]
async fn list_llm_models() -> Result<Vec<LocalModel>, String> {
    Ok(AVAILABLE_MODELS.clone())
}

#[tauri::command]
async fn load_model(model_id: String) -> Result<bool, String> {
    let model_config = AVAILABLE_MODELS
        .iter()
        .find(|m| m.id == model_id)
        .ok_or_else(|| format!("Model {} not found", model_id))?;

    match model_config.model_type.as_str() {
        "embedding" => load_embedding_model(&model_id, &model_config.architecture).await,
        "classification" => load_classification_model(&model_id, &model_config.architecture).await,
        _ => Err(format!("Unsupported model type: {}", model_config.model_type)),
    }
}

#[tauri::command]
async fn generate_embedding(
    model_id: String,
    text: Vec<String>,
    options: Option<EmbeddingOptions>,
) -> Result<Vec<Vec<f32>>, String> {
    let registry = MODEL_REGISTRY.lock().map_err(|e| e.to_string())?;

    if let Some(ModelWrapper::Embedding(model)) = registry.get(&model_id) {
        let sentences: Vec<&str> = text.iter().map(|s| s.as_str()).collect();

        model.encode(&sentences)
            .map_err(|e| format!("Embedding generation failed: {}", e))
    } else {
        Err(format!("Embedding model {} not loaded", model_id))
    }
}

#[tauri::command]
async fn classify_legal_document(
    model_id: String,
    text: String,
) -> Result<serde_json::Value, String> {
    let registry = MODEL_REGISTRY.lock().map_err(|e| e.to_string())?;

    if let Some(ModelWrapper::Classification(model)) = registry.get(&model_id) {
        let result = model.predict(&[text])
            .map_err(|e| format!("Classification failed: {}", e))?;

        Ok(serde_json::to_value(result).unwrap_or_default())
    } else {
        Err(format!("Classification model {} not loaded", model_id))
    }
}

#[tauri::command]
async fn calculate_cosine_similarity(
    vector1: Vec<f32>,
    vector2: Vec<f32>,
) -> Result<f32, String> {
    if vector1.len() != vector2.len() {
        return Err("Vectors must have the same length".to_string());
    }

    let dot_product: f32 = vector1.iter().zip(vector2.iter()).map(|(a, b)| a * b).sum();
    let norm1: f32 = vector1.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm2: f32 = vector2.iter().map(|x| x * x).sum::<f32>().sqrt();

    if norm1 == 0.0 || norm2 == 0.0 {
        return Ok(0.0);
    }

    Ok(dot_product / (norm1 * norm2))
}

#[tauri::command]
async fn batch_process_documents(
    documents: Vec<BatchDocument>,
    operations: Vec<String>,
    embedding_model_id: Option<String>,
    chat_model_id: Option<String>,
) -> Result<Vec<BatchResult>, String> {
    let mut results = Vec::new();

    for doc in documents {
        let mut result = BatchResult {
            id: doc.id.clone(),
            embedding: None,
            classification: None,
            summary: None,
            error: None,
        };

        // Generate embedding if requested
        if operations.contains(&"embed".to_string()) {
            if let Some(ref model_id) = embedding_model_id {
                match generate_embedding(model_id.clone(), vec![doc.text.clone()], None).await {
                    Ok(embeddings) => result.embedding = embeddings.first().cloned(),
                    Err(e) => result.error = Some(format!("Embedding failed: {}", e)),
                }
            }
        }

        // Classify if requested
        if operations.contains(&"classify".to_string()) {
            if let Some(ref model_id) = embedding_model_id {
                match classify_legal_document(model_id.clone(), doc.text.clone()).await {
                    Ok(classification) => result.classification = Some(classification),
                    Err(e) => result.error = Some(format!("Classification failed: {}", e)),
                }
            }
        }

        results.push(result);
    }

    Ok(results)
}

#[tauri::command]
async fn get_model_metrics(model_id: String) -> Result<serde_json::Value, String> {
    // Implementation would track actual metrics
    // This is a placeholder
    Ok(serde_json::json!({
        "memory_usage": 512000000, // bytes
        "inference_time": 50,      // ms
        "tokens_per_second": 100,
        "accuracy": 0.95
    }))
}

#[tauri::command]
async fn unload_model(model_id: String) -> Result<bool, String> {
    let mut registry = MODEL_REGISTRY.lock().map_err(|e| e.to_string())?;

    if registry.remove(&model_id).is_some() {
        Ok(true)
    } else {
        Ok(false)
    }
}

// Helper functions
async fn load_embedding_model(model_id: &str, architecture: &str) -> Result<bool, String> {
    let model_path = get_model_path(model_id, architecture)?;

    let model = SentenceEmbeddingsBuilder::local(&model_path)
        .with_device(tch::Device::Cpu) // Use GPU if available: tch::Device::cuda_if_available()
        .create_model()
        .map_err(|e| format!("Failed to load embedding model: {}", e))?;

    let mut registry = MODEL_REGISTRY.lock().map_err(|e| e.to_string())?;
    registry.insert(model_id.to_string(), ModelWrapper::Embedding(model));

    Ok(true)
}

async fn load_classification_model(model_id: &str, architecture: &str) -> Result<bool, String> {
    let model_path = get_model_path(model_id, architecture)?;

    let model = TextClassificationBuilder::local(&model_path)
        .with_device(tch::Device::Cpu)
        .create_model()
        .map_err(|e| format!("Failed to load classification model: {}", e))?;

    let mut registry = MODEL_REGISTRY.lock().map_err(|e| e.to_string())?;
    registry.insert(model_id.to_string(), ModelWrapper::Classification(model));

    Ok(true)
}

fn get_model_path(model_id: &str, architecture: &str) -> Result<String, String> {
    // Define model paths based on architecture
    match architecture {
        "legal-bert" => match model_id {
            "legal-bert-embedding" => Ok("models/legal-bert-base-uncased".to_string()),
            "legal-bert-classifier" => Ok("models/legal-bert-classifier".to_string()),
            _ => Err(format!("Unknown legal-bert model: {}", model_id)),
        },
        "bert" => Ok("models/bert-base-uncased".to_string()),
        _ => Err(format!("Unsupported architecture: {}", architecture)),
    }
}

fn main() {
    env_logger::init();

    // Pre-load critical models on startup (optional)
    tauri::async_runtime::spawn(async {
        log::info!("Pre-loading critical models...");
        if let Err(e) = load_model("legal-bert-embedding".to_string()).await {
            log::warn!("Failed to pre-load legal-bert-embedding: {}", e);
        }
    });

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            list_llm_models,
            load_model,
            generate_embedding,
            classify_legal_document,
            calculate_cosine_similarity,
            batch_process_documents,
            get_model_metrics,
            unload_model
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

## 3. Model Setup Instructions

### Download Legal-BERT Models

```bash
# Create models directory
mkdir -p src-tauri/models

# Download legal-bert-base-uncased
git clone https://huggingface.co/nlpaueb/legal-bert-base-uncased src-tauri/models/legal-bert-base-uncased

# Convert to rust-bert format (if needed)
python scripts/convert_model.py --input models/legal-bert-base-uncased --output models/legal-bert-base-uncased
```

### Tauri Configuration (src-tauri/tauri.conf.json)

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devPath": "http://localhost:5173",
    "distDir": "../dist",
    "withGlobalTauri": false
  },
  "package": {
    "productName": "Legal AI Assistant",
    "version": "0.1.0"
  },
  "tauri": {
    "allowlist": {
      "all": false,
      "shell": {
        "all": false,
        "open": true
      }
    },
    "bundle": {
      "active": true,
      "targets": "all",
      "identifier": "com.legal.ai.assistant",
      "icon": [
        "icons/32x32.png",
        "icons/128x128.png",
        "icons/icon.icns",
        "icons/icon.ico"
      ],
      "resources": ["models/**/*"],
      "category": "Productivity",
      "shortDescription": "AI-powered legal case management",
      "longDescription": "Production-ready legal case management system with local AI capabilities"
    },
    "security": {
      "csp": null
    },
    "windows": [
      {
        "fullscreen": false,
        "resizable": true,
        "title": "Legal AI Assistant",
        "width": 1200,
        "height": 800
      }
    ]
  }
}
```

## 4. Environment Setup

### Development Setup

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install Tauri CLI
cargo install tauri-cli --version "^2.0.0"

# Install LibTorch (required for rust-bert)
# Linux/macOS:
wget https://download.pytorch.org/libtorch/cpu/libtorch-shared-with-deps-latest.zip
unzip libtorch-shared-with-deps-latest.zip
export LIBTORCH=$(pwd)/libtorch
export LD_LIBRARY_PATH=${LIBTORCH}/lib:$LD_LIBRARY_PATH

# Windows: Download and extract LibTorch, set TORCH_LIB_PATH environment variable
```

### Model Conversion Script (scripts/convert_model.py)

```python
#!/usr/bin/env python3
"""
Convert Hugging Face models to rust-bert format
"""
import torch
import argparse
from transformers import AutoModel, AutoTokenizer

def convert_model(input_path, output_path):
    # Load model and tokenizer
    model = AutoModel.from_pretrained(input_path)
    tokenizer = AutoTokenizer.from_pretrained(input_path)

    # Convert to TorchScript
    model.eval()
    traced_model = torch.jit.trace(model, torch.randint(0, 1000, (1, 512)))

    # Save in rust-bert compatible format
    traced_model.save(f"{output_path}/rust_model.pt")
    tokenizer.save_pretrained(output_path)

    print(f"Model converted and saved to {output_path}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Input model path")
    parser.add_argument("--output", required=True, help="Output path")
    args = parser.parse_args()

    convert_model(args.input, args.output)
```

## 5. Integration with SvelteKit

The Tauri service integrates seamlessly with your existing RAG system through the enhanced AI service we created. The system will automatically:

1. **Detect Tauri Environment**: Check if running in desktop app vs web
2. **Model Selection**: Prefer local legal-BERT for legal documents
3. **Fallback Gracefully**: Use cloud APIs when local models unavailable
4. **Cache Results**: Store embeddings and responses for performance
5. **Background Sync**: Keep PostgreSQL and Qdrant in sync with local analysis

This gives you the best of both worlds: privacy-focused local AI with cloud fallbacks for reliability.
