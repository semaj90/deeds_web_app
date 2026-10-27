import crypto from 'node:crypto';

/**
 * Versioned CSR adjacency artifact. Derivative only: never canonical, never carries source authority.
 * Layout (little-endian, fixed):
 *   magic "ACSR" | u8 version=1 | u8 endian=1(LE) | u8 offsetWidth(4|8) | u8 flags(bit0 weights)
 *   u32 nodeCount | u64 edgeCount | u32 relationTypeCount | u32 metaLength | u32 reserved=0
 *   meta (utf8 JSON, stable key order) | row offsets (nodeCount+1) | targets u32[edgeCount] | relType u16[edgeCount]
 *   | weights f32[edgeCount] when flagged | sha256 trailer over everything before it
 * Node ordinals are positions in the caller's canonical ordering; the ordering digest is recorded in meta.
 */
export const CSR_MAGIC = 'ACSR';
export const CSR_VERSION = 1;
const HEADER_BYTES = 4 + 4 + 4 + 8 + 4 + 4 + 4;
const U32_MAX = 0xffffffff;

export class CsrArtifactError extends Error {
  constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}

const stableMeta = (meta) => JSON.stringify(Object.fromEntries(Object.entries(meta).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))));

/**
 * @param {{nodeKeys:string[], edges:Array<{source:number,target:number,type:number,weight?:number}>, projectionRevision:string, modelRevision?:string}} input
 * nodeKeys must already be in canonical order; edges reference ordinals.
 */
export function encodeCsr({ nodeKeys, edges, projectionRevision, modelRevision = null, forceOffsetWidth = null }) {
  const nodeCount = nodeKeys.length;
  if (!projectionRevision) throw new CsrArtifactError('PROJECTION_REVISION_REQUIRED');
  if (nodeCount > U32_MAX) throw new CsrArtifactError('NODE_COUNT_OVERFLOW_U32');
  for (let i = 1; i < nodeKeys.length; i++) if (!(nodeKeys[i - 1] < nodeKeys[i])) throw new CsrArtifactError('NODE_KEYS_NOT_STRICTLY_SORTED', nodeKeys[i]);
  const hasWeights = edges.some((e) => e.weight !== undefined);
  if (hasWeights && edges.some((e) => e.weight === undefined || !Number.isFinite(e.weight))) throw new CsrArtifactError('WEIGHT_MISSING_OR_NON_FINITE');
  const typeSet = new Set();
  for (const e of edges) {
    if (!Number.isInteger(e.source) || !Number.isInteger(e.target) || e.source < 0 || e.target < 0 || e.source >= nodeCount || e.target >= nodeCount) throw new CsrArtifactError('EDGE_ORDINAL_OUT_OF_RANGE');
    if (!Number.isInteger(e.type) || e.type < 0 || e.type > 0xffff) throw new CsrArtifactError('RELATION_TYPE_CODE_OUT_OF_RANGE');
    typeSet.add(e.type);
  }
  const sorted = [...edges].sort((a, b) => a.source - b.source || a.target - b.target || a.type - b.type);
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1]; const c = sorted[i];
    if (p.source === c.source && p.target === c.target && p.type === c.type) throw new CsrArtifactError('DUPLICATE_EDGE');
  }
  const edgeCount = sorted.length;
  const offsetWidth = forceOffsetWidth ?? (edgeCount > U32_MAX ? 8 : 4);
  if (offsetWidth === 4 && edgeCount > U32_MAX) throw new CsrArtifactError('EDGE_COUNT_OVERFLOW_U32_OFFSETS');
  if (![4, 8].includes(offsetWidth)) throw new CsrArtifactError('OFFSET_WIDTH_INVALID');

  const orderingDigest = crypto.createHash('sha256').update(nodeKeys.join('\n'), 'utf8').digest('hex');
  const meta = Buffer.from(stableMeta({ projectionRevision, modelRevision, nodeOrderingSha256: `sha256:${orderingDigest}`, canonicalAuthority: false }), 'utf8');

  const offsets = new Array(nodeCount + 1).fill(0);
  for (const e of sorted) offsets[e.source + 1] += 1;
  for (let i = 0; i < nodeCount; i++) offsets[i + 1] += offsets[i];

  const total = HEADER_BYTES + meta.length + (nodeCount + 1) * offsetWidth + edgeCount * 4 + edgeCount * 2 + (hasWeights ? edgeCount * 4 : 0);
  const buf = Buffer.alloc(total);
  let p = 0;
  buf.write(CSR_MAGIC, p, 'ascii'); p += 4;
  buf.writeUInt8(CSR_VERSION, p++); buf.writeUInt8(1, p++); buf.writeUInt8(offsetWidth, p++); buf.writeUInt8(hasWeights ? 1 : 0, p++);
  buf.writeUInt32LE(nodeCount, p); p += 4;
  buf.writeBigUInt64LE(BigInt(edgeCount), p); p += 8;
  buf.writeUInt32LE(typeSet.size, p); p += 4;
  buf.writeUInt32LE(meta.length, p); p += 4;
  buf.writeUInt32LE(0, p); p += 4;
  meta.copy(buf, p); p += meta.length;
  for (const o of offsets) { if (offsetWidth === 4) { buf.writeUInt32LE(o, p); p += 4; } else { buf.writeBigUInt64LE(BigInt(o), p); p += 8; } }
  for (const e of sorted) { buf.writeUInt32LE(e.target, p); p += 4; }
  for (const e of sorted) { buf.writeUInt16LE(e.type, p); p += 2; }
  if (hasWeights) for (const e of sorted) { buf.writeFloatLE(e.weight, p); p += 4; }
  const digest = crypto.createHash('sha256').update(buf).digest();
  const bytes = Buffer.concat([buf, digest]);
  return { bytes, sha256: `sha256:${digest.toString('hex')}`, offsetWidth, nodeCount, edgeCount };
}

export function decodeCsr(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < HEADER_BYTES + 32) throw new CsrArtifactError('TRUNCATED_HEADER');
  const body = bytes.subarray(0, bytes.length - 32);
  const trailer = bytes.subarray(bytes.length - 32);
  if (!crypto.createHash('sha256').update(body).digest().equals(trailer)) throw new CsrArtifactError('DIGEST_MISMATCH');
  let p = 0;
  if (body.toString('ascii', 0, 4) !== CSR_MAGIC) throw new CsrArtifactError('BAD_MAGIC');
  p = 4;
  const version = body.readUInt8(p++); const endian = body.readUInt8(p++); const offsetWidth = body.readUInt8(p++); const flags = body.readUInt8(p++);
  if (version !== CSR_VERSION) throw new CsrArtifactError('UNSUPPORTED_VERSION', String(version));
  if (endian !== 1) throw new CsrArtifactError('UNSUPPORTED_ENDIANNESS', String(endian));
  if (![4, 8].includes(offsetWidth)) throw new CsrArtifactError('OFFSET_WIDTH_INVALID');
  const nodeCount = body.readUInt32LE(p); p += 4;
  const edgeBig = body.readBigUInt64LE(p); p += 8;
  if (edgeBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new CsrArtifactError('EDGE_COUNT_UNSAFE');
  const edgeCount = Number(edgeBig);
  p += 4; // relationTypeCount (informational; recomputed by consumers)
  const metaLength = body.readUInt32LE(p); p += 4;
  if (body.readUInt32LE(p) !== 0) throw new CsrArtifactError('RESERVED_NONZERO'); p += 4;
  const hasWeights = (flags & 1) === 1;
  const expected = HEADER_BYTES + metaLength + (nodeCount + 1) * offsetWidth + edgeCount * 6 + (hasWeights ? edgeCount * 4 : 0);
  if (body.length !== expected) throw new CsrArtifactError('LENGTH_MISMATCH', `${body.length}!=${expected}`);
  const meta = JSON.parse(body.toString('utf8', p, p + metaLength)); p += metaLength;
  const offsets = new Array(nodeCount + 1);
  for (let i = 0; i <= nodeCount; i++) { if (offsetWidth === 4) { offsets[i] = body.readUInt32LE(p); p += 4; } else { offsets[i] = Number(body.readBigUInt64LE(p)); p += 8; } }
  if (offsets[0] !== 0 || offsets[nodeCount] !== edgeCount) throw new CsrArtifactError('OFFSETS_INCONSISTENT');
  for (let i = 1; i <= nodeCount; i++) if (offsets[i] < offsets[i - 1]) throw new CsrArtifactError('OFFSETS_NOT_MONOTONIC');
  const targets = new Uint32Array(edgeCount); for (let i = 0; i < edgeCount; i++) { targets[i] = body.readUInt32LE(p); p += 4; if (targets[i] >= nodeCount) throw new CsrArtifactError('TARGET_OUT_OF_RANGE'); }
  const types = new Uint16Array(edgeCount); for (let i = 0; i < edgeCount; i++) { types[i] = body.readUInt16LE(p); p += 2; }
  const weights = hasWeights ? new Float32Array(edgeCount) : null;
  if (weights) for (let i = 0; i < edgeCount; i++) { weights[i] = body.readFloatLE(p); p += 4; }
  return { meta, nodeCount, edgeCount, offsetWidth, offsets, targets, types, weights, sha256: `sha256:${trailer.toString('hex')}` };
}

export function neighbors(csr, ordinal) {
  return csr.targets.subarray(csr.offsets[ordinal], csr.offsets[ordinal + 1]);
}

/** Sorted-merge intersection of two sorted-per-row neighbor lists (rows are sorted by target by construction). */
export function intersectNeighbors(csr, a, b) {
  const x = neighbors(csr, a); const y = neighbors(csr, b); const out = [];
  for (let i = 0, j = 0; i < x.length && j < y.length;) {
    if (x[i] === y[j]) { if (out[out.length - 1] !== x[i]) out.push(x[i]); i++; j++; } else if (x[i] < y[j]) i++; else j++;
  }
  return out;
}
