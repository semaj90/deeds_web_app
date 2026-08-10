# Integrate this fragment into simd-bridge/cpp/CMakeLists.txt after CUDA/cuBLAS detection.
# Do not add the same source to both cuda_kernels and tensorrt_bridge.

set(ATLAS_GEMM_SOURCES
  gemm/gemm_dispatch.cpp
  gemm/gemm_cpu_fallback.cpp
  gemm/cutlass_gemm.cu
)

if(SIMD_HAVE_CUDA AND SIMD_HAVE_CUBLAS)
  list(APPEND ATLAS_GEMM_SOURCES gemm/cublas_gemm.cu)
endif()
if(SIMD_HAVE_CUDA AND SIMD_HAVE_CUBLASLT)
  list(APPEND ATLAS_GEMM_SOURCES gemm/cublaslt_gemm.cu)
endif()

add_library(atlas_gemm STATIC ${ATLAS_GEMM_SOURCES})
target_include_directories(atlas_gemm PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/gemm)
target_compile_definitions(atlas_gemm PRIVATE
  ATLAS_GEMM_BUILD=1
  SIMD_HAVE_CUBLAS=$<BOOL:${SIMD_HAVE_CUBLAS}>
  SIMD_HAVE_CUBLASLT=$<BOOL:${SIMD_HAVE_CUBLASLT}>
  SIMD_HAVE_CUTLASS=$<BOOL:${SIMD_HAVE_CUTLASS}>
)

if(SIMD_HAVE_CUDA)
  set_target_properties(atlas_gemm PROPERTIES CUDA_ARCHITECTURES "${CMAKE_CUDA_ARCHITECTURES}")
  target_link_libraries(atlas_gemm PRIVATE CUDA::cudart)
endif()
if(SIMD_HAVE_CUBLAS)
  target_link_libraries(atlas_gemm PRIVATE CUDA::cublas)
endif()
if(SIMD_HAVE_CUBLASLT)
  target_link_libraries(atlas_gemm PRIVATE CUDA::cublasLt)
endif()

# Existing addon target:
target_link_libraries(tensorrt_bridge PRIVATE atlas_gemm)

# Optional smoke test:
add_executable(atlas_gemm_parity gemm/gemm_parity_test.cpp)
target_link_libraries(atlas_gemm_parity PRIVATE atlas_gemm)
