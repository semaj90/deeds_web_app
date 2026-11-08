// Deduplicated canonical Huffman coding for string columns (labels, source paths, statuses).
//
//  1. DEDUP    : the distinct strings go into a table sorted by their UTF-8 bytes (so the table does not depend on input order).
//  2. HUFFMAN  : each row stores only its table index, coded with a canonical Huffman code built from the index frequencies.
//  3. CANONICAL: tie-breaking is fully specified (frequency, then smallest symbol index) and codes are assigned canonically, so the same
//                multiset of strings always yields the same table and code lengths, and the same input order the same bytes.
//
// Container (little-endian): 'HFD1' | u32 rowCount | u32 uniqueCount | uniqueCount x (varint byteLength, utf8) | uniqueCount x u8 codeLength
//                            | u32 payloadBits | payload (MSB-first, zero padded)
// Lossless and strictly validated on unpack. This is a storage/transport codec only: it carries no identity or authority.
const MAGIC = Buffer.from('HFD1', 'ascii');
const MAX_CODE_LENGTH = 30; // keeps every code inside an exact JS integer

class Heap {
  constructor(cmp) { this.a = []; this.cmp = cmp; }
  get size() { return this.a.length; }
  push(x) { const a = this.a; a.push(x); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (this.cmp(a[i], a[p]) >= 0) break; [a[i], a[p]] = [a[p], a[i]]; i = p; } }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l; if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}

/** Code length per symbol. Deterministic: ties broken by frequency, then smallest symbol index. One symbol gets length 0. */
export function huffmanLengths(freqs) {
  const n = freqs.length;
  if (n === 0) return [];
  if (n === 1) return [0];
  if (freqs.some((f) => !Number.isInteger(f) || f < 1)) throw new Error('HUFFMAN_FREQUENCY_INVALID');
  const heap = new Heap((a, b) => a.f - b.f || a.min - b.min);
  freqs.forEach((f, i) => heap.push({ f, min: i, sym: i }));
  while (heap.size > 1) {
    const a = heap.pop(), b = heap.pop();
    heap.push({ f: a.f + b.f, min: Math.min(a.min, b.min), l: a, r: b });
  }
  const lengths = new Array(n).fill(0);
  const walk = (node, depth) => { if (node.sym !== undefined) { lengths[node.sym] = depth; return; } walk(node.l, depth + 1); walk(node.r, depth + 1); };
  walk(heap.pop(), 0);
  if (Math.max(...lengths) > MAX_CODE_LENGTH) throw new Error('HUFFMAN_CODE_TOO_LONG');
  return lengths;
}

/** Canonical codes: ordered by (length, symbol). Returns { codes[], order[] } where codes[sym] is an integer of lengths[sym] bits. */
export function canonicalCodes(lengths) {
  const order = lengths.map((len, sym) => ({ len, sym })).filter((x) => x.len > 0).sort((a, b) => a.len - b.len || a.sym - b.sym);
  const codes = new Array(lengths.length).fill(0);
  let code = 0, prev = order.length ? order[0].len : 0;
  order.forEach((x, i) => { if (i > 0) code = (code + 1) * 2 ** (x.len - prev); codes[x.sym] = code; prev = x.len; });
  return { codes, order: order.map((x) => x.sym) };
}

/** Kraft equality for a complete prefix code (or a single zero-length symbol). */
export function isCompleteCode(lengths) {
  if (lengths.length === 0) return true;
  if (lengths.length === 1) return lengths[0] === 0;
  if (lengths.some((l) => l < 1 || l > MAX_CODE_LENGTH)) return false;
  return lengths.reduce((s, l) => s + 2 ** (MAX_CODE_LENGTH - l), 0) === 2 ** MAX_CODE_LENGTH;
}

export function encodeSymbols(symbols, lengths) {
  const { codes } = canonicalCodes(lengths);
  let bits = 0; for (const s of symbols) bits += lengths[s];
  const out = Buffer.alloc(Math.ceil(bits / 8));
  let pos = 0;
  for (const s of symbols) for (let b = lengths[s] - 1; b >= 0; b--, pos++) if (Math.floor(codes[s] / 2 ** b) % 2) out[pos >> 3] |= 0x80 >> (pos & 7);
  return { bytes: out, bits };
}

export function decodeSymbols(payload, bits, count, lengths) {
  if (lengths.length === 0) { if (count !== 0 || bits !== 0) throw new Error('HFD_EMPTY_TABLE_WITH_ROWS'); return []; }
  if (lengths.length === 1) { if (bits !== 0) throw new Error('HFD_PAYLOAD_NOT_EMPTY'); return new Array(count).fill(0); }
  const { order } = canonicalCodes(lengths);
  const maxLen = Math.max(...lengths);
  const firstCode = new Array(maxLen + 2).fill(0), firstIndex = new Array(maxLen + 2).fill(0), countAt = new Array(maxLen + 2).fill(0);
  for (const sym of order) countAt[lengths[sym]]++;
  let code = 0, idx = 0;
  for (let len = 1; len <= maxLen; len++) { firstCode[len] = code; firstIndex[len] = idx; idx += countAt[len]; code = (code + countAt[len]) * 2; }
  const out = []; let pos = 0;
  for (let i = 0; i < count; i++) {
    let c = 0, len = 0;
    for (;;) {
      if (pos >= bits) throw new Error('HFD_PAYLOAD_TRUNCATED');
      c = c * 2 + ((payload[pos >> 3] >> (7 - (pos & 7))) & 1); pos++; len++;
      if (len > maxLen) throw new Error('HFD_CODE_INVALID');
      if (countAt[len] && c - firstCode[len] >= 0 && c - firstCode[len] < countAt[len]) { out.push(order[firstIndex[len] + (c - firstCode[len])]); break; }
    }
  }
  if (pos !== bits) throw new Error('HFD_PAYLOAD_LENGTH_MISMATCH');
  return out;
}

const varintBytes = (n) => { const b = []; while (n >= 0x80) { b.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); } b.push(n); return Buffer.from(b); };
function readVarint(buf, offset) {
  let n = 0, shift = 0;
  for (let i = 0; i < 5; i++) { if (offset + i >= buf.length) throw new Error('HFD_TRUNCATED'); const b = buf[offset + i]; n += (b & 0x7f) * 2 ** shift; if (!(b & 0x80)) return { n, next: offset + i + 1 }; shift += 7; }
  throw new Error('HFD_VARINT_TOO_LONG');
}

/** Deduplicate + Huffman-code a list of strings. Deterministic. */
export function packStrings(strings) {
  if (strings.some((s) => typeof s !== 'string')) throw new Error('HFD_NON_STRING_INPUT');
  const table = [...new Set(strings)].sort((a, b) => Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8')));
  const index = new Map(table.map((s, i) => [s, i]));
  const symbols = strings.map((s) => index.get(s));
  const freqs = new Array(table.length).fill(0); for (const s of symbols) freqs[s]++;
  const lengths = table.length ? huffmanLengths(freqs) : [];
  const { bytes, bits } = encodeSymbols(symbols, lengths);
  const head = Buffer.alloc(12); MAGIC.copy(head); head.writeUInt32LE(strings.length, 4); head.writeUInt32LE(table.length, 8);
  const tableBytes = Buffer.concat(table.map((s) => { const b = Buffer.from(s, 'utf8'); return Buffer.concat([varintBytes(b.length), b]); }));
  const bitLen = Buffer.alloc(4); bitLen.writeUInt32LE(bits);
  return Buffer.concat([head, tableBytes, Buffer.from(lengths), bitLen, bytes]);
}

export function unpackStrings(buf) {
  if (buf.length < 12 || !buf.subarray(0, 4).equals(MAGIC)) throw new Error('HFD_BAD_MAGIC');
  const count = buf.readUInt32LE(4), unique = buf.readUInt32LE(8);
  if (count > 0 && unique === 0) throw new Error('HFD_EMPTY_TABLE_WITH_ROWS');
  let off = 12; const table = [];
  for (let i = 0; i < unique; i++) {
    const { n, next } = readVarint(buf, off);
    if (next + n > buf.length) throw new Error('HFD_TRUNCATED');
    table.push(buf.subarray(next, next + n)); off = next + n;
  }
  for (let i = 1; i < table.length; i++) if (Buffer.compare(table[i - 1], table[i]) >= 0) throw new Error('HFD_TABLE_NOT_SORTED_UNIQUE');
  if (off + unique + 4 > buf.length) throw new Error('HFD_TRUNCATED');
  const lengths = [...buf.subarray(off, off + unique)]; off += unique;
  if (!isCompleteCode(lengths)) throw new Error('HFD_CODE_NOT_COMPLETE');
  const bits = buf.readUInt32LE(off); off += 4;
  const payload = buf.subarray(off);
  if (payload.length !== Math.ceil(bits / 8)) throw new Error('HFD_PAYLOAD_SIZE_MISMATCH');
  if (bits % 8 && (payload[payload.length - 1] & (0xff >> (bits % 8))) !== 0) throw new Error('HFD_PADDING_NOT_ZERO');
  const symbols = decodeSymbols(payload, bits, count, lengths);
  return symbols.map((s) => table[s].toString('utf8'));
}
