import type { RevisionTuple } from './policy-types';

export interface PassResult<T = unknown> {
  requestId: string;
  packetKey: string;
  revision: RevisionTuple;
  passName: string;
  payload: T;
}

export interface ReducedCandidate {
  requestId: string;
  packetKey: string;
  revision: RevisionTuple;
  passes: Record<string, unknown>;
  missingPasses: string[];
}

export function revisionKey(revision: RevisionTuple): string {
  return [
    revision.workspaceRevision,
    revision.sourceRevision,
    revision.representationRevision,
    revision.graphRevision ?? '-',
    revision.featureRevision ?? '-',
  ].join('|');
}

export function candidateJoinKey(result: Pick<PassResult, 'requestId' | 'packetKey' | 'revision'>): string {
  return `${result.requestId}|${result.packetKey}|${revisionKey(result.revision)}`;
}

export function reducePassResults(
  results: PassResult[],
  requiredPasses: readonly string[],
): ReducedCandidate[] {
  const grouped = new Map<string, ReducedCandidate>();
  for (const result of results) {
    const key = candidateJoinKey(result);
    const existing = grouped.get(key) ?? {
      requestId: result.requestId,
      packetKey: result.packetKey,
      revision: result.revision,
      passes: {},
      missingPasses: [],
    };
    if (existing.passes[result.passName] !== undefined) {
      throw new Error(`Duplicate pass result for ${key} pass=${result.passName}`);
    }
    existing.passes[result.passName] = result.payload;
    grouped.set(key, existing);
  }

  return [...grouped.values()]
    .map((candidate) => ({
      ...candidate,
      missingPasses: requiredPasses.filter((pass) => candidate.passes[pass] === undefined),
    }))
    .sort((a, b) => a.packetKey.localeCompare(b.packetKey) || revisionKey(a.revision).localeCompare(revisionKey(b.revision)));
}

export function stableRank<T extends { packetKey: string; score: number; authority?: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) =>
    b.score - a.score ||
    (b.authority ?? 0) - (a.authority ?? 0) ||
    a.packetKey.localeCompare(b.packetKey),
  );
}
