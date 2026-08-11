import { describe, expect, it } from 'vitest';
import { buildTelemetryBreadthV1 } from './telemetry-breadth-contract.js';

describe('telemetry-breadth contract', () => {
  it('keeps breadth telemetry separate from policy and identity truth', () => {
    const first = buildTelemetryBreadthV1({
      packetKey: 'packet:telemetry-1',
      sourceRef: 'src/lib/server/example.ts',
      sourceRevision: 'source:v1',
      representationRevision: 'semantic_768@v1',
      producerId: 'telemetry-breadth-lane',
      producerRevision: 'lane:v1',
      featureRevision: 'telemetry-features:v1',
      telemetryRevision: 'telemetry-breadth:v1',
      windowStartedAt: '2026-08-11T00:00:00.000Z',
      countedAt: '2026-08-11T00:05:00.000Z',
      hllKeys: {
        workflowHllKey: 'hll:workflow:1',
        symbolHllKey: 'hll:symbol:1',
        sessionHllKey: 'hll:session:1',
        userHllKey: 'hll:user:1',
        neighborhoodHllKey: 'hll:neighborhood:1',
        processHllKey: 'hll:process:1',
      },
      estimates: {
        workflowBreadth: 4,
        symbolBreadth: 12,
        sessionBreadth: 2,
        userBreadth: 1,
        neighborhoodBreadth: 5,
        processBreadth: 3,
      },
      inputDigest: 'input:sha256:111',
      outputDigest: 'output:sha256:222',
    });

    const second = buildTelemetryBreadthV1({
      packetKey: first.packetKey,
      sourceRef: first.sourceRef,
      sourceRevision: first.sourceRevision,
      representationRevision: first.representationRevision,
      producerId: first.producerId,
      producerRevision: first.producerRevision,
      featureRevision: first.featureRevision,
      telemetryRevision: first.telemetryRevision,
      windowStartedAt: first.windowStartedAt,
      countedAt: first.countedAt,
      inputDigest: 'input:sha256:111',
      outputDigest: 'output:sha256:222',
      hllKeys: first.hllKeys,
      estimates: {
        ...first.estimates,
        workflowBreadth: first.estimates.workflowBreadth + 1,
      },
    });

    expect(first.schemaVersion).toBe('atlas.telemetry-breadth.v1');
    expect(first.representationId).toBe('semantic_768');
    expect(first.breadthId).not.toBe(second.breadthId);
    expect(first.provenance.sourceRevision).toBe('source:v1');
    expect(first.estimates.userBreadth).toBe(1);
  });
});
