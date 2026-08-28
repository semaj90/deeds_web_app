import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const apply = process.argv.includes('--apply');
const planPath = path.resolve(REPO_ROOT, 'docs/reports/current-feature-ontology-evidence-lineage-repair-plan-v1.json');
const outputPath = path.resolve(REPO_ROOT, 'docs/reports/current-feature-ontology-evidence-lineage-repair-v1.json');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const authorization = 'AUTHORIZE NON-PRODUCTION EVIDENCE LINEAGE REPAIR FOR FROZEN 8-ROW PLAN';

if (apply) {
  if (process.env.ATLAS_EVIDENCE_LINEAGE_REPAIR_CONFIRM !== authorization) throw new Error('EVIDENCE_LINEAGE_REPAIR_AUTHORIZATION_REQUIRED');
  if (process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') throw new Error('EVIDENCE_LINEAGE_REPAIR_NON_PRODUCTION_FLAG_REQUIRED');
  if (plan.status !== 'EVIDENCE_LINEAGE_REPAIR_PLAN_READY_FOR_EXPLICIT_AUTHORIZATION' || plan.rows?.length !== 8) {
    throw new Error('EVIDENCE_LINEAGE_REPAIR_PLAN_NOT_FROZEN_OR_EXPECTED');
  }
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 5000,
  query_timeout: 30000,
});

try {
  const ids = plan.rows.map((row) => row.relationshipId);
  const evidenceIds = plan.rows.map((row) => row.evidenceId).filter(Boolean);
  const current = await pool.query(`
    SELECT r.relationship_id, r.source_ref, r.source_revision,
           r.metadata, e.evidence_id, e.source_ref AS evidence_source_ref,
           e.source_revision AS evidence_source_revision, e.payload
      FROM atlas_relationships r
      LEFT JOIN atlas_relationship_evidence re USING (relationship_id)
      LEFT JOIN atlas_evidence e ON e.evidence_id = re.evidence_id
     WHERE r.relationship_id = ANY($1::text[])
     ORDER BY r.relationship_id, e.evidence_id
  `, [ids]);

  const before = current.rows.filter((row) => evidenceIds.includes(row.evidence_id));
  const graphify = await pool.query(`
    SELECT source_ref, workspace_revision, code_source_revision, source_revision, content_hash
      FROM graphify_files
     WHERE workspace_revision = $1
       AND source_ref = ANY($2::text[])
     ORDER BY source_ref, code_source_revision NULLS LAST, content_hash NULLS LAST
  `, [plan.rows[0]?.workspaceRevision ?? null, [...new Set(plan.rows.map((row) => row.sourceRef))]]);
  const graphifyBySource = new Map();
  for (const row of graphify.rows) {
    const key = `${row.source_ref}|${row.workspace_revision}`;
    const existing = graphifyBySource.get(key);
    if (existing && existing.content_hash !== row.content_hash) {
      graphifyBySource.set(key, { ambiguous: true });
    } else if (!existing) {
      graphifyBySource.set(key, row);
    }
  }
  const report = {
    schema: 'atlas.current-feature-ontology-evidence-lineage-repair.v1',
    mode: apply ? 'apply' : 'dry-run',
    planPath: path.relative(REPO_ROOT, planPath),
    planSelectionChecksum: plan.selectionChecksum,
    expectedRows: plan.rows.length,
    relationshipRows: new Set(current.rows.map((row) => row.relationship_id)).size,
    evidenceRows: new Set(before.map((row) => row.evidence_id)).size,
    writesPerformed: false,
    mismatches: [],
  };

  for (const expected of plan.rows) {
    const row = before.find((candidate) => candidate.relationship_id === expected.relationshipId && candidate.evidence_id === expected.evidenceId);
    if (!row) {
      report.mismatches.push({ relationshipId: expected.relationshipId, evidenceId: expected.evidenceId, reason: 'EXPECTED_RELATIONSHIP_OR_EVIDENCE_MISSING' });
      continue;
    }
    if (row.source_ref !== expected.sourceRef) report.mismatches.push({ evidenceId: expected.evidenceId, reason: 'RELATIONSHIP_SOURCE_REF_MISMATCH' });
    if (row.source_revision !== expected.sourceRevision) report.mismatches.push({ evidenceId: expected.evidenceId, reason: 'RELATIONSHIP_SOURCE_REVISION_MISMATCH' });
    if (row.evidence_source_ref !== expected.sourceRef) report.mismatches.push({ evidenceId: expected.evidenceId, reason: 'EVIDENCE_SOURCE_REF_MISMATCH' });
    const observed = graphifyBySource.get(`${expected.sourceRef}|${expected.workspaceRevision}`);
    if (!observed || observed.ambiguous || !observed.content_hash) report.mismatches.push({ evidenceId: expected.evidenceId, reason: 'CURRENT_GRAPHIFY_SOURCE_CONTENT_HASH_UNAVAILABLE' });
    else if (observed.code_source_revision !== expected.sourceRevision && observed.source_revision !== expected.sourceRevision) report.mismatches.push({ evidenceId: expected.evidenceId, reason: 'GRAPHIFY_SOURCE_REVISION_MISMATCH', expected: expected.sourceRevision, actual: observed.code_source_revision ?? observed.source_revision ?? null });
  }

  if (report.mismatches.length > 0) {
    report.status = 'EVIDENCE_LINEAGE_REPAIR_BLOCKED_PRECONDITION_MISMATCH';
  } else if (!apply) {
    report.status = 'EVIDENCE_LINEAGE_REPAIR_READY_FOR_EXPLICIT_AUTHORIZATION';
    report.nextAction = authorization;
  } else {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const expected of plan.rows) {
        const row = before.find((candidate) => candidate.relationship_id === expected.relationshipId && candidate.evidence_id === expected.evidenceId);
        const observed = graphifyBySource.get(`${expected.sourceRef}|${expected.workspaceRevision}`);
        const payload = {
          ...(row.payload ?? {}),
          workspace_revision: expected.workspaceRevision,
          source_content_hash: observed.content_hash,
          legacy_source_ref: expected.legacySourceRef,
          canonical_binding_checksum: row.payload?.canonical_binding_checksum ?? null,
        };
        await client.query(`
          UPDATE atlas_evidence
             SET source_revision = $1, source_ref = $2, payload = $3::jsonb
           WHERE evidence_id = $4
        `, [expected.sourceRevision, expected.sourceRef, JSON.stringify(payload), expected.evidenceId]);
      }

      const after = await client.query(`
        SELECT evidence_id, source_ref, source_revision,
               payload->>'workspace_revision' AS workspace_revision,
               payload->>'legacy_source_ref' AS legacy_source_ref
          FROM atlas_evidence
         WHERE evidence_id = ANY($1::text[])
         ORDER BY evidence_id
      `, [evidenceIds]);
      for (const expected of plan.rows) {
        const row = after.rows.find((candidate) => candidate.evidence_id === expected.evidenceId);
        if (!row || row.source_ref !== expected.sourceRef || row.source_revision !== expected.sourceRevision || row.workspace_revision !== expected.workspaceRevision || row.legacy_source_ref !== expected.legacySourceRef) {
          report.mismatches.push({ evidenceId: expected.evidenceId, reason: 'POST_WRITE_READBACK_MISMATCH' });
        }
      }
      if (report.mismatches.length > 0) {
        await client.query('ROLLBACK');
        report.status = 'EVIDENCE_LINEAGE_REPAIR_ROLLED_BACK_READBACK_MISMATCH';
      } else {
        await client.query('COMMIT');
        report.status = 'EVIDENCE_LINEAGE_REPAIR_APPLIED_READBACK_PROVEN';
        report.writesPerformed = true;
      }
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    reportPath: path.relative(REPO_ROOT, outputPath),
    expectedRows: report.expectedRows,
    relationshipRows: report.relationshipRows,
    evidenceRows: report.evidenceRows,
    writesPerformed: report.writesPerformed,
    mismatches: report.mismatches.length,
  }, null, 2));
} finally {
  await pool.end();
}
