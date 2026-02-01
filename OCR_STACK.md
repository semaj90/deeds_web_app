# OCR & Text Extraction Stack

## ✅ Active Services

### **IBM Docling** (Primary OCR)
- **Model**: IBM Docling 2.5.8 ONNX
- **Acceleration**: Triton TensorRT engine conversion
- **LLM**: Ollama for text processing
- **Location**: `sveltekit-frontend/python/docling_analyze.py`
- **Use Case**: PDF layout extraction with GPU acceleration

### **Tesseract** (CPU Fallback)
- **Version**: Latest via pytesseract
- **Location**: `ocr_pipeline/ocr_pipeline.py`
- **Config**: `--oem 3 --psm 6`
- **Use Case**: Backup OCR when GPU unavailable

### **YOLO** (Object Detection)
- **Model**: YOLOv8n
- **Location**: `tests/test_phase8_visual_context.py`
- **Use Case**: Visual context enhancement

### **Python langextract** (Entity Extraction)
- **Type**: Granite-Docling DocTags hybrid chunker
- **Location**: `backend/chunker_langextract.py`
- **Features**: Layout-aware semantic chunking

## ⚡ Performance Tools

### **ripgrep** (Text Search) - FASTEST
```bash
rg "pattern" --type py  # 500 MB/s, parallelized
```

### **awk** (Structured Text)
```bash
awk '/pattern/ {print $1}' file.txt  # 30 MB/s
```

## 🔧 Architecture

```
PDF/Image
    ↓
IBM Docling (GPU via Triton)
    ↓
langextract (Python)
    ↓
Chunking → Embeddings (Ollama)
    ↓
Qdrant Vector DB
```

### Fallback Chain:
```
Docling (GPU) → Tesseract (CPU) → Text extraction
```

## ❌ Deprecated (Removed)

- ~~Surya OCR~~ - All references in old backups only
- ~~langextract-go~~ - Unused submodule (gitignored)

## 🚀 Future Optimizations

1. **FAISS-GPU** for batch embeddings (100x faster)
2. **CuPy** for GPU-accelerated numpy operations
3. **Rapids cuML** for CUDA clustering
