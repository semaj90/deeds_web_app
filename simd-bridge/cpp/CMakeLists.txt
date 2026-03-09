cmake_minimum_required(VERSION 3.18)
project(tensorbridge LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Try to find CUDA / CUDAToolkit. If not present, fall back to NO_CUDA.
find_package(CUDAToolkit QUIET)

if (CUDAToolkit_FOUND)
  message(STATUS "CUDAToolkit found -> building with CUDA support")
  enable_language(CUDA)
  add_library(som_cache STATIC som_cache.cu)
  target_compile_definitions(som_cache PRIVATE SOM_HAVE_CUDA=1)
  # Optional: set a reasonable CUDA architecture list; adjust as needed.
  if (NOT DEFINED CMAKE_CUDA_ARCHITECTURES)
    # Common modern archs; user can override via -DCMAKE_CUDA_ARCHITECTURES=...
    set_target_properties(som_cache PROPERTIES CMAKE_CUDA_ARCHITECTURES "75;80;86" )
  endif()
else()
  message(STATUS "CUDA not found -> building CPU-only (define NO_CUDA)")
  add_library(som_cache STATIC som_cache.cu)
  # compile the .cu as C++ source (force language and define NO_CUDA)
  set_source_files_properties(som_cache.cu PROPERTIES LANGUAGE CXX)
  target_compile_definitions(som_cache PRIVATE NO_CUDA=1 SOM_HAVE_CUDA=0)
  target_compile_options(som_cache PRIVATE $<$<CXX_COMPILER_ID:GNU>:-O3>)
endif()

include_directories(${CMAKE_CURRENT_SOURCE_DIR}/include)

add_library(tensorbridge SHARED
  tensor_bridge.cc
  som_cache.cu
)

target_compile_definitions(tensorbridge PRIVATE BUILDING_TENSORBRIDGE)

find_package(PkgConfig QUIET)
pkg_check_modules(SIMDJSON simdjson QUIET)
if(SIMDJSON_FOUND)
  include_directories(${SIMDJSON_INCLUDE_DIRS})
  target_link_libraries(tensorbridge PRIVATE ${SIMDJSON_LIBRARIES})
endif()

# ── LibTorch GPU Graph Analysis ──────────────────────────────────────────
# Set CMAKE_PREFIX_PATH to libtorch before running cmake:
#   cmake -DCMAKE_PREFIX_PATH=/path/to/libtorch ..
find_package(Torch QUIET)
if(Torch_FOUND)
  message(STATUS "LibTorch found (${TORCH_CXX_FLAGS}) -> building libtorch_graph")
  add_library(libtorch_graph SHARED libtorch_graph.cc)
  target_link_libraries(libtorch_graph PRIVATE ${TORCH_LIBRARIES})
  target_compile_options(libtorch_graph PRIVATE ${TORCH_CXX_FLAGS})
  set_property(TARGET libtorch_graph PROPERTY CXX_STANDARD 17)
  install(TARGETS libtorch_graph LIBRARY DESTINATION lib)
else()
  message(STATUS "LibTorch not found -> skipping libtorch_graph (set CMAKE_PREFIX_PATH)")
endif()

install(TARGETS tensorbridge LIBRARY DESTINATION lib)
