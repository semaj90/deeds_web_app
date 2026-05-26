# Optimized LangExtract Service

Memory-efficient legal document extraction service.

## Memory Comparison

| Component | Original | Optimized | Savings |
|-----------|----------|-----------|---------|
| spaCy model | `en_core_web_trf` (500MB) | `en_core_web_md` (40MB) | **460MB** |
| BERT NER | HuggingFace in-process (400MB) | Uses Ollama (shared) | **400MB** |
| EasyOCR | In-process (100MB+) | Removed (use tesseract.js) | **100MB** |
| PyTorch | Full runtime (50MB) | Minimal | **30MB** |
| **Total RAM** | **~1GB** | **~200-300MB** | **70% reduction** |

## Changes

1. **Smaller spaCy Model**: Uses `en_core_web_md` (medium, 40MB) instead of `en_core_web_trf` (transformer, 500MB). Slightly lower accuracy but 10x smaller.

2. **Ollama-based NER**: Instead of loading a separate BERT model, NER can use your existing Ollama `gemma4-rotorquant:latest` instance via HTTP. Pass `use_ollama_ner: true` in requests for higher quality.

3. **Lazy Model Loading**: spaCy model loads on first request, not at startup. Faster cold starts.

4. **Removed EasyOCR**: Use `tesseract.js` on the SvelteKit side or the `docling-vlm` service for OCR.

5. **Regex-based Entity Extraction**: Instant extraction of dates, money, citations, case references using compiled regex patterns.

## Usage

### Build and Run
```bash
cd docker/langextract-optimized
docker build -t deeds-langextract-optimized:latest .
docker run -d -p 8095:8095 --name langextract-optimized \
    -e OLLAMA_URL=http://host.docker.internal:11434 \
    --memory=512m \
    deeds-langextract-optimized:latest
```

### Or use the script
```bash
docker\langextract-optimized\build-and-run.bat
```

### API Endpoints

```bash
# Health check
curl http://localhost:8095/health

# Extract entities + structure (uses spaCy)
curl -X POST http://localhost:8095/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "Contract between ACME Corp and John Doe dated January 15, 2025 for $50,000.", "document_type": "legal"}'

# Extract with Ollama NER (higher quality, slower)
curl -X POST http://localhost:8095/analyze \
  -H "Content-Type: application/json" \
  -d '{"content": "...", "use_ollama_ner": true}'
```

### Response Example
```json
{
  "document_id": "doc_1710534123456",
  "structure": {
    "basic_stats": { "word_count": 15, "sentence_count": 1 },
    "contract_type": "service",
    "legal_elements": { "has_signature": false, "clause_count": 0 }
  },
  "entities": [
    { "text": "ACME Corp", "label": "ORG", "source": "spacy" },
    { "text": "January 15, 2025", "label": "DATE", "source": "regex" },
    { "text": "$50,000", "label": "MONEY", "source": "regex" }
  ],
  "processing_time": 0.042
}
```

## Configuration

| Env Variable | Default | Description |
|--------------|---------|-------------|
| `OLLAMA_URL` | `http://host.docker.internal:11434` | Ollama API URL |
| `SPACY_MODEL` | `en_core_web_md` | spaCy model to load |
| `ENABLE_SPACY` | `true` | Load spaCy at all |

## Switching from Original

1. Stop old container: `docker stop phase66-langextract`
2. Run build script: `docker\langextract-optimized\build-and-run.bat`
3. Verify: `curl http://localhost:8095/health`

The API is compatible — existing `/analyze` and `/extract` endpoints work the same.
