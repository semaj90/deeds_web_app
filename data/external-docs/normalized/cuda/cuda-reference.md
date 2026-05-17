# CUDA C++ Programming & Memory Reference Manual

This manual details CUDA driver capabilities, kernel execution profiles, host-device memory mapping, and multi-stream synchronization parameters for native NVIDIA GPU programming.

---

## 1. Host-Device Unified Memory Management

CUDA C++ enables allocating memory accessible by both the CPU (host) and GPU (device) using Unified Memory (`cudaMallocManaged`).

```cpp
#include 
#include 

// Helper to check for CUDA driver execution errors
#define gpuErrchk(ans) { gpuAssert((ans), __FILE__, __LINE__); }
inline void gpuAssert(cudaError_t code, const char *file, int line, bool abort=true) {
   if (code != cudaSuccess) {
      fprintf(stderr, "GPUassert: %s %s %d\n", cudaGetErrorString(code), file, line);
      if (abort) exit(code);
   }
}

void allocateMemory() {
    float *data;
    // Allocate Unified Memory – accessible from CPU or GPU
    gpuErrchk(cudaMallocManaged(&data, 1024 * sizeof(float)));

    // Initialize values on the Host
    for (int i = 0; i (i);
    }

    // Free allocated memory
    gpuErrchk(cudaFree(data));
}
```

---

## 2. Kernel Execution Configuration

CUDA kernels are launched using triple angle-brackets `>>` defining grid and workgroup dimensional maps.

```cpp
// CUDA Kernel function running in parallel on the GPU
__global__ void doubleValueKernel(float *data, int n) {
    int index = blockIdx.x * blockDim.x + threadIdx.x;
    if (index >>(data, n);

    // Wait for the GPU to finish execution before reading memory on Host
    gpuErrchk(cudaDeviceSynchronize());
}
```

---

## 3. Streams and Concurrent Execution

Streams manage task queues on the GPU, allowing concurrent kernel execution and memory transfers to maximize VRAM throughput.

```cpp
void executeConcurrentStreams(float *hostData, int n) {
    cudaStream_t stream1, stream2;
    gpuErrchk(cudaStreamCreate(&stream1));
    gpuErrchk(cudaStreamCreate(&stream2));

    float *devData1, *devData2;
    int size = n * sizeof(float);
    gpuErrchk(cudaMalloc(&devData1, size));
    gpuErrchk(cudaMalloc(&devData2, size));

    // Queue asynchronous memory transfer and kernel execution in stream1
    gpuErrchk(cudaMemcpyAsync(devData1, hostData, size, cudaMemcpyHostToDevice, stream1));
    doubleValueKernel>>(devData1, n);

    // Queue asynchronous memory transfer and kernel execution in stream2
    gpuErrchk(cudaMemcpyAsync(devData2, hostData, size, cudaMemcpyHostToDevice, stream2));
    doubleValueKernel>>(devData2, n);

    // Synchronize streams
    gpuErrchk(cudaStreamSynchronize(stream1));
    gpuErrchk(cudaStreamSynchronize(stream2));

    // Clean up streams
    gpuErrchk(cudaStreamDestroy(stream1));
    gpuErrchk(cudaStreamDestroy(stream2));
}
```