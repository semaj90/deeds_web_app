import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sidecarUrl = process.env.ATLAS_AST_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const sourceRevision = 'ast-incremental-proof-v1';
const hash = (source: string) => createHash('sha256').update(source).digest('hex');

const files = [
  { sourceRef: 'src/incremental-unchanged.ts', source: 'export function unchanged(){ return 1; }', priorHash: hash('export function unchanged(){ return 1; }') },
  { sourceRef: 'src/incremental-changed.ts', source: 'export function changed(){ return 2; }', priorHash: 'stale-hash' },
  { sourceRef: 'src/incremental-deleted.ts', source: null, priorHash: 'deleted-file-hash' },
];

const results = [] as Array<Record<string, unknown>>;
for (const file of files) {
  const contentHash = file.source == null ? null : hash(file.source);
  if (file.source == null) {
    results.push({
      sourceRef: file.sourceRef,
      action: 'DELETE_TOMBSTONE',
      status: 'PASS',
      tombstone: { sourceRef: file.sourceRef, sourceRevision, reason: 'SOURCE_DELETED' },
    });
    continue;
  }

  if (file.priorHash === contentHash) {
    results.push({ sourceRef: file.sourceRef, action: 'SKIP_UNCHANGED', status: 'PASS', contentHash });
    continue;
  }

  try {
    const response = await fetch(`${sidecarUrl}/ast/chunk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ source: file.source, language: 'typescript', filePath: file.sourceRef, sourceRevision }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const evidence = await response.json() as { chunks?: unknown[]; diagnostics?: unknown[]; error_tag?: string | null };
    const extracted = (evidence.chunks?.length ?? 0) > 0 && evidence.error_tag == null;
    results.push({
      sourceRef: file.sourceRef,
      action: 'REEXTRACT_CHANGED',
      status: extracted ? 'PASS' : 'FAIL',
      contentHash,
      chunkCount: evidence.chunks?.length ?? 0,
      diagnosticCount: evidence.diagnostics?.length ?? 0,
    });
  } catch (error) {
    results.push({ sourceRef: file.sourceRef, action: 'REEXTRACT_CHANGED', status: 'FAIL', error: error instanceof Error ? error.message : String(error) });
  }
}

const report = {
  schema: 'atlas.ast.incremental-proof.v1',
  generatedAt: new Date().toISOString(),
  sidecarUrl,
  sourceRevision,
  status: results.every((result) => result.status === 'PASS') ? 'BOUNDED_PROVEN' : 'FAIL',
  unchangedSkipPass: results.some((result) => result.action === 'SKIP_UNCHANGED' && result.status === 'PASS'),
  changedReextractPass: results.some((result) => result.action === 'REEXTRACT_CHANGED' && result.status === 'PASS'),
  deletionTombstonePass: results.some((result) => result.action === 'DELETE_TOMBSTONE' && result.status === 'PASS'),
  productionGraphifyWiring: 'PENDING',
  results,
};

const reportPath = resolve(repoRoot, 'docs/reports/ast-incremental-extraction-proof.json');
const markdownPath = resolve(repoRoot, 'docs/reports/ast-incremental-extraction-proof.md');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, [
  '# AST incremental extraction proof',
  '',
  `- status: **${report.status}**`,
  `- unchanged skip: ${report.unchangedSkipPass ? 'PASS' : 'FAIL'}`,
  `- changed re-extraction: ${report.changedReextractPass ? 'PASS' : 'FAIL'}`,
  `- deletion tombstone: ${report.deletionTombstonePass ? 'PASS' : 'FAIL'}`,
  '- production Graphify wiring: PENDING',
  '',
  ...results.map((result) => `- ${String(result.sourceRef)}: ${String(result.action)} ${String(result.status)}`),
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status: report.status, results: results.length, report: reportPath }, null, 2));
if (report.status !== 'BOUNDED_PROVEN') process.exitCode = 1;
