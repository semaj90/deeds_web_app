import { createHash } from 'node:crypto';
import { z } from 'zod';

import { canonicalCandidateV1Schema, compareUtf8, type CanonicalCandidateV1 } from './canonical-candidate-v1.js';

export const CANDIDATE_MANIFEST_SCHEMA = 'atlas.candidate-manifest.v1' as const;
export const CANDIDATE_CURSOR_SCHEMA = 'atlas.candidate-cursor.v1' as const;

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const RankedCandidateV1Schema = z.object({
  candidate: canonicalCandidateV1Schema,
  finalScore: z.number().finite(),
  rank: z.number().int().nonnegative(),
}).strict();
export type RankedCandidateV1 = z.infer<typeof RankedCandidateV1Schema>;

export const CandidateManifestV1Schema = z.object({
  schema: z.literal(CANDIDATE_MANIFEST_SCHEMA),
  requestId: z.string().min(1),
  workspaceRevision: revision,
  candidateSnapshotRevision: revision,
  rankingRevision: revision,
  candidateSetChecksum: checksum,
  rowCount: z.number().int().nonnegative(),
  orderedCandidates: z.array(RankedCandidateV1Schema),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((manifest, ctx) => {
  if (manifest.rowCount !== manifest.orderedCandidates.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rowCount'], message: 'CANDIDATE_MANIFEST_ROW_COUNT_MISMATCH' });
  }
  manifest.orderedCandidates.forEach((row, index) => {
    if (row.rank !== index) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderedCandidates', index, 'rank'], message: 'CANDIDATE_MANIFEST_RANK_NOT_DENSE' });
    }
    if (row.candidate.workspaceRevision !== manifest.workspaceRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderedCandidates', index, 'candidate', 'workspaceRevision'], message: 'CANDIDATE_MANIFEST_WORKSPACE_MISMATCH' });
    }
    if (row.candidate.candidateSnapshotRevision !== manifest.candidateSnapshotRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orderedCandidates', index, 'candidate', 'candidateSnapshotRevision'], message: 'CANDIDATE_MANIFEST_SNAPSHOT_MISMATCH' });
    }
  });
});
export type CandidateManifestV1 = z.infer<typeof CandidateManifestV1Schema>;

export const CandidateCursorV1Schema = z.object({
  schema: z.literal(CANDIDATE_CURSOR_SCHEMA),
  candidateSetChecksum: checksum,
  rankingRevision: revision,
  candidateSnapshotRevision: revision,
  lastRank: z.number().int().nonnegative(),
  lastScore: z.number().finite(),
  lastCanonicalId: z.string().min(1),
}).strict();
export type CandidateCursorV1 = z.infer<typeof CandidateCursorV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => compareUtf8(a, b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

function sha256(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

export function materializeCandidateManifestV1(input: {
  requestId: string;
  rankingRevision: string;
  rankedCandidates: Array<{ candidate: CanonicalCandidateV1; finalScore: number }>;
}): CandidateManifestV1 {
  if (input.rankedCandidates.length === 0) throw new Error('CANDIDATE_MANIFEST_REQUIRES_CANDIDATES');

  const parsed = input.rankedCandidates.map((row) => ({
    candidate: canonicalCandidateV1Schema.parse(row.candidate),
    finalScore: z.number().finite().parse(row.finalScore),
  }));
  const workspaceRevisions = [...new Set(parsed.map((row) => row.candidate.workspaceRevision))];
  const snapshotRevisions = [...new Set(parsed.map((row) => row.candidate.candidateSnapshotRevision))];
  if (workspaceRevisions.length !== 1) throw new Error('CANDIDATE_MANIFEST_WORKSPACE_REVISION_MIXED');
  if (snapshotRevisions.length !== 1) throw new Error('CANDIDATE_MANIFEST_SNAPSHOT_REVISION_MIXED');

  const canonicalIds = new Set<string>();
  const ordinals = new Set<number>();
  parsed.forEach(({ candidate }) => {
    if (canonicalIds.has(candidate.canonicalId)) throw new Error(`CANDIDATE_MANIFEST_CANONICAL_ID_DUPLICATE:${candidate.canonicalId}`);
    if (ordinals.has(candidate.candidateOrdinal)) throw new Error(`CANDIDATE_MANIFEST_ORDINAL_DUPLICATE:${candidate.candidateOrdinal}`);
    canonicalIds.add(candidate.canonicalId);
    ordinals.add(candidate.candidateOrdinal);
  });

  // Ranking is supplied by the admitted ranking owner. We freeze it exactly; we do not rerank here.
  const orderedCandidates = parsed.map((row, rank) => RankedCandidateV1Schema.parse({ ...row, rank }));
  const candidateSetChecksum = sha256({
    workspaceRevision: workspaceRevisions[0],
    candidateSnapshotRevision: snapshotRevisions[0],
    rankingRevision: input.rankingRevision,
    orderedCandidates: orderedCandidates.map(({ candidate, finalScore, rank }) => ({
      rank,
      canonicalId: candidate.canonicalId,
      candidateOrdinal: candidate.candidateOrdinal,
      packetKey: candidate.packetKey,
      sourceRevision: candidate.sourceRevision,
      finalScore,
    })),
  });

  return CandidateManifestV1Schema.parse({
    schema: CANDIDATE_MANIFEST_SCHEMA,
    requestId: input.requestId,
    workspaceRevision: workspaceRevisions[0],
    candidateSnapshotRevision: snapshotRevisions[0],
    rankingRevision: input.rankingRevision,
    candidateSetChecksum,
    rowCount: orderedCandidates.length,
    orderedCandidates,
    canonicalAuthority: false,
  });
}

export function encodeCandidateCursorV1(cursor: CandidateCursorV1): string {
  const parsed = CandidateCursorV1Schema.parse(cursor);
  return Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64url');
}

export function decodeCandidateCursorV1(encoded: string): CandidateCursorV1 {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new Error('CANDIDATE_CURSOR_INVALID_ENCODING');
  }
  return CandidateCursorV1Schema.parse(value);
}

export function paginateCandidateManifestV1(input: {
  manifest: CandidateManifestV1;
  pageSize: number;
  cursor?: string | null;
}): {
  rows: RankedCandidateV1[];
  nextCursor: string | null;
  candidateSetChecksum: string;
  rankingRevision: string;
} {
  const manifest = CandidateManifestV1Schema.parse(input.manifest);
  const pageSize = z.number().int().positive().max(500).parse(input.pageSize);
  let startRank = 0;

  if (input.cursor) {
    const cursor = decodeCandidateCursorV1(input.cursor);
    if (cursor.candidateSetChecksum !== manifest.candidateSetChecksum) throw new Error('CANDIDATE_CURSOR_CANDIDATE_SET_MISMATCH');
    if (cursor.rankingRevision !== manifest.rankingRevision) throw new Error('CANDIDATE_CURSOR_RANKING_REVISION_MISMATCH');
    if (cursor.candidateSnapshotRevision !== manifest.candidateSnapshotRevision) throw new Error('CANDIDATE_CURSOR_SNAPSHOT_REVISION_MISMATCH');
    const last = manifest.orderedCandidates[cursor.lastRank];
    if (!last) throw new Error('CANDIDATE_CURSOR_LAST_RANK_OUT_OF_RANGE');
    if (last.finalScore !== cursor.lastScore || last.candidate.canonicalId !== cursor.lastCanonicalId) {
      throw new Error('CANDIDATE_CURSOR_LAST_ROW_MISMATCH');
    }
    startRank = cursor.lastRank + 1;
  }

  const rows = manifest.orderedCandidates.slice(startRank, startRank + pageSize);
  const last = rows.at(-1) ?? null;
  const hasMore = last !== null && last.rank + 1 < manifest.rowCount;
  const nextCursor = hasMore
    ? encodeCandidateCursorV1({
      schema: CANDIDATE_CURSOR_SCHEMA,
      candidateSetChecksum: manifest.candidateSetChecksum,
      rankingRevision: manifest.rankingRevision,
      candidateSnapshotRevision: manifest.candidateSnapshotRevision,
      lastRank: last.rank,
      lastScore: last.finalScore,
      lastCanonicalId: last.candidate.canonicalId,
    })
    : null;

  return {
    rows,
    nextCursor,
    candidateSetChecksum: manifest.candidateSetChecksum,
    rankingRevision: manifest.rankingRevision,
  };
}

export const CANDIDATE_MANIFEST_V1_INVARIANTS = Object.freeze({
  paginationStage: 'AFTER_RERANK',
  mutableOffsetPagination: false,
  cursorBindsCandidateSetChecksum: true,
  cursorBindsRankingRevision: true,
  cursorBindsCandidateSnapshotRevision: true,
  manifestAuthority: 'DERIVED_READ_MODEL',
  canonicalAuthority: false,
});
