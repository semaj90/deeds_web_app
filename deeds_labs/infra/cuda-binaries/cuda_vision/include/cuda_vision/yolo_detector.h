#pragma once

#include "vision_kernels.cuh"
#include <string>
#include <memory>

namespace cuda_vision {

class YOLODetector {
public:
    YOLODetector();
    ~YOLODetector();

    bool load_model(const std::string& model_path);
    std::vector<Detection> detect(const cv::Mat& image);

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace cuda_vision