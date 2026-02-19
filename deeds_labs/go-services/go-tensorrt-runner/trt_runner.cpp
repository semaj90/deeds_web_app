#include "trt_runner.h"
#include <string>

void loadEngine(const char* path) {
    (void)path; // stub no-op
}

const char* runInference(const char* input) {
    static std::string out;
    out = std::string("[trt-stub] ") + (input ? input : "");
    return out.c_str();
}
