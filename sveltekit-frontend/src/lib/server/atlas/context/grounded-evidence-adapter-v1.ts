import { createHash } from 'node:crypto';
import type { FanoutEvidenceItemV1 } from './fanout-evidence-bundle-v1.js';

type GroundedEvidenceInput = {
  evidenceId: string;
  kind: Extract<FanoutEvidenceItemV1['kind'], 'STRUCTURAL' | 'COMPILER' | 'ONTOLOGY'>;
  sourceRef: string;
  sourceRevision: string;
  extractorRevision: string;
  extractionText: string;
  startByte: number;
  endByte: number;
  sourceBytes: Uint8Array;
  confidence?: number | null;
};

export function buildGroundedEvidenceItemV1(input: GroundedEvidenceInput): FanoutEvidenceItemV1 {
  if (input.endByte < input.startByte) throw new Error('GROUNDED_EVIDENCE_INVALID_RANGE');
  const sourceText = Buffer.from(input.sourceBytes).subarray(input.startByte, input.endByte).toString('utf8');
  if (sourceText !== input.extractionText) throw new Error('GROUNDED_EVIDENCE_SOURCE_SLICE_MISMATCH');
  if (input.extractionText.length === 0) throw new Error('GROUNDED_EVIDENCE_EMPTY_TEXT');
  const evidenceId = input.evidenceId || `grounded:${createHash('sha256').update(`${input.sourceRef}\0${input.startByte}\0${input.endByte}\0${input.extractionText}`).digest('hex').slice(0, 24)}`;
  return {
    evidenceId,
    kind: input.kind,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    extractorRevision: input.extractorRevision,
    text: input.extractionText,
    startByte: input.startByte,
    endByte: input.endByte,
    confidence: input.confidence ?? null,
  };
}
