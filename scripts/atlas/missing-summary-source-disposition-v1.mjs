#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '../..');
const DEFAULT_INPUT = path.join(ROOT, '.tmp/atlas/missing-packet-summaries-v1.json');
const DEFAULT_OUTPUT = path.join(ROOT, '.tmp/atlas/missing-summary-source-disposition-v1.json');
const TEXT_EXTENSIONS = new Set(['.c', '.cc', '.cpp', '.cs', '.css', '.go', '.h', '.hpp', '.html', '.java', '.js', '.json', '.jsonc', '.jsx', '.md', '.mdx', '.mjs', '.mts', '.php', '.ps1', '.py', '.pyi', '.rs', '.sql', '.svelte', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml']);
const BINARY_EXTENSIONS = new Set(['.7z', '.bin', '.dll', '.exe', '.gif', '.gz', '.jpeg', '.jpg', '.mp3', '.mp4', '.npz', '.pdf', '.png', '.pt', '.rlib', '.rmeta', '.so', '.tar', '.webp', '.woff', '.woff2', '.zip']);
const GENERATED_PARTS = new Set(['.cache', '.git', '.next', '.svelte-kit', '.tmp', 'build', 'coverage', 'dist', 'node_modules', 'target']);
const ARCHIVE_PARTS = new Set(['archive', 'archives', 'backup', 'backups']);

export function classifyMissingSummarySourceV1(sourceRef, tracked, statKind) {
  if (typeof sourceRef !== 'string' || sourceRef.trim() === '' || sourceRef === '<NULL>') return 'MISSING_SOURCE_REFERENCE';
  if (/^[a-z][a-z0-9+.-]*:/i.test(sourceRef)) return 'NON_PATH_REFERENCE';
  const normalized = sourceRef.replace(/\\/g, '/').replace(/^\.\//, '');
  const pathParts = normalized.split('/').filter(Boolean).map((part) => part.toLowerCase());
  const extension = path.extname(normalized).toLowerCase();
  if (statKind === 'OUTSIDE') return 'OUTSIDE_WORKSPACE';
  if (statKind === 'MISSING') return 'MISSING_ON_DISK';
  if (statKind === 'DIRECTORY') return 'DIRECTORY_REFERENCE';
  if (pathParts.some((part) => GENERATED_PARTS.has(part))) return 'GENERATED_OR_CACHE_REVIEW';
  if (pathParts.some((part) => ARCHIVE_PARTS.has(part))) return 'ARCHIVE_REVIEW';
  if (BINARY_EXTENSIONS.has(extension) || !TEXT_EXTENSIONS.has(extension)) return 'NON_TEXT_OR_UNCLASSIFIED_REVIEW';
  return tracked ? 'TRACKED_TEXT_CANDIDATE_UNQUALIFIED' : 'UNTRACKED_TEXT_REVIEW';
}

function dispositionOne(source, trackedPaths) {
  const sourceRef = source.source_ref;
  let statKind = 'MISSING';
  let workspacePath = null;
  if (typeof sourceRef === 'string' && sourceRef.trim() !== '' && sourceRef !== '<NULL>' && !/^[a-z][a-z0-9+.-]*:/i.test(sourceRef)) {
    workspacePath = path.resolve(ROOT, sourceRef);
    const relative = path.relative(ROOT, workspacePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      statKind = 'OUTSIDE';
    } else {
      try {
        const stat = fs.statSync(workspacePath);
        statKind = stat.isDirectory() ? 'DIRECTORY' : stat.isFile() ? 'FILE' : 'MISSING';
      } catch {
        statKind = 'MISSING';
      }
    }
  }
  const gitPath = typeof sourceRef === 'string' ? sourceRef.replace(/\\/g, '/').replace(/^\.\//, '') : '';
  return {
    sourceRef,
    packetCount: source.packet_count,
    noEmbeddingCount: source.no_embedding_count,
    packetKeys: source.packet_keys,
    workspacePath: statKind === 'FILE' ? path.relative(ROOT, workspacePath).replace(/\\/g, '/') : null,
    disposition: classifyMissingSummarySourceV1(sourceRef, trackedPaths.has(gitPath), statKind),
    sourceRevisionChecked: false,
  };
}

export function buildMissingSummarySourceDispositionV1(receipt, trackedPaths) {
  if (receipt?.schema !== 'atlas.missing-packet-summaries.v1' || !Array.isArray(receipt.sources)) {
    throw new Error('MISSING_SUMMARY_SOURCE_RECEIPT_INVALID');
  }
  const sources = receipt.sources.map((source) => dispositionOne(source, trackedPaths));
  const counts = Object.fromEntries([...new Set(sources.map((item) => item.disposition))]
    .sort().map((name) => [name, sources.filter((item) => item.disposition === name).reduce((sum, item) => sum + item.packetCount, 0)]));
  return {
    schema: 'atlas.missing-summary-source-disposition.v1',
    generatedAt: new Date().toISOString(),
    inputGeneratedAt: receipt.generatedAt,
    database: receipt.database,
    writesPerformed: false,
    fileContentsRead: false,
    sourceRevisionChecksPerformed: false,
    dispositionCounts: counts,
    sourceGroups: sources.length,
    sources,
  };
}

async function main() {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
  const outputPath = process.argv[3] ? path.resolve(process.argv[3]) : DEFAULT_OUTPUT;
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const trackedPaths = new Set(execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer', maxBuffer: 128 * 1024 * 1024 })
    .toString('utf8').split('\0').filter(Boolean).map((item) => item.replace(/\\/g, '/')));
  const report = buildMissingSummarySourceDispositionV1(input, trackedPaths);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ sourceGroups: report.sourceGroups, dispositionCounts: report.dispositionCounts, reportPath: path.relative(ROOT, outputPath) }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
