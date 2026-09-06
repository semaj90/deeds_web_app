#!/usr/bin/env node

/**
 * SOURCE-REGISTRY-OWNER-JOIN-01 (read-only).
 *
 * Proves whether the PKT-LINEAGE-08A bounded 50-source cohort
 * (docs/reports/pkt-lineage-08-bounded-snapshot-v1.json) has an exact,
 * deterministic identity join into the stable `atlas_source_refs` registry.
 * Never guesses a namespace for an unmatched source -- an unmatched source
 * stays SOURCE_REGISTRY_IDENTITY_UNPROVEN.
 *
 * Runs a positive control (a relative_path already known to exist in the
 * registry) alongside the cohort check, so a report of "zero matches" can
 * be told apart from "the join query itself is broken."
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { toRegistryRelativePath, classifySourceRegistryJoin } from './lib/source-registry-owner-join.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const snapshotPath = path.join(root, 'docs', 'reports', 'pkt-lineage-08-bounded-snapshot-v1.json');
const outPath = path.join(root, 'docs', 'reports', 'source-registry-owner-join-v1.json');
const sha256 = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;

// A relative_path independently confirmed present in atlas_source_refs this
// session via a direct query -- used only to prove the join mechanism works.
const POSITIVE_CONTROL_RELATIVE_PATH = 'src/lib/server/db/schema-postgres.ts';

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const targetSourceRefs = snapshot.targetSourceRefs ?? [];

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 30000 });

let databaseError = null;
let results = [];
let positiveControl = null;

try {
  const relativePaths = targetSourceRefs.map(toRegistryRelativePath);
  const rows = (await pool.query(
    `select source_ref_key, repo_id, relative_path, content_hash from public.atlas_source_refs where relative_path = any($1::text[])`,
    [relativePaths],
  )).rows;
  const byRelativePath = new Map();
  for (const row of rows) {
    const list = byRelativePath.get(row.relative_path) ?? [];
    list.push(row);
    byRelativePath.set(row.relative_path, list);
  }
  results = targetSourceRefs.map((sourceRef) => classifySourceRegistryJoin(sourceRef, byRelativePath.get(toRegistryRelativePath(sourceRef)) ?? []));

  const controlRows = (await pool.query(
    `select source_ref_key, repo_id, relative_path, content_hash from public.atlas_source_refs where relative_path = $1`,
    [POSITIVE_CONTROL_RELATIVE_PATH],
  )).rows;
  positiveControl = classifySourceRegistryJoin(`sveltekit-frontend/${POSITIVE_CONTROL_RELATIVE_PATH}`, controlRows);
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const exactMatches = results.filter((row) => row.status === 'EXACT_REGISTRY_MATCH');
const unproven = results.filter((row) => row.status === 'SOURCE_REGISTRY_IDENTITY_UNPROVEN');
const joinMechanismProven = !databaseError && positiveControl?.status === 'EXACT_REGISTRY_MATCH';

let status;
if (databaseError) status = 'AUDIT_FAILED';
else if (!joinMechanismProven) status = 'JOIN_MECHANISM_UNPROVEN';
else if (exactMatches.length > 0) status = 'SOURCE_REGISTRY_IDENTITY_PROVEN_FOR_SUBSET';
else status = 'SOURCE_REGISTRY_IDENTITY_UNPROVEN_FOR_COHORT';

const report = {
  schema: 'atlas.source-registry-owner-join.v1',
  gate: 'SOURCE-REGISTRY-OWNER-JOIN-01',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  canonicalAuthority: false,
  writesPerformed: false,
  status,
  cohortSource: 'docs/reports/pkt-lineage-08-bounded-snapshot-v1.json',
  cohortTargetCount: targetSourceRefs.length,
  exactMatchCount: exactMatches.length,
  unprovenCount: unproven.length,
  positiveControl: {
    relativePath: POSITIVE_CONTROL_RELATIVE_PATH,
    ...positiveControl,
  },
  joinMechanismProven,
  namespaceAuthorityNote: 'atlas_source_refs.repo_id = "deeds-web-app" for its rows; other Graphify/workspace-origin tooling in this repo uses repositoryId = "semaj90/deeds_web_app" -- a real, unreconciled naming-convention mismatch, not resolved by this gate.',
  results,
  databaseError,
};
report.reportChecksum = sha256(JSON.stringify(report));

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  cohortTargetCount: report.cohortTargetCount,
  exactMatchCount: report.exactMatchCount,
  unprovenCount: report.unprovenCount,
  joinMechanismProven: report.joinMechanismProven,
  out: outPath,
}, null, 2));
if (status === 'AUDIT_FAILED' || status === 'JOIN_MECHANISM_UNPROVEN') process.exitCode = 1;
