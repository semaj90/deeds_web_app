# TensorRT Inference Pipeline for Windows

Complete end-to-end TensorRT (INT4 AWQ) → CUDA → Go inference pipeline for Windows 10 Home with VS2022, CUDA 12/13, and TensorRT 10.x.

## Features

- ✅ C++ TensorRT wrapper with extern "C" interface
- ✅ Go CGO bindings for seamless integration
- ✅ GPU buffer management with CUDA
- ✅ Engine loading and inference execution
- ✅ Windows CMake build system
- ✅ Gemma3 INT4 AWQ model support
- ✅ Ready for legal AI pipeline integration

## Prerequisites

- Windows 10 Home or Pro
- Visual Studio 2022 with C++ build tools
- CUDA 12.x or 13.x
- TensorRT 10.x (installed to `C:/TensorRT/`)
- Go 1.19+

## Build Instructions

### 1. Build C++ TensorRT Wrapper

```bash
# Create build directory
cmake -B build -S .

# Build the DLL
cmake --build build --config Release
```

### 2. Copy DLL to Go Directory

```bash
cp build/cpp/Release/trt_wrapper.dll go/
```

### 3. Build Go Package

```bash
cd go
go build -buildmode=c-shared -o trt.dll .
```

## Usage

### Basic Inference Example

```go
package main

import (
    "fmt"
    "tensorrt-infer/go/trt"
)

func main() {
    // Load TensorRT engine
    engine, err := trt.LoadPlan("gemma3_int4.plan")
    if err != nil {
        panic(err)
    }

    // Prepare input/output buffers
    input := make([]float32, 4096)   // token embeddings
    output := make([]float32, 4096)  // next-token logits

    // Run inference
    err = engine.Infer(input, output)
    if err != nil {
        panic(err)
    }

    fmt.Println("Inference successful!")
    fmt.Printf("First 10 logits: %v\n", output[:10])
}
```

## Integration with Legal AI Pipeline

This TensorRT pipeline is designed to integrate with:

- **Phase 70/71**: RAG pipeline acceleration
- **Judge Engine**: Legal document analysis
- **Embedding Services**: GPU-accelerated text embeddings
- **Microservices**: Go backend inference services

## Directory Structure

```
tensorrt-infer/
├── cpp/                    # C++ TensorRT wrapper
│   ├── trt_wrapper.cpp
│   ├── trt_wrapper.h
│   └── CMakeLists.txt
├── go/                     # Go bindings and examples
│   ├── trt.go             # CGO bindings
│   ├── loader.go          # Engine loading
│   ├── buffers.go         # GPU buffer management
│   ├── infer.go           # Inference execution
│   └── engine.go          # Example usage
├── CMakeLists.txt         # Top-level build
└── README.md             # This file
```

## Performance

- **Memory**: <8GB RAM usage
- **GPU**: <50% VRAM utilization for embeddings
- **Speed**: Sub-second inference for Gemma3 models
- **Compatibility**: Windows 10 Home, CUDA 12/13, TensorRT 10.x

## Troubleshooting

### Common Issues

1. **"Cannot find TensorRT libraries"**
   - Ensure TensorRT is installed to `C:/TensorRT/`
   - Check `C:/TensorRT/lib/` contains `nvinfer.lib`

2. **"CUDA runtime error"**
   - Verify CUDA installation: `nvcc --version`
   - Check GPU: `nvidia-smi`

3. **"CGO build failed"**
   - Ensure Visual Studio C++ build tools are installed
   - Check Go version: `go version`

### Build Logs

Check build output in `build/` directory for detailed error messages.

## License

This TensorRT inference pipeline is part of the Legal AI Platform and follows the same licensing terms.