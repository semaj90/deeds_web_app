package main

// Build notes: use build-tensorrt.ps1 to set CGO_CFLAGS/CGO_LDFLAGS.
/*
#include "trt_runner.h"
*/
import "C"

import "fmt"

func main() {
    fmt.Println("🚀 Starting TensorRT Go microservice")
    C.loadEngine(C.CString("/workspace/engines/gemma3_270m_fp16.engine"))
    out := C.runInference(C.CString("Hello"))
    fmt.Println("Output:", C.GoString(out))
}
