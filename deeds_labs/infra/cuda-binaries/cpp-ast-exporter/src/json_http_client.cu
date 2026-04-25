#include <iostream>
#include <string>
#include <vector>
#include <curl/curl.h>
#include <cuda_runtime.h> // Include CUDA runtime header

// Simple HTTP POST helper
static size_t WriteCallback(void* contents, size_t size, size_t nmemb, void* userp) {
    ((std::string*)userp)->append((char*)contents, size * nmemb);
    return size * nmemb;
}

std::string postJSON(const std::string& url, const std::string& data) {
    CURL* curl = curl_easy_init();
    if (!curl) return "{}";
    std::string response;
    curl_easy_setopt(curl, CURLOPT_URL, url.c_str());
    curl_easy_setopt(curl, CURLOPT_POSTFIELDS, data.c_str());
    curl_easy_setopt(curl, CURLOPT_WRITEFUNCTION, WriteCallback);
    curl_easy_setopt(curl, CURLOPT_WRITEDATA, &response);
    curl_easy_perform(curl);
    curl_easy_cleanup(curl);
    return response;
}

// --- CUDA Kernel for processing JSON chunks ---
// For demonstration, this kernel will simply copy integer data from host to device
// and perform a simple operation. In a real scenario, this would parse/process JSON.
__global__ void process_json_chunk_kernel(int* device_data, int num_elements) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;
    if (idx < num_elements) {
        device_data[idx] *= 2; // Example operation: multiply by 2
    }
}

int main() {
    std::string testJSON = R"([{"value":10},{"value":20},{"value":30}])"; // Example JSON with values
    std::string result = postJSON("http://localhost:8099/parse", testJSON);
    std::cout << "📦 Parsed JSON Chunks:\n" << result << std::endl;

    // --- Simulate processing a chunk with CUDA ---
    // In a real application, you would parse 'result' to extract data from chunks.
    // For this example, let's assume we extract a simple array of integers.
    std::vector<int> host_data = {1, 2, 3, 4, 5}; // Simulated data from a JSON chunk
    int num_elements = host_data.size();
    size_t data_size = num_elements * sizeof(int);

    // 1. Allocate pinned host memory
    int* pinned_host_data;
    cudaError_t cudaStatus = cudaMallocHost((void**)&pinned_host_data, data_size);
    if (cudaStatus != cudaSuccess) {
        std::cerr << "cudaMallocHost failed: " << cudaGetErrorString(cudaStatus) << std::endl;
        return 1;
    }
    memcpy(pinned_host_data, host_data.data(), data_size); // Copy data to pinned memory

    // 2. Get device pointer for zero-copy access
    int* device_data;
    cudaStatus = cudaHostGetDevicePointer((void**)&device_data, pinned_host_data, 0);
    if (cudaStatus != cudaSuccess) {
        std::cerr << "cudaHostGetDevicePointer failed: " << cudaGetErrorString(cudaStatus) << std::endl;
        cudaFreeHost(pinned_host_data);
        return 1;
    }

    // 3. Launch CUDA kernel
    int threadsPerBlock = 256;
    int numBlocks = (num_elements + threadsPerBlock - 1) / threadsPerBlock;
    process_json_chunk_kernel<<<numBlocks, threadsPerBlock>>>(device_data, num_elements);

    // 4. Synchronize and check for errors
    cudaStatus = cudaDeviceSynchronize();
    if (cudaStatus != cudaSuccess) {
        std::cerr << "CUDA kernel execution failed: " << cudaGetErrorString(cudaStatus) << std::endl;
        cudaFreeHost(pinned_host_data);
        return 1;
    }

    // 5. Verify results (data is modified in pinned_host_data directly)
    std::cout << "Processed data in pinned memory (first element): " << pinned_host_data[0] << std::endl;

    // 6. Free pinned host memory
    cudaFreeHost(pinned_host_data);

    return 0;
}