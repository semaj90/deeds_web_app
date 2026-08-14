import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import {
  QAS_CORE_FEATURE_NAMES,
  sampleQueryAdaptiveCandidates,
  type QueryAdaptiveCandidate,
} from '../../sveltekit-frontend/src/lib/server/atlas/retrieval/query-adaptive-sampler.js';

const ROOT = resolve(import.meta.dirname, '../..');
const defaultInput = resolve(ROOT, 'docs/reports/atlas-qas-candidate-features.raw.jsonl');
const defaultOutput = resolve(ROOT, 'docs/reports/atlas-qas-candidate-features.jsonl');
const inputIndex = process.argv.indexOf('--input');
const outputIndex = process.argv.indexOf('--output');
const inputPath = resolve(ROOT, inputIndex >= 0 ? process.argv[inputIndex + 1] : defaultInput);
const outputPath = resolve(ROOT, outputIndex >= 0 ? process.argv[outputIndex + 1] : defaultOutput);
const reportPath = resolve(ROOT, 'docs/reports/query-adaptive-input-adapter.json');

const report = {
  schemaVersion: 'atlas.qas.input-adapter-report.v1',
  inputPath,
  outputPath,
  status: 'MISSING_INPUT' as 'MISSING_INPUT' | 'PROVEN',
  rowsRead: 0,
  rowsWritten: 0,
  rejectedRows: [] as Array<{ line: number; reason: string }>,
  writesCanonicalTruth: false,
};

if (existsSync(inputPath)) {
  const rows: QueryAdaptiveCandidate[] = [];
  for (const [index, line] of readFileSync(inputPath, 'utf8').split(/\r?\n/).filter(Boolean).entries()) {
    report.rowsRead += 1;
    try {
      const row = JSON.parse(line) as QueryAdaptiveCandidate;
      if (!row.packetKey || !row.sourceRef || !row.workspaceRevision || !row.sourceRevision || !row.representationRevision || !row.featureRevision) {
        throw new Error('missing packet/source identity or revision lineage');
      }
      for (const featureName of QAS_CORE_FEATURE_NAMES) {
        if (!Number.isFinite(row.features?.[featureName])) throw new Error(`missing feature ${featureName}`);
      }
      rows.push(row);
    } catch (error) {
      report.rejectedRows.push({ line: index + 1, reason: error instanceof Error ? error.message : String(error) });
    }
  }

  if (report.rowsRead > 0 && report.rejectedRows.length === 0) {
    // Run the canonical sampler validator without selecting a production result.
    sampleQueryAdaptiveCandidates({
      candidates: rows,
      weights: { semantic: 1, lexical: 0.25, structural: 0.5, domain: 0.35, execution: 0.2 },
      sampleSize: 1,
      seed: 'qas-input-validation',
    });
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
    report.status = 'PROVEN';
    report.rowsWritten = rows.length;
  }
}

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
