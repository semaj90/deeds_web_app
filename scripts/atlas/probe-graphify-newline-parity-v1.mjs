#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sidecarUrl = (process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');
const reportPath = path.resolve(root, 'docs/reports/graphify-newline-parity-v1.json');
const cases = [
  { id: 'without-terminal-newline', source: 'const answer = 42;' },
  { id: 'with-terminal-newline', source: 'const answer = 42;\n' },
];

function revision(source) {
  return `sha256:${createHash('sha256').update(Buffer.from(source, 'utf8')).digest('hex')}`;
}

const results = [];
for (const item of cases) {
  const response = await fetch(`${sidecarUrl}/ast/chunk`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      source: item.source,
      language: 'typescript',
      filePath: 'fixture.ts',
      sourceRevision: revision(item.source),
    }),
  });
  const payload = await response.json();
  results.push({
    id: item.id,
    httpStatus: response.status,
    sourceRevision: revision(item.source),
    syntaxStatus: payload.syntax_status ?? null,
    diagnosticCount: Array.isArray(payload.diagnostics) ? payload.diagnostics.length : null,
    diagnostics: Array.isArray(payload.diagnostics) ? payload.diagnostics : [],
    chunkCount: Array.isArray(payload.chunks) ? payload.chunks.length : null,
  });
}

const clean = results.find((item) => item.id === 'without-terminal-newline');
const newline = results.find((item) => item.id === 'with-terminal-newline');
const report = {
  schema: 'atlas.graphify-newline-parity.v1',
  sidecarUrl,
  provider: 'treesitter-chunker-8095',
  status: clean?.syntaxStatus === 'CLEAN' && newline?.syntaxStatus === 'RECOVERED_WITH_ERRORS'
    ? 'NEWLINE_DIAGNOSTIC_REPRODUCED'
    : 'PARITY_RESULT_REQUIRES_REVIEW',
  results,
  readOnly: true,
  writesPerformed: false,
  canonicalAuthority: false,
  nextGate: 'GRAPHIFY-STRUCTURAL-PARSER-NEWLINE-PARITY-01',
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, results, reportPath }));
