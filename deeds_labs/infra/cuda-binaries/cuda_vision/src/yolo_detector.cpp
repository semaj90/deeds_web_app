#include "cuda_vision/yolo_detector.h"
#include "cuda_vision/vision_kernels.cuh"
#include <NvInfer.h>
#include <fstream>
#include <iostream>

namespace cuda_vision {

class YOLODetector::Impl {
public:
    Impl() : engine_(nullptr), context_(nullptr) {}
    ~Impl() { cleanup(); }

    bool load_model(const std::string& model_path) {
        // Load TensorRT engine
        std::ifstream file(model_path, std::ios::binary);
        if (!file) {
            std::cerr << "Failed to open model file: " << model_path << std::endl;
            return false;
        }

        file.seekg(0, std::ios::end);
        size_t size = file.tellg();
        file.seekg(0, std::ios::beg);

        std::vector<char> buffer(size);
        file.read(buffer.data(), size);

        // Deserialize engine
        nvinfer1::IRuntime* runtime = nvinfer1::createInferRuntime(logger_);
        engine_ = runtime->deserializeCudaEngine(buffer.data(), size);
        runtime->destroy();

        if (!engine_) {
            std::cerr << "Failed to deserialize TensorRT engine" << std::endl;
            return false;
        }

        context_ = engine_->createExecutionContext();
        return context_ != nullptr;
    }

    std::vector<Detection> detect(const cv::Mat& image) {
        if (!context_) return {};

        // Preprocess image
        cv::Mat processed = preprocess_image(image);

        // Run inference
        // TODO: Implement TensorRT inference

        return {};
    }

private:
    nvinfer1::ICudaEngine* engine_;
    nvinfer1::IExecutionContext* context_;
    Logger logger_;

    void cleanup() {
        if (context_) context_->destroy();
        if (engine_) engine_->destroy();
    }

    cv::Mat preprocess_image(const cv::Mat& image) {
        cv::Mat resized, float_img;
        cv::resize(image, resized, cv::Size(640, 640));
        resized.convertTo(float_img, CV_32FC3, 1.0/255.0);
        return float_img;
    }
};

YOLODetector::YOLODetector() : impl_(std::make_unique<Impl>()) {}
YOLODetector::~YOLODetector() = default;

bool YOLODetector::load_model(const std::string& model_path) {
    return impl_->load_model(model_path);
}

std::vector<Detection> YOLODetector::detect(const cv::Mat& image) {
    return impl_->detect(image);
}

} // namespace cuda_vision