import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { resolve } from 'node:path';

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { materializeCandidateOrdinalMap } from './canonical-candidate-v1.js';
import { materializeCandidateFeatureSnapshot } from './candidate-feature-snapshot-v1.js';
import { materializeCandidateFeatureColumnar } from './candidate-feature-columnar-v1.js';
type ArrowWriter = (input: unknown, outputPath?: string) => {
  bytes: Uint8Array;
  artifact: Record<string, unknown>;
  receipt: Record<string, unknown>;
};
type ArrowReader = (input: Record<string, unknown>) => Promise<Record<string, unknown>>;

let serializeCandidateFeatureArrowFile: ArrowWriter;
let readCandidateFeatureArrowFile: ArrowReader;

beforeAll(async () => {
  const require = createRequire(import.meta.url);
  const writer = require('../../../../../../scripts/atlas/write-candidate-feature-arrow.mjs') as Record<string, unknown>;
  const reader = require('../../../../../../scripts/atlas/read-candidate-feature-arrow.mjs') as Record<string, unknown>;
  serializeCandidateFeatureArrowFile = writer.serializeCandidateFeatureArrowFile as ArrowWriter;
  readCandidateFeatureArrowFile = reader.readCandidateFeatureArrowFile as ArrowReader;
});

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

  it('proves read-only Python OS-mmap Arrow parity against the same frozen fixture', async () => {
    const { dir, arrowPath, columnar, serialized } = await writeFixture();
    const artifactPath = path.join(dir, 'artifact.json');
    const expectedPath = path.join(dir, 'expected-columnar.json');
    await fs.writeFile(artifactPath, JSON.stringify({ ...serialized.artifact, locator: { storage: 'ARROW_IPC', path: arrowPath } }));
    await fs.writeFile(expectedPath, JSON.stringify(columnar));

    const repoRoot = resolve(process.cwd(), '..');
    const scriptPath = resolve(repoRoot, 'scripts/atlas/prove-candidate-feature-arrow-mmap.py');
    const configuredPython = process.env.ATLAS_PYTHON_EXECUTABLE;
    const python = configuredPython ?? (process.platform === 'win32' ? 'py' : 'python3');
    const args = configuredPython
      ? [scriptPath, `--artifact=${artifactPath}`, `--expected=${expectedPath}`, '--features=semanticRelevance,lexicalRelevance,memoryUtility', '--ordinals=1,0']
      : process.platform === 'win32'
        ? ['-3.13', scriptPath, `--artifact=${artifactPath}`, `--expected=${expectedPath}`, '--features=semanticRelevance,lexicalRelevance,memoryUtility', '--ordinals=1,0']
        : [scriptPath, `--artifact=${artifactPath}`, `--expected=${expectedPath}`, '--features=semanticRelevance,lexicalRelevance,memoryUtility', '--ordinals=1,0'];
    const result = spawnSync(python, args, { cwd: repoRoot, encoding: 'utf8', timeout: 30000 });

    expect(result.error?.message).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const receipt = JSON.parse(result.stdout) as {
      status: string;
      osMmap: boolean;
      mmapAccess: string;
      arrowReadbackProven: boolean;
      expectedColumnarVerified: boolean;
      ordinalMapChecksum: string;
      selectedRows: Array<{ candidateOrdinal: number; canonicalId: string; features: Record<string, { value: number; present: boolean }> }>;
    };
    expect(receipt).toMatchObject({
      status: 'CANDIDATE_FEATURE_ARROW_MMAP_PROVEN',
      osMmap: true,
      mmapAccess: 'READ_ONLY',
      arrowReadbackProven: true,
      arrowReadMode: 'PYARROW_READ_ONLY_MMAP',
      expectedColumnarVerified: true,
      ordinalMapChecksum: columnar.ordinalMapChecksum,
    });
    expect(receipt.selectedRows).toEqual([
      {
        candidateOrdinal: 1,
        canonicalId: 'candidate:b',
        features: {
          semanticRelevance: { value: 0.25, present: true },
          lexicalRelevance: { value: 0, present: true },
          memoryUtility: { value: 0, present: false },
        },
      },
      {
        candidateOrdinal: 0,
        canonicalId: 'candidate:a',
        features: {
          semanticRelevance: { value: 1, present: true },
          lexicalRelevance: { value: 0, present: false },
          memoryUtility: { value: 0, present: true },
        },
      },
    ]);
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
