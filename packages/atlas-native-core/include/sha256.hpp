#pragma once

#include <array>
#include <bit>
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace atlas::native {

inline std::string sha256_hex(const std::uint8_t* data, std::size_t size) {
    constexpr std::array<std::uint32_t, 64> round_constants{
        0x428a2f98u, 0x71374491u, 0xb5c0fbcfu, 0xe9b5dba5u, 0x3956c25bu, 0x59f111f1u, 0x923f82a4u, 0xab1c5ed5u,
        0xd807aa98u, 0x12835b01u, 0x243185beu, 0x550c7dc3u, 0x72be5d74u, 0x80deb1feu, 0x9bdc06a7u, 0xc19bf174u,
        0xe49b69c1u, 0xefbe4786u, 0x0fc19dc6u, 0x240ca1ccu, 0x2de92c6fu, 0x4a7484aau, 0x5cb0a9dcu, 0x76f988dau,
        0x983e5152u, 0xa831c66du, 0xb00327c8u, 0xbf597fc7u, 0xc6e00bf3u, 0xd5a79147u, 0x06ca6351u, 0x14292967u,
        0x27b70a85u, 0x2e1b2138u, 0x4d2c6dfcu, 0x53380d13u, 0x650a7354u, 0x766a0abbu, 0x81c2c92eu, 0x92722c85u,
        0xa2bfe8a1u, 0xa81a664bu, 0xc24b8b70u, 0xc76c51a3u, 0xd192e819u, 0xd6990624u, 0xf40e3585u, 0x106aa070u,
        0x19a4c116u, 0x1e376c08u, 0x2748774cu, 0x34b0bcb5u, 0x391c0cb3u, 0x4ed8aa4au, 0x5b9cca4fu, 0x682e6ff3u,
        0x748f82eeu, 0x78a5636fu, 0x84c87814u, 0x8cc70208u, 0x90befffau, 0xa4506cebu, 0xbef9a3f7u, 0xc67178f2u
    };
    constexpr std::array<std::uint32_t, 8> initial_state{
        0x6a09e667u, 0xbb67ae85u, 0x3c6ef372u, 0xa54ff53au,
        0x510e527fu, 0x9b05688cu, 0x1f83d9abu, 0x5be0cd19u
    };

    std::vector<std::uint8_t> padded;
    padded.reserve(((size + 9 + 63) / 64) * 64);
    if (size != 0) padded.insert(padded.end(), data, data + size);
    padded.push_back(0x80u);
    while ((padded.size() % 64) != 56) padded.push_back(0);
    const auto bit_length = static_cast<std::uint64_t>(size) * 8u;
    for (int shift = 56; shift >= 0; shift -= 8) {
        padded.push_back(static_cast<std::uint8_t>(bit_length >> shift));
    }

    auto state = initial_state;
    for (std::size_t block_offset = 0; block_offset < padded.size(); block_offset += 64) {
        std::array<std::uint32_t, 64> schedule{};
        for (std::size_t index = 0; index < 16; ++index) {
            const auto offset = block_offset + index * 4;
            schedule[index] = (static_cast<std::uint32_t>(padded[offset]) << 24u) |
                (static_cast<std::uint32_t>(padded[offset + 1]) << 16u) |
                (static_cast<std::uint32_t>(padded[offset + 2]) << 8u) |
                static_cast<std::uint32_t>(padded[offset + 3]);
        }
        for (std::size_t index = 16; index < schedule.size(); ++index) {
            const auto x = schedule[index - 15];
            const auto y = schedule[index - 2];
            const auto small_sigma0 = std::rotr(x, 7) ^ std::rotr(x, 18) ^ (x >> 3u);
            const auto small_sigma1 = std::rotr(y, 17) ^ std::rotr(y, 19) ^ (y >> 10u);
            schedule[index] = schedule[index - 16] + small_sigma0 + schedule[index - 7] + small_sigma1;
        }

        auto a = state[0];
        auto b = state[1];
        auto c = state[2];
        auto d = state[3];
        auto e = state[4];
        auto f = state[5];
        auto g = state[6];
        auto h = state[7];
        for (std::size_t index = 0; index < schedule.size(); ++index) {
            const auto big_sigma1 = std::rotr(e, 6) ^ std::rotr(e, 11) ^ std::rotr(e, 25);
            const auto choice = (e & f) ^ (~e & g);
            const auto temporary1 = h + big_sigma1 + choice + round_constants[index] + schedule[index];
            const auto big_sigma0 = std::rotr(a, 2) ^ std::rotr(a, 13) ^ std::rotr(a, 22);
            const auto majority = (a & b) ^ (a & c) ^ (b & c);
            const auto temporary2 = big_sigma0 + majority;
            h = g;
            g = f;
            f = e;
            e = d + temporary1;
            d = c;
            c = b;
            b = a;
            a = temporary1 + temporary2;
        }
        state[0] += a;
        state[1] += b;
        state[2] += c;
        state[3] += d;
        state[4] += e;
        state[5] += f;
        state[6] += g;
        state[7] += h;
    }

    constexpr char digits[] = "0123456789abcdef";
    std::string result;
    result.reserve(64);
    for (const auto word : state) {
        for (int shift = 28; shift >= 0; shift -= 4) {
            result.push_back(digits[(word >> shift) & 0x0fu]);
        }
    }
    return result;
}

}
