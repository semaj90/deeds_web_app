cmake_minimum_required(VERSION 3.18)
project(tensorrt_bridge LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Feature options
option(SIMD_ENABLE_CUDA "Enable CUDA-backed kernels" ON)
option(SIMD_ENABLE_LIBTORCH "Enable LibTorch-backed kernels" ON)
option(SIMD_ENABLE_FALLBACK_STUBS "Enable fallback stubs when LibTorch is unavailable" ON)

set(SIMD_HAVE_CUDA OFF)
set(SIMD_HAVE_LIBTORCH OFF)

# ── Node.js headers + link library ──────────────────────────────────
# node-gyp caches headers at $LOCALAPPDATA/node-gyp/Cache/<version>/
set(NODE_GYP_CACHE "$ENV{LOCALAPPDATA}/node-gyp/Cache")

# Auto-detect node version
execute_process(
  COMMAND node -e "process.stdout.write(process.version.slice(1))"
  OUTPUT_VARIABLE NODE_VERSION
)
message(STATUS "Node.js version: ${NODE_VERSION}")

set(NODE_INCLUDE "${NODE_GYP_CACHE}/${NODE_VERSION}/include/node")
set(NODE_LIB "${NODE_GYP_CACHE}/${NODE_VERSION}/x64/node.lib")

if(NOT EXISTS "${NODE_INCLUDE}/node_api.h")
  message(STATUS "Downloading node headers via node-gyp...")
  execute_process(COMMAND npx node-gyp install)
endif()

include_directories(${NODE_INCLUDE})
message(STATUS "Node headers: ${NODE_INCLUDE}")
message(STATUS "Node lib: ${NODE_LIB}")

# node-addon-api (header-only C++ wrapper, optional)
set(NAPI_INCLUDE "${CMAKE_CURRENT_SOURCE_DIR}/../../sveltekit-frontend/node_modules/node-addon-api")
if(EXISTS "${NAPI_INCLUDE}/napi.h")
  include_directories(${NAPI_INCLUDE})
  message(STATUS "node-addon-api: ${NAPI_INCLUDE}")
endif()

# ── CUDA Toolkit ────────────────────────────────────────────────────
find_package(CUDAToolkit QUIET)
if(SIMD_ENABLE_CUDA)
  include(CheckLanguage)
  check_language(CUDA)
  if(CMAKE_CUDA_COMPILER)
    # CMake detected a usable CUDA compiler; enable CUDA language
    enable_language(CUDA)
    set(SIMD_HAVE_CUDA ON)
    message(STATUS "CUDA compiler enabled: ${CMAKE_CUDA_COMPILER}")
    if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
      set(CMAKE_CUDA_ARCHITECTURES "86")
    endif()
    if(NOT DEFINED TORCH_CUDA_ARCH_LIST)
      set(TORCH_CUDA_ARCH_LIST "8.6")
    endif()
  else()
    message(WARNING "CUDA compiler unavailable or failed sanity check; proceeding without CUDA (fallback stubs will be used)")
  endif()
else()
  message(STATUS "SIMD_ENABLE_CUDA=OFF: skipping CUDA detection")
endif()

# ── LibTorch (select real or fallback at configure time) ─────────────
# Options to control whether LibTorch-backed kernels are enabled,
# and whether CPU fallback stubs are permitted when LibTorch isn't present.
option(SIMD_ENABLE_LIBTORCH "Enable LibTorch-backed kernels" ON)
option(SIMD_ENABLE_FALLBACK_STUBS "Enable fallback stubs when LibTorch is unavailable" ON)
set(SIMD_HAVE_LIBTORCH OFF)

# Try to find LibTorch only when requested
if(SIMD_ENABLE_LIBTORCH)
  # Save/clear CUDA archs before calling find_package(Torch) to avoid Caffe2 warnings
  set(_SAVED_CUDA_ARCHS "${CMAKE_CUDA_ARCHITECTURES}")
  unset(CMAKE_CUDA_ARCHITECTURES CACHE)
  unset(CMAKE_CUDA_ARCHITECTURES)

  if(DEFINED ENV{LIBTORCH_ROOT})
    list(APPEND CMAKE_PREFIX_PATH "$ENV{LIBTORCH_ROOT}")
    message(STATUS "LIBTORCH_ROOT provided: $ENV{LIBTORCH_ROOT}")
  endif()

  find_package(Torch QUIET)

  # Restore CUDA archs for local CUDA targets
  set(CMAKE_CUDA_ARCHITECTURES "${_SAVED_CUDA_ARCHS}")

  if(NOT Torch_FOUND)
    # Probe common Windows install locations as a convenience
    file(GLOB LIBTORCH_CANDIDATES
      "C:/libtorch*"
      "C:/Program Files/libtorch*"
      "C:/Program Files (x86)/libtorch*"
    )
    foreach(_cand IN LISTS LIBTORCH_CANDIDATES)
      message(STATUS "Probing LibTorch candidate: ${_cand}")
      find_package(Torch QUIET PATHS "${_cand}" NO_DEFAULT_PATH)
      if(Torch_FOUND)
        break()
      endif()
    endforeach()
  endif()

  if(Torch_FOUND)
    set(SIMD_HAVE_LIBTORCH ON)
    message(STATUS "LibTorch found: enabling LibTorch kernels")
  else()
    message(WARNING "LibTorch not found: building fallback/stub kernels (SIMD_ENABLE_FALLBACK_STUBS=${SIMD_ENABLE_FALLBACK_STUBS})")
  endif()
else()
  message(STATUS "SIMD_ENABLE_LIBTORCH=OFF: skipping LibTorch probing; building with fallback if enabled")
endif()

# ── CUDA source files (compiled as CUDA or C++) ─────────────────────
if(SIMD_HAVE_CUDA)
  add_library(cuda_kernels STATIC som_cache.cu lstm_gpu.cu cuda_graph_bridge.cu)
  target_compile_definitions(cuda_kernels PRIVATE SOM_HAVE_CUDA=1)
  set_target_properties(cuda_kernels PROPERTIES CUDA_ARCHITECTURES "86")
else()
  # Build CUDA sources as plain C++ sources for the CPU fallback
  add_library(cuda_kernels STATIC som_cache.cu lstm_gpu.cu cuda_graph_bridge.cu)
  set_source_files_properties(som_cache.cu lstm_gpu.cu cuda_graph_bridge.cu PROPERTIES LANGUAGE CXX)
  target_compile_definitions(cuda_kernels PRIVATE NO_CUDA=1 SOM_HAVE_CUDA=0)
endif()

# ── simdjson (single-header, compiled as part of addon) ──────────────
set(SIMDJSON_SRC "${CMAKE_CURRENT_SOURCE_DIR}/vendor/simdjson.cpp")
if(EXISTS "${SIMDJSON_SRC}")
  message(STATUS "simdjson: found vendor/simdjson.cpp")
else()
  message(WARNING "simdjson: vendor/simdjson.cpp not found — simdJson* functions will be stubs")
endif()

# ── Main addon: tensorrt_bridge.node ────────────────────────────────
set(ADDON_SOURCES
  binding.cc
  tensor_bridge.cc
  simdjson_bridge.cc
  lstm_bridge.cc
)

# Add simdjson implementation if available
if(EXISTS "${SIMDJSON_SRC}")
  list(APPEND ADDON_SOURCES vendor/simdjson.cpp)
endif()

# Add either the LibTorch-backed implementation or the CPU fallback stubs.
if(SIMD_HAVE_LIBTORCH)
  list(APPEND ADDON_SOURCES libtorch_graph_impl.cpp pytorch_graph.cc pytorch_graph_fp16.cc)
else()
  if(SIMD_ENABLE_FALLBACK_STUBS)
    list(APPEND ADDON_SOURCES graph_fallback_stubs.cpp)
  else()
    message(FATAL_ERROR "LibTorch not found and SIMD_ENABLE_FALLBACK_STUBS is OFF. Enable one of them to build the addon.")
  endif()
endif()

add_library(tensorrt_bridge SHARED ${ADDON_SOURCES})

# Node addons use .node extension (renamed .dll/.so)
set_target_properties(tensorrt_bridge PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

# Preprocessor defines
target_compile_definitions(tensorrt_bridge PRIVATE
  NAPI_DISABLE_CPP_EXCEPTIONS
  BUILDING_NODE_EXTENSION
  NODE_GYP_MODULE_NAME=tensorrt_bridge
)
target_compile_definitions(tensorrt_bridge PRIVATE
  SIMD_HAVE_CUDA=${SIMD_HAVE_CUDA}
  SIMD_HAVE_LIBTORCH=${SIMD_HAVE_LIBTORCH}
)

# Link cuda_kernels
target_link_libraries(tensorrt_bridge PRIVATE cuda_kernels)

# Link node.lib (required on Windows for N-API symbols)
if(WIN32 AND EXISTS "${NODE_LIB}")
  target_link_libraries(tensorrt_bridge PRIVATE "${NODE_LIB}")
endif()

# Link LibTorch if available; otherwise compile with NO_LIBTORCH.
if(SIMD_HAVE_LIBTORCH)
  target_link_libraries(tensorrt_bridge PRIVATE ${TORCH_LIBRARIES})
  target_compile_options(tensorrt_bridge PRIVATE ${TORCH_CXX_FLAGS})
else()
  target_compile_definitions(tensorrt_bridge PRIVATE NO_LIBTORCH=1)
endif()

# Link CUDA runtime if available
if(CUDAToolkit_FOUND)
  target_link_libraries(tensorrt_bridge PRIVATE CUDA::cudart)
endif()

# ── Install ─────────────────────────────────────────────────────────
install(TARGETS tensorrt_bridge LIBRARY DESTINATION lib RUNTIME DESTINATION lib)
