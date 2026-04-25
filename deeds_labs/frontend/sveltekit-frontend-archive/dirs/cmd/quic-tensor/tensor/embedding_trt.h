#ifndef EMBEDDING_TRT_H
#define EMBEDDING_TRT_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

// Return 0 on success, non-zero on failure
int loadTRTEngine(const char* path);
// Run embedding; out points to float buffer of length maxLen. Return 0 on success.
int runEmbedding(const char* text, float* out, int maxLen);

#ifdef __cplusplus
}
#endif

#endif // EMBEDDING_TRT_H
