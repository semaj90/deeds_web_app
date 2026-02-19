#include "cuda_vision/ocr_processor.h"
#include <iostream>
#include <tesseract/baseapi.h>

namespace cuda_vision {

class OCRProcessor::Impl {
public:
    Impl() : tesseract_api_(nullptr) {
        tesseract_api_ = new tesseract::TessBaseAPI();
    }

    ~Impl() {
        if (tesseract_api_) {
            tesseract_api_->End();
            delete tesseract_api_;
        }
    }

    bool load_model(const std::string& model_path) {
        // Initialize Tesseract
        if (tesseract_api_->Init(model_path.c_str(), "eng", tesseract::OEM_LSTM_ONLY)) {
            std::cerr << "Failed to initialize Tesseract" << std::endl;
            return false;
        }

        std::cout << "OCR model loaded from: " << model_path << std::endl;
        return true;
    }

    std::vector<OCRResult> extract_text(const cv::Mat& image) {
        std::vector<OCRResult> results;

        if (!tesseract_api_) return results;

        // Convert to grayscale if needed
        cv::Mat gray;
        if (image.channels() == 3) {
            cv::cvtColor(image, gray, cv::COLOR_BGR2GRAY);
        } else {
            gray = image;
        }

        // Set image for OCR
        tesseract_api_->SetImage(gray.data, gray.cols, gray.rows, 1, gray.step);

        // Get OCR result
        char* text = tesseract_api_->GetUTF8Text();
        if (text) {
            OCRResult result;
            result.text = std::string(text);
            result.confidence = tesseract_api_->MeanTextConf();
            result.bbox = cv::Rect(0, 0, image.cols, image.rows);
            result.language = "eng";

            results.push_back(result);
            delete[] text;
        }

        return results;
    }

private:
    tesseract::TessBaseAPI* tesseract_api_;
};

OCRProcessor::OCRProcessor() : impl_(std::make_unique<Impl>()) {}
OCRProcessor::~OCRProcessor() = default;

bool OCRProcessor::load_model(const std::string& model_path) {
    return impl_->load_model(model_path);
}

std::vector<OCRResult> OCRProcessor::extract_text(const cv::Mat& image) {
    return impl_->extract_text(image);
}

} // namespace cuda_vision