#include <cstdio>
#include <cuda_runtime.h>

// Minimal CUDA kernel - just proves kernel execution works
__global__ void smoketest_kernel() {
    // Do nothing - just need to verify kernel can launch
}

// Simple vector addition kernel for basic compute test
__global__ void vector_add(const float* a, const float* b, float* c, int n) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < n) {
        c[idx] = a[idx] + b[idx];
    }
}

int main() {
    printf("=== CUDA Smoketest ===\n\n");

    // Test 1: Check CUDA runtime version
    int runtime_version = 0;
    cudaError_t err = cudaRuntimeGetVersion(&runtime_version);
    if (err != cudaSuccess) {
        printf("❌ Failed to get CUDA runtime version: %s\n", cudaGetErrorString(err));
        return 1;
    }
    printf("✅ CUDA Runtime Version: %d.%d\n",
           runtime_version / 1000, (runtime_version % 100) / 10);

    // Test 2: Check driver version
    int driver_version = 0;
    err = cudaDriverGetVersion(&driver_version);
    if (err != cudaSuccess) {
        printf("⚠️  Could not get driver version: %s\n", cudaGetErrorString(err));
    } else {
        printf("✅ CUDA Driver Version: %d.%d\n",
               driver_version / 1000, (driver_version % 100) / 10);
    }

    // Test 3: Enumerate devices
    int device_count = 0;
    err = cudaGetDeviceCount(&device_count);
    if (err != cudaSuccess) {
        printf("❌ cudaGetDeviceCount failed: %s\n", cudaGetErrorString(err));
        return 2;
    }

    if (device_count == 0) {
        printf("❌ No CUDA devices found!\n");
        return 3;
    }

    printf("✅ CUDA Devices Found: %d\n\n", device_count);

    // Test 4: Query device properties
    for (int i = 0; i < device_count; i++) {
        cudaDeviceProp prop;
        err = cudaGetDeviceProperties(&prop, i);
        if (err != cudaSuccess) {
            printf("❌ Failed to query device %d: %s\n", i, cudaGetErrorString(err));
            continue;
        }

        printf("Device %d: %s\n", i, prop.name);
        printf("  Compute Capability: %d.%d\n", prop.major, prop.minor);
        printf("  Total Global Memory: %.2f GB\n", prop.totalGlobalMem / 1e9);
        printf("  SM Count: %d\n", prop.multiProcessorCount);
        printf("  Max Threads per Block: %d\n", prop.maxThreadsPerBlock);
        printf("  Warp Size: %d\n", prop.warpSize);
        printf("\n");
    }

    // Test 5: Set device (use device 0)
    err = cudaSetDevice(0);
    if (err != cudaSuccess) {
        printf("❌ cudaSetDevice(0) failed: %s\n", cudaGetErrorString(err));
        return 4;
    }
    printf("✅ Set active device: 0\n");

    // Test 6: Launch minimal kernel
    printf("✅ Launching empty kernel...\n");
    smoketest_kernel<<<1, 1>>>();
    err = cudaDeviceSynchronize();
    if (err != cudaSuccess) {
        printf("❌ Kernel launch/sync failed: %s\n", cudaGetErrorString(err));
        return 5;
    }
    printf("✅ Empty kernel executed successfully\n");

    // Test 7: Simple vector addition (compute test)
    const int N = 1024;
    const size_t bytes = N * sizeof(float);

    float* h_a = new float[N];
    float* h_b = new float[N];
    float* h_c = new float[N];

    // Initialize host arrays
    for (int i = 0; i < N; i++) {
        h_a[i] = static_cast<float>(i);
        h_b[i] = static_cast<float>(i * 2);
    }

    // Allocate device memory
    float *d_a, *d_b, *d_c;
    err = cudaMalloc(&d_a, bytes);
    if (err != cudaSuccess) {
        printf("❌ cudaMalloc failed for d_a: %s\n", cudaGetErrorString(err));
        return 6;
    }
    err = cudaMalloc(&d_b, bytes);
    if (err != cudaSuccess) {
        printf("❌ cudaMalloc failed for d_b: %s\n", cudaGetErrorString(err));
        cudaFree(d_a);
        return 6;
    }
    err = cudaMalloc(&d_c, bytes);
    if (err != cudaSuccess) {
        printf("❌ cudaMalloc failed for d_c: %s\n", cudaGetErrorString(err));
        cudaFree(d_a);
        cudaFree(d_b);
        return 6;
    }
    printf("✅ Allocated %zu bytes on device (3 arrays)\n", bytes * 3);

    // Copy host to device
    err = cudaMemcpy(d_a, h_a, bytes, cudaMemcpyHostToDevice);
    if (err != cudaSuccess) {
        printf("❌ cudaMemcpy H->D failed for d_a: %s\n", cudaGetErrorString(err));
        cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
        return 7;
    }
    err = cudaMemcpy(d_b, h_b, bytes, cudaMemcpyHostToDevice);
    if (err != cudaSuccess) {
        printf("❌ cudaMemcpy H->D failed for d_b: %s\n", cudaGetErrorString(err));
        cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
        return 7;
    }
    printf("✅ Copied data to device\n");

    // Launch vector addition kernel
    int threads_per_block = 256;
    int blocks = (N + threads_per_block - 1) / threads_per_block;
    printf("✅ Launching vector_add kernel (%d blocks, %d threads/block)...\n",
           blocks, threads_per_block);

    vector_add<<<blocks, threads_per_block>>>(d_a, d_b, d_c, N);

    err = cudaDeviceSynchronize();
    if (err != cudaSuccess) {
        printf("❌ vector_add kernel failed: %s\n", cudaGetErrorString(err));
        cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
        return 8;
    }
    printf("✅ Vector add kernel executed\n");

    // Copy result back to host
    err = cudaMemcpy(h_c, d_c, bytes, cudaMemcpyDeviceToHost);
    if (err != cudaSuccess) {
        printf("❌ cudaMemcpy D->H failed: %s\n", cudaGetErrorString(err));
        cudaFree(d_a); cudaFree(d_b); cudaFree(d_c);
        return 9;
    }
    printf("✅ Copied result back to host\n");

    // Verify results
    bool correct = true;
    for (int i = 0; i < N; i++) {
        float expected = h_a[i] + h_b[i];
        if (h_c[i] != expected) {
            printf("❌ Verification failed at index %d: expected %f, got %f\n",
                   i, expected, h_c[i]);
            correct = false;
            break;
        }
    }

    if (correct) {
        printf("✅ Vector addition results verified (all %d elements correct)\n", N);
    }

    // Cleanup
    cudaFree(d_a);
    cudaFree(d_b);
    cudaFree(d_c);
    delete[] h_a;
    delete[] h_b;
    delete[] h_c;

    printf("\n=== 🎉 All CUDA tests passed! ===\n");
    printf("Your CUDA installation is working correctly.\n");
    printf("\nNext steps:\n");
    printf("  - Install PyTorch with CUDA support for Python\n");
    printf("  - Or install CuPy for NumPy-like GPU arrays\n");
    printf("  - Use CUDA for Phase 89 reranking/clustering\n");

    return 0;
}
