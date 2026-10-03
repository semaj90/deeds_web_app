import { createHash } from 'node:crypto';
import { EvidenceTupleV1Schema, type EvidenceTupleV1 } from './evidence-tuple-v1.js';

export type EvidenceTupleSourceReaderV1 = (sourcePath: string) => Promise<Uint8Array | null>;

export interface EvidenceTupleKagQueryV1 {
  subject?: string;
  predicate?: string;
  object?: string;
  limit?: number;
  maxCandidates?: number;
}

export interface EvidenceTupleKagHitV1 {
  tuple: EvidenceTupleV1;
  evidenceText: string;
  resolvedSpanSha256: string;
}

export interface EvidenceTupleKagSearchResultV1 {
  schema: 'atlas.evidence-tuple-kag-search.v1';
  canonicalAuthority: false;
  writesPerformed: false;
  indexedTupleCount: number;
  candidateCount: number;
  scannedCount: number;
  truncated: boolean;
  hits: EvidenceTupleKagHitV1[];
  rejected: Array<{
    eventId: string;
    reason: 'SOURCE_MISSING' | 'SOURCE_READ_FAILED' | 'BYTE_RANGE_INVALID' | 'RAW_HASH_MISMATCH' | 'SPAN_NOT_UTF8';
  }>;
  checksum: string;
}

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const sha256 = (bytes: Uint8Array): string => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const exactKey = (field: string, value: string): string => `${field}\u0000${value}`;

/**
 * Builds an ephemeral exact-match lookup over already-created evidence tuples.
 * It is a derived lookup structure only: no persistence, ontology promotion,
 * source-path interpretation, or authority transfer occurs here.
 */
export function createEvidenceTupleKagIndexV1(input: readonly EvidenceTupleV1[]) {
  const unique = new Map<string, EvidenceTupleV1>();
  for (const candidate of input) {
    const tuple = EvidenceTupleV1Schema.parse(candidate);
    const prior = unique.get(tuple.event_id);
    if (prior && JSON.stringify(prior) !== JSON.stringify(tuple)) {
      throw new Error('EVIDENCE_TUPLE_EVENT_ID_COLLISION');
    }
    unique.set(tuple.event_id, tuple);
  }

  const tuples = [...unique.values()].sort((a, b) => compare(a.event_id, b.event_id));
  const byField = new Map<string, EvidenceTupleV1[]>();
  for (const tuple of tuples) {
    for (const [field, value] of [['subject', tuple.subject], ['predicate', tuple.predicate], ['object', tuple.object]] as const) {
      const key = exactKey(field, value);
      const entries = byField.get(key) ?? [];
      entries.push(tuple);
      byField.set(key, entries);
    }
  }

  return {
    tupleCount: tuples.length,
    indexChecksum: sha256(new TextEncoder().encode(tuples.map((tuple) => tuple.event_id).join('\n'))),

    async search(query: EvidenceTupleKagQueryV1, readSource: EvidenceTupleSourceReaderV1): Promise<EvidenceTupleKagSearchResultV1> {
      const clauses = (['subject', 'predicate', 'object'] as const)
        .flatMap((field) => query[field] === undefined ? [] : [{ field, value: query[field]!.trim() }]);
      if (clauses.length === 0 || clauses.some((clause) => clause.value.length === 0)) {
        throw new Error('EVIDENCE_TUPLE_KAG_QUERY_REQUIRED');
      }
      const limit = query.limit ?? 20;
      const maxCandidates = query.maxCandidates ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('EVIDENCE_TUPLE_KAG_LIMIT_INVALID');
      if (!Number.isInteger(maxCandidates) || maxCandidates < limit || maxCandidates > 500) {
        throw new Error('EVIDENCE_TUPLE_KAG_MAX_CANDIDATES_INVALID');
      }

      const lists = clauses.map(({ field, value }) => byField.get(exactKey(field, value)) ?? []);
      lists.sort((a, b) => a.length - b.length);
      const smallest = lists[0] ?? [];
      const remainingMembership = lists.slice(1).map((list) => new Set(list.map((tuple) => tuple.event_id)));
      const candidates = smallest.filter((tuple) => remainingMembership.every((members) => members.has(tuple.event_id)));
      const bounded = candidates.slice(0, maxCandidates);
      const hits: EvidenceTupleKagHitV1[] = [];
      const rejected: EvidenceTupleKagSearchResultV1['rejected'] = [];
      let scannedCount = 0;

      for (const tuple of bounded) {
        scannedCount += 1;
        let source: Uint8Array | null;
        try {
          source = await readSource(tuple.source_path);
        } catch {
          rejected.push({ eventId: tuple.event_id, reason: 'SOURCE_READ_FAILED' });
          continue;
        }
        if (source === null) {
          rejected.push({ eventId: tuple.event_id, reason: 'SOURCE_MISSING' });
          continue;
        }
        if (tuple.byte_end > source.byteLength) {
          rejected.push({ eventId: tuple.event_id, reason: 'BYTE_RANGE_INVALID' });
          continue;
        }
        const span = source.subarray(tuple.byte_start, tuple.byte_end);
        const resolvedSpanSha256 = sha256(span);
        if (resolvedSpanSha256 !== tuple.raw_sha256) {
          rejected.push({ eventId: tuple.event_id, reason: 'RAW_HASH_MISMATCH' });
          continue;
        }
        let evidenceText: string;
        try {
          evidenceText = new TextDecoder('utf-8', { fatal: true }).decode(span);
        } catch {
          rejected.push({ eventId: tuple.event_id, reason: 'SPAN_NOT_UTF8' });
          continue;
        }
        hits.push({ tuple, evidenceText, resolvedSpanSha256 });
        if (hits.length >= limit) break;
      }

      const body = {
        schema: 'atlas.evidence-tuple-kag-search.v1' as const,
        canonicalAuthority: false as const,
        writesPerformed: false as const,
        indexedTupleCount: tuples.length,
        candidateCount: candidates.length,
        scannedCount,
        truncated: scannedCount < candidates.length,
        hits,
        rejected: rejected.sort((a, b) => compare(a.eventId, b.eventId)),
      };
      return { ...body, checksum: sha256(new TextEncoder().encode(JSON.stringify(body))) };
    },
  };
}
