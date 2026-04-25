# Ollama Models Inventory (September 16, 2025)
## Current Available Models

### 🚀 **MAIN GPU SERVER MODEL** (Production TensorRT-LLM)
- **gemma3-legal:latest**
  - ID: add10d58fb30
  - Size: 7.3 GB
  - Modified: 9 days ago
  - **Purpose**: Main server-side model for TensorRT-LLM production inference
  - **Integration**: SvelteKit 2 + Svelte 5 + PostgreSQL + pgvector + Drizzle ORM
  - **Target Performance**: <1ms inference with Q4_K_M quantization

### 🎯 Student Model (Client-side WebAssembly)
- **gemma3:270m**
  - ID: e7d36fb2c3b3
  - Size: 291 MB
  - Modified: 3 days ago
  - **Purpose**: Client-side inference for offline capabilities
  - **Target**: Expand to 350MB with distilled legal knowledge

### 🔤 Embedding Models
- **embeddinggemma:latest**
  - ID: 85462619ee72
  - Size: 621 MB
  - Modified: 8 days ago
  - **Purpose**: Document embeddings for pgvector similarity search
  - **Integration**: Drizzle ORM vector queries

- **nomic-embed-text:latest**
  - ID: 0a109f422b47
  - Size: 274 MB
  - Modified: 9 days ago
  - **Purpose**: Text embeddings for semantic search
  - **Integration**: PostgreSQL pgvector HNSW indexing## Knowledge Distillation Pipeline Strategy

### Option 1: Download Large Legal Model
```bash
# If gemma3-legal exists on Ollama registry
ollama pull gemma3-legal:latest

# Or download a large base model for legal fine-tuning
ollama pull gemma3:7b  # Use as teacher candidate
```

### Option 2: Use Available Models
```bash
# Teacher: embeddinggemma:latest (621MB)
# Student: gemma3:270m (291MB)
# Method: Embedding knowledge transfer + legal domain adaptation
```

### Option 3: Create Legal Teacher Model
```bash
# Fine-tune gemma3:7b with legal documents
# Then distill to gemma3:270m for production efficiency
```

## TensorRT Conversion Pipeline
All models will be converted to optimized .plan engines for <1ms inference:

1. **gemma3:270m** → `gemma3-270m-legal.plan`
2. **embeddinggemma:latest** → `embeddinggemma-legal.plan`
3. **nomic-embed-text:latest** → `nomic-embed-legal.plan`
4. **gemma3-legal:latest** → `gemma3-legal-q4km.plan` (teacher, when available)

## Next Steps
1. ✅ Models inventoried
2. 🔄 Download/create teacher model
3. 🔄 Validate engine paths
4. 🔄 Deploy TensorRT container
5. 🔄 Implement knowledge distillation