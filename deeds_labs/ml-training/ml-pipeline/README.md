# Phase 46: ML Pipeline for Unsloth Training

This pipeline processes your modern web development codebase (SvelteKit 2, Svelte 5, bits-ui v2, TypeScript, WebGPU, CUDA, C++) into training data for fine-tuning an LLM with Unsloth.

## Overview

The pipeline consists of 5 main stages:

1. **AST Extraction** - Parse source code into Abstract Syntax Trees
2. **Embedding Generation** - Create vector embeddings using EmbeddingGemma
3. **Clustering & Deduplication** - Group similar code and remove duplicates
4. **Dataset Building** - Format data for Unsloth training
5. **Web Scraping** - Supplement with documentation and examples

## Quick Start

### Prerequisites

1. **Python 3.12+** with pip
2. **Qdrant vector database** running locally:
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```
3. **EmbeddingGemma model** (automatically downloaded)

### Installation

```bash
cd ml-pipeline
pip install -r requirements.txt
```

### Run Complete Pipeline

```bash
python run_pipeline.py
```

This will process your codebase and generate `outputs/final_training_dataset.jsonl` ready for Unsloth training.

## Manual Step-by-Step Execution

### 1. AST Extraction

Extract AST data from your source code:

```bash
python ast_extractor/extract_ast_graph.py ../sveltekit-frontend outputs/ast_data.jsonl
```

### 2. Build Embeddings

Generate embeddings for clustering:

```bash
python embeddings/build_embedding_index.py outputs/ast_data.jsonl outputs/embeddings_data.jsonl
```

### 3. Clustering & Deduplication

Group similar code and remove duplicates:

```bash
python clustering/dedup_and_cluster.py outputs/embeddings_data.jsonl outputs/clustered_data.jsonl
```

### 4. Build Training Dataset

Format data for Unsloth:

```bash
python dataset_builder/build_training_jsonl.py outputs/clustered_data.jsonl outputs/training_dataset.jsonl
```

### 5. Web Scraping (Optional)

Add documentation examples:

```bash
python web_scraper/scrape_docs_to_jsonl.py outputs/web_scraped_data.jsonl
```

## Unsloth Training

Once you have the training dataset, use it with Unsloth:

```python
from unsloth import FastLanguageModel
import json

# Load your training data
with open("ml-pipeline/outputs/final_training_dataset.jsonl", "r") as f:
    data = [json.loads(line) for line in f]

# Format for Unsloth (instruction tuning)
formatted_data = []
for item in data:
    formatted_data.append({
        "instruction": item["instruction"],
        "input": item.get("input", ""),
        "output": item["output"]
    })

# Train with Unsloth
model, tokenizer = FastLanguageModel.from_pretrained("unsloth/gemma-3-4b-it")
# ... configure training ...
# trainer = Trainer(model=model, ...)
# trainer.train()
```

## Pipeline Components

### AST Extractor (`ast_extractor/`)

- **Input**: Source code directory
- **Output**: JSONL with AST nodes, functions, classes, imports
- **Languages**: TypeScript, JavaScript, Svelte, CUDA, C++

### Embedding Builder (`embeddings/`)

- **Model**: EmbeddingGemma-300m (384D embeddings)
- **Storage**: Qdrant vector database
- **Features**: Batch processing, chunk extraction

### Clustering (`clustering/`)

- **Deduplication**: Cosine similarity threshold (0.95)
- **Clustering**: DBSCAN (eps=0.3, min_samples=3)
- **Output**: Clustered code groups

### Dataset Builder (`dataset_builder/`)

- **Templates**: Instruction-response format
- **Types**: Functions, classes, components, CUDA kernels
- **Features**: Agentic examples, multi-language support

### Web Scraper (`web_scraper/`)

- **Targets**: Svelte, TypeScript, WebGPU, CUDA documentation
- **Features**: Static and dynamic content scraping
- **Output**: Additional training examples

## Configuration

### Environment Variables

```bash
# Qdrant configuration
export QDRANT_URL=http://localhost:6333

# Embedding model
export EMBEDDING_MODEL=google/embeddinggemma-300m

# Pipeline settings
export BATCH_SIZE=1000
export SIMILARITY_THRESHOLD=0.95
```

### Customization

Edit the scripts to:
- Add new language parsers in `ast_extractor/`
- Modify embedding models in `embeddings/`
- Adjust clustering parameters in `clustering/`
- Add new instruction templates in `dataset_builder/`

## Output Files

All outputs are saved to `ml-pipeline/outputs/`:

- `ast_data.jsonl` - Raw AST extraction
- `embeddings_data.jsonl` - Vector embeddings
- `clustered_data.jsonl` - Deduplicated clusters
- `training_dataset.jsonl` - Unsloth-formatted data
- `web_scraped_data.jsonl` - Web documentation data
- `final_training_dataset.jsonl` - Merged dataset
- `pipeline_report.json` - Execution statistics

## Troubleshooting

### Common Issues

1. **Qdrant Connection Failed**
   ```bash
   docker run -p 6333:6333 qdrant/qdrant
   ```

2. **Embedding Model Download**
   - Ensure internet connection
   - Model downloads automatically on first run

3. **Memory Issues**
   - Reduce batch sizes in scripts
   - Process smaller codebases first

4. **Web Scraping Failures**
   - Some sites block scraping
   - Pipeline continues without web data

### Performance Tuning

- **Large Codebases**: Increase batch sizes, use GPU
- **Memory**: Reduce `BATCH_SIZE` in embedding scripts
- **Speed**: Use SSD storage for Qdrant

## Architecture

```
Source Code ──► AST Extraction ──► Embeddings ──► Clustering ──► Dataset ──► Unsloth Training
     │               │                   │             │             │
     └─ TypeScript   └─ JSONL            └─ Qdrant     └─ DBSCAN     └─ JSONL
       Svelte          nodes/functions      vectors       dedup         instructions
       CUDA
       C++
```

## Contributing

1. Add new language support in `ast_extractor/`
2. Improve embedding quality in `embeddings/`
3. Enhance clustering algorithms in `clustering/`
4. Add more instruction templates in `dataset_builder/`

## License

This pipeline is part of the legal AI codebase processing system.