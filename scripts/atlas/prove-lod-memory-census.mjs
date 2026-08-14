#!/usr/bin/env node

import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index];
  if (!value.startsWith('--')) continue;
  const [key, inline] = value.slice(2).split('=', 2);
  args.set(key, inline ?? process.argv[index + 1] ?? true);
  if (inline === undefined && process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) index += 1;
}

const reportPath = path.resolve(repoRoot, String(args.get('report') ?? 'docs/reports/lod-memory-census.json'));
const snapshotPath = args.get('snapshot') ? path.resolve(repoRoot, String(args.get('snapshot'))) : null;
const indexPath = args.get('index') ? path.resolve(repoRoot, String(args.get('index'))) : null;
const turbovecRoot = args.get('turbovec-root') ? path.resolve(repoRoot, String(args.get('turbovec-root'))) : null;

async function fileMeasurement(filePath) {
  if (!filePath) return { status: 'NOT_CONFIGURED', bytes: null };
  try {
    const details = await stat(filePath);
    if (details.isDirectory()) {
      let bytes = 0;
      let files = 0;
      const entries = await readdir(filePath, { withFileTypes: true });
      for (const entry of entries) {
        const child = await fileMeasurement(path.join(filePath, entry.name));
        if (child.status === 'MEASURED' && child.bytes !== null) {
          bytes += child.bytes;
          files += child.files ?? 1;
        }
      }
      return {
        status: 'MEASURED',
        path: path.relative(repoRoot, filePath),
        bytes,
        files,
        kind: 'directory',
      };
    }
    return {
      status: 'MEASURED',
      path: path.relative(repoRoot, filePath),
      bytes: details.isFile() ? details.size : null,
      files: 1,
      kind: 'file',
    };
  } catch (error) {
    return {
      status: 'UNAVAILABLE',
      path: path.relative(repoRoot, filePath),
      bytes: null,
      reason: error instanceof Error ? error.code ?? error.message : String(error),
    };
  }
}

const memory = process.memoryUsage();
const snapshot = await fileMeasurement(snapshotPath);
const index = await fileMeasurement(indexPath);
const report = {
  schema: 'atlas.lod-memory-census.v1',
  status: 'PARTIAL_NOT_MEASURED',
  generatedAt: new Date().toISOString(),
  workspaceRevision: process.env.ATLAS_WORKSPACE_REVISION ?? null,
  representationRevision: process.env.ATLAS_REPRESENTATION_REVISION ?? null,
  measurementMode: 'READ_ONLY_LOCAL_PROCESS_AND_ARTIFACT_METADATA',
  process: {
    owner: 'lod-census-node-process',
    rssBytes: memory.rss,
    heapUsedBytes: memory.heapUsed,
    externalBytes: memory.external,
    arrayBuffersBytes: memory.arrayBuffers,
  },
  artifacts: {
    semanticSnapshot: snapshot,
    compressedIndex: index,
    turbovecSourceRoot: await fileMeasurement(turbovecRoot),
  },
  measurements: {
    canonicalFp32CorpusBytes: snapshot.bytes,
    compressedTurboVecBytes: index.bytes,
    compressionRatio: snapshot.bytes && index.bytes ? snapshot.bytes / index.bytes : null,
    pythonTurboVecRssBytes: null,
    rustTurboVecRssBytes: null,
    arrowVirtualBytes: snapshot.bytes,
    arrowResidentBytes: null,
    qdrantMemoryBytes: null,
    valkeyMemoryBytes: null,
    gpuVramBytes: null,
    ordinalMapBytes: null,
  },
  gates: {
    'LOD-MEMORY-COMPRESSION-PROVEN': 'NOT_PROVEN',
    'LOD-PROCESS-WORKING-SET-PROVEN': 'NOT_PROVEN',
  },
  gaps: [
    'Run against a frozen SemanticSnapshotV1 and a measured TurboVec artifact.',
    'Collect owner-process RSS separately; this process RSS is not TurboVec RSS.',
    'Collect Arrow/mmap resident pages, Qdrant, Valkey, GPU VRAM, and ordinal-map bytes.',
    'Repeat after reload to detect hidden FP32 duplicates.',
  ],
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  reportPath: path.relative(repoRoot, reportPath),
  processRssBytes: report.process.rssBytes,
  snapshotStatus: snapshot.status,
  indexStatus: index.status,
  compressionGate: report.gates['LOD-MEMORY-COMPRESSION-PROVEN'],
  workingSetGate: report.gates['LOD-PROCESS-WORKING-SET-PROVEN'],
}, null, 2));
