#pragma once
/**
 * @file fsm_detector.hpp
 * @brief Deterministic DFA State Machine with explicit C insert-stop sentinel ('\0')
 *        for RFC domain topic detection and LSP-free language/grammar identification.
 *
 * When a user query or raw AST/CST chunk is scanned on "detect", an explicit stop
 * sentinel ('\0') is inserted at the bounded scan window and the DFA halts immediately
 * upon matching a canonical RFC/domain trigger or grammar token signature.
 */

#include <cstdint>
#include <cstring>
#include <string>
#include <string_view>
#include <vector>

namespace atlas::native {

constexpr char ATLAS_FSM_STOP_SENTINEL = '\0';
constexpr std::size_t ATLAS_FSM_MAX_WINDOW = 2048;

enum class FsmMatchKind : std::uint8_t {
    NONE = 0,
    RFC_DOMAIN_TOPIC = 1,
    GRAMMAR_LANGUAGE_SIGNATURE = 2
};

struct FsmDetectMatch {
    bool matched{false};
    FsmMatchKind kind{FsmMatchKind::NONE};
    const char* domain_topic{"unknown"};
    const char* rfc_id{"RFC-0000"};
    const char* feature_label{"feature:unclassified"};
    const char* language_id{"unknown"};
    std::uint32_t byte_offset{0};
    std::uint32_t state_transitions{0};
};

struct RfcPatternRule {
    const char* token;
    const char* domain_topic;
    const char* rfc_id;
    const char* feature_label;
    const char* language_id;
    FsmMatchKind kind;
};

inline constexpr RfcPatternRule kCanonicalFsmRules[] = {
    // RFC / Legal / Retrieval Domain Triggers
    {"rfc9110",      "http_semantics",   "RFC-9110", "feature:protocol:http_semantics", "http",       FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"rfc7519",      "auth_jwt",         "RFC-7519", "feature:auth:jwt_claims",         "typescript", FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"rfc6749",      "auth_oauth2",      "RFC-6749", "feature:auth:oauth2_flow",        "typescript", FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"rfc8259",      "json_canonical",   "RFC-8259", "feature:serialization:json",      "json",       FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"rfc4122",      "uuid_identity",    "RFC-4122", "feature:identity:uuid_v5",        "sql",        FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"rfc9562",      "uuid_v7_v5",       "RFC-9562", "feature:identity:uuid_v5",        "sql",        FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"turbovec",     "vector_quant",     "RFC-ATLAS-TV4", "feature:vector:turbovec_4bit", "cpp",      FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"som_bmu",      "topology_som",     "RFC-ATLAS-SOM", "feature:topology:som_20x20", "python",     FsmMatchKind::RFC_DOMAIN_TOPIC},
    {"pgvector",     "storage_pg18",     "RFC-ATLAS-PG18", "feature:db:pg18_bytea_bitset", "sql",     FsmMatchKind::RFC_DOMAIN_TOPIC},
    // Grammar / Language Fallback Signatures (when file_path / LSP is unavailable)
    {"$state(",      "ui_svelte5_runes", "RFC-ATLAS-SV5", "feature:ui:svelte5_runes",   "svelte",     FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"$derived(",    "ui_svelte5_runes", "RFC-ATLAS-SV5", "feature:ui:svelte5_runes",   "svelte",     FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"__global__",   "gpu_cuda_kernel",  "RFC-ATLAS-CUDA", "feature:gpu:cuda_kernel",   "cuda",       FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"torch::Tensor","gpu_aten_abi",     "RFC-ATLAS-ATEN", "feature:gpu:aten_tensor",   "cpp",        FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"CREATE TABLE", "storage_ddl",      "RFC-ATLAS-PG18", "feature:db:drizzle_schema", "sql",        FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"package main", "service_go",       "RFC-ATLAS-GO",   "feature:service:go_grpc",   "go",         FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"def ",         "runtime_python",   "RFC-ATLAS-PY",   "feature:runtime:python",    "python",     FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
    {"export const", "app_typescript",   "RFC-ATLAS-TS",   "feature:app:typescript",    "typescript", FsmMatchKind::GRAMMAR_LANGUAGE_SIGNATURE},
};

/**
 * Copies up to ATLAS_FSM_MAX_WINDOW - 1 bytes into a stack buffer, forces the
 * C insert-stop sentinel ('\0') at the boundary, and runs a single-pass DFA scan
 * that halts immediately on the first deterministic match.
 */
inline FsmDetectMatch fsm_detect_with_insert_stop(const char* raw_input, std::size_t raw_len) noexcept {
    FsmDetectMatch result{};
    if (!raw_input || raw_len == 0) {
        return result;
    }

    char bounded_buf[ATLAS_FSM_MAX_WINDOW];
    const std::size_t copy_len = (raw_len < (ATLAS_FSM_MAX_WINDOW - 1))
        ? raw_len
        : (ATLAS_FSM_MAX_WINDOW - 1);

    std::memcpy(bounded_buf, raw_input, copy_len);
    // Explicit C insert-stop sentinel guarantees bounded termination
    bounded_buf[copy_len] = ATLAS_FSM_STOP_SENTINEL;

    std::size_t scan_len = 0;
    while (scan_len < copy_len && bounded_buf[scan_len] != ATLAS_FSM_STOP_SENTINEL) ++scan_len;
    std::size_t detect_offset = scan_len;
    for (std::size_t i = 0; i + 6 <= scan_len; ++i) {
        constexpr char detect_token[] = "detect";
        std::size_t matched = 0;
        for (; matched < 6; ++matched) {
            char actual = bounded_buf[i + matched];
            if (actual >= 'A' && actual <= 'Z') actual = static_cast<char>(actual + 32);
            if (actual != detect_token[matched]) break;
        }
        if (matched == 6) {
            detect_offset = i + 6;
            break;
        }
    }
    if (detect_offset == scan_len) {
        result.state_transitions = static_cast<std::uint32_t>(scan_len);
        return result;
    }

    std::uint32_t transitions = 0;
    for (std::size_t i = detect_offset; bounded_buf[i] != ATLAS_FSM_STOP_SENTINEL; ++i) {
        ++transitions;
        const char c = bounded_buf[i];
        const char c_lower = (c >= 'A' && c <= 'Z') ? static_cast<char>(c + 32) : c;

        for (const auto& rule : kCanonicalFsmRules) {
            const char first = rule.token[0];
            const char first_lower = (first >= 'A' && first <= 'Z') ? static_cast<char>(first + 32) : first;
            if (c_lower != first_lower) {
                continue;
            }

            std::size_t k = 0;
            while (rule.token[k] != ATLAS_FSM_STOP_SENTINEL &&
                   bounded_buf[i + k] != ATLAS_FSM_STOP_SENTINEL) {
                char a = bounded_buf[i + k];
                char b = rule.token[k];
                if (a >= 'A' && a <= 'Z') a = static_cast<char>(a + 32);
                if (b >= 'A' && b <= 'Z') b = static_cast<char>(b + 32);
                if (a != b) break;
                ++k;
            }

            if (rule.token[k] == ATLAS_FSM_STOP_SENTINEL) {
                // Early-halt stop transition triggered on "detect"
                bounded_buf[i + k] = ATLAS_FSM_STOP_SENTINEL;
                result.matched = true;
                result.kind = rule.kind;
                result.domain_topic = rule.domain_topic;
                result.rfc_id = rule.rfc_id;
                result.feature_label = rule.feature_label;
                result.language_id = rule.language_id;
                result.byte_offset = static_cast<std::uint32_t>(i);
                result.state_transitions = transitions;
                return result;
            }
        }
    }

    result.state_transitions = transitions;
    return result;
}

} // namespace atlas::native
