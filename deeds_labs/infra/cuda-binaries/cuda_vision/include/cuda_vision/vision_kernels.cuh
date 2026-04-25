#pragma once

#include <cuda_runtime.h>
#include <opencv2/opencv.hpp>
#include <vector>
#include <memory>

namespace cuda_vision {

// YOLO Detection Result
struct Detection {
    cv::Rect bbox;
    float confidence;
    int class_id;
    std::string class_name;
};

// SAM Segmentation Result
struct Segmentation {
    cv::Mat mask;
    cv::Rect bbox;
    float confidence;
    std::vector<cv::Point> contours;
};

// OCR Result
struct OCRResult {
    std::string text;
    cv::Rect bbox;
    float confidence;
    std::string language;
};

// Seal/Signature Detection Result
struct SealDetection {
    cv::Rect bbox;
    float confidence;
    std::string seal_type;  // "signature", "stamp", "notary", "emboss"
    bool is_authentic;
};

// CUDA Kernel Functions
__global__ void preprocess_image_kernel(
    const unsigned char* input,
    float* output,
    int width, int height, int channels
);

__global__ void postprocess_detections_kernel(
    const float* predictions,
    Detection* detections,
    int num_predictions,
    float confidence_threshold
);

__global__ void fuse_multimodal_features_kernel(
    const float* vision_features,
    const float* text_features,
    float* fused_features,
    int batch_size, int feature_dim
);

// Host functions
class VisionProcessor {
public:
    VisionProcessor();
    ~VisionProcessor();

    // Initialize CUDA resources
    bool initialize(int gpu_id = 0);

    // YOLO object detection
    std::vector<Detection> detect_objects(const cv::Mat& image);

    // SAM segmentation
    std::vector<Segmentation> segment_objects(const cv::Mat& image, const std::vector<Detection>& detections);

    // OCR processing
    std::vector<OCRResult> extract_text(const cv::Mat& image);

    // Seal/Signature detection
    std::vector<SealDetection> detect_seals(const cv::Mat& image);

    // Multimodal fusion
    cv::Mat fuse_vision_text(const cv::Mat& vision_features, const cv::Mat& text_features);

private:
    // CUDA resources
    cudaStream_t stream_;
    void* workspace_;
    size_t workspace_size_;

    // Model handles
    void* yolo_engine_;
    void* sam_encoder_;
    void* sam_decoder_;
    void* ocr_engine_;
    void* seal_detector_;

    // Helper functions
    cv::Mat preprocess_image(const cv::Mat& image);
    void allocate_workspace(size_t size);
    void free_workspace();
};

} // namespace cuda_vision