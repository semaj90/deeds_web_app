//go:build cuda

package quictensor

/*
#cgo CXXFLAGS: -std=c++17
#cgo LDFLAGS: -L${SRCDIR}/native -lembedding_trt -lcudart -lnvinfer -lnvparsers -lnvonnxparser
#cgo LDFLAGS: -Wl,-rpath=${SRCDIR}/native
#include "native/embedding_trt.h"
#include <stdlib.h> // For C.free
*/
import "C"
import (
	"fmt"
	"unsafe"
)

// LoadTRTEngine loads the TensorRT engine from the specified path.
func LoadTRTEngine(enginePath string) error {
	cEnginePath := C.CString(enginePath)
	defer C.free(unsafe.Pointer(cEnginePath))

	ret := C.loadTRTEngine(cEnginePath)
	if ret != 0 {
		return fmt.Errorf("failed to load TensorRT engine from %s", enginePath)
	}
	return nil
}

// RunEmbedding performs embedding inference using the loaded TensorRT engine.
// It takes pre-tokenized input IDs, attention mask, and the maximum sequence length.
// The output embeddings are returned as a Go slice.
func RunEmbedding(inputIDs []int32, attentionMask []int32, maxLen int) ([]float32, error) {
	if len(inputIDs) != maxLen || len(attentionMask) != maxLen {
		return nil, fmt.Errorf("inputIDs and attentionMask must have length equal to maxLen")
	}

	// Determine output size (e.g., embedding dimension)
	// This needs to be known or queried from the engine after loading.
	// For now, let's assume a fixed embedding dimension, e.g., 768.
	// In a real scenario, you'd query engine->getBindingDimensions(outputEmbeddingsIdx)
	// and pass that information back to Go or have it configured.
	embeddingDim := 768 // Placeholder: Adjust this to your model's actual embedding dimension
	output := make([]float32, embeddingDim)

	cInputIDs := (*C.int)(unsafe.Pointer(&inputIDs[0]))
	cAttentionMask := (*C.int)(unsafe.Pointer(&attentionMask[0]))
	cOutput := (*C.float)(unsafe.Pointer(&output[0]))

	latencyMs := C.runEmbedding(cInputIDs, cAttentionMask, C.int(maxLen), cOutput)
	if latencyMs < 0 {
		return nil, fmt.Errorf("TensorRT embedding inference failed")
	}

	fmt.Printf("TensorRT embedding inference latency: %.2f ms\n", latencyMs)
	return output, nil
}
