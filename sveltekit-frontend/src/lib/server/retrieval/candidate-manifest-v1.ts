import { createHash } from 'node:crypto';

export interface CandidateManifestV1 {
  schema: 'atlas.candidate-manifest.v1';
  requestId: string;
  workspaceRevision: string;
  rankingRevision: string;
  orderedCandidateIds: string[];
  candidateSetChecksum: string;
}

export interface CandidateCursorV1 {
  schema: 'atlas.candidate-cursor.v1';
  candidateSetChecksum: string;
  lastScore: number;
  lastCanonicalChunkId: string;
}

export interface CandidateManifestPageV1 {
  candidateIds: string[];
  nextCursor: string | null;
  hasMore: boolean;
}

const clean = (value: string): string => value.trim();
const checksum = (value: string): string => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

export function buildCandidateManifestV1(input: {
  requestId: string;
  workspaceRevision: string;
  rankingRevision: string;
  orderedCandidateIds: readonly string[];
}): CandidateManifestV1 {
  const requestId = clean(input.requestId);
  const workspaceRevision = clean(input.workspaceRevision);
  const rankingRevision = clean(input.rankingRevision);
  const orderedCandidateIds = input.orderedCandidateIds.map(clean);
  if (!requestId || !workspaceRevision || !rankingRevision) throw new Error('CandidateManifestV1 requires request, workspace, and ranking revisions');
  if (orderedCandidateIds.some((id) => !id)) throw new Error('CandidateManifestV1 candidate IDs must be non-empty');
  if (new Set(orderedCandidateIds).size !== orderedCandidateIds.length) throw new Error('CandidateManifestV1 duplicate candidate IDs');
  const canonical = JSON.stringify({ requestId, workspaceRevision, rankingRevision, orderedCandidateIds });
  return { schema: 'atlas.candidate-manifest.v1', requestId, workspaceRevision, rankingRevision, orderedCandidateIds, candidateSetChecksum: checksum(canonical) };
}

export function encodeCandidateCursorV1(cursor: Omit<CandidateCursorV1, 'schema'>): string {
  if (!/^sha256:[0-9a-f]{64}$/i.test(clean(cursor.candidateSetChecksum))) throw new Error('CandidateCursorV1 requires a qualified candidate checksum');
  if (!Number.isFinite(cursor.lastScore) || !clean(cursor.lastCanonicalChunkId)) throw new Error('CandidateCursorV1 requires finite score and canonical chunk ID');
  return Buffer.from(JSON.stringify({ schema: 'atlas.candidate-cursor.v1', ...cursor }), 'utf8').toString('base64url');
}

export function decodeCandidateCursorV1(encoded: string, expectedCandidateSetChecksum?: string): CandidateCursorV1 {
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw new Error('CandidateCursorV1 malformed'); }
  if (!parsed || typeof parsed !== 'object') throw new Error('CandidateCursorV1 malformed');
  const cursor = parsed as Partial<CandidateCursorV1>;
  if (cursor.schema !== 'atlas.candidate-cursor.v1' || typeof cursor.candidateSetChecksum !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(cursor.candidateSetChecksum) || typeof cursor.lastScore !== 'number' || !Number.isFinite(cursor.lastScore) || typeof cursor.lastCanonicalChunkId !== 'string' || !cursor.lastCanonicalChunkId.trim()) throw new Error('CandidateCursorV1 invalid');
  if (expectedCandidateSetChecksum && cursor.candidateSetChecksum.toLowerCase() !== expectedCandidateSetChecksum.trim().toLowerCase()) throw new Error('CandidateCursorV1 candidate set mismatch');
  return { schema: 'atlas.candidate-cursor.v1', candidateSetChecksum: cursor.candidateSetChecksum, lastScore: cursor.lastScore, lastCanonicalChunkId: cursor.lastCanonicalChunkId.trim() };
}

export function sliceCandidateManifestPageV1(
  manifest: CandidateManifestV1,
  candidates: ReadonlyMap<string, { score: number }>,
  pageSize: number,
  encodedCursor?: string | null,
): CandidateManifestPageV1 {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error('CandidateManifestV1 page size must be positive');
  const cursor = encodedCursor ? decodeCandidateCursorV1(encodedCursor, manifest.candidateSetChecksum) : null;
  const missing = manifest.orderedCandidateIds.filter((id) => {
    const candidate = candidates.get(id);
    return candidate === undefined || !Number.isFinite(candidate.score);
  });
  if (missing.length) throw new Error(`CandidateManifestV1 incomplete candidate set: ${missing[0]}`);
  const start = cursor ? manifest.orderedCandidateIds.indexOf(cursor.lastCanonicalChunkId) + 1 : 0;
  if (cursor && start === 0) throw new Error('CandidateCursorV1 last identity is not in candidate manifest');
  const candidateIds = manifest.orderedCandidateIds.slice(start).filter((id) => {
    const candidate = candidates.get(id);
    return candidate !== undefined && Number.isFinite(candidate.score);
  }).slice(0, pageSize);
  const consumed = candidateIds.length;
  const hasMore = manifest.orderedCandidateIds.slice(start).some((id) => candidates.has(id) && Number.isFinite(candidates.get(id)?.score ?? Number.NaN)) && manifest.orderedCandidateIds.slice(start).filter((id) => candidates.has(id) && Number.isFinite(candidates.get(id)?.score ?? Number.NaN)).length > consumed;
  const lastId = candidateIds.at(-1);
  const nextCursor = hasMore && lastId ? encodeCandidateCursorV1({ candidateSetChecksum: manifest.candidateSetChecksum, lastScore: candidates.get(lastId)!.score, lastCanonicalChunkId: lastId }) : null;
  return { candidateIds, nextCursor, hasMore };
}
