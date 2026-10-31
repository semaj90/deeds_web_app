import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

const MAX_PROPOSAL_CANDIDATES = 4096;
const representationRevisionSchema = z.string().min(1);
const isUint32Array = (value: unknown): value is Uint32Array =>
  ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint32Array]';
const isUint16Array = (value: unknown): value is Uint16Array =>
  ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint16Array]';

const signatureRowSchema = z.object({
  candidateOrdinal: z.number().int().nonnegative().max(4_294_967_295),
  signature: z.instanceof(Uint8Array).refine((value) => value.byteLength === 16),
}).strict();

export interface Hamming128ProposalComputePoolV1 {
  run<T>(type: 'hamming128.proposal', payload: unknown, options?: { timeoutMs?: number }): Promise<T>;
}

export interface Hamming128ProposalResultV1 {
  schema: 'atlas.hamming128.proposal-result.v1';
  authority: 'PROPOSAL_ONLY';
  backend: string;
  workspaceRevision: string;
  candidateSnapshotRevision: string;
  ordinalMapChecksum: string;
  representationRevision: string;
  queryDigest: string;
  proposalChecksum: string;
  rows: Array<{
    candidateOrdinal: number;
    canonicalId: string;
    packetKey: string | null;
    sourceRef: string | null;
    sourceRevision: string;
    hammingDistance: number;
  }>;
}

export async function scoreHamming128ProposalV1(input: {
  computePool: Hamming128ProposalComputePoolV1;
  ordinalMap: unknown;
  representationRevision: string;
  querySignature: Uint8Array;
  candidateSignatures: unknown;
  timeoutMs?: number;
}): Promise<Hamming128ProposalResultV1> {
  const ordinalMap: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  const representationRevision = representationRevisionSchema.parse(input.representationRevision);
  if (!(input.querySignature instanceof Uint8Array) || input.querySignature.byteLength !== 16) {
    throw new Error('HAMMING128_QUERY_SIGNATURE_INVALID');
  }
  if (!Array.isArray(input.candidateSignatures) || input.candidateSignatures.length > MAX_PROPOSAL_CANDIDATES) {
    throw new Error('HAMMING128_PROPOSAL_CANDIDATE_LIMIT_EXCEEDED');
  }

  const signatures = input.candidateSignatures.map((row) => signatureRowSchema.parse(row))
    .sort((left, right) => left.candidateOrdinal - right.candidateOrdinal);
  const seen = new Set<number>();
  for (const row of signatures) {
    if (seen.has(row.candidateOrdinal)) throw new Error(`HAMMING128_DUPLICATE_CANDIDATE_ORDINAL:${row.candidateOrdinal}`);
    if (row.candidateOrdinal >= ordinalMap.rowCount) throw new Error(`HAMMING128_ORDINAL_OUTSIDE_MAP:${row.candidateOrdinal}`);
    const candidate = ordinalMap.candidates[row.candidateOrdinal];
    if (!candidate || candidate.candidateOrdinal !== row.candidateOrdinal
      || candidate.workspaceRevision !== ordinalMap.workspaceRevision
      || candidate.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision) {
      throw new Error(`HAMMING128_CANDIDATE_BINDING_MISMATCH:${row.candidateOrdinal}`);
    }
    if (candidate.degradedIdentity) throw new Error(`HAMMING128_DEGRADED_IDENTITY:${row.candidateOrdinal}`);
    seen.add(row.candidateOrdinal);
  }

  const packedCandidates = new Uint8Array(signatures.length * 16);
  const candidateOrdinals = new Uint32Array(signatures.length);
  signatures.forEach((row, index) => {
    packedCandidates.set(row.signature, index * 16);
    candidateOrdinals[index] = row.candidateOrdinal;
  });

  const queryDigest = createHash('sha256').update(input.querySignature).digest('hex');
  const scored = await input.computePool.run<{
    schema: string;
    authority: string;
    backend: 'AVX2' | 'AVX512' | 'SCALAR';
    candidateOrdinals: Uint32Array;
    distances: Uint16Array;
  }>('hamming128.proposal', {
    query: new Uint8Array(input.querySignature),
    packedCandidates,
    candidateOrdinals,
  }, { timeoutMs: input.timeoutMs ?? 5000 });

  if (scored.schema !== 'atlas.hamming128.worker-result.v1'
    || scored.authority !== 'PROPOSAL_ONLY'
    || !['AVX2', 'AVX512', 'SCALAR'].includes(scored.backend)
    || !isUint32Array(scored.candidateOrdinals)
    || !isUint16Array(scored.distances)
    || scored.candidateOrdinals.length !== signatures.length
    || scored.distances.length !== signatures.length) {
    throw new Error('HAMMING128_WORKER_RESULT_INVALID');
  }

  const rows = signatures.map((signature, index) => {
    if (scored.candidateOrdinals[index] !== signature.candidateOrdinal) {
      throw new Error(`HAMMING128_RESULT_ORDINAL_MISMATCH:${index}`);
    }
    const candidate = ordinalMap.candidates[signature.candidateOrdinal];
    return {
      candidateOrdinal: signature.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      sourceRevision: candidate.sourceRevision,
      hammingDistance: scored.distances[index],
    };
  });
  const proposalChecksum = createHash('sha256').update(JSON.stringify({
    queryDigest,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representationRevision,
    rows,
  })).digest('hex');

  return {
    schema: 'atlas.hamming128.proposal-result.v1',
    authority: 'PROPOSAL_ONLY',
    backend: scored.backend,
    workspaceRevision: ordinalMap.workspaceRevision,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    representationRevision,
    queryDigest,
    proposalChecksum,
    rows,
  };
}
