#pragma once
#include <torch/script.h>
#include <vector>
#include <string>

// Simple interface header for SOM Autoencoder
struct SomAutoEncoder {
    torch::jit::script::Module module;
    explicit SomAutoEncoder(const std::string& modelPath)
        : module(torch::jit::load(modelPath)) {
        module.eval();
    }
    std::vector<float> run(const std::vector<float>& input) {
        auto t = torch::from_blob(const_cast<float*>(input.data()), {(long)input.size()}, torch::kFloat);
        auto out = module.forward({t}).toTensor().to(torch::kCPU).contiguous();
        return std::vector<float>(out.data_ptr<float>(), out.data_ptr<float>() + out.numel());
    }
};

