import crypto from 'node:crypto';

/**
 * Domain-separated SHA-256 Merkle manifest over immutable graph partitions.
 * Integrity only: a valid root says "these bytes are the bytes that were listed", never "this is canonical source truth".
 *
 * leaf  = SHA256( 0x00 || "atlas.graph-partition.v1" 0x00 || utf8(partitionId) 0x00 || sha256(bytes) )
 * node  = SHA256( 0x01 || left || right )
 * empty = SHA256( 0x02 || "atlas.graph-merkle.empty.v1" )
 * Leaves are ordered by (partitionId, bytesSha256) as byte-wise strings; duplicate partition ids are rejected.
 * An odd node at any level is PROMOTED unchanged (no duplication), so a proof for it simply skips that level.
 */
const LEAF_TAG = Buffer.from([0x00]);
const NODE_TAG = Buffer.from([0x01]);
const EMPTY_TAG = Buffer.from([0x02]);
const DOMAIN = Buffer.from('atlas.graph-partition.v1\0', 'utf8');
const sha = (...parts) => { const h = crypto.createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); };
const HEX = /^[0-9a-f]{64}$/;

export class MerkleManifestError extends Error {
  constructor(code, detail) { super(detail ? `${code}: ${detail}` : code); this.code = code; }
}

export const emptyRoot = () => sha(EMPTY_TAG, Buffer.from('atlas.graph-merkle.empty.v1', 'utf8'));

function leafHash(partitionId, bytesSha256Hex) {
  return sha(LEAF_TAG, DOMAIN, Buffer.from(partitionId, 'utf8'), Buffer.from([0x00]), Buffer.from(bytesSha256Hex, 'hex'));
}

function normalise(partitions) {
  const seen = new Set();
  const rows = partitions.map(({ partitionId, bytesSha256 }) => {
    const hex = String(bytesSha256 ?? '').replace(/^sha256:/, '');
    if (typeof partitionId !== 'string' || partitionId === '' || partitionId.includes('\0')) throw new MerkleManifestError('PARTITION_ID_INVALID');
    if (!HEX.test(hex)) throw new MerkleManifestError('PARTITION_DIGEST_INVALID', partitionId);
    if (seen.has(partitionId)) throw new MerkleManifestError('PARTITION_ID_DUPLICATE', partitionId);
    seen.add(partitionId);
    return { partitionId, hex };
  });
  rows.sort((a, b) => (a.partitionId < b.partitionId ? -1 : a.partitionId > b.partitionId ? 1 : 0));
  return rows;
}

function levels(leaves) {
  const out = [leaves];
  while (out[out.length - 1].length > 1) {
    const cur = out[out.length - 1]; const next = [];
    for (let i = 0; i < cur.length; i += 2) next.push(i + 1 < cur.length ? sha(NODE_TAG, cur[i], cur[i + 1]) : cur[i]);
    out.push(next);
  }
  return out;
}

export function buildMerkleManifest(partitions) {
  const rows = normalise(partitions);
  const leaves = rows.map((r) => leafHash(r.partitionId, r.hex));
  const lv = levels(leaves);
  const root = rows.length === 0 ? emptyRoot() : lv[lv.length - 1][0];
  return {
    schema: 'atlas.graph-merkle-manifest.v1',
    leafCount: rows.length,
    partitions: rows.map((r) => ({ partitionId: r.partitionId, bytesSha256: `sha256:${r.hex}` })),
    rootSha256: `sha256:${root.toString('hex')}`,
    sourceAuthority: false,
    canonicalAuthority: false,
    _levels: lv,
  };
}

export function inclusionProof(manifest, partitionId) {
  const index = manifest.partitions.findIndex((p) => p.partitionId === partitionId);
  if (index < 0) throw new MerkleManifestError('PARTITION_NOT_IN_MANIFEST', partitionId);
  const path = []; let i = index;
  for (let level = 0; level < manifest._levels.length - 1; level++) {
    const nodes = manifest._levels[level];
    const sibling = i % 2 === 0 ? i + 1 : i - 1;
    if (sibling < nodes.length) path.push({ side: i % 2 === 0 ? 'right' : 'left', hash: nodes[sibling].toString('hex') });
    i = Math.floor(i / 2);
  }
  return { partitionId, bytesSha256: manifest.partitions[index].bytesSha256, path };
}

export function verifyInclusionProof({ partitionId, bytesSha256, path }, rootSha256) {
  const hex = String(bytesSha256 ?? '').replace(/^sha256:/, '');
  if (!HEX.test(hex) || typeof partitionId !== 'string' || partitionId === '' || partitionId.includes('\0')) return false;
  let acc = leafHash(partitionId, hex);
  for (const step of path) {
    if (!HEX.test(step.hash) || !['left', 'right'].includes(step.side)) return false;
    const sib = Buffer.from(step.hash, 'hex');
    acc = step.side === 'right' ? sha(NODE_TAG, acc, sib) : sha(NODE_TAG, sib, acc);
  }
  return `sha256:${acc.toString('hex')}` === rootSha256;
}

/** Public, serialisable form without internal levels. */
export const publicManifest = ({ _levels, ...rest }) => rest;
