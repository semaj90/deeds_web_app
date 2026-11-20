// Optional Node-API addon: SoA jaw deformation with an x86 AVX2 runtime path.
// Browser-side editing uses the TypeScript fallback; native addon never runs in a browser.
#include <napi.h>
#include <algorithm>
#include <cmath>
#include <cstddef>
#include <stdexcept>
#if defined(__GNUC__) && (defined(__x86_64__) || defined(__i386__))
  #include <immintrin.h>
  #define ATLAS_GNU_X86 1
#else
  #define ATLAS_GNU_X86 0
#endif

namespace {
float clamp01(float t) { return std::min(1.0f, std::max(0.0f, t)); }
void taper_scalar(const float* x, const float* y, float* dst, size_t n, float amount) {
  for (size_t i = 0; i < n; ++i) {
    float t = clamp01((0.02f - y[i]) / 0.12f);
    dst[i] = x[i] * (1.0f - amount * t);
  }
}
#if ATLAS_GNU_X86
__attribute__((target("avx2")))
void taper_avx2(const float* x, const float* y, float* dst, size_t n, float amount) {
  size_t i = 0;
  const __m256 zero = _mm256_set1_ps(0.0f), one = _mm256_set1_ps(1.0f);
  const __m256 lo = _mm256_set1_ps(0.02f), inv = _mm256_set1_ps(1.0f / 0.12f);
  const __m256 a = _mm256_set1_ps(amount);
  for (; i + 8 <= n; i += 8) {
    const __m256 vx = _mm256_loadu_ps(x + i), vy = _mm256_loadu_ps(y + i);
    const __m256 t = _mm256_min_ps(one, _mm256_max_ps(zero, _mm256_mul_ps(_mm256_sub_ps(lo, vy), inv)));
    const __m256 scale = _mm256_sub_ps(one, _mm256_mul_ps(a, t));
    _mm256_storeu_ps(dst + i, _mm256_mul_ps(vx, scale));
  }
  taper_scalar(x + i, y + i, dst + i, n - i, amount);
}
#endif
Napi::Value TaperJaw(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() != 4 || !info[0].IsTypedArray() || !info[1].IsTypedArray() ||
      !info[2].IsTypedArray() || !info[3].IsNumber()) {
    throw Napi::TypeError::New(env, "taperJaw(baseX: Float32Array, y: Float32Array, outX: Float32Array, amount: number)");
  }
  for (int i = 0; i < 3; ++i) {
    if (info[i].As<Napi::TypedArray>().TypedArrayType() != napi_float32_array)
      throw Napi::TypeError::New(env, "All three arrays must be Float32Array");
  }
  auto x = info[0].As<Napi::Float32Array>();
  auto y = info[1].As<Napi::Float32Array>();
  auto dst = info[2].As<Napi::Float32Array>();
  if (x.ElementLength() != y.ElementLength() || x.ElementLength() != dst.ElementLength()) {
    throw Napi::RangeError::New(env, "Array lengths must match");
  }
  float amount = info[3].As<Napi::Number>().FloatValue();
  if (!std::isfinite(amount) || amount < -0.5f || amount > 0.5f) {
    throw Napi::RangeError::New(env, "amount must be -0.5..0.5");
  }
  // Always start with immutable base arrays; prevents cumulative sculpt drift.
#if ATLAS_GNU_X86
  if (__builtin_cpu_supports("avx2"))
    taper_avx2(x.Data(), y.Data(), dst.Data(), x.ElementLength(), amount);
  else
#endif
    taper_scalar(x.Data(), y.Data(), dst.Data(), x.ElementLength(), amount);
  return env.Undefined();
}
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("taperJaw", Napi::Function::New(env, TaperJaw));
  return exports;
}
NODE_API_MODULE(atlas_face, Init)
} // namespace
