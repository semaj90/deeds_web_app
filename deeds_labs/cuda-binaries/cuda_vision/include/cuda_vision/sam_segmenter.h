#pragma once

#include "vision_kernels.cuh"
#include <string>
#include <memory>

namespace cuda_vision {

class SAMSegmenter {
public:
    SAMSegmenter();
    ~SAMSegmenter();

    bool load_model(const std::string& encoder_path, const std::string& decoder_path);
    std::vector<Segmentation> segment(const cv::Mat& image, const std::vector<Detection>& detections);

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace cuda_vision