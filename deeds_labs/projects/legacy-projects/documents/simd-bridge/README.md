SIMD → GPU → TensorRT Bridge

This folder contains a minimal scaffold for a bridge between simdjson/CUDA SOM cache and TensorRT, plus a Node native addon binding.

Structure created:

simd-bridge/
├── cpp/
│   ├── CMakeLists.txt         # builds libtensorbridge.so and the node addon
│   ├── som_cache.cu           # CUDA stub for SOM cache
│   ├── tensor_bridge.cc       # C++ bridge that links simdjson + TensorRT (stubbed)
│   └── binding.cc             # N-API wrapper for Node
├── binding.gyp                # node-gyp project for the addon

How to build (WSL / Linux / container with CUDA):

# 1) Build C++ shared library with CMake
mkdir -p simd-bridge/build && cd simd-bridge/build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . -j$(nproc)

# 2) Build Node addon (node-gyp expects the shared lib in ../cpp)
cd ../cpp
node-gyp configure build

This scaffolding is intentionally minimal and stubbed: it shows the interfaces and provides a starting point. You will need to fill in the actual SOM CUDA kernel and TensorRT inference code.

Quick N-API notes
------------------

1. Use `node-gyp` or `cmake-js` to build the `.node` addon. Typically you will build a shared library (libtensorbridge.so) and then create a narrow `.node` wrapper that links it.
2. Include `node-addon-api` as a dependency (it provides C++ RAII wrappers for N-API). Install in this folder or globally in the project: `npm install node-addon-api --save-dev`.
3. When building inside a CUDA/TensorRT container, ensure `node` and `node-gyp` are installed and `node` headers exist (node-gyp will fetch them). For reproducibility, build inside a container that has your CUDA and TensorRT SDKs available.
4. Example build flow: build the native library with CMake (produces libtensorbridge.so), then run `node-gyp configure build` for the small N-API wrapper. Provide `libraries` and `include_dirs` to the binding.gyp that point to the native lib and include.

See `README_tensorrt.md` and `run-smoke-tensorrt.ps1` for exact Docker/WSL2 commands to run the TensorRT smoke-test.
