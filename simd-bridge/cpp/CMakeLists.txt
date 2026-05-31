cmake_minimum_required(VERSION 3.18)
project(tensorrt_bridge LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# ── Feature options (all overridable via -D or env vars) ─────────────
option(SIMD_ENABLE_CUDA          "Enable CUDA-backed kernels"              ON)
option(SIMD_ENABLE_LIBTORCH      "Enable LibTorch-backed kernels"          ON)
option(SIMD_ENABLE_FALLBACK_STUBS "Enable CPU fallback stubs"              ON)
option(SIMD_ENABLE_CUBLAS        "Link cuBLAS for direct GEMM kernels"     ON)
option(SIMD_ENABLE_CUBLASLT      "Link cuBLASLt for FP16/BF16 matmul"     ON)
option(SIMD_ENABLE_CUVS          "Link cuVS (CAGRA/IVF-PQ/IVF-RaBitQ)"   OFF)
option(SIMD_ENABLE_CUTLASS       "Enable CUTLASS 3.x header-only GEMM"    OFF)

set(SIMD_HAVE_CUDA     OFF)
set(SIMD_HAVE_LIBTORCH OFF)
set(SIMD_HAVE_CUBLAS   OFF)
set(SIMD_HAVE_CUBLASLT OFF)
set(SIMD_HAVE_CUVS     OFF)
set(SIMD_HAVE_CUTLASS  OFF)

# ── Dynamic path resolution ───────────────────────────────────────────
# Priority: env var > CMake cache/preset > auto-glob

# LibTorch: env LIBTORCH_ROOT > preset CMAKE_PREFIX_PATH > glob C:/libtorch*
if(DEFINED ENV{LIBTORCH_ROOT})
  list(APPEND CMAKE_PREFIX_PATH "$ENV{LIBTORCH_ROOT}")
  message(STATUS "LibTorch root (env LIBTORCH_ROOT): $ENV{LIBTORCH_ROOT}")
elseif(DEFINED CMAKE_PREFIX_PATH)
  message(STATUS "LibTorch root (preset): ${CMAKE_PREFIX_PATH}")
else()
  file(GLOB _lt_candidates "C:/libtorch*" "C:/Program Files/libtorch*")
  if(_lt_candidates)
    list(SORT _lt_candidates)
    list(GET _lt_candidates -1 _lt_best)
    list(APPEND CMAKE_PREFIX_PATH "${_lt_best}")
    message(STATUS "LibTorch root (auto): ${_lt_best}")
  endif()
endif()

# cuVS: env CUVS_ROOT > RAPIDS conda env > skip
set(CUVS_ROOT "")
if(SIMD_ENABLE_CUVS)
  if(DEFINED ENV{CUVS_ROOT})
    set(CUVS_ROOT "$ENV{CUVS_ROOT}")
    message(STATUS "cuVS root (env): ${CUVS_ROOT}")
  else()
    # RAPIDS conda/pip installs: check CONDA_PREFIX, WSL /usr/local, Docker paths
    foreach(_cand
        "$ENV{CONDA_PREFIX}/Library"
        "$ENV{CONDA_PREFIX}"
        "/usr/local"
        "/opt/conda"
        "C:/rapids/cuvs")
      if(EXISTS "${_cand}/include/cuvs/neighbors/ivf_pq.hpp")
        set(CUVS_ROOT "${_cand}")
        message(STATUS "cuVS root (auto): ${CUVS_ROOT}")
        break()
      endif()
    endforeach()
    if(NOT CUVS_ROOT)
      message(STATUS "cuVS: not found (set CUVS_ROOT or: conda install -c rapidsai cuvs-cu13)")
    endif()
  endif()
endif()

# CUTLASS: env CUTLASS_ROOT > standard clone location
set(CUTLASS_ROOT "")
if(SIMD_ENABLE_CUTLASS)
  if(DEFINED ENV{CUTLASS_ROOT})
    set(CUTLASS_ROOT "$ENV{CUTLASS_ROOT}")
    message(STATUS "CUTLASS root (env): ${CUTLASS_ROOT}")
  else()
    foreach(_cand
        "C:/cutlass"
        "$ENV{USERPROFILE}/cutlass"
        "/opt/cutlass"
        "$ENV{HOME}/cutlass")
      if(EXISTS "${_cand}/include/cutlass/gemm/device/gemm.h")
        set(CUTLASS_ROOT "${_cand}")
        message(STATUS "CUTLASS root (auto): ${CUTLASS_ROOT}")
        break()
      endif()
    endforeach()
    if(NOT CUTLASS_ROOT)
      message(STATUS "CUTLASS: not found (set CUTLASS_ROOT or: git clone https://github.com/NVIDIA/cutlass C:/cutlass)")
    endif()
  endif()
endif()

# ── Node.js headers + link library ───────────────────────────────────
set(NODE_GYP_CACHE "$ENV{LOCALAPPDATA}/node-gyp/Cache")
execute_process(
  COMMAND node -e "process.stdout.write(process.version.slice(1))"
  OUTPUT_VARIABLE NODE_VERSION
)
message(STATUS "Node.js version: ${NODE_VERSION}")
set(NODE_INCLUDE "${NODE_GYP_CACHE}/${NODE_VERSION}/include/node")
set(NODE_LIB     "${NODE_GYP_CACHE}/${NODE_VERSION}/x64/node.lib")
if(NOT EXISTS "${NODE_INCLUDE}/node_api.h")
  message(STATUS "Downloading node headers via node-gyp...")
  execute_process(COMMAND npx node-gyp install)
endif()
include_directories(${NODE_INCLUDE})
message(STATUS "Node headers: ${NODE_INCLUDE}")

set(NAPI_INCLUDE "${CMAKE_CURRENT_SOURCE_DIR}/../../sveltekit-frontend/node_modules/node-addon-api")
if(EXISTS "${NAPI_INCLUDE}/napi.h")
  include_directories(${NAPI_INCLUDE})
  message(STATUS "node-addon-api: ${NAPI_INCLUDE}")
endif()

# ── CUDA Toolkit ─────────────────────────────────────────────────────
find_package(CUDAToolkit QUIET)
if(SIMD_ENABLE_CUDA)
  include(CheckLanguage)
  check_language(CUDA)
  if(CMAKE_CUDA_COMPILER)
    enable_language(CUDA)
    set(SIMD_HAVE_CUDA ON)
    message(STATUS "CUDA compiler: ${CMAKE_CUDA_COMPILER}")
    if(CUDAToolkit_VERSION)
      message(STATUS "CUDA Toolkit: ${CUDAToolkit_VERSION}")
    endif()
    if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
      set(CMAKE_CUDA_ARCHITECTURES "86")
    endif()
    if(NOT DEFINED TORCH_CUDA_ARCH_LIST)
      set(TORCH_CUDA_ARCH_LIST "8.6")
    endif()
  else()
    message(WARNING "CUDA compiler unavailable — building CPU fallback stubs")
  endif()
endif()

# ── cuBLAS + cuBLASLt (direct GEMM, separate from LibTorch) ──────────
# LibTorch already dispatches mm() through cuBLASLt internally.
# These flags let custom GEMM kernels bypass LibTorch when needed.
if(SIMD_ENABLE_CUBLAS AND CUDAToolkit_FOUND)
  if(TARGET CUDA::cublas)
    set(SIMD_HAVE_CUBLAS ON)
    message(STATUS "cuBLAS: found via CUDAToolkit")
  endif()
  if(SIMD_ENABLE_CUBLASLT AND TARGET CUDA::cublasLt)
    set(SIMD_HAVE_CUBLASLT ON)
    message(STATUS "cuBLASLt: found (FP16/BF16 matmul heuristic)")
  endif()
  if(NOT SIMD_HAVE_CUBLAS)
    message(STATUS "cuBLAS: not in CUDAToolkit targets — LibTorch handles matmul")
  endif()
endif()

# ── cuVS (CAGRA graph ANN + IVF-PQ + IVF-RaBitQ) ────────────────────
# CAGRA: GPU-resident graph index, fastest ANN for 768-dim embeddings
# IVF-RaBitQ (2026): 2.7x faster than IVF-PQ, no raw-vector reranking
# Windows native: needs RAPIDS conda (limited support, use WSL/Docker)
# WSL2/Docker: conda install -c rapidsai cuvs-cu13
if(SIMD_ENABLE_CUVS AND CUVS_ROOT AND EXISTS "${CUVS_ROOT}/include/cuvs/neighbors/ivf_pq.hpp")
  set(SIMD_HAVE_CUVS ON)
  include_directories("${CUVS_ROOT}/include")
  find_library(CUVS_LIB cuvs PATHS "${CUVS_ROOT}/lib" "${CUVS_ROOT}/lib64" NO_DEFAULT_PATH)
  find_library(RAFT_LIB raft PATHS "${CUVS_ROOT}/lib" "${CUVS_ROOT}/lib64" NO_DEFAULT_PATH)
  # Check for CAGRA (graph-based ANN, fastest for recall >0.95)
  if(EXISTS "${CUVS_ROOT}/include/cuvs/neighbors/cagra.hpp")
    target_compile_definitions(tensorrt_bridge PRIVATE SIMD_HAVE_CAGRA=1)
    message(STATUS "cuVS CAGRA: found (graph ANN, best recall/throughput tradeoff)")
  endif()
  # Check for IVF-RaBitQ (2026, fastest throughput, no reranking needed)
  if(EXISTS "${CUVS_ROOT}/include/cuvs/neighbors/ivf_rabitq.hpp")
    target_compile_definitions(tensorrt_bridge PRIVATE SIMD_HAVE_IVF_RABITQ=1)
    message(STATUS "cuVS IVF-RaBitQ: found (2.7x faster than IVF-PQ)")
  endif()
  message(STATUS "cuVS: enabled at ${CUVS_ROOT}")
endif()

# ── CUTLASS 3.x (header-only FP16/BF16/INT8 GEMM) ────────────────────
# No linking — headers only. Ampere (SM80+): TensorCore MMA kernels.
# Use when custom GEMM tile configs beat cuBLAS heuristic (rare).
if(SIMD_ENABLE_CUTLASS AND CUTLASS_ROOT AND EXISTS "${CUTLASS_ROOT}/include/cutlass/gemm/device/gemm.h")
  set(SIMD_HAVE_CUTLASS ON)
  include_directories("${CUTLASS_ROOT}/include" "${CUTLASS_ROOT}/tools/util/include")
  message(STATUS "CUTLASS 3.x: found at ${CUTLASS_ROOT} (SM86 TensorCore MMA)")
endif()

# ── LibTorch ─────────────────────────────────────────────────────────
if(SIMD_ENABLE_LIBTORCH)
  set(_SAVED_CUDA_ARCHS "${CMAKE_CUDA_ARCHITECTURES}")
  unset(CMAKE_CUDA_ARCHITECTURES CACHE)
  unset(CMAKE_CUDA_ARCHITECTURES)

  find_package(Torch QUIET)

  set(CMAKE_CUDA_ARCHITECTURES "${_SAVED_CUDA_ARCHS}")

  if(Torch_FOUND)
    set(SIMD_HAVE_LIBTORCH ON)
    message(STATUS "LibTorch: found — cuBLASLt FP16/BF16 dispatched via torch::mm()")
  else()
    message(WARNING "LibTorch: not found — building CPU fallback stubs")
  endif()
endif()

# ── Capability summary ────────────────────────────────────────────────
message(STATUS "")
message(STATUS "═══ SIMD-Bridge capability summary ═══════════════════════")
message(STATUS "  CUDA kernels    : ${SIMD_HAVE_CUDA}  (arch=${CMAKE_CUDA_ARCHITECTURES})")
message(STATUS "  LibTorch+cuBLASLt: ${SIMD_HAVE_LIBTORCH}")
message(STATUS "  cuBLAS direct   : ${SIMD_HAVE_CUBLAS}")
message(STATUS "  cuBLASLt direct : ${SIMD_HAVE_CUBLASLT}")
message(STATUS "  cuVS (CAGRA/ANN): ${SIMD_HAVE_CUVS}")
message(STATUS "  CUTLASS 3.x     : ${SIMD_HAVE_CUTLASS}")
message(STATUS "═══════════════════════════════════════════════════════════")
message(STATUS "")

# ── CUDA source files ─────────────────────────────────────────────────
if(SIMD_HAVE_CUDA)
  add_library(cuda_kernels STATIC som_cache.cu lstm_gpu.cu cuda_graph_bridge.cu)
  target_compile_definitions(cuda_kernels PRIVATE SOM_HAVE_CUDA=1)
  set_target_properties(cuda_kernels PROPERTIES CUDA_ARCHITECTURES "${CMAKE_CUDA_ARCHITECTURES}")
else()
  add_library(cuda_kernels STATIC som_cache.cu lstm_gpu.cu cuda_graph_bridge.cu)
  set_source_files_properties(som_cache.cu lstm_gpu.cu cuda_graph_bridge.cu PROPERTIES LANGUAGE CXX)
  target_compile_definitions(cuda_kernels PRIVATE NO_CUDA=1 SOM_HAVE_CUDA=0)
endif()

# ── simdjson ─────────────────────────────────────────────────────────
set(SIMDJSON_SRC "${CMAKE_CURRENT_SOURCE_DIR}/vendor/simdjson.cpp")
if(EXISTS "${SIMDJSON_SRC}")
  message(STATUS "simdjson: found vendor/simdjson.cpp")
else()
  message(WARNING "simdjson: not found — simdJson* functions will be stubs")
endif()

# ── Main addon sources ────────────────────────────────────────────────
set(ADDON_SOURCES
  binding.cc
  tensor_bridge.cc
  simdjson_bridge.cc
  lstm_bridge.cc
  cuvs_bridge.cc
)

if(EXISTS "${SIMDJSON_SRC}")
  list(APPEND ADDON_SOURCES vendor/simdjson.cpp)
endif()

if(SIMD_HAVE_LIBTORCH)
  list(APPEND ADDON_SOURCES libtorch_graph_impl.cpp pytorch_graph.cc pytorch_graph_fp16.cc)
else()
  if(SIMD_ENABLE_FALLBACK_STUBS)
    list(APPEND ADDON_SOURCES graph_fallback_stubs.cpp)
  else()
    message(FATAL_ERROR "LibTorch not found and SIMD_ENABLE_FALLBACK_STUBS is OFF.")
  endif()
endif()

add_library(tensorrt_bridge SHARED ${ADDON_SOURCES})
set_target_properties(tensorrt_bridge PROPERTIES PREFIX "" SUFFIX ".node")

# ── Compile definitions ───────────────────────────────────────────────
target_compile_definitions(tensorrt_bridge PRIVATE
  NAPI_DISABLE_CPP_EXCEPTIONS
  BUILDING_NODE_EXTENSION
  NODE_GYP_MODULE_NAME=tensorrt_bridge
  SIMD_HAVE_CUDA=$<BOOL:${SIMD_HAVE_CUDA}>
  SIMD_HAVE_LIBTORCH=$<BOOL:${SIMD_HAVE_LIBTORCH}>
  SIMD_HAVE_CUBLAS=$<BOOL:${SIMD_HAVE_CUBLAS}>
  SIMD_HAVE_CUBLASLT=$<BOOL:${SIMD_HAVE_CUBLASLT}>
  SIMD_HAVE_CUVS=$<BOOL:${SIMD_HAVE_CUVS}>
  SIMD_HAVE_CUTLASS=$<BOOL:${SIMD_HAVE_CUTLASS}>
)

if(SIMD_HAVE_CUTLASS)
  # SM86 Ampere TensorCore MMA: enable FP16 TensorOp kernels
  target_compile_definitions(tensorrt_bridge PRIVATE
    CUTLASS_ARCH_MMA_SM80_ENABLED=1
    CUTLASS_ENABLE_TENSOR_CORE_MMA=1
  )
endif()

# ── Link libraries ────────────────────────────────────────────────────
target_link_libraries(tensorrt_bridge PRIVATE cuda_kernels)

if(WIN32 AND EXISTS "${NODE_LIB}")
  target_link_libraries(tensorrt_bridge PRIVATE "${NODE_LIB}")
endif()

if(SIMD_HAVE_LIBTORCH)
  # TORCH_LIBRARIES includes cuBLAS, cuBLASLt, cudnn (Linux), cudart
  target_link_libraries(tensorrt_bridge PRIVATE ${TORCH_LIBRARIES})
  target_compile_options(tensorrt_bridge PRIVATE ${TORCH_CXX_FLAGS})
else()
  target_compile_definitions(tensorrt_bridge PRIVATE NO_LIBTORCH=1)
endif()

# Direct cuBLAS/cuBLASLt (for custom GEMM bypassing LibTorch dispatch)
if(SIMD_HAVE_CUBLAS)
  target_link_libraries(tensorrt_bridge PRIVATE CUDA::cublas)
endif()
if(SIMD_HAVE_CUBLASLT AND TARGET CUDA::cublasLt)
  target_link_libraries(tensorrt_bridge PRIVATE CUDA::cublasLt)
endif()

# cuVS
if(SIMD_HAVE_CUVS)
  if(CUVS_LIB)
    target_link_libraries(tensorrt_bridge PRIVATE "${CUVS_LIB}")
  endif()
  if(RAFT_LIB)
    target_link_libraries(tensorrt_bridge PRIVATE "${RAFT_LIB}")
  endif()
endif()

# CUDA runtime
if(CUDAToolkit_FOUND)
  target_link_libraries(tensorrt_bridge PRIVATE CUDA::cudart)
endif()

# ── Install ───────────────────────────────────────────────────────────
install(TARGETS tensorrt_bridge LIBRARY DESTINATION lib RUNTIME DESTINATION lib)