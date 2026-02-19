package tensor

/*
#cgo LDFLAGS: -L${SRCDIR} -lembedding_trt -lnvinfer -lnvinfer_plugin -lcudart -lcublas -lstdc++
// Declare the C functions we want to call
float runEmbedding(const char* text, float* out, int maxLen);
int loadTRTEngine(const char* path);
*/
import "C"
import (
	"fmt"
	"time"
	"unsafe"
)

const (
	// EmbeddingDimension is the expected output dimension of the embedding model (e.g., Gemma).
	EmbeddingDimension = 384
	// MaxSequenceLength is the maximum number of tokens the TensorRT engine can process for input.
	// This value should match the model's configured maximum input sequence length.
	// A common value for many transformer models is 512. Adjust if your model differs.
	MaxSequenceLength = 512
)

var initialized bool

func InitTensorRT() {
	if initialized { return }
	// Ensure the path to the .plan file is correct within the Docker container
	path := C.CString("/models/embeddinggemma.plan")
	defer C.free(unsafe.Pointer(path)) // Free the C string after use

	status := C.loadTRTEngine(path)
	if status != 0 {
		panic("❌ failed to load TensorRT engine")
	}
	initialized = true
	fmt.Println("✅ TensorRT engine loaded")
}

// ExecuteGPUEmbedding performs real FP16 embedding inference via TensorRT
func ExecuteGPUEmbedding(query string) (tensorID string, gpuTime int64, embedding []float32) {
	InitTensorRT()
	start := time.Now()

	// Assuming an embedding dimension of 768 for Gemma
	embedding = make([]float32, EmbeddingDimension)

	cstr := C.CString(query)
	defer C.free(unsafe.Pointer(cstr)) // Free the C string after use

	// Call the C function for embedding inference
	// The C function will fill the 'embedding' slice directly
	// maxLen should be the maximum sequence length for tokenization, not the embedding dimension.
	latencyMs := C.runEmbedding(cstr, (*C.float)(unsafe.Pointer(&embedding[0])), C.int(MaxSequenceLength))

	gpuTime = time.Since(start).Milliseconds() // This measures Go overhead + C call
	// If you want only the C-side inference time, use latencyMs
	// gpuTime = int64(latencyMs)

	tensorID = fmt.Sprintf("tensor_%d", start.UnixNano())
	return
}
}
