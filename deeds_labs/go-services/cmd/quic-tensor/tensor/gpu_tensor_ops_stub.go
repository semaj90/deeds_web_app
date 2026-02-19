//go:build !cuda
// +build !cuda

package tensor

import (
	"fmt"
	"math/rand"
	"time"
)

const (
    // Keep same constants as CUDA implementation
    EmbeddingDimension = 384
    MaxSequenceLength  = 512
)

// InitTensorRT is a no-op in the stub build
func InitTensorRT() {
    // noop: TensorRT not available in this build
}

// ExecuteGPUEmbedding returns a simulated embedding and latency when CUDA/TensorRT is not enabled.
func ExecuteGPUEmbedding(query string) (tensorID string, gpuTime int64, embedding []float32) {
    start := time.Now()
    // deterministic-ish pseudo-embedding for fallback: seeded by time
    rand.Seed(time.Now().UnixNano())
    embedding = make([]float32, EmbeddingDimension)
    for i := range embedding {
        embedding[i] = float32(rand.Intn(1000)) / 1000.0
    }
    // simulate small inference latency
    simulatedMs := int64(8 + rand.Intn(10))
    time.Sleep(time.Duration(simulatedMs) * time.Millisecond)
    gpuTime = time.Since(start).Milliseconds()
    tensorID = fmt.Sprintf("tensor_stub_%d", start.UnixNano())
    return
}
