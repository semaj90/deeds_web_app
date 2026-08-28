import { createHash } from 'node:crypto';
import type { FanoutEvidenceCandidateV1, FanoutEvidenceItemV1 } from './fanout-evidence-bundle-v1.js';

type AceEnvelopeInput = {
  packet_key: string;
  source_ref: string;
  source_revision: string;
  extraction_method?: string | null;
  summary?: string | null;
  lexical_nouns?: string[];
  lexical_verbs?: string[];
  lexical_adverbs_ly?: string[];
  used_concepts?: string[];
};

function evidenceId(kind: string, sourceRef: string, value: string): string {
  const digest = createHash('sha256').update(`${kind}\0${sourceRef}\0${value}`).digest('hex').slice(0, 24);
  return `ace:${kind.toLowerCase()}:${digest}`;
}

function item(
  kind: FanoutEvidenceItemV1['kind'],
  row: AceEnvelopeInput,
  value: string,
): FanoutEvidenceItemV1 {
  return {
    evidenceId: evidenceId(kind, row.source_ref, value),
    kind,
    sourceRef: row.source_ref,
    sourceRevision: row.source_revision,
    extractorRevision: row.extraction_method ?? 'ace-packet-assembly:unknown',
    text: value,
    startByte: null,
    endByte: null,
    confidence: null,
  };
}

export function aceEnvelopeToFanoutCandidate(
  row: AceEnvelopeInput,
  candidateOrdinal: number,
): FanoutEvidenceCandidateV1 {
  const values: Array<[FanoutEvidenceItemV1['kind'], string]> = [
    ...(row.lexical_nouns ?? []).map((value) => ['LEXICAL' as const, value]),
    ...(row.lexical_verbs ?? []).map((value) => ['LEXICAL' as const, value]),
    ...(row.lexical_adverbs_ly ?? []).map((value) => ['LEXICAL' as const, value]),
    ...(row.used_concepts ?? []).map((value) => ['ONTOLOGY' as const, value]),
  ];
  const evidence = values
    .filter(([, value]) => value.trim().length > 0)
    .map(([kind, value]) => item(kind, row, value));
  return { candidateOrdinal, packetKey: row.packet_key, sourceRef: row.source_ref, sourceRevision: row.source_revision, evidence };
}
