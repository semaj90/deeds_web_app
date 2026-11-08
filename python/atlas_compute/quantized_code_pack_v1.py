"""Reference LSB-first packer for 2/3/4-bit integer quantization codes; must stay byte-identical to scripts/atlas/lib/quantized-code-pack-v1.mjs."""
BITS = (2, 3, 4)


def _check(bits):
    if bits not in BITS:
        raise ValueError("QUANT_BITS_UNSUPPORTED")


def pack_codes(codes, bits):
    _check(bits)
    mask = (1 << bits) - 1
    out = bytearray((len(codes) * bits + 7) // 8)
    for i, v in enumerate(codes):
        if not isinstance(v, int) or v < 0 or v > mask:
            raise ValueError("QUANT_CODE_OUT_OF_RANGE")
        off = i * bits
        byte, shift = off >> 3, off & 7
        out[byte] |= (v << shift) & 0xFF
        if shift + bits > 8:
            out[byte + 1] |= v >> (8 - shift)
    return bytes(out)


def unpack_code(data, index, bits):
    _check(bits)
    if index < 0 or (index + 1) * bits > len(data) * 8:
        raise ValueError("QUANT_INDEX_OUT_OF_RANGE")
    off = index * bits
    byte, shift = off >> 3, off & 7
    word = data[byte] | ((data[byte + 1] if byte + 1 < len(data) else 0) << 8)
    return (word >> shift) & ((1 << bits) - 1)
