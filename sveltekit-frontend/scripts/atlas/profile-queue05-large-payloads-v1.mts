#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const {
  legacyVectorIndexInputSchema,
  vectorArtifactQueueEnvelopeSchema,
  vectorEnvelopeByteLength,
} = await import('../../src/lib/server/queue/vector-artifact-transport-v1.js');
const { measureJsonMessageBytes } = await import(
  '../../src/lib/server/queue/message-size-policy-v1.js'
);

const LIMIT_BYTES = 64 * 1024;
const REPORT_PATH = path.resolve(
  process.cwd(),
  '..',
  'docs',
  'reports',
  'queue-large-payload-profile-v1.json',
);

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function repeatedText(bytes: number): string {
  const seed = 'Parent Atlas queue payload profile — UTF-8 representative text. ';
  let value = '';
  while (Buffer.byteLength(value, 'utf8') < bytes) value += seed;
  return value.slice(0, bytes);
}

const rawDocumentCases = [1024, 16 * 1024, LIMIT_BYTES, 256 * 1024].map((targetBytes) => {
  const payload = {
    documentId: `queue05-profile-document-${targetBytes}`,
    text: repeatedText(targetBytes),
    collection: 'legal_documents',
    metadata: { profile: 'QUEUE-05-PAYLOAD-PROFILE-01', targetBytes },
  };
  const bytes = measureJsonMessageBytes(payload);
  return {
    kind: 'LEGACY_DOCUMENT_EMBED' as const,
    targetBytes,
    actualBytes: bytes,
    exceedsArtifactEnvelopeLimit: bytes > LIMIT_BYTES,
    amplificationRatioAgainstReference: null,
  };
});

const rawVectorCases = [128, 256, 384, 512, 768].map((dimension) => {
  const payload = legacyVectorIndexInputSchema.parse({
    documentId: `queue05-profile-vector-${dimension}`,
    embedding: Array.from({ length: dimension }, (_, index) => ((index % 31) - 15) / 31),
    collection: 'legal_documents',
    metadata: { profile: 'QUEUE-05-PAYLOAD-PROFILE-01', dimension },
  });
  const bytes = measureJsonMessageBytes(payload);
  return {
    kind: 'LEGACY_VECTOR_INDEX' as const,
    dimension,
    actualBytes: bytes,
    exceedsArtifactEnvelopeLimit: bytes > LIMIT_BYTES,
    amplificationRatioAgainstReference: null,
  };
});

const referenceAddress = {
  schema: 'atlas.artifact-address.v1',
  artifactId: 'sha256:queue05-profile-artifact',
  artifactHash: 'a'.repeat(64),
  schemaId: 'atlas.legacy-vector-index-input.v1',
  checksum: 'b'.repeat(64),
  revisionSetHash: 'c'.repeat(64),
  revisions: { transport: 'artifact-ref-v1', producer: 'queue05-profile-v1' },
  locator: {
    storage: 'POSTGRES',
    table: 'workflow_artifacts',
    primaryKey: 'sha256:queue05-profile-artifact',
  },
};

const referenceEnvelope = vectorArtifactQueueEnvelopeSchema.parse({
  schema: 'atlas.vector-index-artifact-envelope.v1',
  documentId: 'queue05-profile-vector-768',
  collection: 'legal_documents',
  artifactRef: referenceAddress,
  producerRevision: 'queue05-profile-v1',
});
const referenceBytes = vectorEnvelopeByteLength(referenceEnvelope);

for (const vectorCase of rawVectorCases) {
  vectorCase.amplificationRatioAgainstReference = Number(
    (vectorCase.actualBytes / referenceBytes).toFixed(3),
  );
}

const normalizedProfile = {
  schema: 'atlas.queue-large-payload-profile.v1',
  policy: {
    artifactEnvelopeLimitBytes: LIMIT_BYTES,
    referenceEnvelopeBytes: referenceBytes,
    source: 'deterministic_representative_payloads',
    liveCapture: false,
    migrationAuthorized: false,
  },
  rawDocumentCases,
  rawVectorCases,
};

const report = {
  ...normalizedProfile,
  capturedAt: new Date().toISOString(),
  profileChecksum: `sha256:${sha256(stableJson(normalizedProfile))}`,
  status: 'QUEUE05_PAYLOAD_PROFILE_REPRESENTATIVE_ONLY',
  livePublisherDistribution: 'NOT_MEASURED',
  legacyPublishersChanged: false,
  canonicalWritesPerformed: false,
  qdrantMutationAttempted: false,
  nextGate: 'QUEUE-05-LIVE-PUBLISHER-PROFILE-01',
  note:
    'This profile exercises existing serialization and reference-envelope helpers with fixed representative payloads. It is not runtime publisher telemetry and does not authorize redirecting legacy publishers.',
};

await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  profileChecksum: report.profileChecksum,
  referenceEnvelopeBytes: referenceBytes,
  reportPath: REPORT_PATH,
  livePublisherDistribution: report.livePublisherDistribution,
  legacyPublishersChanged: report.legacyPublishersChanged,
}, null, 2));
