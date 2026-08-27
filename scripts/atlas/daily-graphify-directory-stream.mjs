#!/usr/bin/env node
/**
 * Bounded directory-oriented Graphify stream.
 *
 * This stage prepares a streamed JSONL graph plan from the admitted source
 * manifest. It does not write Postgres, Qdrant, Redis, Neo4j, or embeddings.
 * AST/chunking, semantic_768, and RAPIDS are represented as downstream jobs
 * sharing the same source revision and manifest checksum.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (!arg.startsWith('--')) continue;
  const [key, inline] = arg.slice(2).split('=', 2);
  args.set(key, inline ?? process.argv[i + 1]);
  if (inline === undefined) i += 1;
}

const limitDirs = Math.max(1, Number(args.get('limit-dirs') || 16));
const filesPerDir = Math.max(1, Number(args.get('files-per-dir') || 128));
const manifestPath = path.resolve(REPO_ROOT, String(args.get('manifest') || '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl'));
const outputDir = path.resolve(REPO_ROOT, String(args.get('output-dir') || '.tmp/atlas/daily-directory-stream-v1'));
const outputPath = path.join(outputDir, 'graph.jsonl');
const receiptPath = path.join(outputDir, 'receipt.json');

if (!fs.existsSync(manifestPath)) {
  throw new Error(`Manifest not found: ${manifestPath}`);
}

await fsp.mkdir(outputDir, { recursive: true });
const output = fs.createWriteStream(outputPath, { encoding: 'utf8' });
const hash = crypto.createHash('sha256');
const manifestHash = crypto.createHash('sha256');
let currentDir = null;
let currentRows = [];
let directories = 0;
let files = 0;
let oversized = 0;
let skipped = 0;
let sourceRevision = null;

function writeRecord(record) {
  const line = `${JSON.stringify(record)}\n`;
  hash.update(line);
  output.write(line);
}

function flushDirectory() {
  if (!currentDir || directories >= limitDirs) return;
  directories += 1;
  writeRecord({
    schema: 'atlas.graphify-directory-node.v1',
    directory: currentDir,
    fileCount: currentRows.length,
    pipeline: {
      ast: 'ast-grep-tree-sitter',
      chunking: 'ast-aware-with-text-fallback',
      embedding: 'semantic_768-document',
      gpuAnalysis: 'rapids-descriptor-deferred',
    },
  });
  for (const row of currentRows) {
    files += 1;
    if (row.status === 'SOURCE_TOO_LARGE') oversized += 1;
    writeRecord({
      schema: 'atlas.graphify-file-node.v1',
      directory: currentDir,
      relativePath: row.relativePath,
      contentHash: row.contentHash,
      status: row.status,
      sourceRootAuthority: row.sourceRootAuthority,
      canonicalAdmission: row.canonicalAdmission,
      jobs: [
        { stage: 'AST', executor: 'CPU', status: 'PLANNED' },
        { stage: 'CHUNK', executor: 'CPU', status: 'PLANNED', fallback: 'TEXT_FALLBACK' },
        { stage: 'EMBED', representation: 'semantic_768', executor: 'EmbeddingGemma', status: 'PLANNED' },
        { stage: 'GRAPH_FEATURES', executor: 'WSL2_RAPIDS', status: 'DEFERRED' },
      ],
    });
  }
  currentRows = [];
}

const rl = readline.createInterface({ input: fs.createReadStream(manifestPath, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  if (!line.trim()) continue;
  manifestHash.update(`${line}\n`);
  const row = JSON.parse(line);
  sourceRevision ??= row.sourceRevision ?? null;
  const dir = path.posix.dirname(String(row.relativePath).replaceAll('\\', '/')) || '.';
  if (currentDir !== null && dir !== currentDir) flushDirectory();
  if (directories >= limitDirs) { skipped += 1; continue; }
  currentDir = dir;
  if (currentRows.length < filesPerDir) currentRows.push(row);
  else skipped += 1;
}
flushDirectory();
await new Promise((resolve, reject) => { output.end(resolve); output.on('error', reject); });

const receipt = {
  schema: 'atlas.graphify-directory-stream-receipt.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  writesPerformed: false,
  sourceManifest: path.relative(REPO_ROOT, manifestPath).replaceAll('\\', '/'),
  sourceManifestChecksum: manifestHash.digest('hex'),
  sourceRevision,
  limits: { limitDirs, filesPerDir },
  directories,
  files,
  oversized,
  skipped,
  graphJsonl: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/'),
  graphChecksum: hash.digest('hex'),
  stages: {
    ast: 'PLANNED_CPU',
    chunking: 'PLANNED_AST_AWARE_TEXT_FALLBACK',
    semantic768: 'PLANNED_EMBEDDINGGEMMA_DOCUMENT',
    rapids: 'DEFERRED_DESCRIPTOR_ONLY',
  },
};
await fsp.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...receipt, receiptPath: path.relative(REPO_ROOT, receiptPath).replaceAll('\\', '/') }, null, 2));
