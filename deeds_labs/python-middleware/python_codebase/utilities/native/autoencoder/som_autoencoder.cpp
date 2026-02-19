#include <iostream>

#if defined(__has_include)
  #if __has_include(<torch/script.h>)
    #include <torch/script.h>
    #define HAVE_LIBTORCH 1
    // These headers are only used when LibTorch is available
    #include <vector>
    #include <string>
    #include <cstdlib>
    #include <exception>
  #endif
#endif

int main(int argc, char* argv[]) {
#if defined(HAVE_LIBTORCH)
	try {
		if (argc < 2) {
			std::cerr << "Usage: " << argv[0] << " <encoder.pt> [val1 val2 ...]" << std::endl;
			return 1;
		}
		std::string model_path = argv[1];

		// load TorchScript module
		auto module = torch::jit::load(model_path);

		std::vector<float> inputVec;
		// Use std::strtof for robust parsing across toolchains
		for (int i = 2; i < argc; ++i) inputVec.push_back(std::strtof(argv[i], nullptr));

		if (inputVec.empty()) {
			std::cerr << "Error: no input values provided. Provide at least one value after the model path." << std::endl;
			return 1;
		}

		auto options = torch::TensorOptions().dtype(torch::kFloat32);
		auto tensor = torch::from_blob(inputVec.data(), {1, (long)inputVec.size()}, options).clone();

		// Handle different forward() return types (Tensor, Tuple, etc.)
		torch::IValue outIVal = module.forward({tensor});
		torch::Tensor outputs;
		if (outIVal.isTensor()) {
			outputs = outIVal.toTensor();
		} else if (outIVal.isTuple()) {
			auto elems = outIVal.toTuple()->elements();
			if (elems.empty() || !elems[0].isTensor()) {
				std::cerr << "Error: model returned a tuple but first element is not a tensor." << std::endl;
				return -1;
			}
			outputs = elems[0].toTensor();
		} else {
			std::cerr << "Error: unsupported model output type. Expected Tensor or Tuple(Tensor,...)." << std::endl;
			return -1;
		}

		// Flatten to 1D and ensure contiguous memory for safe data_ptr access
		outputs = outputs.contiguous().reshape({-1});
		int64_t n = outputs.numel();
		const float* data = outputs.data_ptr<float>();

		for (int64_t j = 0; j < n; ++j) {
			std::cout << data[j];
			if (j + 1 < n) std::cout << ' ';
		}
		std::cout << std::endl;
	} catch (const c10::Error& e) {
		std::cerr << "Torch error: " << e.what() << std::endl;
		return -1;
	} catch (const std::exception& e) {
		std::cerr << "Error: " << e.what() << std::endl;
		return -1;
	}
	return 0;

#else
	// Fallback when libtorch headers are not available at compile time.
	std::cerr << "LibTorch headers not found. To build this program, install libtorch and compile with"
			  << " a proper include/link setup. Example (CMake) hints:\n\n"
			  << "find_package(Torch REQUIRED)\n"
			  << "target_link_libraries(your_target \"${TORCH_LIBRARIES}\")\n"
			  << "target_compile_definitions(your_target PRIVATE HAVE_LIBTORCH=1)\n\n"
			  << "Or compile with a compiler that supports __has_include and make sure the libtorch include path\n"
			  << "is in the compiler search paths. Exiting.\n";
	return 1;
#endif
}
