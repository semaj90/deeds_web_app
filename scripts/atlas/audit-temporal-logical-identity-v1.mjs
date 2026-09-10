#!/usr/bin/env node

/** Read-only single-frame identity cardinality audit; never infers creation or supersession. */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/temporal-logical-identity-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 20000 });
const report = { schema: 'atlas.temporal-logical-identity.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY', authority: false, writesPerformed: false, status: 'UNKNOWN', observations: 0, logicalArtifactCount: 0, versionArtifactCount: 0, logicalIdsWithMultipleVersions: 0, logicalIdsWithOneVersion: 0, logicalIdentityIncludesRevisionMaterial: false, historyFramesObserved: 0, supersessionClaims: 0, databaseError: null };
try {
  const result = await pool.query(`SELECT packet_key::text, source_revision::text, workspace_revision::text FROM public.atlas_packets WHERE packet_key IS NOT NULL ORDER BY packet_key::text`);
  const logical = new Map();
  const versions = new Map();
  for (const row of result.rows) {
    const logicalId = `packet:${row.packet_key}`;
    const versionId = `packet:${row.packet_key}:${row.source_revision ?? 'unbound'}`;
    (logical.get(logicalId) ?? logical.set(logicalId, new Set()).get(logicalId)).add(versionId);
    (versions.get(versionId) ?? versions.set(versionId, new Set()).get(versionId)).add(logicalId);
  }
  const logicalEntries = [...logical.entries()];
  report.observations = result.rowCount;
  report.logicalArtifactCount = logical.size;
  report.versionArtifactCount = versions.size;
  report.logicalIdsWithMultipleVersions = logicalEntries.filter(([, values]) => values.size > 1).length;
  report.logicalIdsWithOneVersion = logicalEntries.filter(([, values]) => values.size === 1).length;
  report.versionIdsWithMultipleLogicalIds = [...versions.values()].filter((values) => values.size > 1).length;
  report.distinctSourceRevisionCount = new Set(result.rows.map((row) => row.source_revision).filter(Boolean)).size;
  report.distinctWorkspaceRevisionCount = new Set(result.rows.map((row) => row.workspace_revision).filter(Boolean)).size;
  report.historyFramesObserved = 1;
  report.supersessionClaims = 0;
  report.status = 'SINGLE_FRAME_NO_SUPERSESSION_POSSIBLE';
  report.note = 'packet_key is used as the proposed logical identity; source/workspace revisions are version coordinates and no historical creation or replacement is inferred from this frame.';
  report.identityChecksum = createHash('sha256').update(JSON.stringify([...logical.keys()].sort()), 'utf8').digest('hex');
} catch (error) { report.status = 'IDENTITY_AUDIT_UNAVAILABLE'; report.databaseError = error instanceof Error ? error.message : String(error); }
finally { await pool.end(); }
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, observations: report.observations, logicalArtifactCount: report.logicalArtifactCount, versionArtifactCount: report.versionArtifactCount, logicalIdsWithMultipleVersions: report.logicalIdsWithMultipleVersions, historyFramesObserved: report.historyFramesObserved, reportPath }, null, 2));
