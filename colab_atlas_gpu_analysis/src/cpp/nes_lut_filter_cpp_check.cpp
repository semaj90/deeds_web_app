// Harness for NLUT-07. Reads a frozen fixture on stdin:
//   line 1: n
//   line 2: k then k allowed byte values (decimal)
//   line 3: lut bytes as 2n hex characters
// Prints "SCALAR <words>" and "AVX2 <words>" (8-hex-digit words, space separated).
// Build (Windows): scripts\dev\clang-vs.bat scripts\spatial\nes_lut_filter_cpp_check.cpp <out.exe> -mavx2
#include <cstdint>
#include <cstdio>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "../../simd-bridge/cpp/nes_lut_filter.h"

static std::uint8_t hex_nibble(char c) {
    if (c >= '0' && c <= '9') return static_cast<std::uint8_t>(c - '0');
    if (c >= 'a' && c <= 'f') return static_cast<std::uint8_t>(c - 'a' + 10);
    if (c >= 'A' && c <= 'F') return static_cast<std::uint8_t>(c - 'A' + 10);
    return 0xFF;
}

int main() {
    std::size_t n = 0;
    std::size_t k = 0;
    std::string hex;
    if (!(std::cin >> n)) return 2;
    if (!(std::cin >> k)) return 2;
    std::vector<std::uint8_t> allowed(k);
    for (std::size_t a = 0; a < k; ++a) {
        unsigned v = 0;
        if (!(std::cin >> v) || v > 255) return 2;
        allowed[a] = static_cast<std::uint8_t>(v);
    }
    if (n > 0 && (!(std::cin >> hex) || hex.size() != 2 * n)) return 2;
    if (n == 0 && !hex.empty()) return 2;
    std::vector<std::uint8_t> lut(n);
    for (std::size_t i = 0; i < n; ++i) {
        const std::uint8_t hi = hex_nibble(hex[2 * i]);
        const std::uint8_t lo = hex_nibble(hex[2 * i + 1]);
        if (hi == 0xFF || lo == 0xFF) return 2;
        lut[i] = static_cast<std::uint8_t>((hi << 4) | lo);
    }
    const std::size_t words = (n + 31) / 32;
    std::vector<std::uint32_t> scalar(words == 0 ? 1 : words, 0);
    std::vector<std::uint32_t> avx(words == 0 ? 1 : words, 0);
    if (!nes_lut::match_mask_scalar(lut.data(), n, allowed.data(), k, scalar.data())) {
        std::cout << "SCALAR_REJECTED\n";
        return 3;
    }
    std::cout << "SCALAR";
    for (std::size_t w = 0; w < words; ++w) std::printf(" %08x", scalar[w]);
    std::cout << "\n";
#if defined(__AVX2__)
    if (!nes_lut::match_mask_avx2(lut.data(), n, allowed.data(), k, avx.data())) {
        std::cout << "AVX2_REJECTED\n";
        return 4;
    }
    std::cout << "AVX2";
    for (std::size_t w = 0; w < words; ++w) std::printf(" %08x", avx[w]);
    std::cout << "\n";
#else
    std::cout << "AVX2_NOT_COMPILED\n";
#endif
    return 0;
}
