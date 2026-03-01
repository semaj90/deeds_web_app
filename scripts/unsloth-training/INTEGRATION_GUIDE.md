# Integration Guide: Stack Optimizations

**Where to use the optimizations** - Complete step-by-step integration

---

## ✅ Files Created/Updated

### New Files (Ready to Use)
1. ✅ `src/lib/server/embedding-cache.ts` - Binary Redis cache for embeddings
2. ✅ `src/lib/server/batch-embedder.ts` - 50ms batching window with auto-cache
3. ✅ `src/lib/server/vector/qdrant-manager.ts` - INT8 quantization added

### Updated Files
4. ✅ `Gemma3_12B_Legal_Production.ipynb` - A100 optimizations (BF16, rank-stabilized LoRA)
5. ✅ `RTX_3060_TI_TRT_BUILD.md` - Will update with INT8 KV + XQA flags

---

## 📍 Where to Use: Batch Embedder

### Replace ALL existing embedding calls with batch embedder

#### Location 1: Evidence Upload Pipeline
**File**: `src/routes/api/evidence/upload/+server.ts`

**Find** (around line 380):
```typescript
// OLD: Direct Ollama call
const response = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: [chunk.text]
    })
});
const data = await response.json();
const embedding = new Float32Array(data.embeddings[0]);
```

**Replace with**:
```typescript
// NEW: Batch embedder with auto-cache
import { embedText } from '$lib/server/batch-embedder.js';

const embedding = await embedText(chunk.text);
```

**Benefits**:
- ✅ Automatic Redis caching (binary format)
- ✅ 50ms batching window (if multiple uploads)
- ✅ 4x smaller cache than JSON

---

#### Location 2: RAG Search Endpoint
**File**: `src/routes/api/rag/search/+server.ts`

**Find** (around line 25):
```typescript
// OLD: Embed query
const embedResponse = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: [query]
    })
});
const embedData = await embedResponse.json();
const queryEmbedding = embedData.embeddings[0];
```

**Replace with**:
```typescript
// NEW: Batch embedder
import { embedText } from '$lib/server/batch-embedder.js';

const queryEmbedding = await embedText(query);
// Convert Float32Array → number[] for Qdrant
const queryEmbeddingArray = Array.from(queryEmbedding);
```

---

#### Location 3: Chat Embedding (SSE)
**File**: `src/routes/api/sse/chat/+server.ts` or `src/routes/api/chat/stream/+server.ts`

**Find**:
```typescript
// OLD: Embed user message
const embedResponse = await fetch(`${OLLAMA_BASE_URL}/api/embed`, {
    method: 'POST',
    body: JSON.stringify({
        model: 'embeddinggemma:latest',
        input: [userMessage]
    })
});
```

**Replace with**:
```typescript
// NEW: Batch embedder
import { embedText } from '$lib/server/batch-embedder.js';

const messageEmbedding = await embedText(userMessage);
```

---

#### Location 4: Entity Extraction (if embedding-based)
**File**: `src/lib/server/analysis/entity-extraction.ts`

**If** you're using embeddings for entity extraction:
```typescript
// NEW: Batch all entity candidates at once
import { embedTexts } from '$lib/server/batch-embedder.js';

const entityTexts = entities.map(e => e.text);
const embeddings = await embedTexts(entityTexts); // Batch all at once
```

---

#### Location 5: Codebase Indexing
**File**: `src/lib/server/indexer/codebase-indexer.ts` (if exists)

**Find**:
```typescript
// OLD: Sequential embedding
for (const chunk of chunks) {
    const response = await fetch(...);
    const embedding = ...;
    await qdrant.upsert(...);
}
```

**Replace with**:
```typescript
// NEW: Batch all chunks
import { embedTexts } from '$lib/server/batch-embedder.js';

const chunkTexts = chunks.map(c => c.text);
const embeddings = await embedTexts(chunkTexts); // 32x faster

// Batch upsert to Qdrant
const points = chunks.map((chunk, i) => ({
    id: deterministicPointId(chunk.id),
    vector: Array.from(embeddings[i]),
    payload: { ...chunk.payload }
}));

await qdrant.batchUpsert(collectionName, points);
```

---

## 📍 Where to Use: INT8 Qdrant Quantization

### Recreate collections with INT8 quantization

**Option 1: Fresh Install** (no existing data)
```bash
# Restart Qdrant Docker to clear all collections
docker restart phase66-qdrant

# Run initialization (uses new INT8 configs)
npm run dev
# Navigate to /admin or trigger collection creation
```

**Option 2: Existing Data** (migrate)
```typescript
// File: scripts/migrate-qdrant-int8.ts (NEW - create this)
import { QdrantClient } from '@qdrant/js-client-rest';

const client = new QdrantClient({ url: 'http://localhost:6333' });

async function migrateToInt8(collectionName: string) {
    console.log(`Migrating ${collectionName} to INT8...`);

    // 1. Get all points from old collection
    const allPoints = [];
    let offset = null;
    while (true) {
        const batch = await client.scroll(collectionName, {
            limit: 100,
            offset,
            with_payload: true,
            with_vector: true
        });

        allPoints.push(...batch.points);
        if (!batch.next_page_offset) break;
        offset = batch.next_page_offset;
    }

    console.log(`  ${allPoints.length} points found`);

    // 2. Delete old collection
    await client.deleteCollection(collectionName);

    // 3. Create new collection with INT8
    await client.createCollection(collectionName, {
        vectors: { size: 768, distance: 'Cosine' },
        quantization_config: {
            scalar: { type: 'int8', quantile: 0.99, always_ram: true }
        },
        hnsw_config: { m: 16, ef_construct: 100 }
    });

    // 4. Re-insert all points
    for (let i = 0; i < allPoints.length; i += 100) {
        const batch = allPoints.slice(i, i + 100);
        await client.upsert(collectionName, {
            wait: false,
            points: batch
        });
    }

    await client.waitForCollection(collectionName);
    console.log(`  ✅ ${collectionName} migrated to INT8`);
}

// Run migration
const collections = [
    'legal_documents',
    'legal_cases',
    'evidence_items',
    'chat_messages',
    'embedding_cache',
    'document_tags',
    'topic_clusters'
];

for (const col of collections) {
    await migrateToInt8(col);
}
```

**Run**:
```bash
npx tsx scripts/migrate-qdrant-int8.ts
```

**Expected**:
- ✅ 4x less memory per collection
- ✅ 2x faster search
- ✅ <0.5% accuracy loss

---

## 📍 Where to Use: TRT-LLM INT8 KV Cache

### Update your TRT build command

**File**: `scripts/build-trt-engine.sh` (create or update)

```bash
#!/bin/bash
# Build TensorRT-LLM engine for RTX 3060 Ti with all optimizations

export TORCH_CUDA_ARCH_LIST="8.6"
export CUDA_VISIBLE_DEVICES=0
export NVCC_APPEND_FLAGS="-gencode=arch=compute_86,code=[sm_86,compute_86]"
export TRT_LLM_EXTRA_BUILD_FLAGS="--use_fused_mlp --use_gemm_woq_plugin"

# Convert merged model to TRT checkpoint
python TensorRT-LLM/examples/gemma/convert_checkpoint.py \
  --model_dir gemma3-12b-legal-merged-16bit \
  --output_dir trt_checkpoints/gemma3-12b-legal \
  --dtype float16 \
  --tp_size 1 \
  --pp_size 1

# Build INT4 engine with INT8 KV cache (NEW FLAGS)
trtllm-build \
  --checkpoint_dir ./trt_checkpoints/gemma3-12b-legal \
  --output_dir ./trt_engines/gemma3-12b-rtx3060ti-optimized \
  \
  # Precision
  --use_weight_only \
  --weight_only_precision int4 \
  --int8_kv_cache \
  \
  # Plugins
  --gemm_plugin float16 \
  --gpt_attention_plugin float16 \
  --gemm_swiglu_plugin float16 \
  \
  # Context limits
  --max_batch_size 1 \
  --max_input_len 1024 \
  --max_output_len 512 \
  --max_beam_width 1 \
  \
  # Attention optimizations
  --context_fmha enable \
  --context_fmha_fp32_acc enable \
  --enable_context_fmha_fp32_acc \
  --paged_kv_cache enable \
  --use_paged_context_fmha enable \
  --remove_input_padding enable \
  \
  # Multi-block mode + XQA (NEW)
  --multi_block_mode enable \
  --enable_xqa enable \
  --max_num_tokens 2048 \
  \
  # PTX optimizations
  --builder_opt 4 \
  --strongly_typed \
  --use_custom_all_reduce disable \
  --gather_all_token_logits \
  --workers 1

echo "✅ TRT engine built with INT8 KV cache + XQA"
echo "   Expected VRAM: ~6.8 GB (vs 7.5 GB baseline)"
echo "   Expected throughput: ~50-75 tok/s (vs 40-60 baseline)"
```

**Run after Colab training**:
```bash
chmod +x scripts/build-trt-engine.sh
./scripts/build-trt-engine.sh
```

---

## 📍 Colab Training Workflow

### Use Colab **Website** (not VS Code extension)

**Why website?**
- ✅ More stable (extension is experimental)
- ✅ Better GPU runtime management
- ✅ Easier file upload
- ✅ Native progress bars

**Steps**:

### 1. Upload Notebook
1. Go to https://colab.research.google.com/
2. File → Upload notebook
3. Select `scripts/unsloth-training/Gemma3_12B_Legal_Production.ipynb`

### 2. Switch to A100 GPU
1. Runtime → Change runtime type
2. Hardware accelerator: **GPU**
3. GPU type: **A100** (requires Colab Pro+)
4. Click **Save**

### 3. Upload Local Datasets
1. Run Cell 1-8 (install + load HuggingFace datasets)
2. When you reach **Cell 9** (Upload), click the file picker
3. Navigate to `sveltekit-frontend/training-datasets/`
4. Select **all 7 .jsonl files** at once:
   - evidence-patterns.jsonl
   - legal-keywords.jsonl
   - entity-patterns.jsonl
   - forensic-patterns.jsonl
   - rag-context.jsonl
   - svelte5-patterns.jsonl
   - schema-patterns.jsonl
5. Click **Upload**

### 4. Run Training
1. Execute cells 10-23 in order
2. **Cell 23** will train for 3.5-5 hours
3. Monitor progress bar and loss metrics

### 5. Download Model
1. After training completes, run Cell 29 (export merged models)
2. Run Cell 31 (zip + download)
3. File will be `gemma3-12b-legal-merged-4bit.zip` (~7 GB)
4. Save to your local machine

**Expected**:
- Training time: 3.5-5 hours on A100
- Download size: 7 GB (4-bit) + 24 GB (16-bit, optional)
- Cost: ~$10-15 (Colab Pro+ compute units)

---

## 📍 Post-Training Deployment

### 1. Extract Downloaded Model
```bash
cd ~/models  # or your model directory
unzip gemma3-12b-legal-merged-4bit.zip
```

### 2. Build TRT Engine
```bash
cd ~/TensorRT-LLM  # or your TRT-LLM directory
./scripts/build-trt-engine.sh
```

### 3. Deploy via Triton
```bash
# Create model repository
mkdir -p models/gemma3_12b_legal/1

# Copy engine
cp trt_engines/gemma3-12b-rtx3060ti-optimized/rank0.engine \
   models/gemma3_12b_legal/1/model.plan

# Create config.pbtxt
cat > models/gemma3_12b_legal/config.pbtxt <<EOF
name: "gemma3_12b_legal"
backend: "tensorrtllm"
max_batch_size: 1

model_transaction_policy {
  decoupled: True
}

dynamic_batching {
  preferred_batch_size: [1]
  max_queue_delay_microseconds: 100
}

instance_group [
  {
    count: 1
    kind: KIND_GPU
    gpus: [0]
  }
]

parameters: {
  key: "max_beam_width"
  value: { string_value: "1" }
}

parameters: {
  key: "gpt_model_type"
  value: { string_value: "gemma" }
}

parameters: {
  key: "gpt_model_path"
  value: { string_value: "/models/gemma3_12b_legal/1" }
}
EOF

# Run Triton
docker run -d --gpus all --rm \
  --name triton-gemma3-12b \
  --shm-size=2g \
  -p 8099:8000 \
  -p 8100:8001 \
  -p 8101:8002 \
  -v $(pwd)/models:/models \
  nvcr.io/nvidia/tritonserver:24.01-trtllm-python-py3 \
  tritonserver --model-repository=/models \
    --backend-config=tensorrtllm,max_beam_width=1
```

### 4. Test Inference
```bash
curl http://localhost:8099/v2/health/ready
# Expected: {"ready":true}

# Monitor VRAM
nvidia-smi dmon -s u
# Expected: ~6.8 GB (vs 7.5 GB baseline)
```

### 5. Update SvelteKit
**File**: `.env`
```bash
TENSORRT_SERVICE_URL=http://localhost:8099
```

**File**: `src/lib/server/trt-llm.ts` (if not already using port 8099)
Update references to use `TENSORRT_SERVICE_URL` from env.server.ts

---

## 📊 Verification Checklist

### Batch Embedder
- [ ] Evidence upload uses `embedText()`
- [ ] RAG search uses `embedText()`
- [ ] Chat uses `embedText()`
- [ ] Redis shows `embed:*` keys: `redis-cli KEYS "embed:*" | wc -l`
- [ ] Check cache hit rate in logs

### Qdrant INT8
- [ ] Collections recreated with quantization
- [ ] Memory usage reduced: `docker stats phase66-qdrant`
- [ ] Search still returns accurate results
- [ ] No accuracy degradation in top-k results

### TRT-LLM INT8 KV
- [ ] Engine size: ~3.5 GB (check `ls -lh rank0.engine`)
- [ ] VRAM usage: ~6.8 GB (check `nvidia-smi`)
- [ ] Throughput: 50-75 tok/s (benchmark)
- [ ] No OOM errors

---

## 🎯 Expected Performance Gains

| Component | Before | After | Files Changed |
|-----------|--------|-------|---------------|
| **Embeddings** | 3200ms (32 seq) | 100ms (batch) | 5 routes |
| **Redis cache** | 15ms (JSON) | 5ms (binary) | Auto via batch-embedder |
| **Qdrant** | 80ms (FP32) | 40ms (INT8) | qdrant-manager.ts |
| **TRT VRAM** | 7.5 GB | 6.8 GB | Build script |
| **TRT tokens/s** | 40-60 | 50-75 | Build script |

---

## 🚨 Troubleshooting

### Batch Embedder Not Working
```bash
# Check Redis connection
redis-cli PING
# Expected: PONG

# Check Ollama
curl http://localhost:11434/api/tags
# Expected: List of models including embeddinggemma:latest
```

### Qdrant INT8 Migration Failed
```bash
# Check Qdrant health
curl http://localhost:6333/healthz
# Expected: healthz passed

# Check collections
curl http://localhost:6333/collections | jq
# Expected: JSON list of collections
```

### TRT Engine OOM
```bash
# Reduce context length
trtllm-build ... --max_input_len 512  # Down from 1024

# Or reduce batch size (already at 1)
# Or use FP16 KV cache instead of INT8 (loses 600 MB savings)
```

---

## Summary

✅ **3 new files** ready to use
✅ **5+ routes** need batch embedder integration
✅ **7 Qdrant collections** need INT8 migration
✅ **1 TRT build script** with new flags
✅ **Colab website** for training (not VS Code extension)

**Next**: Start with Colab training, then integrate batch embedder in parallel while model trains.
