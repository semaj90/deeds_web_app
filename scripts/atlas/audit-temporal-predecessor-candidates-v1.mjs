#!/usr/bin/env node

/** Read-only comparison of two explicit WorkspaceSnapshotV1 manifests. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/temporal-predecessor-candidates-v1.json');
const { values } = parseArgs({ options: { base: { type: 'string' }, target: { type: 'string' } } });
const report = { schema: 'atlas.temporal-predecessor-candidates.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY', authority: false, writesPerformed: false, status: 'BLOCKED_INPUTS', base: null, target: null, counts: null, candidates: [], supersessionClaims: 0, reportPath };
if (!values.base || !values.target) throw new Error('--base and --target must name two exact snapshot manifests');
try {
  const base = JSON.parse(readFileSync(values.base, 'utf8'));
  const target = JSON.parse(readFileSync(values.target, 'utf8'));
  const baseAudit = validateSnapshot(base);
  const targetAudit = validateSnapshot(target);
  report.base = { snapshotRevision: base.snapshotRevision, workspaceRevision: base.workspaceRevision ?? null, status: baseAudit.status, violations: baseAudit.violations };
  report.target = { snapshotRevision: target.snapshotRevision, workspaceRevision: target.workspaceRevision ?? null, status: targetAudit.status, violations: targetAudit.violations };
  if (baseAudit.violations.length || targetAudit.violations.length) {
    report.status = 'BLOCKED_SNAPSHOT_READBACK';
  } else {
    const baseByRef = new Map(base.sources.map((source) => [source.sourceRef, source]));
    const targetByRef = new Map(target.sources.map((source) => [source.sourceRef, source]));
    const refs = [...new Set([...baseByRef.keys(), ...targetByRef.keys()])].sort();
    for (const sourceRef of refs) {
      const before = baseByRef.get(sourceRef); const after = targetByRef.get(sourceRef);
      const operation = !before ? 'CREATED' : !after ? 'TOMBSTONED' : before.sourceRevision === after.sourceRevision && before.contentDigest === after.contentDigest ? 'UNCHANGED' : 'UPDATED';
      report.candidates.push({ sourceRef, operation, baseSourceRevision: before?.sourceRevision ?? null, targetSourceRevision: after?.sourceRevision ?? null, baseContentDigest: before?.contentDigest ?? null, targetContentDigest: after?.contentDigest ?? null, priorVersionVisible: Boolean(before), replacementVersionVisible: Boolean(after), supersessionEligible: operation === 'UPDATED' });
    }
    report.counts = { baseSources: base.sources.length, targetSources: target.sources.length, created: report.candidates.filter((row) => row.operation === 'CREATED').length, updated: report.candidates.filter((row) => row.operation === 'UPDATED').length, unchanged: report.candidates.filter((row) => row.operation === 'UNCHANGED').length, tombstoned: report.candidates.filter((row) => row.operation === 'TOMBSTONED').length, supersessionClaims: 0, workspaceRevisionBound: Boolean(base.workspaceRevision && target.workspaceRevision) };
    report.status = 'PREDECESSOR_CANDIDATES_COMPILED_NOT_ADMITTED';
  }
} catch (error) { report.status = 'PREDECESSOR_AUDIT_UNAVAILABLE'; report.error = error instanceof Error ? error.message : String(error); }
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ status: report.status, counts: report.counts, base: report.base, target: report.target, supersessionClaims: 0, reportPath }, null, 2));
