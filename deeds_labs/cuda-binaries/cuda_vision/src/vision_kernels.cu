#include "cuda_vision/vision_kernels.cuh"
#include <iostream>
#include <algorithm>

namespace cuda_vision {

// CUDA Kernel Implementations

__global__ void preprocess_image_kernel(
    const unsigned char* input,
    float* output,
    int width, int height, int channels
) {
    int x = blockIdx.x * blockDim.x + threadIdx.x;
    int y = blockIdx.y * blockDim.y + threadIdx.y;
    int c = blockIdx.z * blockDim.z + threadIdx.z;

    if (x < width && y < height && c < channels) {
        int input_idx = (y * width + x) * channels + c;
        int output_idx = c * (width * height) + y * width + x;

        // Normalize to [0, 1] and apply mean subtraction
        float pixel = static_cast<float>(input[input_idx]) / 255.0f;
        const float mean[] = {0.485f, 0.456f, 0.406f};
        const float std[] = {0.229f, 0.224f, 0.225f};

        output[output_idx] = (pixel - mean[c]) / std[c];
    }
}

__global__ void postprocess_detections_kernel(
    const float* predictions,
    Detection* detections,
    int num_predictions,
    float confidence_threshold
) {
    int idx = blockIdx.x * blockDim.x + threadIdx.x;

    if (idx < num_predictions) {
        const float* pred = predictions + idx * 6; // [x1, y1, x2, y2, conf, class_id]

        float confidence = pred[4];
        if (confidence >= confidence_threshold) {
            detections[idx].bbox = cv::Rect(
                static_cast<int>(pred[0]),
                static_cast<int>(pred[1]),
                static_cast<int>(pred[2] - pred[0]),
                static_cast<int>(pred[3] - pred[1])
            );
            detections[idx].confidence = confidence;
            detections[idx].class_id = static_cast<int>(pred[5]);
        }
    }
}

__global__ void fuse_multimodal_features_kernel(
    const float* vision_features,
    const float* text_features,
    float* fused_features,
    int batch_size, int feature_dim
) {
    int batch = blockIdx.x;
    int feature = blockIdx.y * blockDim.x + threadIdx.x;

    if (batch < batch_size && feature < feature_dim) {
        int idx = batch * feature_dim + feature;

        // Simple concatenation fusion (can be enhanced with attention)
        if (feature < feature_dim / 2) {
            fused_features[idx] = vision_features[idx];
        } else {
            fused_features[idx] = text_features[idx - feature_dim / 2];
        }
    }
}

// VisionProcessor Implementation

VisionProcessor::VisionProcessor()
    : stream_(nullptr), workspace_(nullptr), workspace_size_(0),
      yolo_engine_(nullptr), sam_encoder_(nullptr), sam_decoder_(nullptr),
      ocr_engine_(nullptr), seal_detector_(nullptr) {
}

VisionProcessor::~VisionProcessor() {
    free_workspace();
    if (stream_) {
        cudaStreamDestroy(stream_);
    }
}

bool VisionProcessor::initialize(int gpu_id) {
    cudaError_t err = cudaSetDevice(gpu_id);
    if (err != cudaSuccess) {
        std::cerr << "Failed to set CUDA device: " << cudaGetErrorString(err) << std::endl;
        return false;
    }

    // Create CUDA stream
    err = cudaStreamCreate(&stream_);
    if (err != cudaSuccess) {
        std::cerr << "Failed to create CUDA stream: " << cudaGetErrorString(err) << std::endl;
        return false;
    }

    // Allocate workspace for TensorRT
    allocate_workspace(1 << 30); // 1GB workspace

    std::cout << "CUDA Vision Processor initialized on GPU " << gpu_id << std::endl;
    return true;
}

cv::Mat VisionProcessor::preprocess_image(const cv::Mat& image) {
    cv::Mat resized, float_img;
    cv::resize(image, resized, cv::Size(640, 640)); // YOLO standard size
    resized.convertTo(float_img, CV_32FC3, 1.0/255.0);

    // Allocate GPU memory
    unsigned char* d_input;
    float* d_output;
    size_t input_size = resized.total() * resized.channels();
    size_t output_size = input_size * sizeof(float);

    cudaMalloc(&d_input, input_size);
    cudaMalloc(&d_output, output_size);

    // Copy to GPU
    cudaMemcpy(d_input, resized.data, input_size, cudaMemcpyHostToDevice);

    // Launch preprocessing kernel
    dim3 block(16, 16, 3);
    dim3 grid((640 + block.x - 1) / block.x,
              (640 + block.y - 1) / block.y,
              (3 + block.z - 1) / block.z);

    preprocess_image_kernel<<<grid, block, 0, stream_>>>(
        d_input, d_output, 640, 640, 3
    );

    // Copy back to CPU
    cv::Mat output(640, 640, CV_32FC3);
    cudaMemcpy(output.data, d_output, output_size, cudaMemcpyDeviceToHost);

    // Cleanup
    cudaFree(d_input);
    cudaFree(d_output);

    return output;
}

std::vector<Detection> VisionProcessor::detect_objects(const cv::Mat& image) {
    // Preprocess image
    cv::Mat processed = preprocess_image(image);

    // TODO: Implement YOLO inference
    // This would load the TensorRT engine and run inference

    std::vector<Detection> detections;
    // Placeholder: return empty detections for now
    return detections;
}

std::vector<Segmentation> VisionProcessor::segment_objects(
    const cv::Mat& image, const std::vector<Detection>& detections) {

    std::vector<Segmentation> segmentations;
    // TODO: Implement SAM segmentation
    return segmentations;
}

std::vector<OCRResult> VisionProcessor::extract_text(const cv::Mat& image) {
    std::vector<OCRResult> results;
    // TODO: Implement OCR processing
    return results;
}

std::vector<SealDetection> VisionProcessor::detect_seals(const cv::Mat& image) {
    std::vector<SealDetection> seals;
    // TODO: Implement seal detection
    return seals;
}

cv::Mat VisionProcessor::fuse_vision_text(
    const cv::Mat& vision_features, const cv::Mat& text_features) {

    // TODO: Implement multimodal fusion
    cv::Mat fused;
    return fused;
}

void VisionProcessor::allocate_workspace(size_t size) {
    if (workspace_) {
        cudaFree(workspace_);
    }
    cudaMalloc(&workspace_, size);
    workspace_size_ = size;
}

void VisionProcessor::free_workspace() {
    if (workspace_) {
        cudaFree(workspace_);
        workspace_ = nullptr;
        workspace_size_ = 0;
    }
}

} // namespace cuda_vision