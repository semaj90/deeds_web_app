#include "som_autoencoder.h"
#include <torch/script.h>
#include <iostream>
#include <vector>
#include <string>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

int main(int argc, char* argv[]) {
    try {
        if (argc < 2) {
            std::cerr << "Usage: som_autoencoder <model.pt> [input...]" << std::endl;
            return 1;
        }

        // Load TorchScript model
        auto module = torch::jit::load(argv[1]);
        module.eval();

        // Parse input vector
        std::vector<float> inputVals;
        for (int i = 2; i < argc; i++) {
            try {
                inputVals.push_back(std::stof(argv[i]));
            } catch (...) {
                inputVals.push_back(0.0f);
            }
        }

        torch::Tensor inputTensor = torch::from_blob(
            inputVals.data(), {(long)inputVals.size()}, torch::kFloat
        );

        // Run inference
        auto output = module.forward({inputTensor}).toTensor();
        auto outVec = output.to(torch::kCPU).contiguous();

        // Serialize result to JSON
        json j;
        j["output"] = std::vector<float>(outVec.data_ptr<float>(), outVec.data_ptr<float>() + outVec.numel());
        std::cout << j.dump() << std::endl;

        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
}

