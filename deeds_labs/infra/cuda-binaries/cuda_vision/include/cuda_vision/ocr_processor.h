#pragma once

#include "vision_kernels.cuh"
#include <string>
#include <memory>

namespace cuda_vision {

class OCRProcessor {
public:
    OCRProcessor();
    ~OCRProcessor();

    bool load_model(const std::string& model_path);
    std::vector<OCRResult> extract_text(const cv::Mat& image);

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace cuda_vision