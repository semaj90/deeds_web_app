#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const WORKSPACE = path.resolve(REPO_ROOT, 'sveltekit-frontend');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: WORKSPACE,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: false,
    ...options,
  });

  return {
    code: typeof result.status === 'number' ? result.status : 1,
  };
}

async function readJsonIfExists(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function main() {
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'WARN',
    lanes: {
      workstationStatus: 'NOT_RUN',
      summaryPromotion: 'NOT_RUN',
      featureMetadata: 'NOT_RUN',
      qdrantPayload: 'NOT_RUN',
      qdrantComponentParity: 'NOT_RUN',
      bitfrostSemanticCache: 'NOT_RUN',
    },
    notes: [],
  };

  let result = run(process.execPath, [path.join(REPO_ROOT, 'scripts', 'atlas', 'parent-atlas-workstation-status.mjs')]);
  if (result.code !== 0) {
    report.lanes.workstationStatus = 'FAIL';
    report.notes.push('workstation status script failed');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.lanes.workstationStatus = 'PASS';

  result = run(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'atlas', 'backfill-summary-layers-from-chunks.mjs'),
    '--apply',
    '--limit=100',
    '--batch-size=100',
  ]);
  if (result.code !== 0) {
    report.lanes.summaryPromotion = 'FAIL';
    report.notes.push('summary promotion batch failed');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.lanes.summaryPromotion = 'PASS';

  result = run(process.execPath, [
    path.join(WORKSPACE, 'sveltekit-frontend', 'scripts', 'atlas', 'backfill-feature-metadata.mjs'),
    '--verify',
  ]);
  if (result.code !== 0) {
    report.lanes.featureMetadata = 'FAIL';
    report.notes.push('feature metadata verifier failed');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.lanes.featureMetadata = 'PASS';

  result = run(process.execPath, [
    path.join(WORKSPACE, 'scripts', 'atlas', 'verify-qdrant-packet-payload.mjs'),
  ]);
  const qdrantReportPath = path.join(WORKSPACE, 'docs', 'reports', 'qdrant-packet-payload-verify.json');
  const qdrantReport = await readJsonIfExists(qdrantReportPath);
  if (!qdrantReport) {
    report.lanes.qdrantPayload = 'FAIL';
    report.notes.push('qdrant payload report was not written');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const qdrantNoContradictions = Boolean(
    qdrantReport.postgresQdrantNoContradictions ?? qdrantReport.report?.postgresQdrantNoContradictions,
  );
  if (qdrantNoContradictions) {
    const agreementPct = Number(qdrantReport.agreementPct ?? qdrantReport.report?.agreementPct ?? 0);
    const hasCoverageWarning = Boolean(qdrantReport.warning ?? qdrantReport.report?.warning) || agreementPct < 95;
    report.lanes.qdrantPayload = 'PASS';
    if (hasCoverageWarning) {
      report.notes.push(
        String(
          qdrantReport.warning ??
          qdrantReport.report?.warning ??
          'qdrant payload verification reported advisory compatibility coverage below threshold',
        ),
      );
    }
  } else {
    report.lanes.qdrantPayload = 'FAIL';
    report.notes.push('qdrant payload verification reported contradictions or non-ok state');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  result = run(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'atlas', 'qdrant-parity-repair.mjs'),
    '--collection=codebase_chunks_384_v2',
  ]);
  if (result.code !== 0) {
    report.lanes.qdrantComponentParity = 'FAIL';
    report.notes.push('qdrant component parity runner failed');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const qdrantComponentReportPath = path.join(WORKSPACE, 'docs', 'reports', 'qdrant-component-parity.json');
  const qdrantComponentReport = await readJsonIfExists(qdrantComponentReportPath);
  if (!qdrantComponentReport) {
    report.lanes.qdrantComponentParity = 'FAIL';
    report.notes.push('qdrant component parity report was not written');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  if (String(qdrantComponentReport.status ?? 'WARN').toUpperCase() === 'FAIL') {
    report.lanes.qdrantComponentParity = 'FAIL';
    report.notes.push('qdrant component parity reported contradictions');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.lanes.qdrantComponentParity = qdrantComponentReport.status === 'PASS' ? 'PASS' : 'WARN';
  if (report.lanes.qdrantComponentParity === 'WARN') {
    const warning = qdrantComponentReport.status ?? 'WARN';
    report.notes.push(`qdrant component parity reported ${warning.toLowerCase()} coverage`);
  }

  result = run(process.execPath, [
    path.join(REPO_ROOT, 'scripts', 'atlas', 'audit-bitfrost-semantic-cache.mjs'),
  ]);
  if (result.code !== 0) {
    report.lanes.bitfrostSemanticCache = 'FAIL';
    report.notes.push('bitfrost semantic cache audit failed');
    console.log(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  report.lanes.bitfrostSemanticCache = 'PASS';

  const laneValues = Object.values(report.lanes);
  report.status = laneValues.includes('FAIL')
    ? 'FAIL'
    : laneValues.includes('WARN')
      ? 'WARN'
      : 'PASS';
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(`[parent-atlas-workstation-end-to-end] failed: ${error?.stack ?? error?.message ?? error}`);
  process.exit(1);
});
