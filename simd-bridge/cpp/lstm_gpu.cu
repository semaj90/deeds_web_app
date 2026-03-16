/**
 * GPU Compute Kernels for Legal AI Pipeline
 *
 * Provides CUDA-accelerated operations:
 *   1. run_lstm_add(a, b, out, n)     — elementwise float add
 *   2. run_dot_product(a, b, out, n)  — dot product (single scalar result)
 *   3. run_scale(in, out, scalar, n)  — scalar multiply
 *   4. run_relu(in, out, n)           — ReLU activation
 *
 * Each function: CUDA path when nvcc + GPU available, CPU fallback otherwise.
 * Compiled as part of cuda_kernels static library (see CMakeLists.txt).
 *
 * Build notes:
 *   - To compile GPU path use nvcc (so __CUDACC__ is defined).
 *   - To force CPU-only build add -DNO_CUDA to your compiler flags.
 */

#if defined(__CUDACC__) && !defined(NO_CUDA)

#include <cuda_runtime.h>
#include <cstdio>
#include <vector>

// ── CUDA Kernels ────────────────────────────────────────────────────

extern "C" __global__ void lstm_add_kernel(const float* a, const float* b, float* out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = a[i] + b[i];
    }
}

__global__ static void dot_product_kernel(const float* a, const float* b, float* partial, int n) {
    extern __shared__ float sdata[];
    int tid = threadIdx.x;
    int i = blockIdx.x * blockDim.x + tid;

    sdata[tid] = (i < n) ? a[i] * b[i] : 0.0f;
    __syncthreads();

    // Parallel reduction in shared memory
    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {
            sdata[tid] += sdata[tid + s];
        }
        __syncthreads();
    }

    if (tid == 0) {
        partial[blockIdx.x] = sdata[0];
    }
}

__global__ static void scale_kernel(const float* in, float* out, float scalar, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = in[i] * scalar;
    }
}

__global__ static void relu_kernel(const float* in, float* out, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        out[i] = (in[i] > 0.0f) ? in[i] : 0.0f;
    }
}

// ── Constants ───────────────────────────────────────────────────────

static const int BLOCK_SIZE = 256;

// ── run_lstm_add ────────────────────────────────────────────────────

extern "C" int run_lstm_add(const float* a, const float* b, float* out, int n) {
    if (n <= 0 || !a || !b || !out) return -1;

    float *d_a = nullptr, *d_b = nullptr, *d_out = nullptr;
    size_t sz = sizeof(float) * (size_t)n;
    cudaError_t err = cudaSuccess;

    err = cudaMalloc((void**)&d_a, sz);
    if (err != cudaSuccess) return -2;

    err = cudaMalloc((void**)&d_b, sz);
    if (err != cudaSuccess) { cudaFree(d_a); return -3; }

    err = cudaMalloc((void**)&d_out, sz);
    if (err != cudaSuccess) { cudaFree(d_a); cudaFree(d_b); return -4; }

    cudaMemcpy(d_a, a, sz, cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, b, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    lstm_add_kernel<<<grid, BLOCK_SIZE>>>(d_a, d_b, d_out, n);

    err = cudaGetLastError();
    if (err != cudaSuccess) goto fail;

    err = cudaDeviceSynchronize();
    if (err != cudaSuccess) goto fail;

    err = cudaMemcpy(out, d_out, sz, cudaMemcpyDeviceToHost);
    if (err != cudaSuccess) goto fail;

    cudaFree(d_a); cudaFree(d_b); cudaFree(d_out);
    return 0;

fail:
    if (d_a) cudaFree(d_a);
    if (d_b) cudaFree(d_b);
    if (d_out) cudaFree(d_out);
    return -99;
}

// ── run_dot_product ─────────────────────────────────────────────────

extern "C" int run_dot_product(const float* a, const float* b, float* out, int n) {
    if (n <= 0 || !a || !b || !out) return -1;

    size_t sz = sizeof(float) * (size_t)n;
    float *d_a = nullptr, *d_b = nullptr, *d_partial = nullptr;

    if (cudaMalloc((void**)&d_a, sz) != cudaSuccess) return -2;
    if (cudaMalloc((void**)&d_b, sz) != cudaSuccess) { cudaFree(d_a); return -3; }

    cudaMemcpy(d_a, a, sz, cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, b, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;

    if (cudaMalloc((void**)&d_partial, grid * sizeof(float)) != cudaSuccess) {
        cudaFree(d_a); cudaFree(d_b);
        return -4;
    }

    dot_product_kernel<<<grid, BLOCK_SIZE, BLOCK_SIZE * sizeof(float)>>>(d_a, d_b, d_partial, n);
    cudaDeviceSynchronize();

    // Copy partial sums to host and reduce
    std::vector<float> h_partial(grid);
    cudaMemcpy(h_partial.data(), d_partial, grid * sizeof(float), cudaMemcpyDeviceToHost);

    float sum = 0.0f;
    for (int i = 0; i < grid; ++i) {
        sum += h_partial[i];
    }
    *out = sum;

    cudaFree(d_a); cudaFree(d_b); cudaFree(d_partial);
    return (cudaGetLastError() == cudaSuccess) ? 0 : -99;
}

// ── run_scale ───────────────────────────────────────────────────────

extern "C" int run_scale(const float* in, float* out, float scalar, int n) {
    if (n <= 0 || !in || !out) return -1;

    size_t sz = sizeof(float) * (size_t)n;
    float *d_in = nullptr, *d_out = nullptr;

    if (cudaMalloc((void**)&d_in, sz) != cudaSuccess) return -2;
    if (cudaMalloc((void**)&d_out, sz) != cudaSuccess) { cudaFree(d_in); return -3; }

    cudaMemcpy(d_in, in, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    scale_kernel<<<grid, BLOCK_SIZE>>>(d_in, d_out, scalar, n);

    cudaDeviceSynchronize();
    cudaMemcpy(out, d_out, sz, cudaMemcpyDeviceToHost);

    cudaFree(d_in); cudaFree(d_out);
    return (cudaGetLastError() == cudaSuccess) ? 0 : -99;
}

// ── run_relu ────────────────────────────────────────────────────────

extern "C" int run_relu(const float* in, float* out, int n) {
    if (n <= 0 || !in || !out) return -1;

    size_t sz = sizeof(float) * (size_t)n;
    float *d_in = nullptr, *d_out = nullptr;

    if (cudaMalloc((void**)&d_in, sz) != cudaSuccess) return -2;
    if (cudaMalloc((void**)&d_out, sz) != cudaSuccess) { cudaFree(d_in); return -3; }

    cudaMemcpy(d_in, in, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    relu_kernel<<<grid, BLOCK_SIZE>>>(d_in, d_out, n);

    cudaDeviceSynchronize();
    cudaMemcpy(out, d_out, sz, cudaMemcpyDeviceToHost);

    cudaFree(d_in); cudaFree(d_out);
    return (cudaGetLastError() == cudaSuccess) ? 0 : -99;
}

#else

// ── CPU-only fallbacks ──────────────────────────────────────────────

extern "C" int run_lstm_add(const float* a, const float* b, float* out, int n) {
    if (n <= 0 || !a || !b || !out) return -1;
    for (int i = 0; i < n; ++i) {
        out[i] = a[i] + b[i];
    }
    return 0;
}

extern "C" int run_dot_product(const float* a, const float* b, float* out, int n) {
    if (n <= 0 || !a || !b || !out) return -1;
    float sum = 0.0f;
    for (int i = 0; i < n; ++i) {
        sum += a[i] * b[i];
    }
    *out = sum;
    return 0;
}

extern "C" int run_scale(const float* in, float* out, float scalar, int n) {
    if (n <= 0 || !in || !out) return -1;
    for (int i = 0; i < n; ++i) {
        out[i] = in[i] * scalar;
    }
    return 0;
}

extern "C" int run_relu(const float* in, float* out, int n) {
    if (n <= 0 || !in || !out) return -1;
    for (int i = 0; i < n; ++i) {
        out[i] = (in[i] > 0.0f) ? in[i] : 0.0f;
    }
    return 0;
}

#endif
