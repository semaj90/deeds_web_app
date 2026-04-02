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

// ── Reusable CUDA Buffer Pool ───────────────────────────────────────
// Avoids cudaMalloc/cudaFree per call. Thread-local to avoid contention.
// Grows on demand, never shrinks (typical allocation pattern: same-size vectors).

struct CudaBuffer {
    float* ptr = nullptr;
    size_t capacity = 0;  // in floats

    float* ensure(int n) {
        size_t need = (size_t)n;
        if (need <= capacity && ptr) return ptr;
        if (ptr) cudaFree(ptr);
        capacity = need;
        if (cudaMalloc((void**)&ptr, capacity * sizeof(float)) != cudaSuccess) {
            ptr = nullptr;
            capacity = 0;
        }
        return ptr;
    }

    ~CudaBuffer() { if (ptr) cudaFree(ptr); }
};

// 3 slots: A input, B input, output — covers all kernel signatures
static thread_local CudaBuffer tl_buf_a, tl_buf_b, tl_buf_out;

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

    float* d_a = tl_buf_a.ensure(n);
    float* d_b = tl_buf_b.ensure(n);
    float* d_out = tl_buf_out.ensure(n);
    if (!d_a || !d_b || !d_out) return -2;

    size_t sz = sizeof(float) * (size_t)n;
    cudaMemcpy(d_a, a, sz, cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, b, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    lstm_add_kernel<<<grid, BLOCK_SIZE>>>(d_a, d_b, d_out, n);

    cudaError_t err = cudaGetLastError();
    if (err != cudaSuccess) return -99;

    err = cudaDeviceSynchronize();
    if (err != cudaSuccess) return -99;

    cudaMemcpy(out, d_out, sz, cudaMemcpyDeviceToHost);
    return 0;
}

// ── run_dot_product ─────────────────────────────────────────────────

extern "C" int run_dot_product(const float* a, const float* b, float* out, int n) {
    if (n <= 0 || !a || !b || !out) return -1;

    size_t sz = sizeof(float) * (size_t)n;
    float* d_a = tl_buf_a.ensure(n);
    float* d_b = tl_buf_b.ensure(n);
    if (!d_a || !d_b) return -2;

    cudaMemcpy(d_a, a, sz, cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, b, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    float* d_partial = tl_buf_out.ensure(grid);
    if (!d_partial) return -3;

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

    return (cudaGetLastError() == cudaSuccess) ? 0 : -99;
}

// ── run_scale ───────────────────────────────────────────────────────

extern "C" int run_scale(const float* in, float* out, float scalar, int n) {
    if (n <= 0 || !in || !out) return -1;

    size_t sz = sizeof(float) * (size_t)n;
    float* d_in = tl_buf_a.ensure(n);
    float* d_out = tl_buf_out.ensure(n);
    if (!d_in || !d_out) return -2;

    cudaMemcpy(d_in, in, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    scale_kernel<<<grid, BLOCK_SIZE>>>(d_in, d_out, scalar, n);

    cudaDeviceSynchronize();
    cudaMemcpy(out, d_out, sz, cudaMemcpyDeviceToHost);

    return (cudaGetLastError() == cudaSuccess) ? 0 : -99;
}

// ── run_relu ────────────────────────────────────────────────────────

extern "C" int run_relu(const float* in, float* out, int n) {
    if (n <= 0 || !in || !out) return -1;

    size_t sz = sizeof(float) * (size_t)n;
    float* d_in = tl_buf_a.ensure(n);
    float* d_out = tl_buf_out.ensure(n);
    if (!d_in || !d_out) return -2;

    cudaMemcpy(d_in, in, sz, cudaMemcpyHostToDevice);

    int grid = (n + BLOCK_SIZE - 1) / BLOCK_SIZE;
    relu_kernel<<<grid, BLOCK_SIZE>>>(d_in, d_out, n);

    cudaDeviceSynchronize();
    cudaMemcpy(out, d_out, sz, cudaMemcpyDeviceToHost);

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
