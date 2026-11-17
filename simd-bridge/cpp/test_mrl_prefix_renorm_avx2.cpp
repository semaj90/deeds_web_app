/**
 * simd-bridge/cpp/test_mrl_prefix_renorm_avx2.cpp
 *
 * Test harness for the AVX2 MRL kernel. The scalar reference below is a TEST
 * ORACLE ONLY. It is not compiled into production and is never a fallback.
 *
 * Build (Windows, VS 2022 env): scripts\dev\clang-vs.bat <this file> <out.exe>
 */

#include "mrl_prefix_renorm_avx2.h"

#include <chrono>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

using std::vector;

// ---- scalar oracle (test only) ---------------------------------------------
static int oracle_prefix_renorm(const float* in, size_t rows, size_t in_dim,
                                size_t out_dim, float* out) {
    for (size_t r = 0; r < rows; ++r) {
        double s = 0.0;
        for (size_t i = 0; i < out_dim; ++i) {
            double v = in[r * in_dim + i];
            s += v * v;
        }
        if (!(s > 0.0) || !std::isfinite(s)) return MRL_ERR_ZERO_NORM;
        double inv = 1.0 / std::sqrt(s);
        for (size_t i = 0; i < out_dim; ++i) {
            out[r * out_dim + i] = static_cast<float>(in[r * in_dim + i] * inv);
        }
    }
    return MRL_OK;
}

static int failures = 0;

static void check(bool ok, const char* name) {
    std::printf("%-44s %s\n", name, ok ? "PASS" : "FAIL");
    if (!ok) failures++;
}

static float max_abs_diff(const std::vector<float>& a, const std::vector<float>& b) {
    float m = 0.0f;
    for (size_t i = 0; i < a.size(); ++i) {
        float d = std::fabs(a[i] - b[i]);
        if (d > m) m = d;
    }
    return m;
}

static void fill_random(std::vector<float>& v, unsigned seed) {
    std::srand(seed);
    for (auto& x : v) {
        x = (static_cast<float>(std::rand()) / RAND_MAX) * 2.0f - 1.0f;
    }
}

int main() {
    const bool avx2 = mrl_cpu_supports_avx2() != 0;
    check(avx2, "cpu supports avx2");
    if (!avx2) {
        std::printf("AVX2 not available on this host; kernel fails closed by design.\n");
        return 1;
    }

    // Parity across MRL dims, including non-multiples of 8/32 to hit tails.
    const size_t in_dim = 768;
    const size_t rows = 64;
    std::vector<float> in(rows * in_dim);
    fill_random(in, 42u);
    const size_t dims[] = {768, 512, 256, 128, 100, 33, 7, 1};
    for (size_t k : dims) {
        std::vector<float> got(rows * k), want(rows * k);
        int rc = mrl_prefix_renorm_f32(in.data(), rows, in_dim, k, got.data());
        int rc_o = oracle_prefix_renorm(in.data(), rows, in_dim, k, want.data());
        float diff = max_abs_diff(got, want);
        char name[64];
        std::snprintf(name, sizeof name, "parity out_dim=%zu (max|d|=%.2e)", k, diff);
        check(rc == MRL_OK && rc_o == MRL_OK && diff <= 1e-6f, name);
    }

    // Each renormalized prefix has unit L2 norm.
    {
        std::vector<float> got(rows * 128);
        mrl_prefix_renorm_f32(in.data(), rows, in_dim, 128, got.data());
        bool unit = true;
        for (size_t r = 0; r < rows; ++r) {
            double s = 0.0;
            for (size_t i = 0; i < 128; ++i) s += double(got[r * 128 + i]) * got[r * 128 + i];
            if (std::fabs(std::sqrt(s) - 1.0) > 1e-5) unit = false;
        }
        check(unit, "renormalized prefix has unit norm");
    }

    // Fail-closed edge cases.
    {
        std::vector<float> out(768);
        check(mrl_prefix_renorm_f32(nullptr, 1, 768, 768, out.data()) == MRL_ERR_NULL_POINTER,
              "null input rejected");
        check(mrl_prefix_renorm_f32(in.data(), 1, 768, 0, out.data()) == MRL_ERR_INVALID_DIM,
              "out_dim 0 rejected");
        check(mrl_prefix_renorm_f32(in.data(), 1, 768, 769, out.data()) == MRL_ERR_INVALID_DIM,
              "out_dim > in_dim rejected");
        std::vector<float> zero(768, 0.0f);
        check(mrl_prefix_renorm_f32(zero.data(), 1, 768, 128, out.data()) == MRL_ERR_ZERO_NORM,
              "zero-norm prefix rejected");
        std::vector<float> nan_row(768, 0.0f);
        nan_row[5] = NAN;
        check(mrl_prefix_renorm_f32(nan_row.data(), 1, 768, 128, out.data()) == MRL_ERR_ZERO_NORM,
              "non-finite prefix rejected");
        check(mrl_prefix_renorm_f32(in.data(), 0, 768, 128, out.data()) == MRL_OK,
              "zero rows is a no-op");
    }

    // Throughput (informational, not a gate). Time SIMD only.
    {
        const size_t bench_rows = 20000;
        std::vector<float> big(bench_rows * in_dim), dst(bench_rows * 256);
        fill_random(big, 7u);
        auto t0 = std::chrono::steady_clock::now();
        int rc = mrl_prefix_renorm_f32(big.data(), bench_rows, in_dim, 256, dst.data());
        auto t1 = std::chrono::steady_clock::now();
        double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        std::printf("bench 20000 rows x 768 -> 256: %.2f ms (rc=%d)\n", ms, rc);
    }

    std::printf("%s (%d failure(s))\n", failures ? "FAILED" : "ALL PASS", failures);
    return failures ? 1 : 0;
}
