# Evidence Board Integration Plan
*Connecting frontend components with Go binaries and Ollama inference*

## Current Status Assessment

### ✅ Working Infrastructure
- **Ollama Service**: `go-inference-ollama-proxy` (healthy, 16 workers, RTX 3060 Ti optimized)
- **Model**: `legal:latest` (quantized Gemma3)
- **GPU**: 112 tensor cores, 448 GB/s bandwidth
- **CUDA Helper**: `internal/cuda` package (centralized discovery/execution)
- **Frontend Components**: Evidence UI elements exist in `/routes/ui-demo/` and `/routes/yorha-terminal/`

### 🔄 Components to Wire Together

## 1. Evidence Board Component
**Target**: Create interactive evidence management with AI analysis

### Frontend Implementation
```typescript
// src/lib/components/evidence/EvidenceBoard.svelte
export interface EvidenceItem {
  id: string;
  filename: string;
  type: 'document' | 'image' | 'video' | 'audio';
  uploadedAt: Date;
  aiAnalysis?: {
    summary: string;
    confidence: number;
    relevantLaws: string[];
    suggestedTags: string[];
  };
  position: { x: number; y: number };
}
```

### API Integration Points
- **Upload**: `POST /api/v1/evidence/upload` → Go upload service
- **Analysis**: `POST /api/v1/evidence/analyze` → Ollama inference
- **Similarity**: `POST /api/v1/evidence/similar` → CUDA vector search

## 2. Drag & Drop File Upload

### Enhanced Component
```svelte
<!-- src/lib/components/upload/EvidenceDragDrop.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { EvidenceItem } from '../evidence/types';

  const dispatch = createEventDispatcher<{
    upload: { files: File[], position: { x: number, y: number } };
    analyze: { item: EvidenceItem };
  }>();

  let dragCounter = 0;
  let dropZone: HTMLElement;

  async function handleDrop(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files || []);
    const rect = dropZone.getBoundingClientRect();
    const position = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };

    dispatch('upload', { files, position });

    // Trigger AI analysis after upload
    for (const file of files) {
      const analysis = await analyzeEvidence(file);
      dispatch('analyze', {
        item: {
          id: crypto.randomUUID(),
          filename: file.name,
          type: detectFileType(file),
          uploadedAt: new Date(),
          aiAnalysis: analysis,
          position
        }
      });
    }
  }
</script>
```

## 3. Moving Search Bar Integration

### Dynamic Search with AI Suggestions
```typescript
// src/lib/components/search/IntelligentSearchBar.svelte
export interface SearchSuggestion {
  text: string;
  type: 'case' | 'law' | 'evidence' | 'precedent';
  confidence: number;
  source: string;
}

async function getAISuggestions(query: string): Promise<SearchSuggestion[]> {
  const response = await fetch('/api/v1/search/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      model: 'legal:latest',
      context: getCurrentEvidenceContext()
    })
  });
  return response.json();
}
```

## 4. Go Binary Integration Architecture

### Service Coordination
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   SvelteKit     │    │  Go Services    │    │ Ollama Inference│
│   Frontend      │    │                 │    │                 │
│                 │    │                 │    │                 │
│ Evidence Board  │◄──►│ upload-service  │◄──►│ legal:latest    │
│ Drag & Drop     │    │ cuda-worker     │    │ 16 workers      │
│ Search Bar      │    │ enhanced-rag    │    │ RTX 3060 Ti     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │                       │
        └───────────────────────┼───────────────────────┘
                               │
                    ┌─────────────────┐
                    │ Recommendation  │
                    │ Engine (New)    │
                    │                 │
                    │ - Case matching │
                    │ - Legal research│
                    │ - Evidence links│
                    └─────────────────┘
```minio

### Key Go Services to Enhance

#### A. Enhanced Upload Service
```go
// go-microservice/enhanced-upload-service.go
func (s *UploadService) ProcessEvidenceUpload(c *gin.Context) {
    // 1. Handle file upload
    file := c.Request.FormFile("evidence")

    // 2. Extract text/metadata using CUDA acceleration
    extractReq := map[string]interface{}{
        "job_id": generateID(),
        "type": "document_extraction",
        "file_path": savedPath,
    }

    result, err := cuda.RunExternalCudaWorker(
        c.Request.Context(),
        s.cudaWorkerPath,
        extractReq,
        30*time.Second
    )

    // 3. Generate embeddings via Ollama
    embedding := s.generateEmbedding(extractedText)

    // 4. Store in vector database
    s.storeEvidence(file, extractedText, embedding)

    c.JSON(200, gin.H{"status": "processed", "analysis": result})
}
```

#### B. Recommendation Engine Service
```go
// go-microservice/recommendation-engine.go
type RecommendationEngine struct {
    ollamaClient *ollama.Client
    cudaWorker   string
    vectorDB     *pgvector.Client
}

func (r *RecommendationEngine) GenerateRecommendations(evidenceID string) []Recommendation {
    // 1. Get evidence embeddings
    evidence := r.getEvidence(evidenceID)

    // 2. Find similar cases using CUDA vector similarity
    similarCases := r.findSimilarCases(evidence.Embedding)

    // 3. Generate legal insights using Ollama
    insights := r.ollamaClient.Generate("legal:latest",
        fmt.Sprintf("Analyze this evidence: %s. Provide legal insights.", evidence.Content))

    // 4. Cross-reference with case law
    relevantLaws := r.findRelevantStatutes(evidence.Content)

    return r.combineRecommendations(similarCases, insights, relevantLaws)
}
```

## 5. WebAssembly Integration Points

### Client-Side Processing
```typescript
// src/lib/wasm/evidence-processor.ts
import wasmModule from '../../../wasm/legal-processor.wasm';

export class EvidenceProcessor {
  private wasm: any;

  async initialize() {
    this.wasm = await wasmModule();
  }

  // Fast client-side text extraction
  extractTextFromPDF(buffer: ArrayBuffer): string {
    return this.wasm.extract_pdf_text(new Uint8Array(buffer));
  }

  // Client-side similarity scoring
  calculateSimilarity(text1: string, text2: string): number {
    return this.wasm.calculate_text_similarity(text1, text2);
  }
}
```

## 6. Implementation Roadmap

### Phase 1: Core Evidence Board (Week 1)
1. **Create EvidenceBoard.svelte component**
   ```bash
   # Files to create:
   src/lib/components/evidence/EvidenceBoard.svelte
   src/lib/components/evidence/EvidenceItem.svelte
   src/lib/components/evidence/types.ts
   ```

2. **Wire existing upload service**
   ```bash
   # Enhance existing:
   go-microservice/upload-service.go  # Add evidence processing
   src/routes/api/v1/evidence/+server.ts  # New SvelteKit endpoint
   ```

3. **Test integration**
   ```bash
   # Test commands:
   go test ./internal/cuda  # Verify helper works
   npm run dev  # Start frontend
   curl -X POST localhost:8093/api/evidence/upload  # Test Go service
   ```

### Phase 2: AI Analysis Pipeline (Week 2)
1. **Ollama integration for evidence analysis**
2. **CUDA-accelerated similarity search**
3. **Moving search bar with AI suggestions**

### Phase 3: Recommendation Engine (Week 3)
1. **New Go service: recommendation-engine.go**
2. **Case law cross-referencing**
3. **WebAssembly client-side processing**

### Phase 4: Advanced Features (Week 4)
1. **Real-time collaboration**
2. **Advanced drag & drop workflows**
3. **Performance optimization**

## 7. Quick Start Commands

### Build and Test Current State
```powershell
# Build CUDA service
go build -o cuda-service-worker.exe cuda-service-worker.go

# Test internal helper
go test ./internal/cuda -v

# Start Ollama service (already running)
# go-inference-ollama-proxy is healthy

# Start SvelteKit dev
cd sveltekit-frontend
npm run dev
```

### Create Evidence Board Route
```powershell
# Create new route
mkdir sveltekit-frontend/src/routes/evidence-board
# Files: +page.svelte, +page.ts, +layout.svelte
```

### Test File Upload Pipeline
```powershell
# Upload test file
$file = Get-Content "test-document.pdf" -Raw -Encoding Byte
Invoke-RestMethod -Uri "http://localhost:8093/api/evidence/upload" -Method POST -ContentType "multipart/form-data" -Body $file
```

## 8. Success Metrics

- **Upload Speed**: < 2 seconds for documents < 10MB
- **AI Analysis**: < 5 seconds for legal document summarization
- **Search Response**: < 500ms for intelligent suggestions
- **Drag & Drop**: Seamless file handling with visual feedback
- **GPU Utilization**: 70%+ during batch processing
- **Recommendation Quality**: 85%+ relevance score from legal experts

## Next Immediate Action

Would you like me to:
1. **Create the EvidenceBoard.svelte component** with drag & drop
2. **Enhance the upload-service.go** to process evidence with Ollama
3. **Build the recommendation engine service**
4. **Wire up the moving search bar** with AI suggestions

Pick one and I'll implement it with working code and tests.
