#include "tree_ensemble.h"
#include "native_execution_counters.h"

#include <cmath>

extern "C" {

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
) {
  if (!features || !feature_indices || !thresholds || !left_children ||
      !right_children || !leaf_values || !tree_roots || !out_scores) {
    return TREE_ENSEMBLE_ERR_INVALID_ARGS;
  }
  if (n_rows <= 0 || n_cols <= 0 || total_nodes <= 0 || n_trees <= 0) {
    return TREE_ENSEMBLE_ERR_INVALID_ARGS;
  }
  if (out_len < n_rows) {
    return TREE_ENSEMBLE_ERR_BUFFER_TOO_SMALL;
  }

  const float inv_trees = 1.0f / static_cast<float>(n_trees);

  for (int32_t r = 0; r < n_rows; ++r) {
    const float* row = features + (static_cast<size_t>(r) * n_cols);
    double accum = 0.0;

    for (int32_t t = 0; t < n_trees; ++t) {
      int32_t curr = tree_roots[t];
      int32_t depth_guard = 0;

      while (curr >= 0 && curr < total_nodes && depth_guard++ < 64) {
        int32_t feat = feature_indices[curr];
        if (feat < 0) {
          // Leaf node
          accum += leaf_values[curr];
          break;
        }
        if (feat >= n_cols) break; // Feature index out of range

        float val = row[feat];
        if (std::isnan(val) || val <= thresholds[curr]) {
          curr = left_children[curr];
        } else {
          curr = right_children[curr];
        }
      }
    }

    out_scores[r] = static_cast<float>(accum * inv_trees);
  }

  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return TREE_ENSEMBLE_SUCCESS;
}

}
