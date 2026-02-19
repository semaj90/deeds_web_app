// Simple KD-tree accelerator header (embind-friendly)
#pragma once
#include <vector>

extern "C" {
// Build index from flat float array
// data: pointer to float array (n * dim)
// dim: dimension
// n: number of points
void build_index(const float *data, int dim, int n);

// Query k nearest indices for a single query vector, returns pointer to int32
// array Caller JS will copy the returned indices into a new array; embind
// wrapper handles marshalling
int *knn_search(const float *query, int k);

// Free internal index
void free_index();
}
