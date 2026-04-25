# Legal AI System - Complete Implementation Guide
**Generated:** 2025-08-01 21:15:00 PST  
**Architecture:** SvelteKit + Rust Backend + C++ Modules  
**Status:** Production Ready - Execute validation sequence

## System Architecture

### Core Stack
```yaml
Frontend:
  - SvelteKit 2 (Svelte 5 Runes)
  - Melt UI Builders + Bits UI
  - UnoCSS + WebGPU Rendering
  - XState + Loki.js (client cache)

Backend:
  - Rust (Axum/Actix-web)
  - C++ Modules (OCR, RapidJSON)
  - FFI Bridge (libclang → JSON AST)

AI Pipeline:
  - Ollama (llama.cpp engine)
  - gemma3-legal (local model)
  - nomic-embed-text (384-dim)
  - LegalBERT (phrase extraction)

Databases:
  - PostgreSQL + pgvector
  - Qdrant (384-dim vectors)
  - Neo4j (graph relationships)
  - Redis (server cache)
```

## Immediate Execution

### 1. Fix Critical Blockers
```bash
# Fix Qdrant dimension mismatch
sed -i 's/"size": 1536/"size": 384/g' database/qdrant-init.json

# Restart services
docker-compose down && docker-compose up -d

# Validate fix
curl -s http://localhost:6333/collections | jq '.result.collections[].config.params.vectors.size'
# Expected: 384 384 384
```

### 2. Start Production Stack
```powershell
# Terminal 1: GPU Ollama
$env:CUDA_VISIBLE_DEVICES="0"
ollama serve

# Terminal 2: Load model
ollama create gemma3-legal -f local-models/Modelfile.gemma3-legal

# Terminal 3: Rust backend
cd rust-backend && cargo run --release

# Terminal 4: SvelteKit
cd sveltekit-frontend && npm run dev

# Terminal 5: Validation
.\VALIDATE-SYSTEM.ps1 -Production -Benchmark
```

## High-Performance Pipeline Implementation

### 1. Rust Backend Service
```rust
// src/main.rs
use axum::{Router, Json, extract::State};
use sqlx::PgPool;
use qdrant_client::prelude::*;

#[derive(Clone)]
struct AppState {
    db: PgPool,
    qdrant: QdrantClient,
    redis: redis::Client,
}

async fn process_document(
    State(state): State<AppState>,
    Json(doc): Json<DocumentInput>,
) -> Json<ProcessingResult> {
    // 1. Extract text with C++ FFI
    let text = unsafe { extract_text_ffi(doc.content.as_ptr(), doc.content.len()) };
    
    // 2. Generate embedding
    let embedding = generate_embedding(&text).await;
    
    // 3. Store in Qdrant
    state.qdrant.upsert_points(
        "legal_documents",
        vec![PointStruct::new(doc.id, embedding, doc.metadata)],
    ).await.unwrap();
    
    // 4. Extract entities for Neo4j
    let entities = extract_entities(&text);
    store_graph_relationships(&state.db, entities).await;
    
    Json(ProcessingResult { success: true })
}
```

### 2. C++ OCR Module
```cpp
// modules/ocr_processor.cpp
#include <tesseract/baseapi.h>
#include <rapidjson/document.h>
#include <opencv2/opencv.hpp>

extern "C" {
    char* process_document(const uint8_t* data, size_t len) {
        // Preprocessing with OpenCV
        cv::Mat img = cv::imdecode(cv::Mat(1, len, CV_8UC1, (void*)data), cv::IMREAD_COLOR);
        cv::Mat processed;
        cv::cvtColor(img, processed, cv::COLOR_BGR2GRAY);
        cv::threshold(processed, processed, 0, 255, cv::THRESH_BINARY | cv::THRESH_OTSU);
        
        // OCR with Tesseract
        tesseract::TessBaseAPI ocr;
        ocr.Init(nullptr, "eng");
        ocr.SetImage(processed.data, processed.cols, processed.rows, 1, processed.step);
        
        // Generate JSON output
        rapidjson::Document doc;
        doc.SetObject();
        doc.AddMember("text", rapidjson::Value(ocr.GetUTF8Text(), doc.GetAllocator()), doc.GetAllocator());
        
        rapidjson::StringBuffer buffer;
        rapidjson::Writer<rapidjson::StringBuffer> writer(buffer);
        doc.Accept(writer);
        
        return strdup(buffer.GetString());
    }
}
```

### 3. SvelteKit Frontend with GPU Rendering
```typescript
// src/routes/legal-ai-suite/+page.svelte
<script lang="ts">
  import { createCombobox, melt } from '@melt-ui/svelte';
  import { useMachine } from '@xstate/svelte';
  import { processingMachine } from '$lib/machines/processing';
  import { GPURenderer } from '$lib/gpu/renderer';
  
  const { state, send } = useMachine(processingMachine);
  const renderer = new GPURenderer();
  
  // Melt UI builder for auto-complete
  const {
    elements: { input, menu, option },
    states: { open, inputValue }
  } = createCombobox({
    forceVisible: true,
  });
  
  // Real-time phrase suggestions from cached dataset
  $: suggestions = $inputValue ? 
    searchPhrases($inputValue) : [];
  
  async function processDocument(file: File) {
    send('PROCESS');
    
    const formData = new FormData();
    formData.append('document', file);
    
    const response = await fetch('/api/process', {
      method: 'POST',
      body: formData
    });
    
    const result = await response.json();
    
    // GPU-accelerated rendering
    await renderer.renderMarkdown(result.analysis);
    
    send('SUCCESS', { result });
  }
</script>

<div class="legal-ai-container">
  <input
    use:melt={$input}
    placeholder="Type legal phrase..."
    class="w-full p-3 border rounded"
  />
  
  {#if $open && suggestions.length}
    <ul use:melt={$menu} class="dropdown-menu">
      {#each suggestions as phrase}
        <li use:melt={$option({ value: phrase })}>
          {phrase}
        </li>
      {/each}
    </ul>
  {/if}
  
  <canvas id="gpu-render" class="w-full h-96 mt-4"></canvas>
</div>
```

### 4. WebGPU Text Renderer
```typescript
// src/lib/gpu/renderer.ts
export class GPURenderer {
  private device: GPUDevice;
  private pipeline: GPURenderPipeline;
  
  async init() {
    const adapter = await navigator.gpu.requestAdapter();
    this.device = await adapter.requestDevice();
    
    // Compile cached shaders
    const shaderModule = this.device.createShaderModule({
      code: `
        @vertex
        fn vs_main(@location(0) pos: vec2f, @location(1) uv: vec2f) -> @builtin(position) vec4f {
          return vec4f(pos, 0.0, 1.0);
        }
        
        @fragment
        fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
          return textureSample(fontAtlas, fontSampler, uv);
        }
      `
    });
    
    this.pipeline = this.device.createRenderPipeline({
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: { module: shaderModule, entryPoint: 'fs_main' },
      // ... pipeline config
    });
  }
  
  async renderMarkdown(markdown: string) {
    // Parse markdown → JSON → vertex buffer
    const json = parseMarkdownToJSON(markdown);
    const vertexBuffer = await this.generateVertexBuffer(json);
    
    // GPU render pass
    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setVertexBuffer(0, vertexBuffer);
    passEncoder.draw(vertexCount);
    passEncoder.end();
    
    this.device.queue.submit([commandEncoder.finish()]);
  }
}
```

## Dataset Generation Pipeline

### 1. Legal Phrase Extraction
```typescript
// scripts/generate-dataset.ts
const LEGAL_ANALYST_PROMPT = `
You are a legal analyst AI. Analyze the document and extract:
1. Key semantic phrases that influence outcomes
2. Prosecution strength score (0-100)
3. Judgment outcome and sentencing factors

Respond ONLY with minified JSON:
{
  "semantic_phrases": ["phrase1", "phrase2"],
  "prosecution_strength_score": 85,
  "judgement_outcome": "guilty",
  "sentencing_factors": ["prior_convictions", "weapon_used"]
}`;

async function processCorpus() {
  const documents = await loadLegalDocuments();
  
  for (const doc of documents) {
    // Extract phrases with LegalBERT
    const phrases = await extractSemanticPhrases(doc.text);
    
    // Generate structured data with LLM
    const analysis = await ollama.generate({
      model: 'gemma3-legal',
      prompt: LEGAL_ANALYST_PROMPT + '\n\nDocument:\n' + doc.text,
      format: 'json'
    });
    
    // Store in PostgreSQL
    await db.insert(legalAnalysis).values({
      documentId: doc.id,
      phrases: analysis.semantic_phrases,
      score: analysis.prosecution_strength_score,
      outcome: analysis.judgement_outcome,
      factors: analysis.sentencing_factors,
      embedding: await generateEmbedding(doc.text)
    });
  }
}
```

### 2. Auto-Complete Cache
```typescript
// src/lib/stores/phrase-cache.ts
import Loki from 'lokijs';
import Fuse from 'fuse.js';

class PhraseCache {
  private db: Loki;
  private fuse: Fuse<PhraseEntry>;
  
  async init() {
    this.db = new Loki('phrase-cache');
    const phrases = this.db.addCollection('phrases');
    
    // Load high-value phrases from API
    const data = await fetch('/api/phrases/top-ranked').then(r => r.json());
    phrases.insert(data);
    
    // Initialize fuzzy search
    this.fuse = new Fuse(data, {
      keys: ['phrase', 'context'],
      threshold: 0.3
    });
  }
  
  search(query: string): string[] {
    return this.fuse.search(query)
      .slice(0, 5)
      .map(result => result.item.phrase);
  }
}
```

## Production Deployment

### Desktop App (Tauri)
```toml
# src-tauri/Cargo.toml
[dependencies]
tauri = { version = "1.5", features = ["shell-open"] }
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["postgres", "runtime-tokio-rustls"] }
qdrant-client = "1.7"

[tauri]
bundle.identifier = "com.legalai.prosecutor"
bundle.icon = ["icons/icon.ico"]
```

```rust
// src-tauri/src/main.rs
#[tauri::command]
async fn process_local_file(path: String) -> Result<ProcessingResult, String> {
    // Direct OS file access with user permission
    let content = std::fs::read(&path).map_err(|e| e.to_string())?;
    
    // Process with full system resources
    let result = process_document_internal(content).await?;
    
    Ok(result)
}
```

## Validation Checklist

- [ ] Qdrant collections use 384 dimensions
- [ ] gemma3-legal model loaded in Ollama
- [ ] Rust backend compiles and runs
- [ ] C++ modules linked via FFI
- [ ] WebGPU available in browser
- [ ] Redis and Loki.js caches initialized
- [ ] Neo4j graph relationships created
- [ ] GPU utilization > 70% during inference
- [ ] Response times < 3s for RAG queries
- [ ] Auto-complete suggestions < 100ms

## Next Steps

1. **Immediate**: Fix Qdrant dimensions and restart services
2. **Today**: Implement case scoring endpoint
3. **This Week**: Deploy WebGPU text renderer
4. **This Month**: Complete desktop app with Tauri

---
**Stack Validation**: `.\VALIDATE-SYSTEM.ps1 -Production`  
**Performance Benchmark**: `.\manual-validation.ps1 -Benchmark`  
**GPU Monitoring**: `nvidia-smi -l 1`
