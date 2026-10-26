import { describe, expect, it } from 'vitest';
import { createLiveSourceFetchPortV1, LiveSourceFetchPortV1 } from './live-source-fetch-port-v1.js';
import {
  resolveTopKEvidenceV1,
  sourceRevisionOfBytes,
  type CandidateSourceSpanV1,
} from './topk-evidence-fetch-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';

describe('LiveSourceFetchPortV1', () => {
  it('reads valid workspace files within repository boundaries', () => {
    const port = createLiveSourceFetchPortV1();
    const bytes = port.readBytes('package.json');
    expect(bytes).not.toBeNull();
    expect(bytes!.length).toBeGreaterThan(0);

    const text = new TextDecoder('utf-8').decode(bytes!);
    expect(text).toContain('"name"');
  });

  it('rejects unsafe directory traversal and absolute path references', () => {
    const port = createLiveSourceFetchPortV1();
    expect(port.readBytes('../../../Windows/System32/drivers/etc/hosts')).toBeNull();
    expect(port.readBytes('foo/../../bar')).toBeNull();
    expect(port.readBytes('foo\0bar.ts')).toBeNull();
    expect(port.readBytes('C:/Windows/System32/cmd.exe')).toBeNull();
    expect(port.readBytes('/etc/passwd')).toBeNull();
  });

  it('returns null for missing files without throwing', () => {
    const port = createLiveSourceFetchPortV1();
    expect(port.readBytes('non/existent/path/never_created_12345.ts')).toBeNull();
  });

  it('qualifies live source bytes and exact spans end-to-end with resolveTopKEvidenceV1', () => {
    const portInstance = new LiveSourceFetchPortV1({
      spanResolver: (candidate) => {
        if (candidate.canonicalId === 'canon:live-app-d-ts') {
          return {
            sourceRef: 'src/app.d.ts',
            unit: 'bytes',
            start: 0,
            end: 30,
          };
        }
        return null;
      },
    });

    const fileBytes = portInstance.readBytes('src/app.d.ts');
    expect(fileBytes).not.toBeNull();
    const liveRevision = sourceRevisionOfBytes(fileBytes!);

    const map = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'candidate:live:v1',
      workspaceRevision: 'workspace:live:v1',
      producerRevision: 'producer:live:v1',
      candidates: [
        {
          canonicalId: 'canon:live-app-d-ts',
          packetKey: 'packet:live-1',
          sourceRef: 'src/app.d.ts',
          treeNodeId: 'tree:live-1',
          symbolVersionId: 'symbol:live-1',
          workspaceRevision: 'workspace:live:v1',
          sourceRevision: liveRevision,
          graphRevision: 'graph:live:v1',
          semanticRevision: 'semantic:768:v1',
          degradedIdentity: false,
          evidenceRefs: ['proof:live:1'],
        },
      ],
    });

    const result = resolveTopKEvidenceV1({
      ordinalMap: map,
      selected: [{ canonicalId: 'canon:live-app-d-ts', ordinal: 0, score: 0.95, rank: 1 }],
      port: portInstance,
    });

    expect(result.rejected).toHaveLength(0);
    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].qualification).toBe('QUALIFIED');
    expect(result.qualified[0].canonicalId).toBe('canon:live-app-d-ts');
    expect(result.qualified[0].sourceRevision).toBe(liveRevision);
    expect(result.qualified[0].byteStart).toBe(0);
    expect(result.qualified[0].byteEnd).toBe(30);
    expect(result.qualified[0].text.length).toBe(30);
  });

  it('correctly rejects candidates when file on disk has mutated (stale revision)', () => {
    const portInstance = new LiveSourceFetchPortV1({
      spanResolver: () => ({
        sourceRef: 'src/app.d.ts',
        unit: 'bytes',
        start: 0,
        end: 30,
      }),
    });

    const staleRevision = 'sha256:' + '0'.repeat(64);

    const map = materializeCandidateOrdinalMap({
      candidateSnapshotRevision: 'candidate:stale:v1',
      workspaceRevision: 'workspace:stale:v1',
      producerRevision: 'producer:stale:v1',
      candidates: [
        {
          canonicalId: 'canon:stale-app-d-ts',
          packetKey: 'packet:stale-1',
          sourceRef: 'src/app.d.ts',
          treeNodeId: 'tree:stale-1',
          symbolVersionId: 'symbol:stale-1',
          workspaceRevision: 'workspace:stale:v1',
          sourceRevision: staleRevision,
          graphRevision: 'graph:stale:v1',
          semanticRevision: 'semantic:768:v1',
          degradedIdentity: false,
          evidenceRefs: ['proof:stale:1'],
        },
      ],
    });

    const result = resolveTopKEvidenceV1({
      ordinalMap: map,
      selected: [{ canonicalId: 'canon:stale-app-d-ts', ordinal: 0, score: 0.95, rank: 1 }],
      port: portInstance,
    });

    expect(result.qualified).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0].reason).toBe('SOURCE_REVISION_STALE');
  });
});
