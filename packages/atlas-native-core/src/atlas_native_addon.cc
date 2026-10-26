/**
 * @file atlas_native_addon.cc
 * @brief Node-API 8 bridge for proposal-only FSM, TurboVec packing,
 *        128-bit sign bitset Jaccard similarity, and 2-bit/4-bit asymmetric dot helpers.
 */

#define NAPI_VERSION 8

#include "../include/fsm_detector.hpp"
#include "../include/radix_sort.hpp"
#include "../include/turbovec_pack.hpp"
#include "../include/tile_assembler.hpp"
#include "../include/pgvector_binary.hpp"

#include <cmath>
#include <cstdint>
#include <memory>
#include <new>
#include <vector>
#include <cmath>
#include <limits>

#if __has_include(<napi.h>)
#include <napi.h>

namespace atlas::native {

struct AlignedExternalBufferOwner {
    explicit AlignedExternalBufferOwner(std::size_t length)
        : data(static_cast<std::uint8_t*>(::operator new(length, std::align_val_t{64}))) {}

    ~AlignedExternalBufferOwner() {
        ::operator delete(data, std::align_val_t{64});
    }

    AlignedExternalBufferOwner(const AlignedExternalBufferOwner&) = delete;
    AlignedExternalBufferOwner& operator=(const AlignedExternalBufferOwner&) = delete;

    std::uint8_t* data;
};

Napi::Buffer<std::uint8_t> NewAlignedExternalBuffer(
    Napi::Env env,
    std::size_t length,
    AlignedExternalBufferOwner*& owner_out) {
#if defined(NODE_API_NO_EXTERNAL_BUFFERS_ALLOWED)
    Napi::Error::New(env, "EXTERNAL_NODE_BUFFER_UNSUPPORTED").ThrowAsJavaScriptException();
    owner_out = nullptr;
    return Napi::Buffer<std::uint8_t>();
#else
    auto owner = std::make_unique<AlignedExternalBufferOwner>(length);
    if (reinterpret_cast<std::uintptr_t>(owner->data) % 64 != 0) {
        Napi::Error::New(env, "LOD_TEXTURE_BUFFER_ALIGNMENT_FAILED").ThrowAsJavaScriptException();
        owner_out = nullptr;
        return Napi::Buffer<std::uint8_t>();
    }
    auto buffer = Napi::Buffer<std::uint8_t>::New(
        env,
        owner->data,
        length,
        [](Napi::Env, std::uint8_t*, AlignedExternalBufferOwner* finalizer_owner) {
            delete finalizer_owner;
        },
        owner.get());
    if (buffer.IsEmpty()) {
        owner_out = nullptr;
        return buffer;
    }
    owner_out = owner.get();
    owner.release();
    return buffer;
#endif
}

Napi::Value DetectRfcOrLanguageNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Expected string input for FSM detect").ThrowAsJavaScriptException();
        return env.Null();
    }
    std::string input = info[0].As<Napi::String>().Utf8Value();
    FsmDetectMatch m = fsm_detect_with_insert_stop(input.data(), input.size());

    Napi::Object out = Napi::Object::New(env);
    out.Set("matched", Napi::Boolean::New(env, m.matched));
    out.Set("authority", Napi::String::New(env, "PROPOSAL_ONLY"));
    out.Set("domainTopic", Napi::String::New(env, m.domain_topic));
    out.Set("rfcId", Napi::String::New(env, m.rfc_id));
    out.Set("featureLabel", Napi::String::New(env, m.feature_label));
    out.Set("languageId", Napi::String::New(env, m.language_id));
    out.Set("byteOffset", Napi::Number::New(env, m.byte_offset));
    out.Set("stateTransitions", Napi::Number::New(env, m.state_transitions));
    return out;
}

Napi::Value PackTurboVecMrl128Napi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsTypedArray() ||
        info[0].As<Napi::TypedArray>().TypedArrayType() != napi_float32_array) {
        Napi::TypeError::New(env, "Expected Float32Array (>=128 dims)").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Float32Array arr = info[0].As<Napi::Float32Array>();
    if (arr.ElementLength() < TURBOVEC_MRL_DIM) {
        Napi::RangeError::New(env, "Float32Array must have at least 128 elements").ThrowAsJavaScriptException();
        return env.Null();
    }

    auto sign_bitset = Napi::Buffer<std::uint8_t>::New(env, PG18_BITSET_BYTES);
    auto packed_2bit = Napi::Buffer<std::uint8_t>::New(env, TURBOVEC_2BIT_BYTES);
    auto packed_4bit = Napi::Buffer<std::uint8_t>::New(env, TURBOVEC_4BIT_BYTES);
    PackedTurboVecMetadata metadata{};
    if (!pack_turbovec_mrl128_into(
            arr.Data(), arr.ElementLength(), sign_bitset.Data(), packed_2bit.Data(), packed_4bit.Data(), metadata)) {
        Napi::RangeError::New(env, "TurboVec input contains non-finite values or invalid dimensions").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Object out = Napi::Object::New(env);
    out.Set("scale4bit", Napi::Number::New(env, metadata.scale_4bit));
    out.Set("scale2bit", Napi::Number::New(env, metadata.scale_2bit));
    out.Set("minVal", Napi::Number::New(env, metadata.min_val));
    out.Set("maxVal", Napi::Number::New(env, metadata.max_val));
    out.Set("bytea4bit", packed_4bit);
    out.Set("bytea2bit", packed_2bit);
    out.Set("signBitset128", sign_bitset);
    out.Set("signBitset128BitString", Napi::String::New(env, sign_bitset_128_as_bit_string(sign_bitset.Data())));
    out.Set("authority", Napi::String::New(env, "PROJECTION_PROPOSAL"));
    return out;
}

Napi::Value Bitset128JaccardSimilarityNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsBuffer()) {
        Napi::TypeError::New(env, "Expected two 16-byte Buffers for bitset128JaccardSimilarity").ThrowAsJavaScriptException();
        return env.Null();
    }
    auto a = info[0].As<Napi::Buffer<std::uint8_t>>();
    auto b = info[1].As<Napi::Buffer<std::uint8_t>>();
    if (a.Length() != PG18_BITSET_BYTES || b.Length() != PG18_BITSET_BYTES) {
        Napi::RangeError::New(env, "Bitset buffers must be exactly 16 bytes").ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::Number::New(env, bitset128_jaccard_similarity(a.Data(), b.Data()));
}

Napi::Value AsymmetricDot2BitNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsTypedArray() ||
        info[0].As<Napi::TypedArray>().TypedArrayType() != napi_float32_array ||
        !info[1].IsBuffer() || !info[2].IsNumber() || !info[3].IsNumber()) {
        Napi::TypeError::New(env, "Expected (Float32Array, Buffer(32), minVal, scale2bit)").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Float32Array query = info[0].As<Napi::Float32Array>();
    auto packed = info[1].As<Napi::Buffer<std::uint8_t>>();
    const float min_val = info[2].As<Napi::Number>().FloatValue();
    const float scale_2bit = info[3].As<Napi::Number>().FloatValue();
    if (query.ElementLength() < TURBOVEC_MRL_DIM || packed.Length() != TURBOVEC_2BIT_BYTES) {
        Napi::RangeError::New(env, "Expected >=128-element Float32Array and 32-byte packed 2-bit Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }
    const float score = asymmetric_dot_2bit(query.Data(), packed.Data(), min_val, scale_2bit);
    if (std::isnan(score)) {
        Napi::RangeError::New(env, "Non-finite query or scale in asymmetricDot2Bit").ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::Number::New(env, score);
}

Napi::Value AsymmetricDot4BitNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsTypedArray() ||
        info[0].As<Napi::TypedArray>().TypedArrayType() != napi_float32_array ||
        !info[1].IsBuffer() || !info[2].IsNumber() || !info[3].IsNumber()) {
        Napi::TypeError::New(env, "Expected (Float32Array, Buffer(64), minVal, scale4bit)").ThrowAsJavaScriptException();
        return env.Null();
    }
    Napi::Float32Array query = info[0].As<Napi::Float32Array>();
    auto packed = info[1].As<Napi::Buffer<std::uint8_t>>();
    const float min_val = info[2].As<Napi::Number>().FloatValue();
    const float scale_4bit = info[3].As<Napi::Number>().FloatValue();
    if (query.ElementLength() < TURBOVEC_MRL_DIM || packed.Length() != TURBOVEC_4BIT_BYTES) {
        Napi::RangeError::New(env, "Expected >=128-element Float32Array and 64-byte packed 4-bit Buffer").ThrowAsJavaScriptException();
        return env.Null();
    }
    const float score = asymmetric_dot_4bit(query.Data(), packed.Data(), min_val, scale_4bit);
    if (!std::isfinite(score)) {
        Napi::RangeError::New(env, "Invalid query, minimum, or scale in asymmetricDot4Bit").ThrowAsJavaScriptException();
        return env.Null();
    }
    return Napi::Number::New(env, score);
}

Napi::Value UnpackPgvectorBinary768Napi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsBuffer()) {
        Napi::TypeError::New(env, "Expected a Buffer containing pgvector(768) binary data").ThrowAsJavaScriptException();
        return env.Null();
    }
    const auto raw = info[0].As<Napi::Buffer<std::uint8_t>>();
    std::array<float, PGVECTOR_768_DIM> values{};
    if (!unpack_pgvector_binary_768(raw.Data(), raw.Length(), values.data())) {
        Napi::RangeError::New(env, "PGVECTOR_768_BINARY_INVALID").ThrowAsJavaScriptException();
        return env.Null();
    }
    auto output = Napi::Float32Array::New(env, PGVECTOR_768_DIM);
    std::copy(values.begin(), values.end(), output.Data());
    return output;
}

Napi::Value AssembleLodTextureBlockNapi(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 4 || !info[0].IsTypedArray() ||
        info[0].As<Napi::TypedArray>().TypedArrayType() != napi_float32_array ||
        !info[1].IsNumber() || !info[2].IsNumber() || !info[3].IsNumber()) {
        Napi::TypeError::New(env, "Expected (Float32Array, candidateOrdinal, somBmuId, kmeansClusterId)").ThrowAsJavaScriptException();
        return env.Null();
    }
    const auto checked_integer = [&env](const Napi::Value& value, std::uint32_t maximum, const char* name) -> std::uint32_t {
        const double number = value.As<Napi::Number>().DoubleValue();
        if (!std::isfinite(number) || number < 0.0 || number > static_cast<double>(maximum) || std::floor(number) != number) {
            Napi::RangeError::New(env, name).ThrowAsJavaScriptException();
            return 0;
        }
        return static_cast<std::uint32_t>(number);
    };
    Napi::Float32Array values = info[0].As<Napi::Float32Array>();
    if (values.ElementLength() < TURBOVEC_MRL_DIM) {
        Napi::RangeError::New(env, "Float32Array must have at least 128 elements").ThrowAsJavaScriptException();
        return env.Null();
    }
    const auto candidate_ordinal = checked_integer(info[1], std::numeric_limits<std::uint32_t>::max(), "candidateOrdinal must be uint32");
    if (env.IsExceptionPending()) return env.Null();
    const auto som_bmu_id = checked_integer(info[2], std::numeric_limits<std::uint16_t>::max(), "somBmuId must be uint16");
    if (env.IsExceptionPending()) return env.Null();
    const auto kmeans_cluster_id = checked_integer(info[3], std::numeric_limits<std::uint16_t>::max(), "kmeansClusterId must be uint16");
    if (env.IsExceptionPending()) return env.Null();

    CandidateTileRecord record{};
    record.candidate_ordinal = candidate_ordinal;
    record.som_bmu_id = static_cast<std::uint16_t>(som_bmu_id);
    record.kmeans_cluster_id = static_cast<std::uint16_t>(kmeans_cluster_id);
    record.packed_vector = pack_turbovec_mrl128(values.Data(), values.ElementLength());
    if (!record.packed_vector.valid) {
        Napi::RangeError::New(env, "TurboVec input contains non-finite values or invalid dimensions").ThrowAsJavaScriptException();
        return env.Null();
    }
    AlignedExternalBufferOwner* owner = nullptr;
    auto buffer = NewAlignedExternalBuffer(env, sizeof(LodTextureBlock128B), owner);
    if (env.IsExceptionPending() || owner == nullptr) return env.Null();
    serialize_lod_texture_block_v1(record, owner->data, sizeof(LodTextureBlock128B));
    return buffer;
}

Napi::Object InitAtlasNativeCore(Napi::Env env, Napi::Object exports) {
    exports.Set("detectRfcOrLanguage", Napi::Function::New(env, DetectRfcOrLanguageNapi));
    exports.Set("packTurboVecMrl128", Napi::Function::New(env, PackTurboVecMrl128Napi));
    exports.Set("bitset128JaccardSimilarity", Napi::Function::New(env, Bitset128JaccardSimilarityNapi));
    exports.Set("asymmetricDot2Bit", Napi::Function::New(env, AsymmetricDot2BitNapi));
    exports.Set("asymmetricDot4Bit", Napi::Function::New(env, AsymmetricDot4BitNapi));
    exports.Set("unpackPgvectorBinary768", Napi::Function::New(env, UnpackPgvectorBinary768Napi));
    exports.Set("assembleLodTextureBlockV1", Napi::Function::New(env, AssembleLodTextureBlockNapi));
    return exports;
}

NODE_API_MODULE(atlas_native_core, InitAtlasNativeCore)

} // namespace atlas::native
#endif
