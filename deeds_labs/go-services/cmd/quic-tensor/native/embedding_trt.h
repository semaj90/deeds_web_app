#ifndef EMBEDDING_TRT_H
#define EMBEDDING_TRT_H

#ifdef __cplusplus
extern "C" {
#endif

int loadTRTEngine(const char* path);
float runEmbedding(const int* input_ids, const int* attention_mask, int maxLen, float* out);

#ifdef __cplusplus
}
#endif

#endif // EMBEDDING_TRT_H
