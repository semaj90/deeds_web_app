# Go Package Conflict Resolution

## Problem
VS Code was showing multiple errors in `tensorrt-infer/go/infer.go`:
- ❌ "found packages trt (buffers.go) and chr97 (chr97_gpu.go)"
- ❌ "go list failed to return CompiledGoFiles"
- ❌ Multiple "UndeclaredImportedName" errors (C.cudaStream_t, C.trtEnqueueV2, C.void)

## Root Cause
Two files in the same directory (`tensorrt-infer/go/`) were declaring conflicting packages:
- `buffers.go` → declared `package trt`
- `chr97_gpu.go` → declared `package chr97` (WRONG!)
- `infer.go`, `trt.go`, `loader.go` → declared `package trt`
- `demo.go` → declared `package main` (entry point)
- `engine.go` → declared `package main` (conflicting entry point)

Go doesn't allow multiple packages in the same directory.

## Solution Applied

### 1. Fixed Package Declaration
Changed `chr97_gpu.go` from `package chr97` to `package trt`

### 2. Reorganized Directory Structure
Moved all library code into `/trt` subdirectory:
```
tensorrt-infer/go/
├── demo.go          (package main - entry point)
├── engine.go        (package main - helper functions)
├── go.mod
└── trt/             (NEW: library package)
    ├── buffers.go
    ├── chr97_gpu.go
    ├── infer.go
    ├── loader.go
    └── trt.go
```

### 3. Updated Imports
**demo.go**:
```go
// Before: import "tensorrt-infer/go/chr97"
// After:  import "tensorrt-infer/trt"
// And replaced chr97.NewGPUTileProcessor() with trt.NewGPUTileProcessor()
```

**engine.go**:
```go
// Before: import "tensorrt-infer/go/trt"
// After:  import "tensorrt-infer/trt"
// Renamed main() to demoInference() to avoid dual entry points
```

## Result
✅ **Go package conflict resolved**
- All library code now in `trt` subpackage
- Single entry point in `demo.go`
- Clean import paths
- Next error is legitimate: missing C header file `trt_wrapper.h` (C++ build required)

## Build Status
```
Current error:
  trt\trt.go:7:10: fatal error: 'trt_wrapper.h' file not found

This is expected and requires:
1. Build C++ TensorRT wrapper library first
2. Copy generated headers to tensorrt-infer/cpp/
```

## Files Modified
- ✅ `chr97_gpu.go` - Fixed package declaration
- ✅ `demo.go` - Updated import path, replaced chr97.* with trt.*
- ✅ `engine.go` - Updated import path, renamed main() to demoInference()
- ✅ Created `/trt/` subdirectory with reorganized library code
