go-tensorrt-runner

This folder contains a small Go wrapper that calls into a native TensorRT/C++ runner via cgo.

Why the build script
- cgo needs correct include (-I) and library (-L) flags for CUDA and TensorRT headers/libs.
- These paths are system-dependent on Windows (for example: C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.0).

Quickstart (Windows PowerShell)
1. Open PowerShell.
2. From this folder run: .\build-tensorrt.ps1
3. The script will detect CUDA and TensorRT (if present), set CGO_CFLAGS and CGO_LDFLAGS in-session and run go build -v.

Manual build (if you prefer):
Set CGO_CFLAGS and CGO_LDFLAGS in your PowerShell session then run go build -v. Example values (adjust paths):
  $env:CGO_CFLAGS = '-I"C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.0/include" -I"C:/Program Files/NVIDIA GPU Computing Toolkit/TensorRT/include" -O3 -std=c++17'
  $env:CGO_LDFLAGS = '-L"C:/Program Files/NVIDIA GPU Computing Toolkit/CUDA/v13.0/lib/x64" -L"C:/Program Files/NVIDIA GPU Computing Toolkit/TensorRT/lib" -lnvinfer -lnvonnxparser -lcudart -lstdc++'
  go build -v

If go build still reports missing headers (for example NvInfer.h), ensure the matching TensorRT developer package is installed and the include/lib directories exist.

If you'd like a cross-platform build helper (for WSL/Linux/macOS), I can add a build.sh as well.
