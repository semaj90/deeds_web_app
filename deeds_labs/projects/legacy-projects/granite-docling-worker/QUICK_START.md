# Granite-Docling Worker: Quick Start Guide
**Using Existing Infrastructure - No Rebuild Required**

---

## ✅ Pre-Flight Check (30 seconds)

### 1. Verify Docker Containers Running
```powershell
# Check PostgreSQL (should be UP)
docker ps --filter "name=phase66-postgres"

# Check Redis (should be UP)
docker ps --filter "name=phase66-redis"

# Check Qdrant (should be UP)
docker ps --filter "name=qdrant"

# If any container is stopped, start it:
docker start phase66-postgres
docker start phase66-redis
docker start qdrant
```

**Expected Output**:
```
phase66-postgres   Up X minutes   5434/tcp
phase66-redis      Up X minutes   6379/tcp
qdrant            Up X minutes   6333/tcp
```

### 2. Verify Qdrant Collections
```powershell
curl -s http://localhost:6333/collections | ConvertFrom-Json | Select-Object -ExpandProperty result | Select-Object -ExpandProperty collections | Select-Object -ExpandProperty name | Select-String "phase"
```

**Expected**: 24 phase collections including:
- `phase94_knowledge_graph`
- `phase95_dag_nodes`
- `phase89_cache_index`

### 3. Verify PostgreSQL Schema
```powershell
docker exec phase66-postgres psql -U user -d legal -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'phase%' ORDER BY table_name;"
```

**Expected**: 21 phase tables including `knowledge_cards`, `phase89_qdrant_events`

---

## 🚀 Priority 1: Test Existing Granite Docling Parser (5 minutes)

### Step 1: Activate Python Environment
```powershell
cd C:\Users\james\Videos\deeds-web-app
& .venv\Scripts\Activate.ps1
```

### Step 2: Test Granite Model Loading
```powershell
python -c "from python_codebase.document_processing.granite_docling_parser import GraniteDoclingParser; parser = GraniteDoclingParser(device='cuda'); print('✅ Model loaded:', parser.get_model_info())"
```

**Expected Output**:
```
✅ Model loaded: {'model': 'ibm-granite/granite-docling-258m', 'device': 'cuda', 'dtype': 'bfloat16'}
```

### Step 3: Test Document Processing (Sample PDF)
```powershell
# Create test script
@"
from python_codebase.document_processing.granite_docling_parser import GraniteDoclingParser
import time

parser = GraniteDoclingParser(device='cuda')
print('📄 Processing sample document...')

# Test with a sample PDF (replace with actual file)
start = time.time()
result = parser.parse_document('path/to/sample.pdf')
elapsed = time.time() - start

print(f'✅ Processed in {elapsed:.2f}s')
print(f'Pages: {len(result.get(\"pages\", []))}')
print(f'Tables: {len(result.get(\"tables\", []))}')
print(f'DocTags: {result.get(\"doc_tags\", \"N/A\")[:200]}...')
"@ | Out-File -FilePath test_granite.py -Encoding UTF8

python test_granite.py
```

---

## 🔌 Priority 2: Test End-to-End Pipeline (10 minutes)

### Step 1: Test MinIO Connection
```powershell
docker exec phase66-postgres psql -U user -d legal -c "SELECT COUNT(*) FROM raw_error_embeddings WHERE source = 'minio';"
```

### Step 2: Test Redis Caching
```powershell
docker exec phase66-redis redis-cli PING
docker exec phase66-redis redis-cli DBSIZE
docker exec phase66-redis redis-cli KEYS "ocr:*" | head -5
```

**Expected**: PONG, key count, sample OCR cache keys

### Step 3: Test OCR Worker Pipeline
```powershell
cd C:\Users\james\Videos\deeds-web-app\backend\workers

# Run OCR chunk worker on sample file
python ocr_chunk_worker.py --help

# Process a test document (dry-run mode)
python ocr_chunk_worker.py --input "sample.pdf" --dry-run --verbose
```

**Pipeline Flow**:
```
Sample PDF → Granite Docling (GPU) → LangExtract Chunking → MinIO Upload → Redis Cache
```

### Step 4: Verify Qdrant Indexing
```powershell
# Check if vectors were created
curl -s http://localhost:6333/collections/phase95_dag_nodes | ConvertFrom-Json | Select-Object -ExpandProperty result | Select-Object points_count, vectors_count
```

---

## 🧠 Priority 3: Test ACE Synthesis Loop (5 minutes)

### Step 1: Query Knowledge Cards
```powershell
docker exec phase66-postgres psql -U user -d legal -c "SELECT card_id, question, validated FROM knowledge_cards ORDER BY created_at DESC LIMIT 5;"
```

### Step 2: Test ACE Synthesis
```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

# Run ACE synthesis with sample query
python scripts/phase94-ace-synthesis-loop.py --query "How do Svelte 5 runes work?" --verbose
```

**Expected Output**:
```
🔍 Searching knowledge graph...
📚 Found 3 relevant context chunks
🤖 Generating answer with Gemma3...
✅ Answer validated with 0.87 confidence
💾 Stored in knowledge_cards table
```

### Step 3: Verify Knowledge Card Created
```powershell
docker exec phase66-postgres psql -U user -d legal -c "SELECT question, confidence, validated FROM knowledge_cards WHERE question LIKE '%runes%';"
```

---

## 📊 Priority 4: Test Phase 95 DAG Pipeline (10 minutes)

### Step 1: Run Docling Context Extractor
```powershell
cd C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

# Process document with DAG topology
python scripts/phase95-docling-context-extractor.py --input "sample.pdf" --use-dag --verbose
```

**Expected Flow**:
```
1. Granite Docling → Extract pages, tables, images
2. Create DAG nodes (DOCUMENT, SECTION, CHUNK, IMAGE)
3. Create DAG edges (DERIVES_FROM, CONTAINS, REFERENCES)
4. Store in Qdrant (phase95_dag_nodes, phase95_dag_edges)
5. Generate embeddings with gemma3-legal
```

### Step 2: Query DAG with Topological Sorting
```powershell
# Test DAG query (uses Kahn's algorithm)
python scripts/phase95-docling-dag.py --query "Explain the document structure" --use-topological --verbose
```

**Expected**:
```
🔍 Building DAG from Qdrant...
📊 Found 45 nodes, 78 edges
🧮 Topological sort complete (no cycles detected)
🎯 Retrieving context in dependency order...
✅ Answer: [DAG-aware response with proper context flow]
```

### Step 3: Verify DAG Collections
```powershell
# Check node count
curl -s http://localhost:6333/collections/phase95_dag_nodes/points/count | ConvertFrom-Json

# Check edge metadata
curl -s http://localhost:6333/collections/phase95_dag_edges/points/count | ConvertFrom-Json
```

---

## 🔧 Priority 5: Create Missing Components (Next Session)

### Task 3: Page Classifier (30 minutes)
**File**: `src/core/page_classifier.py`

```python
# Quick implementation using existing infrastructure
from sklearn.ensemble import RandomForestClassifier
import numpy as np

class PageClassifier:
    def __init__(self):
        self.model = RandomForestClassifier(n_estimators=10, max_depth=5)
        self._train_mock_data()  # Use sample data for now

    def classify_page(self, image_array: np.ndarray) -> str:
        """
        Classify page type for routing decision.
        Returns: 'text', 'table', 'image', 'mixed'
        """
        # Extract features
        features = self._extract_features(image_array)

        # Predict category
        category = self.model.predict([features])[0]

        # Routing logic
        if category in ['table', 'mixed']:
            return 'gpu'  # Heavy ROI → GPU
        else:
            return 'cpu'  # Simple text → CPU (faster)

    def _extract_features(self, image: np.ndarray) -> list:
        """Extract: text_density, table_count, image_ratio"""
        # Use existing Granite parser for feature extraction
        # (Already has layout analysis)
        return [0.0, 0.0, 0.0]  # Placeholder
```

**Test Command**:
```powershell
cd C:\Users\james\Videos\deeds-web-app\granite-docling-worker
python -c "from src.core.page_classifier import PageClassifier; clf = PageClassifier(); print(clf.classify_page(np.zeros((100,100))))"
```

### Task 4: Pipeline Manager (15 minutes)
**File**: `src/core/pipeline_manager.py`

```python
# Wire existing components together
from python_codebase.document_processing.granite_docling_parser import GraniteDoclingParser
from python_codebase.document_processing.tesseract_fallback import TesseractFallback
from src.core.page_classifier import PageClassifier
import time

class PipelineManager:
    def __init__(self):
        self.gpu_parser = GraniteDoclingParser(device='cuda')
        self.cpu_fallback = TesseractFallback()
        self.classifier = PageClassifier()

    def process_document(self, pdf_path: str) -> dict:
        """Unified processing with GPU/CPU routing"""
        pages = self._extract_pages(pdf_path)
        results = []

        for page in pages:
            # Classify page
            route = self.classifier.classify_page(page)

            # Route to GPU or CPU
            if route == 'gpu':
                start = time.time()
                result = self.gpu_parser.parse_page(page)
                elapsed = time.time() - start

                # Fallback if GPU timeout (>700ms)
                if elapsed > 0.7:
                    print(f'⚠️  GPU timeout ({elapsed:.2f}s), falling back to CPU')
                    result = self.cpu_fallback.parse_page(page)
            else:
                result = self.cpu_fallback.parse_page(page)

            results.append(result)

        return {'pages': results}
```

**Test Command**:
```powershell
python -c "from src.core.pipeline_manager import PipelineManager; pm = PipelineManager(); result = pm.process_document('sample.pdf'); print(f'Processed {len(result[\"pages\"])} pages')"
```

---

## 📈 Performance Validation (5 minutes)

### Test Against Targets
```powershell
# Create performance test script
@"
import time
from src.core.pipeline_manager import PipelineManager

pm = PipelineManager()

# Test 1-5 page document (<2s target)
start = time.time()
result1 = pm.process_document('small_doc.pdf')  # 3 pages
elapsed1 = time.time() - start
print(f'1-5 pages: {elapsed1:.2f}s (Target: <2s) {"✅" if elapsed1 < 2 else "❌"}')

# Test 50-100 page document (4-10s target)
start = time.time()
result2 = pm.process_document('large_doc.pdf')  # 75 pages
elapsed2 = time.time() - start
print(f'50-100 pages: {elapsed2:.2f}s (Target: 4-10s) {"✅" if 4 <= elapsed2 <= 10 else "❌"}')
"@ | Out-File -FilePath test_performance.py -Encoding UTF8

python test_performance.py
```

---

## 🎯 Summary: What You Can Do RIGHT NOW

### ✅ Ready to Test (No Setup Required):
1. **Granite Docling Parser** → `python_codebase/document_processing/granite_docling_parser.py`
2. **OCR Worker Pipeline** → `backend/workers/ocr_chunk_worker.py`
3. **ACE Synthesis Loop** → `sveltekit-frontend/scripts/phase94-ace-synthesis-loop.py`
4. **Phase 95 DAG** → `sveltekit-frontend/scripts/phase95-docling-dag.py`
5. **Redis Caching** → Docker exec commands
6. **Qdrant Collections** → curl queries

### 📋 Quick Wins (15-30 min each):
1. **Page Classifier** → Create `src/core/page_classifier.py` (scikit-learn)
2. **Pipeline Manager** → Create `src/core/pipeline_manager.py` (wire components)
3. **Performance Tests** → Validate against 2s and 4-10s targets

### 🚀 Integration Script (Priority):
**File**: `src/pipeline/granite_worker_unified.py`

```python
"""
Unified pipeline using ALL existing components:
- MinIO: ocr_chunk_worker.py
- Redis: redis-caching-layer.js + ocr-client.ts
- Granite: granite_docling_parser.py
- LangExtract: chunker_langextract.py
- DAG: phase95-docling-dag.py
- ACE: phase94-ace-synthesis-loop.py
"""

from python_codebase.document_processing.granite_docling_parser import GraniteDoclingParser
from backend.chunker_langextract import HybridChunker
# ... import other components

class GraniteWorkerUnified:
    def __init__(self):
        self.parser = GraniteDoclingParser(device='cuda')
        self.chunker = HybridChunker()
        # ... initialize other components

    def process_full_pipeline(self, pdf_path: str) -> dict:
        """
        Complete pipeline: PDF → Granite → Chunk → MinIO → Redis → DAG → ACE
        """
        # 1. Parse with Granite
        doc = self.parser.parse_document(pdf_path)

        # 2. Chunk with LangExtract
        chunks = self.chunker.chunk_document(doc)

        # 3. Upload to MinIO (existing worker)
        # 4. Cache in Redis (existing service)
        # 5. Create DAG (phase95-docling-dag.py)
        # 6. Synthesize with ACE (phase94-ace-synthesis-loop.py)

        return result
```

---

## 🔥 Next Command to Run

```powershell
# 1. Verify everything is running
docker ps
curl -s http://localhost:6333/collections | ConvertFrom-Json | Select-Object -ExpandProperty result | Select-Object collections

# 2. Test Granite parser
cd C:\Users\james\Videos\deeds-web-app
& .venv\Scripts\Activate.ps1
python -c "from python_codebase.document_processing.granite_docling_parser import GraniteDoclingParser; p=GraniteDoclingParser(); print('✅ Ready')"

# 3. Test ACE synthesis
cd sveltekit-frontend
python scripts/phase94-ace-synthesis-loop.py --query "Test query" --verbose

# 4. Create integration script
# Copy the GraniteWorkerUnified code above to:
# granite-docling-worker/src/pipeline/granite_worker_unified.py
```

**Status**: 🟢 All infrastructure ready, just wire components together!
