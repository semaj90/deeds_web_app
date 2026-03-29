cmake_minimum_required(VERSION 3.18)
project(tensorrt_bridge LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

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
if(CUDAToolkit_FOUND)
  message(STATUS "CUDA Toolkit found: ${CUDAToolkit_VERSION}")
  enable_language(CUDA)
  if(NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
    set(CMAKE_CUDA_ARCHITECTURES "86")  # RTX 3060 Ti = SM 8.6
  endif()
else()
  message(STATUS "CUDA not found -> CPU-only build")
endif()

# ── LibTorch ────────────────────────────────────────────────────────
find_package(Torch QUIET)
if(Torch_FOUND)
  message(STATUS "LibTorch found: ${TORCH_CXX_FLAGS}")
else()
  message(WARNING "LibTorch not found — set -DCMAKE_PREFIX_PATH=/path/to/libtorch")
endif()

# ── CUDA source files (compiled as CUDA or C++) ─────────────────────
if(CUDAToolkit_FOUND)
  add_library(cuda_kernels STATIC som_cache.cu lstm_gpu.cu)
  target_compile_definitions(cuda_kernels PRIVATE SOM_HAVE_CUDA=1)
  set_target_properties(cuda_kernels PROPERTIES CUDA_ARCHITECTURES "86")
else()
  add_library(cuda_kernels STATIC som_cache.cu lstm_gpu.cu)
  set_source_files_properties(som_cache.cu lstm_gpu.cu PROPERTIES LANGUAGE CXX)
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
)

# Add simdjson implementation if available
if(EXISTS "${SIMDJSON_SRC}")
  list(APPEND ADDON_SOURCES vendor/simdjson.cpp)
endif()

# Add libtorch_graph.cc if LibTorch available, otherwise stubs
if(Torch_FOUND)
  list(APPEND ADDON_SOURCES libtorch_graph.cc)
else()
  list(APPEND ADDON_SOURCES libtorch_stubs.cc)
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

# Link cuda_kernels
target_link_libraries(tensorrt_bridge PRIVATE cuda_kernels)

# Link node.lib (required on Windows for N-API symbols)
if(WIN32 AND EXISTS "${NODE_LIB}")
  target_link_libraries(tensorrt_bridge PRIVATE "${NODE_LIB}")
endif()

# Link LibTorch
if(Torch_FOUND)
  target_link_libraries(tensorrt_bridge PRIVATE ${TORCH_LIBRARIES})
  target_compile_options(tensorrt_bridge PRIVATE ${TORCH_CXX_FLAGS})
else()
  # Without LibTorch, provide stub implementations
  target_compile_definitions(tensorrt_bridge PRIVATE NO_LIBTORCH=1)
endif()

# Link CUDA runtime if available
if(CUDAToolkit_FOUND)
  target_link_libraries(tensorrt_bridge PRIVATE CUDA::cudart)
endif()

# ── Install ─────────────────────────────────────────────────────────
install(TARGETS tensorrt_bridge LIBRARY DESTINATION lib RUNTIME DESTINATION lib)
