#include "simdffi.h"
#include <iostream>
#include <string>
#include <vector>

// For the CUDA zero-copy example
#include <cuda_runtime.h>

// A simple struct to represent a node for the AST/Neo4j exporter
struct GraphNode {
    long id;
    char label[50];
    char property[100];
};

// Dummy CUDA kernel for demonstration.
// It processes GraphNode objects directly in pinned host memory.
__global__ void process_nodes_kernel(GraphNode* nodes, int count) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < count) {
        // Example: Modify the node ID on the GPU
        nodes[idx].id += 100;
    }
}

int main() {
    // --- Example 1: Using ParseJSON ---
    std::cout << "--- Testing ParseJSON ---" << std::endl;
    const char* json_input = R"({\"key\": \"value\", \"number\": 123})";
    char* json_output = ParseJSON(json_input);
    if (json_output) {
        std::cout << "Go FFI returned: " << json_output << std::endl;
        FreeString(json_output); // IMPORTANT: Free the memory
    } else {
        std::cerr << "ParseJSON returned null." << std::endl;
    }

    // --- Example 2: Using Pinned Memory for Zero-Copy CUDA ---
    std::cout << "\n--- Testing Pinned Memory for Zero-Copy CUDA ---" << std::endl;
    const int node_count = 10;
    size_t buffer_size = node_count * sizeof(GraphNode);

    // 1. Allocate pinned memory via Go FFI
    void* host_ptr = MallocHost(buffer_size);
    if (!host_ptr) {
        std::cerr << "Failed to allocate pinned host memory!" << std::endl;
        return 1;
    }
    std::cout << "Pinned host buffer allocated at address: " << host_ptr << std::endl;

    // 2. Populate the buffer with graph data
    GraphNode* node_array = static_cast<GraphNode*>(host_ptr);
    for (int i = 0; i < node_count; ++i) {
        node_array[i].id = 1000 + i;
        snprintf(node_array[i].label, sizeof(node_array[i].label), "Node");
        snprintf(node_array[i].property, sizeof(node_array[i].property), "Property_%d", i);
    }
    std::cout << "Populated pinned buffer. First node ID before GPU: " << node_array[0].id << std::endl;

    // 3. Get the corresponding GPU device pointer for zero-copy access
    void* device_ptr = nullptr;
    cudaError_t cuda_err = cudaHostGetDevicePointer(&device_ptr, host_ptr, 0);
    if (cuda_err != cudaSuccess) {
        std::cerr << "cudaHostGetDevicePointer failed: " << cudaGetErrorString(cuda_err) << std::endl;
        FreeHost(host_ptr);
        return 1;
    }
    std::cout << "Mapped host pointer to device pointer: " << device_ptr << std::endl;

    // 4. Launch a CUDA kernel to process the data directly in pinned memory
    int threads_per_block = 256;
    int blocks_per_grid = (node_count + threads_per_block - 1) / threads_per_block;
    process_nodes_kernel<<<blocks_per_grid, threads_per_block>>>(static_cast<GraphNode*>(device_ptr), node_count);
    
    // 5. Wait for the kernel to finish and check for errors
    cuda_err = cudaDeviceSynchronize();
    if (cuda_err != cudaSuccess) {
        std::cerr << "CUDA kernel execution failed: " << cudaGetErrorString(cuda_err) << std::endl;
    } else {
        std::cout << "CUDA kernel executed successfully." << std::endl;
        std::cout << "First node ID after GPU: " << node_array[0].id << " (should be 1100)" << std::endl;
    }

    // 6. Clean up the pinned memory
    std::cout << "Freeing pinned buffer." << std::endl;
    FreeHost(host_ptr);

    return 0;
}
