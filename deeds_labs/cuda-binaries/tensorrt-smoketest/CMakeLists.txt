cmake_minimum_required(VERSION 3.18)
project(tensorrt_smoketest LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED TENSORRT_LLMSDK_INCLUDE_DIR)
  set(TENSORRT_LLMSDK_INCLUDE_DIR "/app/tensorrt_llm/include")
endif()
if(NOT DEFINED TENSORRT_LLMSDK_LIB_DIR)
  set(TENSORRT_LLMSDK_LIB_DIR "/app/tensorrt_llm/lib")
endif()

message(STATUS "Using include dir: ${TENSORRT_LLMSDK_INCLUDE_DIR}")
message(STATUS "Using lib dir: ${TENSORRT_LLMSDK_LIB_DIR}")

include_directories(${TENSORRT_LLMSDK_INCLUDE_DIR})
link_directories(${TENSORRT_LLMSDK_LIB_DIR})

add_executable(tensorrt_smoketest src/main.cpp)

# Try to link common plugin/library names; allow missing libs without fatal error
find_library(TENSORRT_LLM_LIB NAMES tensorrt_llm HINTS ${TENSORRT_LLMSDK_LIB_DIR} NO_DEFAULT_PATH)
if(TENSORRT_LLM_LIB)
  message(STATUS "Found tensorrt_llm lib: ${TENSORRT_LLM_LIB}")
  target_link_libraries(tensorrt_smoketest PRIVATE ${TENSORRT_LLM_LIB})
else()
  message(WARNING "tensorrt_llm library not found in ${TENSORRT_LLMSDK_LIB_DIR}; linking will be skipped. This binary will still compile to validate headers.")
endif()

find_library(TENSORRT_PLUGIN_LIB NAMES libnvinfer_plugin nvinfer_plugin nvinfer_plugin_static HINTS ${TENSORRT_LLMSDK_LIB_DIR} NO_DEFAULT_PATH)
if(TENSORRT_PLUGIN_LIB)
  message(STATUS "Found TensorRT plugin lib: ${TENSORRT_PLUGIN_LIB}")
  target_link_libraries(tensorrt_smoketest PRIVATE ${TENSORRT_PLUGIN_LIB})
endif()

if(UNIX)
  find_library(CUDA_LIB NAMES cudart cudart_static PATHS /usr/local/cuda/lib64 /usr/lib/x86_64-linux-gnu HINTS /usr/local/cuda-*/lib64)
  if(CUDA_LIB)
    target_link_libraries(tensorrt_smoketest PRIVATE ${CUDA_LIB})
  endif()
endif()
