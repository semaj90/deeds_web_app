# TensorRT-LLM Inference Stack Architecture

## 📋 Implementation Roadmap

### Phase 1: Model Preparation ✅
- [x] Identify working checkpoints (gemma3_trtllm_checkpoint)
- [ ] Create INT8 quantized version (19GB → 5GB)
- [ ] Build FP16 engine for quality baseline
- [ ] Build INT8 engine for performance
- [ ] Delete duplicate checkpoints (free 38GB)

### Phase 2: TensorRT Engine Building
```bash
# INT8 Engine (Fast, Small)
trtllm-build --checkpoint_dir ~/gemma3_checkpoint_int8 \
             --output_dir ~/gemma3_engine_int8 \
             --use_weight_only --weight_only_precision int8

# FP16 Engine (Quality)
trtllm-build --checkpoint_dir ~/gemma3_trtllm_checkpoint \
             --output_dir ~/gemma3_engine_fp16 \
             --gemma_plugin float16
```

### Phase 3: Inference Server Setup

#### Option A: Triton Inference Server
```yaml
# model_repository/gemma3_int8/config.pbtxt
name: "gemma3_legal_int8"
backend: "tensorrtllm"
max_batch_size: 8
input [
  {
    name: "text_input"
    data_type: TYPE_STRING
    dims: [-1]
  }
]
output [
  {
    name: "text_output"
    data_type: TYPE_STRING
    dims: [-1]
  }
]
instance_group [
  {
    count: 1
    kind: KIND_GPU
  }
]
```

#### Option B: Direct TensorRT-LLM Runtime
- Lighter weight than Triton
- Direct integration with Go microservice

### Phase 4: Go Microservice Layer

```go
// go-microservice/tensorrt-service.go
package main

import (
    "context"
    pb "legal-ai/proto"
    "google.golang.org/grpc"
)

type TensorRTServer struct {
    pb.UnimplementedLegalAIServer
    enginePath string
    runtime    *TRTRuntime
}

func (s *TensorRTServer) GenerateLegal(ctx context.Context,
    req *pb.LegalRequest) (*pb.LegalResponse, error) {
    // Call TensorRT engine
    result := s.runtime.Infer(req.Prompt)
    return &pb.LegalResponse{Text: result}, nil
}

func main() {
    // Initialize TensorRT runtime
    server := &TensorRTServer{
        enginePath: "/home/james/gemma3_engine_int8/",
        runtime: NewTRTRuntime(),
    }

    // Start gRPC server
    lis, _ := net.Listen("tcp", ":50051")
    grpcServer := grpc.NewServer()
    pb.RegisterLegalAIServer(grpcServer, server)

    // Also start QUIC server for low-latency
    quicServer := StartQUICServer(":4433", server)

    grpcServer.Serve(lis)
}
```

### Phase 5: SvelteKit Integration

```typescript
// src/routes/api/legal-ai/+server.ts
import { GrpcClient } from '$lib/grpc-client';
import { QuicClient } from '$lib/quic-client';

export async function POST({ request }) {
    const { prompt, useQuic = false } = await request.json();

    // Choose transport based on requirements
    const client = useQuic
        ? new QuicClient('localhost:4433')  // Low-latency streaming
        : new GrpcClient('localhost:50051'); // Standard RPC

    const response = await client.generateLegal({
        prompt,
        engine: 'int8',  // or 'fp16' for quality
        maxTokens: 1024
    });

    return json(response);
}
```

### Phase 6: Performance Optimization

#### Batching Strategy
```go
// Batch multiple requests for efficiency
type BatchProcessor struct {
    queue    chan *Request
    batchSize int
    timeout   time.Duration
}

func (b *BatchProcessor) ProcessBatch() {
    batch := make([]*Request, 0, b.batchSize)
    timer := time.NewTimer(b.timeout)

    for {
        select {
        case req := <-b.queue:
            batch = append(batch, req)
            if len(batch) >= b.batchSize {
                b.executeBatch(batch)
                batch = batch[:0]
                timer.Reset(b.timeout)
            }
        case <-timer.C:
            if len(batch) > 0 {
                b.executeBatch(batch)
                batch = batch[:0]
            }
            timer.Reset(b.timeout)
        }
    }
}
```

## 🚀 Performance Targets

| Metric | INT8 Engine | FP16 Engine | Current (Ollama) |
|--------|------------|-------------|------------------|
| Latency (first token) | <50ms | <100ms | ~500ms |
| Throughput | 100 tok/s | 50 tok/s | 10 tok/s |
| Memory | 5GB | 19GB | 20GB |
| Batch Size | 8 | 4 | 1 |

## 🔧 Required Components

1. **TensorRT-LLM** (✅ Installed in trt_env_310)
2. **NVIDIA Triton** (Optional, for production)
3. **Go gRPC/QUIC libs**:
   ```bash
   go get google.golang.org/grpc
   go get github.com/quic-go/quic-go
   ```
4. **SvelteKit adapters** (Already in project)

## 📝 Next Steps

1. **Immediate** (Today):
   - Run `build-tensorrt-engines.sh` to create engines
   - Delete duplicate checkpoints (save 38GB)
   - Test INT8 vs FP16 quality/performance

2. **Tomorrow**:
   - Set up Go microservice with gRPC
   - Implement basic TensorRT runtime wrapper
   - Create protobuf definitions

3. **This Week**:
   - Wire up SvelteKit endpoints
   - Add QUIC streaming support
   - Implement batching logic
   - Performance benchmarking

4. **Production Ready**:
   - Add Triton server for scale
   - Implement caching layer
   - Add monitoring/metrics
   - Deploy with Docker/K8s