#!/usr/bin/env node

import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const { inspectArtifactTransportReadiness } = await import(
  '../../src/lib/server/queue/artifact-transport-readiness-v1.js'
);
const { closeConnections } = await import('../../src/lib/server/db/client.js');

try {
  const readiness = await inspectArtifactTransportReadiness();
  const proof = {
    schema: 'atlas.artifact-transport-readiness-proof.v1',
    observedAt: new Date().toISOString(),
    readOnly: true,
    canonicalWriteAttempted: false,
    readiness,
    status: readiness.ready ? 'ARTIFACT_TRANSPORT_STORE_READY' : 'ARTIFACT_TRANSPORT_STORE_BLOCKED',
  };

  console.log(JSON.stringify(proof, null, 2));

  if (!readiness.ready) {
    process.exitCode = 2;
  }
} finally {
  await closeConnections();
}
