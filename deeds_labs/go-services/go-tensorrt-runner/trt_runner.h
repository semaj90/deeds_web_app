#pragma once
#ifdef __cplusplus
extern "C" {
#endif

void loadEngine(const char* path);
const char* runInference(const char* input);

#ifdef __cplusplus
}
#endif
