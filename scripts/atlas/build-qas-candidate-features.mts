import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  adaptSearchRuntimeCandidatesToQasRows,
  type SearchRuntimeQasCandidate,
  type SearchRuntimeQasFeatureContext,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-feature-compiler.js';

const ROOT = resolve(import.meta.dirname, '../..');
const defaultInput = resolve(ROOT, 'docs/reports/search-runtime-qas-candidates.raw.jsonl');
const defaultOutput = resolve(ROOT, 'docs/reports/atlas-qas-candidate-features.jsonl');
const inputIndex = process.argv.indexOf('--input');
const outputIndex = process.argv.indexOf('--output');
const inputPath = resolve(ROOT, inputIndex >= 0 ? process.argv[inputIndex + 1] : defaultInput);
const outputPath = resolve(ROOT, outputIndex >= 0 ? process.argv[outputIndex + 1] : defaultOutput);
const baselinePath = resolve(ROOT, 'docs/reports/qas-exact-baseline.json');
const reportPath = resolve(ROOT, 'docs/reports/qas-search-runtime-feature-build.json');

type RawRow = {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  candidate: SearchRuntimeQasCandidate;
  featureContext: SearchRuntimeQasFeatureContext;
};

const report = {
  schemaVersion: 'atlas.qas.search-runtime-feature-build.v1',
  inputPath,
  outputPath,
  status: 'MISSING_INPUT' as 'MISSING_INPUT' | 'PROVEN' | 'DEGRADED' | 'LIVE_INPUT_PRODUCED',
  rowsRead: 0,
  rowsWritten: 0,
  candidatesSeen: 0,
  acceptedRows: 0,
  rejectedRows: 0,
  exactBaselineRows: 0,
  rejectedRows: 0,
  rejectedDetails: [] as Array<{ line: number; reason: string }>,
  canonicalWrites: false,
  sourceOwner: 'SearchRuntime candidate envelope + existing feature resolver',
};

if (existsSync(inputPath)) {
  const outputRows: string[] = [];
  let exactBaseline: unknown[] = [];
  let projectionSeen = false;
  const inputText = readFileSync(inputPath, 'utf8');
  const projectionInput = inputPath.endsWith('.json') ? JSON.parse(inputText) as {
    accepted?: unknown[];
    rejected?: unknown[];
    exactBaseline?: unknown[];
  } : null;

  if (projectionInput?.accepted && Array.isArray(projectionInput.accepted)) {
    projectionSeen = true;
    report.candidatesSeen = projectionInput.accepted.length + (projectionInput.rejected?.length ?? 0);
    report.acceptedRows = projectionInput.accepted.length;
    report.rejectedRows = projectionInput.rejected?.length ?? 0;
    exactBaseline = projectionInput.exactBaseline ?? [];
    for (const row of projectionInput.accepted) outputRows.push(JSON.stringify(row));
  } else {
  for (const [index, line] of readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).entries()) {
    report.rowsRead += 1;
    try {
      const raw = JSON.parse(line) as RawRow;
      const result = adaptSearchRuntimeCandidatesToQasRows({
        requestId: raw.requestId,
        policyRevision: raw.policyRevision,
        workspaceRevision: raw.workspaceRevision,
        representationRevision: raw.representationRevision,
        candidates: [raw.candidate],
        resolveFeatures: () => raw.featureContext,
      });
      if (result.rows.length !== 1) {
        throw new Error(result.rejected[0]?.reason ?? 'candidate rejected by QAS adapter');
      }
      outputRows.push(JSON.stringify(result.rows[0]));
    } catch (error) {
      report.rejectedDetails.push({ line: index + 1, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  }

  report.rowsWritten = outputRows.length;
  report.candidatesSeen = report.candidatesSeen || report.rowsRead;
  report.acceptedRows = report.rowsWritten;
  report.rejectedRows += report.rejectedDetails.length;
  report.exactBaselineRows = exactBaseline.length;
  report.status = projectionSeen
    ? 'LIVE_INPUT_PRODUCED'
    : report.rowsWritten > 0 && report.rejectedRows === 0
    ? 'PROVEN'
    : report.rowsWritten > 0
      ? 'DEGRADED'
      : 'MISSING_INPUT';

  if (report.status !== 'MISSING_INPUT') {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${outputRows.join('\n')}\n`, 'utf8');
    if (exactBaseline.length > 0) {
      writeFileSync(baselinePath, `${JSON.stringify({ schema: 'atlas.qas.exact-baseline.v1', rows: exactBaseline }, null, 2)}\n`, 'utf8');
    }
  }
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
