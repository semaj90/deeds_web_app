import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';
import {
  CandidateFeatureRowV1Schema,
  type CandidateFeatureRowV1,
} from './candidate-feature-row-v1.js';
import {
  materializeCandidateFeatureSnapshot,
  type CandidateFeatureSnapshotV1,
} from './candidate-feature-snapshot-v1.js';
import {
  LexicalFingerprintV1Schema,
  type LexicalFingerprintV1,
} from '../agentic-file-compiler/lexical-fingerprint-v1.js';
import {
  QueryFingerprintV1Schema,
  type QueryFingerprintV1,
} from '../agentic-file-compiler/query-fingerprint-v1.js';

/**
 * Joins request-scoped and candidate-scoped lexical observations into the
 * existing feature snapshot. It never creates identity, ordinals, scores, or
 * retrieval votes; all identity and revision checks remain with the existing
 * CandidateFeatureSnapshotV1 materializer.
 */
export function materializeQueryFeaturesIntoCandidateSnapshotV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly z.input<typeof CandidateFeatureRowV1Schema>[];
  queryFingerprint: z.input<typeof QueryFingerprintV1Schema>;
  lexicalFingerprintsByOrdinal: Readonly<Record<string, z.input<typeof LexicalFingerprintV1Schema>>>;
  lexicalFeatureRevision: string;
  featureRevision: string;
  producerRevision: string;
}): {
  snapshot: CandidateFeatureSnapshotV1;
  candidateOrdinals: number[];
  queryFingerprintChecksum: string;
  lexicalFeatureRevision: string;
  canonicalAuthority: false;
  writesPerformed: false;
} {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const queryFingerprint = QueryFingerprintV1Schema.parse(input.queryFingerprint);
  const rows = input.rows.map((row) => CandidateFeatureRowV1Schema.parse(row));
  if (!input.lexicalFeatureRevision.trim()) throw new Error('QUERY_FEATURE_LEXICAL_REVISION_REQUIRED');

  const ordinals = new Set(ordinalMap.candidates.map((candidate) => candidate.candidateOrdinal));
  for (const key of Object.keys(input.lexicalFingerprintsByOrdinal)) {
    const ordinal = Number(key);
    if (!Number.isInteger(ordinal) || !ordinals.has(ordinal)) {
      throw new Error(`QUERY_FEATURE_EXTRA_ORDINAL:${key}`);
    }
  }

  const joinedRows: CandidateFeatureRowV1[] = rows.map((row) => {
    const candidate = ordinalMap.candidates[row.candidateOrdinal];
    if (!candidate) throw new Error(`QUERY_FEATURE_ORDINAL_NOT_IN_MAP:${row.candidateOrdinal}`);
    const lexicalInput = input.lexicalFingerprintsByOrdinal[String(row.candidateOrdinal)];
    if (!lexicalInput) throw new Error(`QUERY_FEATURE_LEXICAL_MISSING:${row.candidateOrdinal}`);
    const lexical = LexicalFingerprintV1Schema.parse(lexicalInput);
    if (lexical.lexicalFeatureRevision !== input.lexicalFeatureRevision) {
      throw new Error(`QUERY_FEATURE_LEXICAL_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }
    if (lexical.candidateRef !== candidate.canonicalId) {
      throw new Error(`QUERY_FEATURE_CANDIDATE_REF_MISMATCH:${row.candidateOrdinal}`);
    }
    if (lexical.sourceRef !== candidate.sourceRef) {
      throw new Error(`QUERY_FEATURE_SOURCE_REF_MISMATCH:${row.candidateOrdinal}`);
    }
    if (lexical.sourceRevision !== candidate.sourceRevision) {
      throw new Error(`QUERY_FEATURE_SOURCE_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }
    if (lexical.workspaceRevision !== candidate.workspaceRevision) {
      throw new Error(`QUERY_FEATURE_WORKSPACE_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }
    return {
      ...row,
      evidenceRefs: [...new Set([
        ...row.evidenceRefs,
        `query-fingerprint:${queryFingerprint.checksum}`,
        `lexical-fingerprint:${lexical.checksum}`,
      ])].sort(),
    };
  });

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows: joinedRows,
    featureRevision: input.featureRevision,
    producerRevision: input.producerRevision,
  });
  return {
    snapshot,
    candidateOrdinals: snapshot.rows.map((row) => row.candidateOrdinal),
    queryFingerprintChecksum: queryFingerprint.checksum,
    lexicalFeatureRevision: input.lexicalFeatureRevision,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
