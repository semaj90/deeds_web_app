#!/usr/bin/env node

/** Read-only bootstrap plan: first observation is not historical creation. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/temporal-bootstrap-plan-v1.json');
const identityPath = resolve(root, 'docs/reports/temporal-logical-identity-v1.json');
const candidatesPath = resolve(root, 'docs/reports/temporal-event-candidates-v1.json');
const report = { schema: 'atlas.temporal-bootstrap-plan.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY', authority: false, writesPerformed: false, eventAppendAuthorized: false, status: 'BLOCKED', plan: null, evidence: { identity: identityPath, candidates: candidatesPath } };
try {
  const identity = JSON.parse(readFileSync(identityPath, 'utf8'));
  const candidates = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  const eligible = identity.status === 'SINGLE_FRAME_NO_SUPERSESSION_POSSIBLE' && candidates.status === 'OBSERVATION_CANDIDATES_COMPILED_NOT_ADMITTED';
  report.plan = {
    eventType: 'BASELINE_OBSERVED',
    observationCount: identity.observations,
    logicalArtifactCount: identity.logicalArtifactCount,
    versionArtifactCount: identity.versionArtifactCount,
    historicalCreationClaims: 0,
    supersessionClaims: 0,
    appendableEventCount: 0,
    requiresSecondOrderedSnapshot: true,
    workspaceRevision: null,
    canonicalAuthority: false,
  };
  report.status = eligible ? 'BASELINE_PLAN_READY_NOT_ADMITTED' : 'BASELINE_PLAN_BLOCKED_INPUTS';
} catch (error) { report.error = error instanceof Error ? error.message : String(error); report.status = 'BASELINE_PLAN_UNAVAILABLE'; }
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, plan: report.plan, eventAppendAuthorized: false, reportPath }, null, 2));
