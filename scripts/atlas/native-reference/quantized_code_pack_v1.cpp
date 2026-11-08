// Standalone C++ reference for the LSB-first 2/3/4-bit code packer (must match quantized-code-pack-v1.mjs / .py byte for byte).
// Not part of any CMake target. Usage: quantized_code_pack_v1 <bits> <codes as comma list>  -> prints packed bytes as hex.
// Exit codes: 0 ok, 2 bad bits, 3 code out of range, 4 bad input.
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <string>
#include <vector>

static int pack_codes(const std::vector<uint8_t>& codes, int bits, std::vector<uint8_t>& out) {
  if (bits < 2 || bits > 4) return 2;
  const unsigned mask = (1u << bits) - 1u;
  out.assign((codes.size() * bits + 7) / 8, 0);
  for (size_t i = 0; i < codes.size(); ++i) {
    const unsigned v = codes[i];
    if (v > mask) return 3;
    const size_t off = i * bits, byte = off >> 3;
    const unsigned shift = off & 7;
    out[byte] = static_cast<uint8_t>(out[byte] | ((v << shift) & 0xffu));
    if (shift + bits > 8) out[byte + 1] = static_cast<uint8_t>(out[byte + 1] | (v >> (8 - shift)));
  }
  return 0;
}

int main(int argc, char** argv) {
  if (argc != 3) return 4;
  const int bits = std::atoi(argv[1]);
  std::vector<uint8_t> codes;
  for (const char* p = argv[2]; *p;) {
    char* end = nullptr;
    const long v = std::strtol(p, &end, 10);
    if (end == p || v < 0 || v > 255) return 4;
    codes.push_back(static_cast<uint8_t>(v));
    p = (*end == ',') ? end + 1 : end;
    if (*end != ',' && *end != '\0') return 4;
  }
  std::vector<uint8_t> out;
  const int rc = pack_codes(codes, bits, out);
  if (rc != 0) return rc;
  for (uint8_t b : out) std::printf("%02x", b);
  std::printf("\n");
  return 0;
}
