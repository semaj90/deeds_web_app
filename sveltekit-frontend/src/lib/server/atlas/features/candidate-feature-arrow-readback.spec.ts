import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from './candidate-feature-columnar-v1.js';
import {
  assertCandidateFeatureArrowPhysicalSchema,
  buildCandidateFeatureArrowTable,
  serializeCandidateFeatureArrowFile,
} from '../../../../../../scripts/atlas/write-candidate-feature-arrow.mjs';
import { readCandidateFeatureArrowFile } from '../../../../../../scripts/atlas/read-candidate-feature-arrow.mjs';

const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

function fixture() {
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: 'candidate-snapshot:readback:v1',
    workspaceRevision: 'workspace:readback:v1',
    producerRevision: 'readback-test:v1',
    candidates: [
      {
        canonicalId: 'candidate:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:readback:v1',
        sourceRevision: 'source:b:v1',
        graphRevision: 'graph:readback:v1',
        semanticRevision: 'semantic:768:v1',
        degradedIdentity: false,
        evidenceRefs: ['e:b'],
      },
      {
        canonicalId: 'candidate:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:readback:v1',
        sourceRevision: 'source:a:v1',
        graphRevision: 'graph:readback:v1',
        semanticRevision: 'semantic:768:v1',
        degradedIdentity: false,
        evidenceRefs: ['e:a'],
      },
    ],
  });

  const snapshot = materializeCandidateFeatureSnapshot({
    ordinalMap,
    featureRevision: 'features:readback:v1',
    producerRevision: 'readback-test:v1',
    rows: [
      {
        schema: 'atlas.candidate-feature-row.v1',
        candidateOrdinal: 1,
        canonicalId: 'candidate:b',
        packetKey: 'packet:b',
        treeNodeId: 'tree:b',
        symbolVersionId: 'symbol:b',
        workspaceRevision: 'workspace:readback:v1',
        sourceRevision: 'source:b:v1',
        graphRevision: 'graph:readback:v1',
        semanticRevision: 'semantic:768:v1',
        featureRevision: 'features:readback:v1',
        semanticRelevance: 0.25,
        lexicalRelevance: 0,
        astAffinity: null,
        graphAuthority: 0.5,
        personalizedPageRank: null,
        communityAffinity: null,
        manifold4OrientationSimilarity: null,
        crossEncoderRawScore: null,
        crossEncoderCalibratedScore: null,
        crossEncoderAvailable: false,
        domainAffinity: null,
        executionUtility: null,
        memoryUtility: null,
        laneMask: ['semantic', 'lexical', 'graph'],
        degradedIdentity: false,
        evidenceRefs: ['e:b'],
      },
      {
        schema: 'atlas.candidate-feature-row.v1',
        candidateOrdinal: 0,
        canonicalId: 'candidate:a',
        packetKey: 'packet:a',
        treeNodeId: 'tree:a',
        symbolVersionId: 'symbol:a',
        workspaceRevision: 'workspace:readback:v1',
        sourceRevision: 'source:a:v1',
        graphRevision: 'graph:readback:v1',
        semanticRevision: 'semantic:768:v1',
        featureRevision: 'features:readback:v1',
        semanticRelevance: 1,
        lexicalRelevance: null,
        astAffinity: 0.75,
        graphAuthority: null,
        personalizedPageRank: null,
        communityAffinity: null,
        manifold4OrientationSimilarity: null,
        crossEncoderRawScore: null,
        crossEncoderCalibratedScore: null,
        crossEncoderAvailable: false,
        domainAffinity: 0,
        executionUtility: null,
        memoryUtility: 0,
        laneMask: ['semantic', 'ast', 'domain', 'memory'],
        degradedIdentity: false,
        evidenceRefs: ['e:a'],
      },
    ],
  });

  return materializeCandidateFeatureColumnar({
    snapshot,
    producerRevision: 'readback-test:v1',
  });
}

async function writeFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'candidate-feature-readback-'));
  tmpDirs.push(dir);
  const arrowPath = path.join(dir, 'features.arrow');
  const columnar = fixture();
  const serialized = serializeCandidateFeatureArrowFile(columnar, arrowPath);
  await fs.writeFile(arrowPath, serialized.bytes);
  return { dir, arrowPath, columnar, serialized };
}

describe('candidate feature Arrow file readback', () => {
  it('uses explicit plain Utf8 identity columns and byte-identical repeated IPC serialization', () => {
    const columnar = fixture();
    const table = buildCandidateFeatureArrowTable(columnar);
    const physicalSchema = assertCandidateFeatureArrowPhysicalSchema(table);
    const first = serializeCandidateFeatureArrowFile(columnar, 'features.arrow');
    const second = serializeCandidateFeatureArrowFile(columnar, 'features.arrow');

    expect(physicalSchema.dictionaryEncodingUsed).toBe(false);
    expect(physicalSchema.stringEncoding).toBe('UTF8_PLAIN');
    for (const columnName of [
      'canonical_id',
      'packet_key',
      'tree_node_id',
      'symbol_version_id',
      'source_revision',
      'graph_revision',
      'semantic_revision',
    ]) {
      expect(physicalSchema.fields[columnName]).toBe('Utf8');
      expect(physicalSchema.fields[columnName]).not.toMatch(/Dictionary/i);
    }

    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
    expect(first.receipt.checksum).toBe(second.receipt.checksum);
    expect(first.artifact.artifactId).toBe(second.artifact.artifactId);
  });

  it('verifies ArtifactAddress lineage, dense ordinals, identity columns, and selected feature cells from disk', async () => {
    const { columnar, serialized } = await writeFixture();
    const readback = await readCandidateFeatureArrowFile({
      artifact: serialized.artifact,
      expectedColumnar: columnar,
      selectedOrdinals: [1, 0, 1],
      selectedFeatures: ['semanticRelevance', 'lexicalRelevance', 'memoryUtility'],
    });

    expect(readback.receipt.readMode).toBe('NODE_FILE_BYTES_ARROW_IPC');
    expect(readback.receipt.osMmap).toBe(false);
    expect(readback.receipt.denseOrdinalVerified).toBe(true);
    expect(readback.receipt.identityColumnsVerified).toBe(true);
    expect(readback.receipt.selectedFeatureColumnsVerified).toBe(true);
    expect(readback.receipt.ordinalMapChecksum).toBe(columnar.ordinalMapChecksum);
    expect(readback.rows.map((row) => row.candidateOrdinal)).toEqual([1, 0]);
    expect(readback.rows[0]?.canonicalId).toBe('candidate:b');
    expect(readback.rows[1]?.canonicalId).toBe('candidate:a');

    // Row 0 lexical is missing: physical zero plus presence=false.
    expect(readback.rows[1]?.features.lexicalRelevance).toEqual({ value: 0, present: false });
    // Row 0 memory utility is a real zero: physical zero plus presence=true.
    expect(readback.rows[1]?.features.memoryUtility).toEqual({ value: 0, present: true });
  });

  it('fails closed when immutable artifact bytes are corrupted after materialization', async () => {
    const { arrowPath, columnar, serialized } = await writeFixture();
    const bytes = Buffer.from(await fs.readFile(arrowPath));
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    await fs.writeFile(arrowPath, bytes);

    await expect(readCandidateFeatureArrowFile({
      artifact: serialized.artifact,
      expectedColumnar: columnar,
    })).rejects.toThrow('CANDIDATE_FEATURE_ARROW_READBACK_FILE_CHECKSUM_MISMATCH');
  });

  it('fails closed when the revision set is changed without recomputing its identity', async () => {
    const { columnar, serialized } = await writeFixture();
    const tampered = {
      ...serialized.artifact,
      revisions: {
        ...serialized.artifact.revisions,
        candidateSnapshotRevision: 'candidate-snapshot:tampered:v9',
      },
    };
    await expect(readCandidateFeatureArrowFile({
      artifact: tampered,
      expectedColumnar: columnar,
    })).rejects.toThrow('CANDIDATE_FEATURE_ARROW_READBACK_REVISION_SET_HASH_MISMATCH');
  });
});
