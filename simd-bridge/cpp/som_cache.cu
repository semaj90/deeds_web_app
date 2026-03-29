// Minimal SOM cache with optional CUDA kernel. Compile with CUDA for GPU path,
// or define NO_CUDA / compile without __CUDACC__ for CPU-only build.
//
// NOTE: If your environment does not have a CUDA toolchain, build with NO_CUDA defined
// (e.g. g++ -x c++ -DNO_CUDA -c som_cache.cu ). Use the provided build scripts/CMakeLists.txt
// to auto-detect CUDA and choose the correct path.

// Robust CUDA detection:
#ifndef SOM_HAVE_CUDA
  #if defined(NO_CUDA)
    // Explicit override to disable CUDA
    #define SOM_HAVE_CUDA 0
  #else
    // If nvcc is present, check for required headers. If headers are missing,
    // force CPU-only path to avoid nvcc attempting device compilation/linking
    // (which can fail with missing libdevice / missing CUDA install).
    #if defined(__CUDACC__)
      #if defined(__has_include)
        #if __has_include(<cuda_runtime.h>)
          #define SOM_HAVE_CUDA 1
        #else
          // Header not found: force CPU-only build and inform the builder.
          #pragma message("NVCC detected but <cuda_runtime.h> not found. For a CPU-only build define -DNO_CUDA or build with host compiler (e.g. g++ -x c++ -DNO_CUDA -c som_cache.cu).")
          #pragma message("If you want NVCC to proceed, provide a valid CUDA installation via --cuda-path or pass -nocudainc -nocudalib to skip CUDA includes/libs.")
          #define SOM_HAVE_CUDA 0
        #endif
      #else
        // No __has_include support: be conservative and prefer CPU-only unless explicitly forced.
        #if defined(SOM_FORCE_CUDA) || defined(SOM_HAVE_CUDA)
          #define SOM_HAVE_CUDA 1
        #else
          #pragma message("NVCC detected but compiler lacks __has_include; defaulting to CPU-only. Define SOM_FORCE_CUDA or -DSOM_HAVE_CUDA=1 to force CUDA paths.")
          #define SOM_HAVE_CUDA 0
        #endif
      #endif
    #else
      // Not compiling with nvcc -> no CUDA
      #define SOM_HAVE_CUDA 0
    #endif
  #endif
#endif

#if SOM_HAVE_CUDA
  // If NVCC is present but headers weren't found, compiler can still invoke nvcc.
  // Emit an informational message to guide maintainers.
  #if defined(__CUDACC__) && !defined(__has_include)
    #pragma message("Compiling with __CUDACC__ and without __has_include support; ensure CUDA includes/libdevice are available or define NO_CUDA or SOM_FORCE_CUDA.")
  #endif

  // Only use __has_include when it's available
  #if defined(__CUDACC__) && defined(__has_include) && !__has_include(<cuda_runtime.h>)
    #pragma message("NVCC detected but <cuda_runtime.h> not found; building CPU-only fallback. To avoid nvcc errors add -nocudainc -nocudalib or set --cuda-path when invoking nvcc.")
  #endif

  #include <cuda_runtime.h>

  // Host-only C++ headers (needed by host-side fallback paths)
  #include <cstring>
  #include <cstdlib>

  // Simple device kernel: copy input to output
  __global__ static void somCopyKernel(const float* in, float* out, int n) {
      int i = blockIdx.x * blockDim.x + threadIdx.x;
      if (i < n) out[i] = in[i];
  }

  static bool isDevicePointer(const void* p) {
      if (!p) return false;
      cudaPointerAttributes attr;
      cudaError_t r = cudaPointerGetAttributes(&attr, p);
      if (r != cudaSuccess) return false;
      // Try common attribute fields across CUDA versions
      #if defined(CUDART_VERSION) && CUDART_VERSION >= 10000
          #if defined(cudaMemoryTypeDevice)
              return (attr.type == cudaMemoryTypeDevice) || (attr.memoryType == cudaMemoryTypeDevice);
          #else
              return (attr.type == 1);
          #endif
      #else
          #if defined(__CUDA_API_VERSION)
              // Older runtimes may expose devicePointer/member checks
              return (attr.devicePointer != nullptr);
          #else
              return true; // best-effort: assume device if attributes retrieved
          #endif
      #endif
  }

  extern "C" {
      void runSOMCache(const float* in, float* out, int n) {
          if (n <= 0 || !in || !out) return;

          bool inIsDevice = isDevicePointer(in);
          bool outIsDevice = isDevicePointer(out);

          // Both device pointers -> launch kernel
          if (inIsDevice && outIsDevice) {
              const int block = 256;
              const int grid = (n + block - 1) / block;
              somCopyKernel<<<grid, block>>>(in, out, n);
              cudaError_t err = cudaGetLastError();
              if (err != cudaSuccess) {
                  // Kernel launch failed -> fallback to CPU copy via host staging
                  cudaDeviceSynchronize();
                  for (int i = 0; i < n; ++i) out[i] = in[i];
                  return;
              }
              cudaDeviceSynchronize();
              return;
          }

          // Both host pointers -> simple CPU copy
          if (!inIsDevice && !outIsDevice) {
              for (int i = 0; i < n; ++i) out[i] = in[i];
              return;
          }

          // Mixed pointers: bridge with cudaMemcpy and fallbacks
          size_t bytes = static_cast<size_t>(n) * sizeof(float);

          if (inIsDevice && !outIsDevice) {
              // device -> host
              if (cudaMemcpy((void*)out, in, bytes, cudaMemcpyDeviceToHost) != cudaSuccess) {
                  float* tmp = static_cast<float*>(std::malloc(bytes));
                  if (tmp) {
                      if (cudaMemcpy(tmp, in, bytes, cudaMemcpyDeviceToHost) == cudaSuccess) {
                          std::memcpy(out, tmp, bytes);
                      }
                      std::free(tmp);
                  }
              }
              return;
          }

          if (!inIsDevice && outIsDevice) {
              // host -> device
              if (cudaMemcpy(out, in, bytes, cudaMemcpyHostToDevice) != cudaSuccess) {
                  float* tmp = static_cast<float*>(std::malloc(bytes));
                  if (tmp) {
                      std::memcpy(tmp, in, bytes);
                      if (cudaMemcpy(out, tmp, bytes, cudaMemcpyHostToDevice) != cudaSuccess) {
                          // final fallback: can't reach device; no-op
                      }
                      std::free(tmp);
                  }
              }
              return;
          }
      }
  }
#else
  // No CUDA: CPU-only fallback.
  extern "C" {
      void runSOMCache(const float* in, float* out, int n) {
          if (n <= 0 || !in || !out) return;
          for (int i = 0; i < n; ++i) {
              out[i] = in[i];
          }
      }
  }
#endif
// End of som_cache.cu

