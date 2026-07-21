# LiteRT.js Conversion Pathway (Optional Post-Phase 106)

**Status**: DEFERRED | **Priority**: P3 (nice-to-have optimization)  
**Decision**: ONNX is canonical for Phase 106. LiteRT conversion is a parallel track.

---

## Why LiteRT.js?

**Potential wins:**
- Smaller model files (~150 MB vs 291 MB ONNX)
- Native Google/MediaPipe ecosystem
- Simpler browser integration (MediaPipe Tasks API)
- Better mobile support (Android/iOS via native SDKs)

**Tradeoffs:**
- Requires ONNX → TFLite conversion (one-time, ~2h)
- New runtime wiring (onnxruntime-web → @mediapipe/tasks-web or tflite)
- Testing & validation needed
- ONNX already proven + wired for Phase 106

---

## Decision Matrix

| Factor | ONNX (Current) | LiteRT (Future) |
|--------|---|---|
| **Phase 106 blocker?** | No (ready now) | Yes (conversion needed) |
| **Server-side support** | ✅ onnxruntime-node | ⏳ TensorFlow.js (slower) |
| **Browser WebGPU** | ✅ Native | ✅ Via delegate |
| **Model availability** | ✅ embeddinggemma exists | ❌ Need to convert |
| **Ecosystem maturity** | ✅ Stable (2+ years) | ✅ Stable (newer) |
| **File size savings** | — | ~150 MB (48% smaller) |
| **Effort to wire** | 0 (done) | 6-8 hours |

**Verdict**: Keep ONNX for Phase 106. Defer LiteRT to Phase 107+ if mobile or file-size optimization is critical.

---

## Conversion Pathway (If Needed Later)

### Step 1: Convert ONNX → TFLite

```bash
# Install conversion tools
pip install onnx onnx-tf tensorflow

# Convert embeddinggemma ONNX to TFLite
python -c "
import onnx
import onnx_tf.backend
import tensorflow as tf

# Load ONNX model
onnx_model = onnx.load('sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx')
onnx_tf.backend.prepare(onnx_model)

# Convert to TFLite
converter = tf.lite.TFLiteConverter.from_saved_model('embeddinggemma_tf')
tflite_model = converter.convert()

# Save
with open('sveltekit-frontend/static/embeddinggemma_300m_tflite/model.tflite', 'wb') as f:
    f.write(tflite_model)
"

# Copy tokenizer
cp sveltekit-frontend/static/embeddinggemma_300m_onnx/tokenizer.json \
   sveltekit-frontend/static/embeddinggemma_300m_tflite/
```

### Step 2: Wire MediaPipe Text Embedder (Browser)

```typescript
// src/lib/ai/mediapipe-embed.ts
import { TextEmbedder } from '@mediapipe/tasks-web';

let embedder: TextEmbedder | null = null;

export async function initMediaPipeEmbedder() {
  if (embedder) return embedder;
  
  embedder = await TextEmbedder.createFromOptions(
    { wasmLoaderPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-web/wasm' },
    {
      baseOptions: {
        modelAssetPath: '/embeddinggemma_300m_tflite/model.tflite'
      },
      quantize: true  // Use quantized model for smaller size
    }
  );
  
  return embedder;
}

export async function embedTextMediaPipe(text: string): Promise<number[]> {
  const embedder = await initMediaPipeEmbedder();
  const result = embedder.embed(text);
  return result.embeddings[0].values; // 768-dim vector
}
```

### Step 3: Wire Server-Side (TensorFlow.js)

```typescript
// src/lib/server/embedding/tflite-embed.ts
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-cpu'; // or 'webgl' for GPU

export async function loadTFLiteModel() {
  const model = await tf.loadGraphModel(
    'file://sveltekit-frontend/static/embeddinggemma_300m_tflite/model.tflite'
  );
  return model;
}

export async function embedTextTFLite(text: string): Promise<number[]> {
  const model = await loadTFLiteModel();
  // Tokenize + inference (same as ONNX path)
  // Return 768-dim L2-normalized vector
}
```

### Step 4: Update 5-Tier Cascade (Tier 5 → Tier 5a + 5b)

```typescript
// src/lib/server/grpc/embedding-client.ts

// Tier 5: ONNX local (existing, primary)
if (!newVectors && isOnnxEmbedAvailable()) {
  newVectors = await batchEmbedOnnx(uncachedTexts);
  if (newVectors.length > 0) {
    source = 'onnx-local';
  }
}

// Tier 5a: TFLite fallback (if ONNX unavailable)
if (!newVectors && isTFLiteAvailable()) {
  newVectors = await batchEmbedTFLite(uncachedTexts);
  if (newVectors.length > 0) {
    source = 'tflite-local';
  }
}

// Tier 5b: MediaPipe browser fallback (Service Worker)
if (!newVectors && isMediaPipeAvailable()) {
  newVectors = await batchEmbedMediaPipe(uncachedTexts);
  if (newVectors.length > 0) {
    source = 'mediapipe-web';
  }
}
```

### Step 5: Testing & Validation

```bash
# Unit tests
npx vitest run tests/tflite-embed.spec.ts
npx vitest run tests/mediapipe-embed.spec.ts

# Integration tests (5-tier cascade)
npx vitest run tests/embedding-tflite-integration.spec.ts

# Performance comparison
npm run bench:embed:onnx:vs:tflite

# Verify dimension contract
# Expected: 768-dim L2-normalized (same as ONNX)
```

---

## Performance Expectations

| Metric | ONNX | TFLite |
|--------|------|--------|
| Model size | 291 MB | ~150 MB (-48%) |
| Server inference | 50-100ms (CUDA) | 100-200ms (TensorFlow.js) |
| Browser inference | Not wired | 200-500ms (MediaPipe) |
| WASM bundle | 24 MB (ORT) | 15-20 MB (MediaPipe) |
| Tokenizer | 32 MB JSON | Same (~32 MB) |

---

## When to Prioritize LiteRT Conversion

**Defer unless:**
- [ ] Mobile/PWA offline mode becomes critical (iOS/Android native)
- [ ] File size optimization is blocking deployment (CDN cost)
- [ ] Server inference throughput becomes bottleneck (>1000 req/s)
- [ ] MediaPipe Tasks ecosystem provides a direct win (audio/video multimodal)

**Proceed if:**
- [ ] Phase 106 completes ahead of schedule
- [ ] Phase 107+ roadmap includes mobile support
- [ ] Vector quantization lane (Phase 107) needs smaller base models

---

## Reference Commands (When Ready)

```bash
# Check ONNX model is valid before conversion
python -c "import onnx; onnx.checker.check_model('sveltekit-frontend/static/embeddinggemma_300m_onnx/model.onnx')"

# Dry-run conversion
npm run convert:onnx:to:tflite:dry

# Apply conversion
npm run convert:onnx:to:tflite:apply

# Validate TFLite model
npm run validate:tflite:embed --limit=10

# Compare performance (ONNX vs TFLite)
npm run bench:embed:comparison
```

---

## Files to Create (When Needed)

- `src/lib/server/embedding/tflite-embed.ts` (200 lines)
- `src/lib/ai/mediapipe-embed.ts` (150 lines)
- `scripts/convert-onnx-to-tflite.py` (100 lines)
- `tests/tflite-embed.spec.ts` (200 lines)
- `tests/mediapipe-embed.spec.ts` (150 lines)
- `tests/embedding-tflite-integration.spec.ts` (250 lines)

---

## Decision Log

**2026-07-20**: DEFERRED. ONNX is operational and wired for Phase 106 (Stage 4). LiteRT conversion is P3, blocks nothing, and saves only file size. Revisit post-Phase 106 if mobile or CDN cost is critical.

**Next**: Continue Phase 106 Stage 4 execution with ONNX. LiteRT conversion is a follow-up optimization for Phase 107+.
