import { readCodeEvidenceLedgerEntry } from '$lib/server/analysis/code-evidence-readback.js';
import {
  codeEvidencePersistedEventSchema,
  type CodeEvidencePersistedEventV1,
} from './integration-events.js';

export function parseCodeEvidencePersistedEvent(raw: unknown): CodeEvidencePersistedEventV1 {
  return codeEvidencePersistedEventSchema.parse(raw);
}

export async function verifyCodeEvidenceReadback(event: CodeEvidencePersistedEventV1) {
  const readback = await readCodeEvidenceLedgerEntry(event.payload.passKey, {
    sourceRef: event.payload.sourceRef,
    sourceRevision: event.payload.sourceRevision,
    packetKey: event.payload.packetKey,
    schemaRevision: event.payload.schemaRevision,
    producerRevision: event.payload.producerRevision,
    synthesisReceiptHash: event.payload.synthesisReceiptHash,
    posConceptPacketHash: event.payload.posConceptPacketHash,
  });

  if (readback.status !== 'FOUND' || readback.mismatches.length > 0) {
    throw new Error(
      `Code evidence readback mismatch: ${readback.status} ${readback.mismatches.join('; ')}`
    );
  }

  return readback;
}
