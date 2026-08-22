#!/usr/bin/env node
import { loadAtlasEnv } from './lib/load-atlas-env.mjs';

loadAtlasEnv();

const enabled = process.env.ATLAS_QUEUE05_VECTOR_ARTIFACT_PROOF === '1';
if (process.env.NODE_ENV === 'production') {
  console.error(JSON.stringify({ status: 'BLOCKED_PRODUCTION_ENVIRONMENT' }, null, 2));
  process.exit(2);
}

const {
  materializeVectorArtifactQueueEnvelope,
  resolveVectorArtifactQueueEnvelope,
  isReferenceOnlyVectorEnvelope,
  vectorEnvelopeByteLength,
} = await import('../../src/lib/server/queue/vector-artifact-transport-v1.js');

if (!enabled) {
  console.log(JSON.stringify({
    status: 'READY_APPLY_DISABLED',
    requiredEnv: 'ATLAS_QUEUE05_VECTOR_ARTIFACT_PROOF=1',
    canonicalWriteAttempted: false,
    qdrantMutationAttempted: false,
  }, null, 2));
  process.exit(0);
}

const proofId = `queue05-proof-${Date.now()}`;
const embedding = Array.from({ length: 768 }, (_, i) => ((i % 31) - 15) / 31);
const rawBytes = Buffer.byteLength(JSON.stringify({
  documentId: proofId,
  embedding,
  collection: 'legal_documents',
  metadata: { proofId },
}), 'utf8');

const envelope = await materializeVectorArtifactQueueEnvelope(
  {
    documentId: proofId,
    embedding,
    collection: 'legal_documents',
    metadata: { proofId, evidenceKind: 'queue05-proof' },
  },
  { producerRevision: 'queue05-vector-artifact-bridge-proof-v1' },
);

if (!isReferenceOnlyVectorEnvelope(envelope)) {
  throw new Error('QUEUE05 proof envelope contains inline vector payload');
}

const payload = await resolveVectorArtifactQueueEnvelope(envelope);
if (payload.documentId !== proofId) throw new Error('QUEUE05 artifact document readback mismatch');
if (payload.embedding.length !== 768) throw new Error('QUEUE05 artifact dimension mismatch');
if (payload.embedding.some((value, i) => value !== embedding[i])) {
  throw new Error('QUEUE05 artifact vector readback mismatch');
}

const envelopeBytes = vectorEnvelopeByteLength(envelope);
if (envelopeBytes >= rawBytes) {
  throw new Error(`QUEUE05 reference envelope did not reduce transport bytes: raw=${rawBytes} envelope=${envelopeBytes}`);
}

console.log(JSON.stringify({
  status: 'QUEUE05_VECTOR_ARTIFACT_BRIDGE_PROVEN',
  proofId,
  dimension: embedding.length,
  artifactId: envelope.artifactRef.artifactId,
  artifactChecksum: envelope.artifactRef.checksum,
  revisionSetHash: envelope.artifactRef.revisionSetHash,
  referenceOnlyEnvelope: true,
  checksumReadbackVerified: true,
  rawEnvelopeBytes: rawBytes,
  referenceEnvelopeBytes: envelopeBytes,
  transportByteReduction: rawBytes - envelopeBytes,
  qdrantMutationAttempted: false,
  producerConsumerWiringProven: false,
  note: 'This proves the compatibility bridge and artifact readback. The two legacy raw-vector call sites remain to be switched before QUEUE-05 can close.',
}, null, 2));
