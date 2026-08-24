#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const phaseReportPath = path.resolve(
  ROOT,
  process.env.GRAPHIFY_PHASE109B_REPORT ?? '.tmp/phase109b/latest.json',
);
const bindingReportPath = path.resolve(
  ROOT,
  process.env.ATLAS_WORKSPACE_SOURCE_BINDING_OUT
    ?? 'docs/reports/workspace-source-binding-observation.json',
);
const output = path.resolve(
  ROOT,
  process.env.GRAPHIFY_DAILY_WORKFLOW_RECEIPT_OUT
    ?? 'docs/reports/graphify-daily-workflow-receipt.json',
);
const workflowId = process.env.GRAPHIFY_WORKFLOW_ID?.trim() || 'graphify:daily:v1';

const phaseReport = JSON.parse(await readFile(phaseReportPath, 'utf8'));
let bindingReport = null;
try {
  bindingReport = JSON.parse(await readFile(bindingReportPath, 'utf8'));
} catch {
  // The binding observation is optional until the canonical writer is proven.
}

const receipt = {
  schemaVersion: 'atlas.graphify-daily-workflow-receipt.v1',
  workflowId,
  runId: phaseReport.runId ?? null,
  repositoryRevision: phaseReport.repositoryRevision ?? null,
  generatedAt: phaseReport.generatedAt ?? new Date().toISOString(),
  readOnly: true,
  canonicalWriteAttempted: false,
  stages: phaseReport.stages ?? {},
  outputs: phaseReport.outputs ?? {},
  sourceBindingObservation: bindingReport
    ? {
        path: path.relative(ROOT, bindingReportPath).replaceAll('\\', '/'),
        workspaceRevision: bindingReport.record?.workspaceRevision ?? null,
        sourceManifestDigest: bindingReport.record?.sourceManifestDigest ?? null,
        sourceCount: bindingReport.record?.sourceCount ?? bindingReport.counts?.boundSources ?? 0,
        boundSources: bindingReport.counts?.boundSources ?? 0,
        skippedSources: bindingReport.counts?.skippedSources ?? 0,
      }
    : null,
  nextGate: 'GRAPHIFY_RUN_WRITER_AND_SOURCE_BINDING_READBACK',
};

await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  status: 'GRAPHIFY_DAILY_WORKFLOW_RECEIPT_PREPARED',
  workflowId,
  runId: receipt.runId,
  sourceManifestDigest: receipt.sourceBindingObservation?.sourceManifestDigest ?? null,
  sourceCount: receipt.sourceBindingObservation?.sourceCount ?? 0,
  canonicalWriteAttempted: false,
  output,
}, null, 2));