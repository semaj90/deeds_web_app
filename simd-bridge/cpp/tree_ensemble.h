#pragma once

#include <cstdint>

#define TREE_ENSEMBLE_SUCCESS 0
#define TREE_ENSEMBLE_ERR_INVALID_ARGS -1
#define TREE_ENSEMBLE_ERR_BUFFER_TOO_SMALL -2

extern "C" {

/**
 * Flat-array Decision Tree & Random Forest batch inference.
 * features: array of shape [n_rows * n_cols] (row-major)
 * feature_indices: array of length total_nodes (split feature index, or -1 for leaf)
 * thresholds: array of length total_nodes (split threshold)
 * left_children: array of length total_nodes (left child node index)
 * right_children: array of length total_nodes (right child node index)
 * leaf_values: array of length total_nodes (leaf prediction value)
 * tree_roots: array of length n_trees containing starting node index for each tree
 * out_scores: output array of length n_rows receiving aggregated predictions
 */
int forestPredict(
    const float* features, int32_t n_rows, int32_t n_cols,
    const int32_t* feature_indices,
    const float* thresholds,
    const int32_t* left_children,
    const int32_t* right_children,
    const float* leaf_values,
    int32_t total_nodes,
    const int32_t* tree_roots, int32_t n_trees,
    float* out_scores, int32_t out_len
);

}
