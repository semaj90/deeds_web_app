/**
 * C Bridge Layer for GPU Compute Kernels
 *
 * Wraps the raw CUDA/CPU kernel functions (lstm_gpu.cu) with argument
 * validation. Each bridge function returns:
 *   0  = success
 *  -1  = invalid arguments (null pointers or non-positive length)
 *  <0  = error from kernel implementation
 */

#include <cstddef>
#include <cstdio>

// External symbols from lstm_gpu.cu (CUDA or CPU fallback)
extern "C" {
int run_lstm_add(const float* a, const float* b, float* out, int n);
int run_dot_product(const float* a, const float* b, float* out, int n);
int run_scale(const float* in, float* out, float scalar, int n);
int run_relu(const float* in, float* out, int n);
}

// ── bridge_run_lstm ─────────────────────────────────────────────────

extern "C" int bridge_run_lstm(const float* a, const float* b, float* out, int n) {
    if (a == nullptr || b == nullptr || out == nullptr) {
        std::fprintf(stderr, "bridge_run_lstm: invalid null pointer argument\n");
        return -1;
    }
    if (n <= 0) {
        std::fprintf(stderr, "bridge_run_lstm: invalid length n=%d\n", n);
        return -1;
    }
    return run_lstm_add(a, b, out, n);
}

// ── bridge_dot_product ──────────────────────────────────────────────

extern "C" int bridge_dot_product(const float* a, const float* b, float* out, int n) {
    if (a == nullptr || b == nullptr || out == nullptr) {
        std::fprintf(stderr, "bridge_dot_product: invalid null pointer argument\n");
        return -1;
    }
    if (n <= 0) {
        std::fprintf(stderr, "bridge_dot_product: invalid length n=%d\n", n);
        return -1;
    }
    return run_dot_product(a, b, out, n);
}

// ── bridge_scale ────────────────────────────────────────────────────

extern "C" int bridge_scale(const float* in, float* out, float scalar, int n) {
    if (in == nullptr || out == nullptr) {
        std::fprintf(stderr, "bridge_scale: invalid null pointer argument\n");
        return -1;
    }
    if (n <= 0) {
        std::fprintf(stderr, "bridge_scale: invalid length n=%d\n", n);
        return -1;
    }
    return run_scale(in, out, scalar, n);
}

// ── bridge_relu ─────────────────────────────────────────────────────

extern "C" int bridge_relu(const float* in, float* out, int n) {
    if (in == nullptr || out == nullptr) {
        std::fprintf(stderr, "bridge_relu: invalid null pointer argument\n");
        return -1;
    }
    if (n <= 0) {
        std::fprintf(stderr, "bridge_relu: invalid length n=%d\n", n);
        return -1;
    }
    return run_relu(in, out, n);
}
