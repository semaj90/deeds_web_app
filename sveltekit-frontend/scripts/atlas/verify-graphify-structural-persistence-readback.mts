#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GraphifyStructuralPersistenceProofV1Schema } from '$lib/server/atlas/indexing/graphify-structural-persistence-proof-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, '../..');
const arg = process.argv.find((value) => value.startsWith('--report='));
const REPORT = arg
  ? path.resolve(process.cwd(), arg.slice('--report='.length))
  : path.resolve(FRONTEND_ROOT, 'docs/reports/graphify-structural-persistence-readback.json');

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

const parsed = GraphifyStructuralPersistenceProofV1Schema.parse(
  JSON.parse(await readFile(REPORT, 'utf8')),
);
const { outputChecksum, ...payload } = parsed;
const checksumValid = sha256(payload) === outputChecksum;
const expectedBlockedStatus = [
  'PERSISTENCE_OWNER_IDENTIFIED_NO_STRUCTURAL_ROWS_REVISION_BLOCKED',
  'PERSISTENCE_OWNER_IDENTIFIED_READBACK_PROVEN_REVISION_BLOCKED',
].includes(parsed.status);

const gates = {
  checksumValid,
  expectedBlockedStatus,
  ownerIdentified: parsed.persistenceOwner === 'PARENT_ATLAS_ATLAS_EVIDENCE_LEDGER',
  canonicalTableCorrect: parsed.canonicalTable === 'atlas_evidence',
  tableExists: parsed.tableExists,
  requiredColumnsPresent: parsed.requiredColumnsPresent,
  sourceRevisionNotNull: parsed.sourceRevisionNotNull,
  sourceRevisionIndexPresent: parsed.sourceRevisionIndexPresent,
  noPseudoRevisions: parsed.suspiciousPseudoRevisionCount === 0,
  revisionOwnerStillUnproven: parsed.revisionOwnerProven === false,
  noCanonicalWriteAttempted: parsed.canonicalWriteAttempted === false,
  canonicalPersistenceStillBlocked: parsed.canonicalPersistenceAuthorized === false,
};

const pass = Object.values(gates).every(Boolean);
const result = {
  schema: 'atlas.graphify-structural-persistence-proof-verification.v1',
  status: pass ? 'GPH18_PERSISTENCE_OWNER_READBACK_PROVEN_REVISION_BLOCKED' : 'GPH18_PERSISTENCE_PROOF_FAILED',
  report: REPORT,
  gates,
  observedStatus: parsed.status,
  sampleEvidenceId: parsed.observation.sampleEvidenceId,
  repositoryReadbackExistingRowProven: parsed.repositoryReadbackExistingRowProven,
  blockers: parsed.blockers,
};

console.log(JSON.stringify(result, null, 2));
if (!pass) process.exitCode = 2;
