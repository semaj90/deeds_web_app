#include <cuda_runtime.h>
#include <cmath>
#include <iostream>
#include <vector>

// --- CUDA reduction kernel for cosine similarity ---
__global__ void cosine_similarity_kernel(
    const float* __restrict__ a,
    const float* __restrict__ b,
    float* __restrict__ partial_dot,
    float* __restrict__ partial_norm_a,
    float* __restrict__ partial_norm_b,
    int n)
{
    __shared__ float dot[256];
    __shared__ float norm_a[256];
    __shared__ float norm_b[256];

    int tid = threadIdx.x;
    int i = blockIdx.x * blockDim.x + tid;

    float local_dot = 0.0f, local_a = 0.0f, local_b = 0.0f;
    if (i < n) {
        float va = a[i];
        float vb = b[i];
        local_dot = va * vb;
        local_a = va * va;
        local_b = vb * vb;
    }
    dot[tid]     = local_dot;
    norm_a[tid]  = local_a;
    norm_b[tid]  = local_b;
    __syncthreads();

    // Parallel reduction
    for (int s = blockDim.x / 2; s > 0; s >>= 1) {
        if (tid < s) {
            dot[tid] += dot[tid + s];
            norm_a[tid] += norm_a[tid + s];
            norm_b[tid] += norm_b[tid + s];
        }
        __syncthreads();
    }

    if (tid == 0) {
        partial_dot[blockIdx.x] = dot[0];
        partial_norm_a[blockIdx.x] = norm_a[0];
        partial_norm_b[blockIdx.x] = norm_b[0];
    }
}

// --- Host wrapper function ---
extern "C" void compute_cosine_similarity(
    const float* vec_a,
    const float* vec_b,
    float* result,
    int embedding_dim)
{
    int threads = 256;
    int blocks = (embedding_dim + threads - 1) / threads;

    // Allocate temporary partial results
    float *d_a, *d_b, *d_dot, *d_na, *d_nb;
    cudaMalloc(&d_a, embedding_dim * sizeof(float));
    cudaMalloc(&d_b, embedding_dim * sizeof(float));
    cudaMalloc(&d_dot, blocks * sizeof(float));
    cudaMalloc(&d_na, blocks * sizeof(float));
    cudaMalloc(&d_nb, blocks * sizeof(float));

    // Copy to device
    cudaMemcpy(d_a, vec_a, embedding_dim * sizeof(float), cudaMemcpyHostToDevice);
    cudaMemcpy(d_b, vec_b, embedding_dim * sizeof(float), cudaMemcpyHostToDevice);

    // Launch kernel
    cosine_similarity_kernel<<<blocks, threads>>>(d_a, d_b, d_dot, d_na, d_nb, embedding_dim);
    cudaDeviceSynchronize();

    // Retrieve partial results
    std::vector<float> h_dot(blocks), h_na(blocks), h_nb(blocks);
    cudaMemcpy(h_dot.data(), d_dot, blocks * sizeof(float), cudaMemcpyDeviceToHost);
    cudaMemcpy(h_na.data(), d_na, blocks * sizeof(float), cudaMemcpyDeviceToHost);
    cudaMemcpy(h_nb.data(), d_nb, blocks * sizeof(float), cudaMemcpyDeviceToHost);

    float dot = 0.0f, norm_a = 0.0f, norm_b = 0.0f;
    for (int i = 0; i < blocks; ++i) {
        dot += h_dot[i];
        norm_a += h_na[i];
        norm_b += h_nb[i];
    }

    *result = dot / (sqrtf(norm_a) * sqrtf(norm_b) + 1e-8f);

    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_dot);
    cudaFree(d_na);
    cudaFree(d_nb);
}

// --- CUDA kernel for normalization ---
__global__ void normalize_kernel(float* data, int n) {
    int i = blockIdx.x * blockDim.x + threadIdx.x;
    if (i < n) {
        data[i] = data[i] / 255.0f;
    }
}

// --- Host wrapper function for normalization ---
extern "C" void process_with_torch(float* pinned_data, int n) {
    float* d_data;
    cudaMalloc(&d_data, n * sizeof(float));
    cudaMemcpy(d_data, pinned_data, n * sizeof(float), cudaMemcpyHostToDevice);

    int threads = 256;
    int blocks = (n + threads - 1) / threads;
    normalize_kernel<<<blocks, threads>>>(d_data, n);
    cudaDeviceSynchronize();

    cudaMemcpy(pinned_data, d_data, n * sizeof(float), cudaMemcpyDeviceToHost);
    cudaFree(d_data);
}

#include <mma.h>
using namespace nvcuda;

extern "C" __global__
void tensorcore_gemm(const half *A, const half *B, float *C, int M, int N, int K) {

    // Leading dimensions
    int lda = K;
    int ldb = N;
    int ldc = N;

    // Warp tile (16x16x16)
    wmma::fragment<wmma::matrix_a, 16, 16, 16, half, wmma::row_major> a_frag;
    wmma::fragment<wmma::matrix_b, 16, 16, 16, half, wmma::col_major> b_frag;
    wmma::fragment<wmma::accumulator, 16, 16, 16, float> c_frag;

    wmma::fill_fragment(c_frag, 0.0f);

    int warpM = (blockIdx.y * blockDim.y + threadIdx.y) / 32;
    int warpN = (blockIdx.x * blockDim.x + threadIdx.x) / 32;

    int aRow = warpM * 16;
    int bCol = warpN * 16;

    // Tile-level multiply
    for (int k = 0; k < K; k += 16) {
        wmma::load_matrix_sync(a_frag, A + aRow * lda + k, lda);
        wmma::load_matrix_sync(b_frag, B + k * ldb + bCol, ldb);

        wmma::mma_sync(c_frag, a_frag, b_frag, c_frag);
    }

    // Store result
    wmma::store_matrix_sync(C + aRow * ldc + bCol, c_frag, ldc, wmma::mem_row_major);
}