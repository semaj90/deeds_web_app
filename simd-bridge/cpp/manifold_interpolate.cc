#include "manifold_interpolate.h"
#include "native_execution_counters.h"

#include <cmath>
#include <vector>
#include <algorithm>

extern "C" {

int slerpEmbeddings(
    const float* v1,
    const float* v2,
    float t,
    int32_t dim,
    float* out,
    int32_t out_len
) {
  if (!v1 || !v2 || !out || dim <= 0 || out_len < dim) {
    return MANIFOLD_INTERP_ERR_INVALID_ARGS;
  }
  if (!std::isfinite(t)) return MANIFOLD_INTERP_ERR_INVALID_ARGS;

  // Clamp t to [0, 1]
  t = std::max(0.0f, std::min(1.0f, t));

  // Compute L2 norms and dot product
  double dot = 0.0;
  double n1_sq = 0.0;
  double n2_sq = 0.0;

  for (int32_t d = 0; d < dim; ++d) {
    dot += static_cast<double>(v1[d]) * static_cast<double>(v2[d]);
    n1_sq += static_cast<double>(v1[d]) * static_cast<double>(v1[d]);
    n2_sq += static_cast<double>(v2[d]) * static_cast<double>(v2[d]);
  }

  double n1 = std::sqrt(n1_sq);
  double n2 = std::sqrt(n2_sq);

  if (n1 < 1e-12 || n2 < 1e-12) {
    return MANIFOLD_INTERP_ERR_INVALID_ARGS;
  }

  double cos_theta = dot / (n1 * n2);
  cos_theta = std::max(-1.0, std::min(1.0, cos_theta));

  double scale1, scale2;

  // If vectors are very close (angle < 0.05 rad), use linear interpolation to avoid division by zero
  if (cos_theta > 0.9995) {
    scale1 = 1.0 - static_cast<double>(t);
    scale2 = static_cast<double>(t);
  } else if (cos_theta < -0.9995) {
    // Nearly opposite vectors
    scale1 = 1.0 - static_cast<double>(t);
    scale2 = -static_cast<double>(t);
  } else {
    double theta = std::acos(cos_theta);
    double sin_theta = std::sin(theta);
    scale1 = std::sin((1.0 - static_cast<double>(t)) * theta) / sin_theta;
    scale2 = std::sin(static_cast<double>(t) * theta) / sin_theta;
  }

  // Synthesize and normalize
  double out_norm_sq = 0.0;
  for (int32_t d = 0; d < dim; ++d) {
    double val = scale1 * static_cast<double>(v1[d]) + scale2 * static_cast<double>(v2[d]);
    out[d] = static_cast<float>(val);
    out_norm_sq += val * val;
  }

  double out_norm = std::sqrt(out_norm_sq);
  if (out_norm > 1e-12) {
    float inv_norm = static_cast<float>(1.0 / out_norm);
    for (int32_t d = 0; d < dim; ++d) {
      out[d] *= inv_norm;
    }
  }

  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return MANIFOLD_INTERP_SUCCESS;
}

int manifoldInterpolate4D(
    const float* coords_4d,
    const float* embeddings,
    int32_t n,
    int32_t dim,
    const float* query_4d,
    float epsilon,
    float* out,
    int32_t out_len
) {
  if (!coords_4d || !embeddings || !query_4d || !out) {
    return MANIFOLD_INTERP_ERR_INVALID_ARGS;
  }
  if (n <= 0 || dim <= 0 || out_len < dim) {
    return MANIFOLD_INTERP_ERR_INVALID_ARGS;
  }
  if (!std::isfinite(epsilon) || epsilon <= 0.0f) {
    epsilon = 2.0f; // Default RBF scale
  }

  // Compute RBF weights based on Euclidean distance in 4D space
  std::vector<double> weights(static_cast<size_t>(n));
  double sum_weights = 0.0;

  for (int32_t i = 0; i < n; ++i) {
    double dist_sq = 0.0;
    for (int32_t k = 0; k < 4; ++k) {
      double diff = static_cast<double>(coords_4d[i * 4 + k]) - static_cast<double>(query_4d[k]);
      dist_sq += diff * diff;
    }
    double w = std::exp(-static_cast<double>(epsilon) * dist_sq);
    weights[static_cast<size_t>(i)] = w;
    sum_weights += w;
  }

  if (sum_weights < 1e-12) {
    double eq = 1.0 / static_cast<double>(n);
    for (int32_t i = 0; i < n; ++i) weights[static_cast<size_t>(i)] = eq;
  } else {
    double inv_sum = 1.0 / sum_weights;
    for (int32_t i = 0; i < n; ++i) weights[static_cast<size_t>(i)] *= inv_sum;
  }

  // Weighted sum over embeddings
  std::vector<double> accum(static_cast<size_t>(dim), 0.0);
  for (int32_t i = 0; i < n; ++i) {
    double w = weights[static_cast<size_t>(i)];
    const float* emb = embeddings + (static_cast<size_t>(i) * dim);
    for (int32_t d = 0; d < dim; ++d) {
      accum[static_cast<size_t>(d)] += w * static_cast<double>(emb[d]);
    }
  }

  // L2 normalize synthesized embedding
  double out_norm_sq = 0.0;
  for (int32_t d = 0; d < dim; ++d) {
    out_norm_sq += accum[static_cast<size_t>(d)] * accum[static_cast<size_t>(d)];
  }

  double out_norm = std::sqrt(out_norm_sq);
  float inv_norm = (out_norm > 1e-12) ? static_cast<float>(1.0 / out_norm) : 1.0f;

  for (int32_t d = 0; d < dim; ++d) {
    out[d] = static_cast<float>(accum[static_cast<size_t>(d)] * inv_norm);
  }

  atlasNativeCounterRecord(AtlasExecutionCounter::cpu_fallback);
  return MANIFOLD_INTERP_SUCCESS;
}

}
