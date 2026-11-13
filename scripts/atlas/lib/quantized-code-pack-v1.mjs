// Reference LSB-first packer for 2/3/4-bit integer quantization codes (a NEW format, NOT atlas.packed-sparse-routing.v1).
// Packs integer codes only; scales, zero points, rounding and rotation revisions are defined by the quantizer, not here.
export const BITS = [2, 3, 4];
const checkBits = (bits) => { if (!BITS.includes(bits)) throw new Error('QUANT_BITS_UNSUPPORTED'); };

export function packCodes(codes, bits) {
  checkBits(bits);
  const mask = (1 << bits) - 1;
  const out = new Uint8Array(Math.ceil((codes.length * bits) / 8));
  for (let i = 0; i < codes.length; i++) {
    const v = codes[i];
    if (!Number.isInteger(v) || v < 0 || v > mask) throw new Error('QUANT_CODE_OUT_OF_RANGE');
    const bitOffset = i * bits, byteIndex = bitOffset >>> 3, shift = bitOffset & 7;
    out[byteIndex] |= (v << shift) & 0xff;
    if (shift + bits > 8) out[byteIndex + 1] |= v >>> (8 - shift);
  }
  return out;
}

export function unpackCode(bytes, index, bits) {
  checkBits(bits);
  if (!Number.isInteger(index) || index < 0 || (index + 1) * bits > bytes.length * 8) throw new Error('QUANT_INDEX_OUT_OF_RANGE');
  const bitOffset = index * bits, byteIndex = bitOffset >>> 3, shift = bitOffset & 7;
  const word = bytes[byteIndex] | ((bytes[byteIndex + 1] ?? 0) << 8);
  return (word >>> shift) & ((1 << bits) - 1);
}

export function unpackAll(bytes, count, bits) {
  const out = new Uint8Array(count);
  for (let i = 0; i < count; i++) out[i] = unpackCode(bytes, i, bits);
  return out;
}
