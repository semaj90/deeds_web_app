#!/usr/bin/env node

/**
 * GRAPH-CONTEXT-DAG-CONSUMER-01: validate the script-level handoff.
 * This is a read-only artifact check, not a production ACE/DAG invocation.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inputPath = path.join(root, 'docs/reports/graph-context-dag-composition-v1.json');
const outputPath = path.join(root, 'docs/reports/graph-context-dag-consumer-v1.json');
const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const required = [
  'schema', 'graphArtifactRef', 'graphRevision', 'graphProjectionChecksum',
  'ontologyTupleArtifactRef', 'ontologyTupleProjectionChecksum', 'compositionChecksum',
];
const missing = required.filter((key) => input[key] === undefined || input[key] === null || input[key] === '');
const graphExists = fs.existsSync(path.join(root, input.graphArtifactRef));
const tupleExists = fs.existsSync(path.join(root, input.ontologyTupleArtifactRef));
const safe = input.canonicalAuthority === false && input.writesPerformed === false
  && input.containsEmbeddings === false && input.containsTensors === false
  && input.containsHiddenReasoning === false;

const receipt = {
  schema: 'atlas.graph-context-dag-consumer-audit.v1',
  inputSchema: input.schema,
  status: missing.length === 0 && graphExists && tupleExists && safe
    ? 'SCRIPT_HANDOFF_VALIDATED'
    : 'SCRIPT_HANDOFF_BLOCKED',
  inputArtifact: 'docs/reports/graph-context-dag-composition-v1.json',
  graphArtifactRef: input.graphArtifactRef,
  graphRevision: input.graphRevision,
  graphProjectionChecksum: input.graphProjectionChecksum,
  ontologyTupleArtifactRef: input.ontologyTupleArtifactRef,
  ontologyTupleProjectionChecksum: input.ontologyTupleProjectionChecksum,
  checks: { missing, graphExists, tupleExists, safetyFlagsValid: safe },
  nextBoundary: 'ContextManifestV2/DAG admission',
  liveProductionInvocation: false,
  canonicalAuthority: false,
  writesPerformed: false,
};
const digestInput = JSON.stringify(receipt, Object.keys(receipt).sort());
receipt.receiptChecksum = `sha256:${crypto.createHash('sha256').update(digestInput, 'utf8').digest('hex')}`;
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...receipt, reportPath: outputPath }, null, 2));
if (receipt.status !== 'SCRIPT_HANDOFF_VALIDATED') process.exitCode = 1;
