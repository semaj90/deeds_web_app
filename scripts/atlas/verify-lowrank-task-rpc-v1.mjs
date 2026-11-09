// Independent JS verifier for the v2 low-rank task record artifacts.
// Decodes every 64-byte record with DataView (little-endian) instead of trusting the producer.
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const RECORD_SIZE = 64;
const LATENT_DIM = 64;
const sha256 = (buf) => 'sha256:' + createHash('sha256').update(buf).digest('hex');

// Layout (see synthesize-lowrank-task-rpc-v1.py): u32 morton | u32 ordinal | u16 cluster | 2 reserved |
// f32 pos[3] | f64 final_score | f32 feature[8]
export function decodeRecords(buf, taskCount) {
  if (buf.byteLength !== taskCount * RECORD_SIZE) {
    throw new Error(`RECORD_TRUNCATED_OR_EXTRA: got ${buf.byteLength}, expected ${taskCount * RECORD_SIZE}`);
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const out = [];
  for (let i = 0; i < taskCount; i++) {
    const o = i * RECORD_SIZE;
    const rec = {
      morton: view.getUint32(o, true),
      ordinal: view.getUint32(o + 4, true),
      cluster: view.getUint16(o + 8, true),
      reserved: view.getUint16(o + 10, true),
      pos: [view.getFloat32(o + 12, true), view.getFloat32(o + 16, true), view.getFloat32(o + 20, true)],
      finalScore: view.getFloat64(o + 24, true),
      feature: Array.from({ length: 8 }, (_, k) => view.getFloat32(o + 32 + 4 * k, true)),
    };
    if (rec.ordinal !== i) throw new Error(`ORDINAL_MISMATCH_AT_${i}: ${rec.ordinal}`);
    if (rec.reserved !== 0) throw new Error(`RESERVED_NONZERO_AT_${i}`);
    out.push(rec);
  }
  return out;
}

async function main() {
  const receiptPath = resolve('docs/reports/openspec-lowrank-task-rpc-receipt-v1.json');
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const artifactSchema = receipt.packet?.artifactSchema ?? receipt.packet?.schema;
  if (!['atlas.openspec-lowrank-task-rpc.v2', 'atlas.openspec-lowrank-task-rpc.v3'].includes(artifactSchema)) {
    throw new Error(`SCHEMA_VERSION_UNSUPPORTED: ${artifactSchema}`);
  }
  const n = receipt.taskCount;
  if (artifactSchema === 'atlas.openspec-lowrank-task-rpc.v3') {
    const bindings = receipt.packet.sourceBindings;
    if (!Array.isArray(bindings) || bindings.length !== n) throw new Error('SOURCE_BINDING_COUNT_MISMATCH');
    const seen = new Set();
    for (let i = 0; i < bindings.length; i++) {
      const b = bindings[i];
      if (!b?.taskKey || !b?.packetKey || !b?.sourceRef || !b?.sourceRevision || b.candidateOrdinal !== i) {
        throw new Error(`SOURCE_BINDING_INVALID_AT_${i}`);
      }
      if (seen.has(b.taskKey)) throw new Error(`DUPLICATE_SOURCE_TASK_KEY_AT_${i}`);
      seen.add(b.taskKey);
    }
    if (receipt.envelope?.status !== 'SOURCE_BOUND_DIAGNOSTIC_ARTIFACT' || receipt.packet.canonicalAuthority !== false) {
      throw new Error('V3_AUTHORITY_OR_STATUS_INVALID');
    }
  }
  const recBuf = await readFile(resolve(receipt.binaryOutput));
  if (sha256(recBuf) !== receipt.packet.binaryChunkSha256) throw new Error('RECORD_HASH_MISMATCH');
  const records = decodeRecords(recBuf, n);

  const latBuf = await readFile(resolve(receipt.packet.latent64File.path));
  if (sha256(latBuf) !== receipt.packet.latent64File.sha256) throw new Error('LATENT_HASH_MISMATCH');
  if (latBuf.byteLength !== n * LATENT_DIM * 4) throw new Error('LATENT_LENGTH_MISMATCH');
  const lat = new DataView(latBuf.buffer, latBuf.byteOffset, latBuf.byteLength);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++) {
      if (lat.getFloat32((i * LATENT_DIM + k) * 4, true) !== records[i].pos[k]) {
        throw new Error(`LATENT_POSITION_MISMATCH_AT_${i}_${k}`);
      }
    }
  }

  const bitBuf = await readFile(resolve(receipt.packet.occupancyFile.path));
  if (sha256(bitBuf) !== receipt.packet.occupancyFile.sha256) throw new Error('BITSET_HASH_MISMATCH');
  if (bitBuf.byteLength !== Math.ceil(n / 8)) throw new Error('BITSET_LENGTH_MISMATCH');
  let bitsSet = 0;
  for (let i = 0; i < n; i++) {
    const bit = (bitBuf[i >> 3] >> (i & 7)) & 1;
    const expected = records[i].finalScore > 0.5 ? 1 : 0;
    if (bit !== expected) throw new Error(`BITSET_MISMATCH_AT_${i}`);
    bitsSet += bit;
  }

  console.log('Schema:', receipt.packet.schema);
  console.log('Records decoded and ordinal-checked:', records.length, 'x', RECORD_SIZE, 'bytes');
  console.log('Latent64 positions matched:', n);
  console.log('Occupancy bits set:', bitsSet, 'of', n);
  console.log('Embedding source:', receipt.packet.embeddingSource);
  console.log('Local artifacts written:', receipt.packet.localArtifactsWritten);
  console.log('Database writes performed:', receipt.packet.databaseWritesPerformed);
  console.log('Canonical authority:', receipt.packet.canonicalAuthority);
  console.log('VERIFICATION_COMPLETE_PASS');
}

if (process.argv[1]?.endsWith('verify-lowrank-task-rpc-v1.mjs')) {
  await main();
}
