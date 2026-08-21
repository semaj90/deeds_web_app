#!/usr/bin/env tsx

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RevisionOwnerProofV1Schema } from '$lib/server/atlas/indexing/revision-owner-proof-v1.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '../..');
const REPO_ROOT = path.resolve(FRONTEND, '..');
const INPUT = process.env.ATLAS_REVISION_OWNER_PROOF_OUT
  ? path.resolve(REPO_ROOT, process.env.ATLAS_REVISION_OWNER_PROOF_OUT)
  : path.resolve(REPO_ROOT, 'docs/reports/revision-owner-proof.json');

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

function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

const raw = JSON.parse(await readFile(INPUT, 'utf8'));
const proof = RevisionOwnerProofV1Schema.parse(raw);
const { outputChecksum, ...payload } = proof;
const checksumValid = checksum(payload) === outputChecksum;

const forbiddenFalseAuthority = proof.observations.filter((item) =>
  item.role !== 'ORIGIN_CANDIDATE'
  && (item.surfaceId === proof.workspaceRevisionOwner || item.surfaceId === proof.sourceRevisionOwner)
);

const gates = {
  checksumValid,
  readOnly: proof.readOnly === true,
  noCanonicalWrite: proof.canonicalWriteAttempted === false,
  noSinkClaimedAsOwner: forbiddenFalseAuthority.length === 0,
  workspaceOwnerConsistent: proof.workspaceRevisionProven === (proof.workspaceRevisionOwner !== null),
  sourceOwnerConsistent: proof.sourceRevisionProven === (proof.sourceRevisionOwner !== null),
};

const passed = Object.values(gates).every(Boolean);
const verificationStatus = passed
  ? proof.status === 'REVISION_OWNER_PROVEN'
    ? 'REVISION_OWNER_PROOF_VERIFIED'
    : 'REVISION_OWNER_BLOCK_VERIFIED'
  : 'REVISION_OWNER_PROOF_INVALID';

console.log(JSON.stringify({ verificationStatus, proofStatus: proof.status, gates, blockers: proof.blockers, input: INPUT }, null, 2));
if (!passed) process.exitCode = 2;
else if (proof.status !== 'REVISION_OWNER_PROVEN') process.exitCode = 3;
