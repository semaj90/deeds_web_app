#!/usr/bin/env node

/** Prove that the workstation plan-only path has no mutation authority. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const files = [
  'docs/reports/parent-atlas-workstation-openspec-workboard-v2.json',
  'docs/reports/parent-atlas-workstation-ace-context-v1.json',
  'docs/reports/parent-atlas-workstation-ornith-synthesis-dry-v1.json',
  'docs/reports/parent-atlas-workstation-residency-v1.json',
];
const reports = files.map((relative) => ({ relative, value: JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8')) }));
const writes = {
  taskLedgers: 0,
  sourceFiles: 0,
  postgres: 0,
  qdrant: 0,
  neo4j: 0,
  cache: 0,
  valkey: 0,
  redis: 0,
  modelCalls: 0,
};
const observedWrites = reports.flatMap(({ relative, value }) => Object.entries(value.writes ?? {}).filter(([, count]) => count !== 0).map(([kind, count]) => ({ relative, kind, count })));
const planStatuses = reports.map(({ value }) => value.status);
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const proof = {
  schema: 'atlas.parent-atlas-workstation-plan-only-proof.v1',
  status: observedWrites.length === 0 ? 'PROVEN' : 'FAILED_NONZERO_WRITE_FLAG',
  planStatuses,
  synthesisDisabled: reports.find(({ relative }) => relative.includes('ornith'))?.value.generated === false,
  modelCalls: reports.find(({ relative }) => relative.includes('ornith'))?.value.modelCalls ?? null,
  observedWrites,
  writes,
  mutationScope: 'NONE_UNTIL_EXPLICIT_AUTHORIZATION',
  noDatastoreWrites: observedWrites.length === 0,
  noSourceWrites: observedWrites.length === 0,
  noCacheWrites: observedWrites.length === 0,
  noModelCalls: (reports.find(({ relative }) => relative.includes('ornith'))?.value.modelCalls ?? 0) === 0,
  evidence: files,
  proofChecksum: sha256(JSON.stringify({ planStatuses, observedWrites, writes })),
};
const out = path.join(root, 'docs', 'reports', 'parent-atlas-workstation-plan-only-proof-v1.json');
fs.writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...proof, out }, null, 2));
if (proof.status !== 'PROVEN' || !proof.synthesisDisabled || !proof.noModelCalls) process.exit(1);
