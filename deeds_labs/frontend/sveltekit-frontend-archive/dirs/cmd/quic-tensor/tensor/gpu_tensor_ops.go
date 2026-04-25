package tensor

/*
#cgo CFLAGS: -I${SRCDIR}
#cgo LDFLAGS: -L${SRCDIR} -lembedding_trt
#include "embedding_trt.h"
#include <stdlib.h>
*/
import "C"
import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"
)

var (
	initialized bool
	initMutex   sync.Mutex
)

// InitTensorRT initializes the TensorRT engine.
// It's designed to be called once and is thread-safe.
func InitTensorRT() {
	initMutex.Lock()
	defer initMutex.Unlock()

	if initialized {
		return
	}

	// Determine the path to the .plan file
	// In a Docker container, /models/embeddinggemma.plan is the expected path.
	// For local development, you might need to adjust this.
	enginePath := "/models/embeddinggemma.plan"
	if _, err := os.Stat(enginePath); os.IsNotExist(err) {
		// Fallback for local development if /models doesn't exist or is not mounted
		// This assumes the .plan file might be in a 'models' directory relative to the executable
		execDir, err := os.Executable()
		if err == nil {
			localPath := filepath.Join(filepath.Dir(execDir), "models", "embeddinggemma.plan")
			if _, err := os.Stat(localPath); err == nil {
				enginePath = localPath
			}
		}
		log.Printf("Warning: TensorRT engine not found at %s. Attempting local path: %s\n", "/models/embeddinggemma.plan", enginePath)
	}

	cPath := C.CString(enginePath)
	defer C.free(unsafe.Pointer(cPath)) // Free the C string after use

	status := C.loadTRTEngine(cPath)
	if status != 0 {
		panic(fmt.Sprintf("❌ failed to load TensorRT engine from %s", enginePath))
	}
	initialized = true
	fmt.Println("✅ TensorRT engine loaded")
}

// ExecuteGPUEmbedding performs real FP16 embedding inference via TensorRT.
// It takes a query string and returns a tensor ID and the GPU processing time in milliseconds.
func ExecuteGPUEmbedding(query string) (tensorID string, gpuTime int64) {
	InitTensorRT() // Ensure the engine is initialized

	start := time.Now()

	// Assuming a fixed embedding dimension of 768 for Gemma
	embeddingDimension := 768
	out := make([]float32, embeddingDimension)

	// Convert Go string to C string
	cQuery := C.CString(query)
	defer C.free(unsafe.Pointer(cQuery)) // Free the C string after use

	// Safety: ensure out has at least one element before taking &out[0]
	if len(out) == 0 {
		log.Println("⚠️  embedding output buffer has zero length")
		return "", -1
	}

	// Call the C function to run embedding inference and capture status
	status := C.runEmbedding(cQuery, (*C.float)(unsafe.Pointer(&out[0])), C.int(len(out)))
	if status != 0 {
		log.Printf("❌ runEmbedding failed with status %d\n", int(status))
		return "", -1
	}

	gpuTime = time.Since(start).Milliseconds()
	tensorID = fmt.Sprintf("tensor_%d", start.UnixNano())

	// In a real application, you would likely return the 'out' slice (the embedding)
	// or store it somewhere. For this example, we just return ID and time.
	// fmt.Printf("Generated embedding for query '%s': %v...\n", query, out[:5]) // Print first 5 elements for debug

	return
}
