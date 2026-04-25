#pragma once

#include "vision_kernels.cuh"
#include <string>
#include <memory>

namespace cuda_vision {

class SealDetector {
public:
    SealDetector();
    ~SealDetector();

    bool load_model(const std::string& model_path);
    std::vector<SealDetection> detect_seals(const cv::Mat& image);

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace cuda_vision