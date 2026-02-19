// Minimal CUDA test to isolate the issue
#include <cuda_runtime.h>

__global__ void minimal_kernel() {
    // Do nothing - just test compilation
}

extern "C" {
    void test_function() {
        // Just a test function
    }
}