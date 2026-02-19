/*
 * FastMCP Code Quality Ranker (C++)
 * Uses libtorch for fast inference on code quality scoring
 *
 * Architecture:
 * Input: 1024-d feature vector from FastMCP indexer
 * Output: Quality scores [0-1] for different aspects
 *
 * Scores:
 * - code_quality: Overall code quality (0-1)
 * - documentation: Comment quality (0-1)
 * - complexity: Code complexity (inverse, 0-1)
 * - maintainability: Ease of maintenance (0-1)
 */

#include <torch/torch.h>
#include <torch/script.h>
#include "httplib.h"
#include "json.hpp"
#include <iostream>
#include <vector>
#include <chrono>
#include <memory>

using json = nlohmann::json;

// Quality Ranker Model
class CodeQualityRanker : public torch::nn::Module {
public:
    CodeQualityRanker(int d_in = 1024, int d_hidden = 256, int n_scores = 4) {
        // Encoder layers
        encoder = register_module("encoder", torch::nn::Sequential(
            torch::nn::Linear(d_in, d_hidden),
            torch::nn::ReLU(),
            torch::nn::Dropout(0.1),
            torch::nn::Linear(d_hidden, d_hidden / 2),
            torch::nn::ReLU()
        ));

        // Score heads (multi-task)
        quality_head = register_module("quality_head", torch::nn::Linear(d_hidden / 2, 1));
        documentation_head = register_module("documentation_head", torch::nn::Linear(d_hidden / 2, 1));
        complexity_head = register_module("complexity_head", torch::nn::Linear(d_hidden / 2, 1));
        maintainability_head = register_module("maintainability_head", torch::nn::Linear(d_hidden / 2, 1));
    }

    // Forward pass
    std::map<std::string, torch::Tensor> forward(torch::Tensor x) {
        // Encode features
        auto encoded = encoder->forward(x);

        // Multi-task prediction
        auto quality = torch::sigmoid(quality_head->forward(encoded));
        auto documentation = torch::sigmoid(documentation_head->forward(encoded));
        auto complexity = torch::sigmoid(complexity_head->forward(encoded));
        auto maintainability = torch::sigmoid(maintainability_head->forward(encoded));

        return {
            {"quality", quality},
            {"documentation", documentation},
            {"complexity", complexity},
            {"maintainability", maintainability}
        };
    }

private:
    torch::nn::Sequential encoder{nullptr};
    torch::nn::Linear quality_head{nullptr};
    torch::nn::Linear documentation_head{nullptr};
    torch::nn::Linear complexity_head{nullptr};
    torch::nn::Linear maintainability_head{nullptr};
};

// Global model
std::shared_ptr<CodeQualityRanker> g_model;
std::shared_ptr<torch::jit::script::Module> g_traced_model;
bool g_use_traced = false;

// Initialize model
bool init_model(const std::string& model_path = "") {
    try {
        if (!model_path.empty()) {
            // Load traced model
            g_traced_model = std::make_shared<torch::jit::script::Module>(
                torch::jit::load(model_path)
            );
            g_use_traced = true;
            std::cout << "✅ Loaded traced model from: " << model_path << std::endl;
        } else {
            // Create new model
            g_model = std::make_shared<CodeQualityRanker>();
            g_model->eval();
            std::cout << "✅ Initialized new CodeQualityRanker model" << std::endl;
        }
        return true;
    } catch (const c10::Error& e) {
        std::cerr << "❌ Error loading model: " << e.what() << std::endl;
        return false;
    }
}

// Score code features
json score_code(const std::vector<float>& features) {
    auto start = std::chrono::high_resolution_clock::now();

    try {
        // Convert to tensor
        torch::NoGradGuard no_grad;
        auto input = torch::from_blob(
            const_cast<float*>(features.data()),
            {1, static_cast<long>(features.size())},
            torch::kFloat
        ).clone();

        json result;

        if (g_use_traced && g_traced_model) {
            // Use traced model
            std::vector<torch::jit::IValue> inputs;
            inputs.push_back(input);
            auto output = g_traced_model->forward(inputs).toTensor();

            // Extract scores (assuming output is [1, 4])
            auto scores = output.accessor<float, 2>();
            result["quality"] = scores[0][0];
            result["documentation"] = scores[0][1];
            result["complexity"] = scores[0][2];
            result["maintainability"] = scores[0][3];
        } else if (g_model) {
            // Use eager model
            auto scores = g_model->forward(input);
            result["quality"] = scores["quality"].item<float>();
            result["documentation"] = scores["documentation"].item<float>();
            result["complexity"] = scores["complexity"].item<float>();
            result["maintainability"] = scores["maintainability"].item<float>();
        } else {
            throw std::runtime_error("No model loaded");
        }

        // Calculate overall score (weighted average)
        float overall = (
            result["quality"].get<float>() * 0.4 +
            result["documentation"].get<float>() * 0.2 +
            result["complexity"].get<float>() * 0.2 +
            result["maintainability"].get<float>() * 0.2
        );
        result["overall"] = overall;

        // Add latency
        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);
        result["latency_us"] = duration.count();

        return result;

    } catch (const std::exception& e) {
        return {
            {"error", e.what()},
            {"quality", 0.0},
            {"documentation", 0.0},
            {"complexity", 0.0},
            {"maintainability", 0.0},
            {"overall", 0.0}
        };
    }
}

// Batch scoring for multiple files
json score_batch(const std::vector<std::vector<float>>& features_batch) {
    auto start = std::chrono::high_resolution_clock::now();

    try {
        torch::NoGradGuard no_grad;

        // Convert batch to tensor
        std::vector<torch::Tensor> tensors;
        for (const auto& features : features_batch) {
            auto tensor = torch::from_blob(
                const_cast<float*>(features.data()),
                {static_cast<long>(features.size())},
                torch::kFloat
            ).clone();
            tensors.push_back(tensor);
        }
        auto batch_tensor = torch::stack(tensors);

        json results = json::array();

        if (g_use_traced && g_traced_model) {
            std::vector<torch::jit::IValue> inputs;
            inputs.push_back(batch_tensor);
            auto output = g_traced_model->forward(inputs).toTensor();

            auto scores = output.accessor<float, 2>();
            for (int i = 0; i < batch_tensor.size(0); i++) {
                json item;
                item["quality"] = scores[i][0];
                item["documentation"] = scores[i][1];
                item["complexity"] = scores[i][2];
                item["maintainability"] = scores[i][3];
                item["overall"] = (
                    scores[i][0] * 0.4 +
                    scores[i][1] * 0.2 +
                    scores[i][2] * 0.2 +
                    scores[i][3] * 0.2
                );
                results.push_back(item);
            }
        } else if (g_model) {
            auto scores = g_model->forward(batch_tensor);

            for (int i = 0; i < batch_tensor.size(0); i++) {
                json item;
                item["quality"] = scores["quality"][i].item<float>();
                item["documentation"] = scores["documentation"][i].item<float>();
                item["complexity"] = scores["complexity"][i].item<float>();
                item["maintainability"] = scores["maintainability"][i].item<float>();
                item["overall"] = (
                    item["quality"].get<float>() * 0.4 +
                    item["documentation"].get<float>() * 0.2 +
                    item["complexity"].get<float>() * 0.2 +
                    item["maintainability"].get<float>() * 0.2
                );
                results.push_back(item);
            }
        }

        auto end = std::chrono::high_resolution_clock::now();
        auto duration = std::chrono::duration_cast<std::chrono::microseconds>(end - start);

        return {
            {"results", results},
            {"batch_size", features_batch.size()},
            {"latency_us", duration.count()},
            {"throughput", features_batch.size() * 1000000.0 / duration.count()}
        };

    } catch (const std::exception& e) {
        return {
            {"error", e.what()},
            {"results", json::array()}
        };
    }
}

int main(int argc, char** argv) {
    std::cout << "🎯 FastMCP Code Quality Ranker Server" << std::endl;
    std::cout << "=====================================\n" << std::endl;

    // Parse args
    std::string model_path = "";
    int port = 9092;

    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--model" && i + 1 < argc) {
            model_path = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        }
    }

    // Initialize model
    if (!init_model(model_path)) {
        return 1;
    }

    // Create HTTP server
    httplib::Server svr;

    // Health check
    svr.Get("/health", [](const httplib::Request&, httplib::Response& res) {
        json response = {
            {"status", "healthy"},
            {"service", "code_quality_ranker"},
            {"model_loaded", g_model != nullptr || g_traced_model != nullptr}
        };
        res.set_content(response.dump(), "application/json");
    });

    // Score single file
    svr.Post("/score", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::vector<float> features = body["features"].get<std::vector<float>>();

            if (features.size() != 1024) {
                throw std::runtime_error("Expected 1024 features, got " + std::to_string(features.size()));
            }

            auto result = score_code(features);
            res.set_content(result.dump(), "application/json");

        } catch (const std::exception& e) {
            json error = {{"error", e.what()}};
            res.status = 400;
            res.set_content(error.dump(), "application/json");
        }
    });

    // Score batch
    svr.Post("/score/batch", [](const httplib::Request& req, httplib::Response& res) {
        try {
            auto body = json::parse(req.body);
            std::vector<std::vector<float>> features_batch = body["features"].get<std::vector<std::vector<float>>>();

            auto result = score_batch(features_batch);
            res.set_content(result.dump(), "application/json");

        } catch (const std::exception& e) {
            json error = {{"error", e.what()}};
            res.status = 400;
            res.set_content(error.dump(), "application/json");
        }
    });

    // Start server
    std::cout << "🚀 Server listening on port " << port << std::endl;
    std::cout << "   Endpoints:" << std::endl;
    std::cout << "   - GET  /health" << std::endl;
    std::cout << "   - POST /score (single file)" << std::endl;
    std::cout << "   - POST /score/batch (multiple files)" << std::endl;
    std::cout << std::endl;

    svr.listen("0.0.0.0", port);

    return 0;
}
