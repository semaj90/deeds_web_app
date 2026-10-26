#pragma once

#include <cstdint>

#define MANIFOLD_INTERP_SUCCESS 0
#define MANIFOLD_INTERP_ERR_INVALID_ARGS -1
#define MANIFOLD_INTERP_ERR_BUFFER_TOO_SMALL -2

extern "C" {

/**
 * Spherical Linear Interpolation (SLERP) between two high-dimensional embeddings.
 * Interpolates along the unit hypersphere geodesic arc.
 */
int slerpEmbeddings(
    const float* v1,
    const float* v2,
    float t,
    int32_t dim,
    float* out,
    int32_t out_len
);

/**
 * 4D Manifold Radial Basis Function (RBF) interpolation.
 * Maps arbitrary [som_x, som_y, semantic_z, grpo_w] queries to continuous dense embeddings.
 */
int manifoldInterpolate4D(
    const float* coords_4d,
    const float* embeddings,
    int32_t n,
    int32_t dim,
    const float* query_4d,
    float epsilon,
    float* out,
    int32_t out_len
);

}
