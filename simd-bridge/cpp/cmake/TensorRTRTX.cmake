# Optional TensorRT-RTX discovery for the Windows-native Parent Atlas bridge.
#
# This helper intentionally does NOT enable TensorRT-RTX by default and does not
# infer availability from the addon target name. The caller must opt in with
# SIMD_ENABLE_TENSORRT_RTX and the local CUDA toolkit must match a supported
# TensorRT-RTX 1.6 package family (CUDA 12.9 Update 1 or CUDA 13.4).
#
# TODO(INTEGRATION): include this file from simd-bridge/cpp/CMakeLists.txt only
# after the Windows environment receipt is proven on the workstation.

set(SIMD_HAVE_TENSORRT_RTX OFF)
set(TENSORRT_RTX_ROOT "" CACHE PATH "TensorRT-RTX 1.6 SDK root")

function(atlas_discover_tensorrt_rtx)
  if(NOT WIN32)
    message(STATUS "TensorRT-RTX: skipped (Windows-native bridge policy)")
    return()
  endif()

  if(NOT SIMD_ENABLE_TENSORRT_RTX)
    message(STATUS "TensorRT-RTX: disabled (SIMD_ENABLE_TENSORRT_RTX=OFF)")
    return()
  endif()

  if(NOT CUDAToolkit_FOUND OR NOT CUDAToolkit_VERSION)
    message(WARNING "TensorRT-RTX: CUDA toolkit not proven; executor remains unavailable")
    return()
  endif()

  string(REGEX MATCH "^([0-9]+)\.([0-9]+)" _cuda_match "${CUDAToolkit_VERSION}")
  set(_cuda_major "${CMAKE_MATCH_1}")
  set(_cuda_minor "${CMAKE_MATCH_2}")
  set(_cuda_family "${_cuda_major}.${_cuda_minor}")
  if(NOT _cuda_family STREQUAL "12.9" AND NOT _cuda_family STREQUAL "13.4")
    message(WARNING "TensorRT-RTX 1.6 requires CUDA 12.9 Update 1 or 13.4; found ${CUDAToolkit_VERSION}. Executor remains unavailable.")
    return()
  endif()

  if(NOT TENSORRT_RTX_ROOT AND DEFINED ENV{TENSORRT_RTX_ROOT})
    set(TENSORRT_RTX_ROOT "$ENV{TENSORRT_RTX_ROOT}" CACHE PATH "TensorRT-RTX 1.6 SDK root" FORCE)
  endif()

  if(NOT TENSORRT_RTX_ROOT)
    file(GLOB _trt_rtx_candidates
      "C:/TensorRT-RTX-1.6*"
      "C:/Program Files/NVIDIA/TensorRT-RTX-1.6*"
      "$ENV{USERPROFILE}/TensorRT-RTX-1.6*")
    if(_trt_rtx_candidates)
      list(SORT _trt_rtx_candidates)
      list(GET _trt_rtx_candidates -1 _trt_rtx_best)
      set(TENSORRT_RTX_ROOT "${_trt_rtx_best}" CACHE PATH "TensorRT-RTX 1.6 SDK root" FORCE)
    endif()
  endif()

  if(NOT TENSORRT_RTX_ROOT)
    message(STATUS "TensorRT-RTX: SDK not found; set TENSORRT_RTX_ROOT after installing the matching 1.6 Windows SDK")
    return()
  endif()

  find_path(TENSORRT_RTX_INCLUDE_DIR
    NAMES NvInferRuntime.h
    PATHS "${TENSORRT_RTX_ROOT}/include"
    NO_DEFAULT_PATH)
  find_library(TENSORRT_RTX_LIBRARY
    NAMES tensorrt_rtx tensorrt_rtx_1_6
    PATHS "${TENSORRT_RTX_ROOT}/lib"
    NO_DEFAULT_PATH)
  find_library(TENSORRT_RTX_ONNXPARSER_LIBRARY
    NAMES tensorrt_onnxparser_rtx tensorrt_onnxparser_rtx_1_6
    PATHS "${TENSORRT_RTX_ROOT}/lib"
    NO_DEFAULT_PATH)

  if(TENSORRT_RTX_INCLUDE_DIR AND TENSORRT_RTX_LIBRARY)
    set(SIMD_HAVE_TENSORRT_RTX ON PARENT_SCOPE)
    set(TENSORRT_RTX_INCLUDE_DIR "${TENSORRT_RTX_INCLUDE_DIR}" PARENT_SCOPE)
    set(TENSORRT_RTX_LIBRARY "${TENSORRT_RTX_LIBRARY}" PARENT_SCOPE)
    set(TENSORRT_RTX_ONNXPARSER_LIBRARY "${TENSORRT_RTX_ONNXPARSER_LIBRARY}" PARENT_SCOPE)
    message(STATUS "TensorRT-RTX: discovered at ${TENSORRT_RTX_ROOT} for CUDA ${CUDAToolkit_VERSION}")
  else()
    message(WARNING "TensorRT-RTX: SDK root found but headers/import libraries are incomplete")
  endif()
endfunction()
