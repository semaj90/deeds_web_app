#!/usr/bin/env node

/** Fail-closed bounded audit of unresolved structural target identity. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planPath = path.join(ROOT, 'docs/reports/current-structural-edge-artifact-plan-v2.json');
const reportPath = path.join(ROOT, 'docs/reports/bounded-structural-target-identity-v1.json');
const limit = Math.max(1, Number(process.env.ATLAS_TARGET_IDENTITY_SAMPLE_LIMIT ?? 500));

async function main() {
  const plan = JSON.parse(await fs.readFile(planPath, 'utf8'));
  const rows = (plan.unresolvedEdges ?? []).slice(0, limit);
  const missingTargetIdentity = rows.filter((row) => !row.targetSourceRef && !row.targetRevision && !row.targetSymbolId && !row.targetSymbolVersionId);
  const report = {
    schema: 'atlas.bounded-structural-target-identity.v1',
    status: rows.length > 0 && missingTargetIdentity.length === rows.length
      ? 'TARGET_IDENTITY_MISSING_FAIL_CLOSED'
      : 'TARGET_IDENTITY_SAMPLE_REQUIRES_REVIEW',
    readOnly: true,
    writesPerformed: false,
    input: {
      planPath: path.relative(ROOT, planPath),
      workspaceRevision: plan.workspaceRevision ?? plan.inputWorkspaceRevision ?? null,
      planGraphRevision: plan.graphRevision ?? null,
      sampleLimit: limit,
      sampledRows: rows.length,
      totalUnresolvedRows: plan.unresolvedEdgeCount ?? plan.unresolvedEdges?.length ?? null,
    },
    counts: {
      sourceRevisionPresent: rows.filter((row) => Boolean(row.sourceRevision)).length,
      targetIdentityPresent: rows.length - missingTargetIdentity.length,
      targetIdentityMissing: missingTargetIdentity.length,
      legacyResolverMatchesPromoted: 0,
      structuralEdgesAdmitted: 0,
    },
    policy: {
      resolverMatchRequired: ['targetSourceRef', 'targetRevision', 'targetSymbolId', 'targetSymbolVersionId'],
      fuzzyMatching: false,
      syntheticRevision: false,
      cachePresenceAsIdentity: false,
      canonicalAuthority: false,
    },
    nextGate: 'GRAPH-RESOLVE-05 authoritative target-identity producer and revision-qualified bounded proof',
  };
  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, sampledRows: rows.length, targetIdentityMissing: missingTargetIdentity.length, reportPath }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
