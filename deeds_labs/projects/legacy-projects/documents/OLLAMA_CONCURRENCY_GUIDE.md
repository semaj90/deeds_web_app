# Ollama Concurrency & Model Configuration Guide

## Available Models in Legal AI Platform

### Embedding Models
- **`embeddinggemma:latest`** (307.58M parameters, 621MB)
  - Architecture: gemma3
  - Context length: 2048 tokens
  - Embedding dimension: 768
  - Quantization: BF16 (high quality)
  - **Primary embedding model for legal documents**

- **`nomic-embed-text:latest`** (274MB)
  - **Fallback embedding model**
  - Lighter weight alternative

### Chat/Generation Models
- **`gemma3-legal:latest`** (7.3GB)
  - **Large legal-specific chat model**
  - Optimized for legal conversations and analysis

- **`gemma3:270m`** (268.10M parameters, 291MB)
  - **Lightweight chat model**
  - Quantization: Q8_0 (high quality)
  - Fast inference for simple legal queries
  - Ideal for quick responses and bulk processing

## Ollama Instance Configuration

### Port Configuration
```
┌─── Port 11434 (Main Ollama) ─────┐
│ embeddinggemma:latest (621MB)     │ ← Primary embeddings
│ gemma3-legal:latest (7.3GB)      │ ← Legal conversations
│ gemma3:270m (291MB)              │ ← Quick responses
│ nomic-embed-text (274MB)         │ ← Fallback embeddings
└───────────────────────────────────┘

┌─── Port 11435 (GPU Worker) ──────┐
│ Isolated worker instance          │ ← Specialized GPU tasks
└───────────────────────────────────┘
```

### Physical Storage Location
- **Windows**: `%LOCALAPPDATA%\Ollama\`
- **Full path**: `C:\Users\james\AppData\Local\Ollama\`
- **Structure**: `blobs/` (model data) + `manifests/` (metadata)

## Concurrency Capabilities

### Embedding Operations (embeddinggemma:latest)
- **Concurrent requests**: 4-8 simultaneous
- **Batch size**: 2048 (very high capacity)
- **Latency**: ~100-500ms per embedding
- **Best for**: Document analysis, semantic search, vector generation

### Chat Generation (gemma3-legal:latest)
- **Concurrent conversations**: 2-3 simultaneous
- **Token-by-token generation**: Sequential but interleaved
- **Memory usage**: High (7.3GB model)
- **Best for**: Complex legal analysis, detailed responses

### Lightweight Chat (gemma3:270m)
- **Concurrent requests**: 6-10 simultaneous
- **Fast inference**: ~50-200ms response time
- **Low memory**: 291MB footprint
- **Best for**: Quick answers, batch processing, API responses

### Mixed Workload Optimization
**Ideal concurrent configuration:**
- 1 active `gemma3-legal:latest` conversation
- 2-4 `embeddinggemma:latest` embedding requests
- 2-3 `gemma3:270m` quick responses
- **Total**: 5-8 concurrent operations

## Environment Variables for Tuning

```bash
# Increase parallel requests (careful with memory)
set OLLAMA_NUM_PARALLEL=8

# Keep models loaded longer (reduces reload time)
set OLLAMA_KEEP_ALIVE=15m

# Allow multiple models in memory simultaneously
set OLLAMA_MAX_LOADED_MODELS=3

# GPU memory allocation (if using GPU)
set OLLAMA_GPU_LAYERS=35
```

## API Usage Examples

### Embedding Request (embeddinggemma:latest)
```bash
curl -s http://localhost:11434/api/embeddings \
  -d '{"model":"embeddinggemma:latest","prompt":"legal document text"}'
```

### Legal Chat (gemma3-legal:latest)
```bash
curl -s http://localhost:11434/api/generate \
  -d '{"model":"gemma3-legal:latest","prompt":"Analyze this contract","stream":false}'
```

### Quick Response (gemma3:270m)
```bash
curl -s http://localhost:11434/api/generate \
  -d '{"model":"gemma3:270m","prompt":"What is a legal brief?","stream":false}'
```

## Performance Benchmarks

### Model Loading Times
- `gemma3:270m`: ~2-5 seconds (cold start)
- `embeddinggemma:latest`: ~3-8 seconds (cold start)
- `gemma3-legal:latest`: ~15-30 seconds (cold start)

### Concurrent Request Capacity
- **Light load** (1-3 requests): All models respond quickly
- **Medium load** (4-6 requests): Optimal performance range
- **Heavy load** (7+ requests): Queue management kicks in

### Memory Usage
- **Base Ollama**: ~500MB
- **With gemma3:270m**: ~800MB total
- **With embeddinggemma**: ~1.4GB total
- **With gemma3-legal**: ~8.7GB total
- **All models loaded**: ~10GB total

## Best Practices for Legal AI Platform

### Model Selection Strategy
1. **Document embedding**: Use `embeddinggemma:latest`
2. **Complex legal analysis**: Use `gemma3-legal:latest`
3. **Quick API responses**: Use `gemma3:270m`
4. **Fallback embedding**: Use `nomic-embed-text:latest`

### Concurrency Management
```go
// Example Go semaphore for controlling concurrent requests
semaphore := make(chan struct{}, 6) // Max 6 concurrent

func callOllama(model, prompt string) {
    semaphore <- struct{}{} // Acquire
    defer func() { <-semaphore }() // Release

    // Make API call
    response := makeOllamaRequest(model, prompt)
    return response
}
```

### Load Balancing Strategy
1. **High-frequency embeddings**: Direct to `embeddinggemma:latest`
2. **User conversations**: Route to `gemma3-legal:latest`
3. **API endpoints**: Use `gemma3:270m` for speed
4. **Batch processing**: Mix `gemma3:270m` + `embeddinggemma:latest`

## Monitoring & Troubleshooting

### Health Checks
```bash
# Check model availability
curl -s http://localhost:11434/api/tags

# Test specific model
curl -s http://localhost:11434/api/generate \
  -d '{"model":"gemma3:270m","prompt":"test","stream":false}'
```

### Process Management
```bash
# Check running Ollama processes
tasklist | findstr ollama

# Check port usage
netstat -ano | findstr :11434
netstat -ano | findstr :11435
```

### Circuit Breaker Pattern
- Monitor response times (target: <2s for embeddings, <10s for chat)
- Implement fallback to lighter models if heavy models are overloaded
- Use `nomic-embed-text` if `embeddinggemma` becomes unresponsive

## Integration with Legal AI Microservices

### Redis + Ollama Architecture
```
Go Microservice → Redis Cache → Ollama Models
     ↓               ↓              ↓
JSON parsing → Vector cache → Model inference
     ↓               ↓              ↓
SIMD accel → Embedding store → Response
```

### Recommended Service Distribution
- **Document processor**: `embeddinggemma:latest` + Redis cache
- **Chat service**: `gemma3-legal:latest` with conversation memory
- **API gateway**: `gemma3:270m` for quick responses
- **Batch analyzer**: All models with intelligent routing

---

**Last Updated**: December 2024
**Verified Models**: All models tested and operational
**Performance**: Optimized for RTX 3060 Ti + 32GB RAM system

---

## Integration With Load Tester & Service Throttling (2025 Update)

### Load Tester Usage
The repo includes a lightweight load driver at `load-tester/main.go` for exercising the `/process/key/{id}` endpoint end‑to‑end (Redis fetch → parse → embedding + summary → Postgres upsert).

Quick run (service already running):
```powershell
go run ./load-tester -c 4 -n 100 -csv run_c4.csv
```

Important output fields:
- `ErrRate` should remain 0%
- `p99.9` reveals extreme tail (GC pauses / model contention)
- CSV rows allow plotting latency vs. request index to visualize warmup vs steady state.

Suggested concurrency sweep:
```powershell
1,2,4,8,12 | ForEach-Object { go run ./load-tester -c $_ -n 150 -csv sweep_$_.csv }
```

### In-Service Concurrency Guard
Add an optional in-flight cap to prevent model overload even if HTTP concurrency spikes. This is now implemented in the cognitive microservice via an environment variable:

Environment variable:

```
OLLAMA_MAX_INFLIGHT=6   # 0 disables guard
```

When set > 0, a buffered channel semaphore limits concurrent requests entering embedding / generate calls. Excess requests wait until capacity frees (or their context is canceled / times out).
```go
// Implementation sketch (now live):
var ollamaMaxInFlight = getenvInt("OLLAMA_MAX_INFLIGHT", 0)
var inflightSem chan struct{}

// in main()
if ollamaMaxInFlight > 0 { inflightSem = make(chan struct{}, ollamaMaxInFlight) }

// at start of getOllamaEmbeddings / getOllamaSummary
if inflightSem != nil {
  select {
  case inflightSem <- struct{}{}:
    defer func(){ <-inflightSem }()
  case <-ctx.Done():
    return nil, ctx.Err() // or "", ctx.Err() for summary
  }
}
```
Tune `OLLAMA_MAX_INFLIGHT` alongside daemon `OLLAMA_NUM_PARALLEL`.

Observability:

The service now exports a Prometheus gauge:

```
# HELP ollama_inflight_requests Current in-flight Ollama API requests
# TYPE ollama_inflight_requests gauge
ollama_inflight_requests <n>
```

Use this to correlate:
- Saturation (gauge ~= OLLAMA_MAX_INFLIGHT) with rising p99/p99.9
- Under-utilization (gauge rarely > 50% of cap) with potential to raise cap
- Circuit breaker openings shortly after sustained saturation → cap likely too high

### Decision Matrix
| Symptom | p50 | p99.9 | Circuit | Action |
|---------|-----|-------|---------|--------|
| High tail only | stable | high | 0 | Reduce OLLAMA_MAX_INFLIGHT one step |
| All latencies up | high | high | 0/1 | Lower WORKERS or add CPU cores |
| Breaker opens | varied | high | 1/2 | Lower concurrency + verify Ollama health |
| Rising error rate | any | any | any | Inspect logs (timeouts/status), consider retry/backoff tuning |

### When to Switch Models
- If tail latency dominated by `gemma3-legal:latest`, route lighter queries to `gemma3:270m`.
- If embedding throughput insufficient, raise `OLLAMA_MAX_INFLIGHT` only after verifying CPU headroom and zero breaker trips for 5+ minutes.

### Automation Next Steps
- Add CI job: build std/jsonv2 + run a tiny smoke (`-c 1 -n 3`).
- Parse CSV to produce markdown summary (min/avg/p95/p99/p99.9) committed under `perf/` directory per commit.

---
*Add new observations here as you evolve operational thresholds.*