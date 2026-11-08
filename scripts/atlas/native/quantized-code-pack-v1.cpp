// Standalone, portable reference for atlas.quantized-code-pack.v1 integer codes.
// LSB-first within each byte; width 2, 3 or 4 bits; no scales/zero-points/rotations.
// Deliberately NOT linked into spatial_packet_synthesizer or the native build system.
// Build (GCC/Clang): c++ -std=c++17 -O2 -Wall -Wextra -Werror -pedantic
//   scripts/atlas/native/quantized-code-pack-v1.cpp -o quantized-code-pack-v1
// Usage: quantized-code-pack-v1 pack <2|3|4> <raw-u8-hex-or->
//        quantized-code-pack-v1 unpack <2|3|4> <count> <packed-hex-or->
#include <cstdint>
#include <cstdlib>
#include <exception>
#include <iostream>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>

namespace atlas_quantized_code_pack_v1 {
using Byte = std::uint8_t;

void check_bits(unsigned bits) {
    if (bits != 2 && bits != 3 && bits != 4) {
        throw std::invalid_argument("QUANT_BITS_UNSUPPORTED");
    }
}

std::size_t packed_size(std::size_t count, unsigned bits) {
    check_bits(bits);
    if (count > (std::numeric_limits<std::size_t>::max() - 7u) / bits) {
        throw std::overflow_error("QUANT_BYTE_LENGTH_OVERFLOW");
    }
    return (count * bits + 7u) / 8u;
}

std::vector<Byte> pack_codes(const std::vector<Byte>& codes, unsigned bits) {
    const auto length = packed_size(codes.size(), bits);
    std::vector<Byte> packed(length, 0);
    const unsigned mask = (1u << bits) - 1u;
    for (std::size_t i = 0; i < codes.size(); ++i) {
        const unsigned value = codes[i];
        if (value > mask) throw std::invalid_argument("QUANT_CODE_OUT_OF_RANGE");
        const std::size_t bit_offset = i * bits;
        const std::size_t byte_index = bit_offset >> 3;
        const unsigned shift = static_cast<unsigned>(bit_offset & 7u);
        packed[byte_index] = static_cast<Byte>(
            packed[byte_index] | static_cast<Byte>((value << shift) & 0xffu));
        if (shift + bits > 8u) {
            packed[byte_index + 1] = static_cast<Byte>(
                packed[byte_index + 1] | static_cast<Byte>(value >> (8u - shift)));
        }
    }
    return packed;
}

std::vector<Byte> unpack_codes(const std::vector<Byte>& packed,
                               std::size_t count, unsigned bits) {
    const auto expected_size = packed_size(count, bits);
    if (packed.size() != expected_size) {
        throw std::invalid_argument("QUANT_PACKED_LENGTH_MISMATCH");
    }
    if (count && ((count * bits) & 7u)) {
        const unsigned valid_bits = static_cast<unsigned>((count * bits) & 7u);
        if ((packed.back() >> valid_bits) != 0u) {
            throw std::invalid_argument("QUANT_NONZERO_PADDING_BITS");
        }
    }
    std::vector<Byte> codes(count);
    const unsigned mask = (1u << bits) - 1u;
    for (std::size_t i = 0; i < count; ++i) {
        const std::size_t bit_offset = i * bits;
        const std::size_t byte_index = bit_offset >> 3;
        const unsigned shift = static_cast<unsigned>(bit_offset & 7u);
        const unsigned word = static_cast<unsigned>(packed[byte_index]) |
            ((byte_index + 1 < packed.size())
                 ? static_cast<unsigned>(packed[byte_index + 1]) << 8u : 0u);
        codes[i] = static_cast<Byte>((word >> shift) & mask);
    }
    return codes;
}
} // namespace atlas_quantized_code_pack_v1

namespace {
using atlas_quantized_code_pack_v1::Byte;

unsigned parse_bits(const std::string& arg) {
    if (arg != "2" && arg != "3" && arg != "4") {
        throw std::invalid_argument("QUANT_BITS_UNSUPPORTED");
    }
    return static_cast<unsigned>(arg[0] - '0');
}

std::size_t parse_count(const std::string& arg) {
    if (arg.empty() || arg.front() == '-') {
        throw std::invalid_argument("QUANT_COUNT_INVALID");
    }
    std::size_t result = 0;
    for (char c : arg) {
        if (c < '0' || c > '9') throw std::invalid_argument("QUANT_COUNT_INVALID");
        const std::size_t digit = static_cast<unsigned>(c - '0');
        if (result > (std::numeric_limits<std::size_t>::max() - digit) / 10u)
            throw std::invalid_argument("QUANT_COUNT_INVALID");
        result = result * 10u + digit;
    }
    return result;
}

unsigned hex_digit(char c) {
    if (c >= '0' && c <= '9') return static_cast<unsigned>(c - '0');
    if (c >= 'a' && c <= 'f') return static_cast<unsigned>(c - 'a' + 10);
    if (c >= 'A' && c <= 'F') return static_cast<unsigned>(c - 'A' + 10);
    throw std::invalid_argument("QUANT_HEX_INVALID");
}

std::vector<Byte> from_hex(const std::string& s) {
    if (s == "-") return {};
    if (s.size() % 2 != 0) throw std::invalid_argument("QUANT_HEX_INVALID");
    std::vector<Byte> out;
    out.reserve(s.size() / 2);
    for (std::size_t i = 0; i < s.size(); i += 2) {
        out.push_back(static_cast<Byte>((hex_digit(s[i]) << 4u) | hex_digit(s[i + 1])));
    }
    return out;
}

std::string to_hex(const std::vector<Byte>& bytes) {
    static constexpr char digits[] = "0123456789abcdef";
    std::string hex;
    hex.reserve(bytes.size() * 2);
    for (const auto value : bytes) {
        hex.push_back(digits[(value >> 4u) & 15u]);
        hex.push_back(digits[value & 15u]);
    }
    return hex;
}
}

int main(int argc, char** argv) {
    try {
        if (argc == 4 && std::string(argv[1]) == "pack") {
            const auto bits = parse_bits(argv[2]);
            const auto codes = from_hex(argv[3]);
            std::cout << to_hex(atlas_quantized_code_pack_v1::pack_codes(codes, bits)) << '\n';
            return EXIT_SUCCESS;
        }
        if (argc == 5 && std::string(argv[1]) == "unpack") {
            const auto bits = parse_bits(argv[2]);
            const auto count = parse_count(argv[3]);
            const auto packed = from_hex(argv[4]);
            std::cout << to_hex(atlas_quantized_code_pack_v1::unpack_codes(packed, count, bits)) << '\n';
            return EXIT_SUCCESS;
        }
        std::cerr << "USAGE: pack bits raw-u8-hex | unpack bits count packed-hex\n";
        return EXIT_FAILURE;
    } catch (const std::exception& error) {
        std::cerr << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
