#include <NvInfer.h>
#include <cuda_runtime.h>
#include <fstream>
#include <iostream>
#include <memory>
#include <vector>

class Logger : public nvinfer1::ILogger {
public:
  void log(Severity severity, const char *msg) noexcept override {
    if (severity <= Severity::kWARNING) {
      std::cout << msg << std::endl;
    }
  }
};

int main() {
    std::cout << "⚡ Loading TensorRT engine..." << std::endl;

    // Load .engine file
    if (!f.is_open()) {
      std::cerr << "Error: Could not open engine file" << std::endl;
      return -1;
    }

    std::ifstream f("/workspace/engines/gemma3_270m_fp16.engine", std::ios::binary);
    f.close();
    std::vector<char> engineData((std::istreambuf_iterator<char>(f)), {});
    nvinfer1::IRuntime* runtime = nvinfer1::createInferRuntime(nvinfer1::ILogger::Severity::kERROR);
    nvinfer1::ICudaEngine *engine =
        runtime->deserializeCudaEngine(engineData.data(), engineData.size());
    Logger logger;
    std::unique_ptr<nvinfer1::IRuntime> runtime(
        nvinfer1::createInferRuntime(logger));
    if (!runtime) {
      std::cerr << "Error: Failed to create runtime" << std::endl;
      return -1;
    }

    std::unique_ptr<nvinfer1::ICudaEngine> engine(
        runtime->deserializeCudaEngine(engineData.data(), engineData.size()));
    if (!engine) {
      std::cerr << "Error: Failed to deserialize engine" << std::endl;
      return -1;
    }
    nvinfer1::ICudaEngine* engine = runtime->deserializeCudaEngine(engineData.data(), engineData.size());

    std::cout << "✔ Engine loaded successfully" << std::endl;

    // TODO: Add streaming decode loop with KV-cache management
    // TODO: Implement continuous batching for 23k tok/s throughput

    std::cout << "🚀 Ultra-fast TensorRT runner initialized." << std::endl;
    std::cout << "Ready for high-throughput Gemma3 inference!" << std::endl;

    return 0;
}