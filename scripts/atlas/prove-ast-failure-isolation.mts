import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sidecarUrl = process.env.ATLAS_AST_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const sourceRevision = 'ast-failure-isolation-v1';

const cases = [
  { name: 'valid-a', filePath: 'src/valid-a.ts', source: 'export function alpha(){ return 1; }', expectedDiagnostic: null },
  { name: 'malformed', filePath: 'src/malformed.ts', source: 'export function broken( { return 1; ', expectedDiagnostic: 'ERROR' },
  { name: 'missing-delimiter', filePath: 'src/missing-delimiter.ts', source: 'export function missing() {', expectedDiagnostic: 'MISSING' },
  { name: 'valid-b', filePath: 'src/valid-b.ts', source: 'export function beta(){ return 2; }', expectedDiagnostic: null },
];

type ProbeResult = {
  name: string;
  filePath: string;
  status: 'PASS' | 'FAIL';
  errorTag: string | null;
  syntaxStatus: string | null;
  chunkCount: number;
  diagnosticCount: number;
  expectedDiagnostic: string | null;
  diagnosticMatch: boolean;
  error?: string;
};

async function probe(item: (typeof cases)[number]): Promise<ProbeResult> {
  try {
    const response = await fetch(`${sidecarUrl}/ast/chunk`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...item, language: 'typescript', sourceRevision }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const evidence = await response.json() as {
      error_tag?: string | null;
      syntax_status?: string | null;
      chunks?: unknown[];
      diagnostics?: unknown[];
    };
    const diagnosticText = Array.isArray(evidence.diagnostics) ? evidence.diagnostics.join(' ') : '';
    const diagnostics = Array.isArray(evidence.diagnostics) ? evidence.diagnostics.length : 0;
    const diagnosticMatch = item.expectedDiagnostic == null
      ? diagnostics === 0
      : diagnosticText.includes(item.expectedDiagnostic);
    const valid = item.expectedDiagnostic != null
      ? evidence.error_tag === 'ChunkingError' && diagnosticMatch && evidence.syntax_status === 'RECOVERED_WITH_ERRORS'
      : evidence.error_tag == null && evidence.syntax_status === 'CLEAN' && diagnosticMatch && (evidence.chunks?.length ?? 0) > 0;
    return {
      name: item.name,
      filePath: item.filePath,
      status: valid ? 'PASS' : 'FAIL',
      errorTag: evidence.error_tag ?? null,
      syntaxStatus: evidence.syntax_status ?? null,
      chunkCount: evidence.chunks?.length ?? 0,
      diagnosticCount: diagnostics,
      expectedDiagnostic: item.expectedDiagnostic,
      diagnosticMatch,
    };
  } catch (error) {
    return {
      name: item.name,
      filePath: item.filePath,
      status: 'FAIL',
      errorTag: null,
      syntaxStatus: null,
      chunkCount: 0,
      diagnosticCount: 0,
      expectedDiagnostic: item.expectedDiagnostic,
      diagnosticMatch: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const settled = await Promise.allSettled(cases.map(probe));
const results = settled.map((entry, index) => entry.status === 'fulfilled'
  ? entry.value
  : { name: cases[index].name, filePath: cases[index].filePath, status: 'FAIL' as const, errorTag: null, syntaxStatus: null, chunkCount: 0, diagnosticCount: 0, expectedDiagnostic: cases[index].expectedDiagnostic, diagnosticMatch: false, error: entry.reason instanceof Error ? entry.reason.message : String(entry.reason) });
const status = results.every((result) => result.status === 'PASS') ? 'PROVEN' : 'DEGRADED';
const report = {
  schema: 'atlas.ast.failure-isolation.v1',
  generatedAt: new Date().toISOString(),
  sidecarUrl,
  sourceRevision,
  status,
  totalFiles: results.length,
  passedFiles: results.filter((result) => result.status === 'PASS').length,
  failedFiles: results.filter((result) => result.status === 'FAIL').length,
  malformedDiagnosticPass: results.some((result) => result.name === 'malformed' && result.diagnosticMatch),
  missingDiagnosticPass: results.some((result) => result.name === 'missing-delimiter' && result.diagnosticMatch),
  results,
};

const reportPath = resolve(repoRoot, 'docs/reports/ast-failure-isolation-proof.json');
const markdownPath = resolve(repoRoot, 'docs/reports/ast-failure-isolation-proof.md');
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
await writeFile(markdownPath, [
  '# AST failure isolation proof',
  '',
  `- status: **${status}**`,
  `- sidecar: ${sidecarUrl}`,
  `- files: ${report.passedFiles}/${report.totalFiles} passed`,
  `- malformed diagnostic: ${report.malformedDiagnosticPass ? 'PASS' : 'FAIL'}`,
  `- missing delimiter diagnostic: ${report.missingDiagnosticPass ? 'PASS' : 'FAIL'}`,
  '',
  ...results.map((result) => `- ${result.name}: ${result.status} (${result.chunkCount} chunks, ${result.diagnosticCount} diagnostics)`),
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status, files: results.length, passed: report.passedFiles, report: reportPath }, null, 2));
if (status !== 'PROVEN') process.exitCode = 1;
