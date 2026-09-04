#!/usr/bin/env node
/**
 * Read-only OpenSpec portfolio inventory.
 * The active convergence change remains the only work authority; this report
 * is an index and must not change task state or create work.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const changesDir = path.join(root, 'openspec', 'changes');
const reportsDir = path.join(root, 'docs', 'reports');
const reportPath = path.join(reportsDir, 'openspec-portfolio-v1.json');
const currentAuthority = 'parent-atlas-retrieval-lineage-dag-convergence';

function countTasks(text) {
  const done = (text.match(/^\s*- \[x\]/gim) ?? []).length;
  const open = (text.match(/^\s*- \[ \]/gim) ?? []).length;
  return { done, open, total: done + open };
}

const changes = existsSync(changesDir)
  ? readdirSync(changesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => {
        const changeId = entry.name;
        const changeDir = path.join(changesDir, changeId);
        const tasksPath = path.join(changeDir, 'tasks.md');
        const tasks = existsSync(tasksPath) ? countTasks(readFileSync(tasksPath, 'utf8')) : { done: 0, open: 0, total: 0 };
        const isAuthority = changeId === currentAuthority;
        return {
          changeId,
          taskProgress: tasks,
          reachableTaskProgress: isAuthority ? tasks : null,
          queueClass: isAuthority ? 'CURRENT_AUTHORITY' : 'FROZEN_REFERENCE',
          currentGateRefs: isAuthority ? ['LINEAGE-01', 'PKT-LINEAGE-08'] : [],
          blockedBy: isAuthority ? ['GRAPHIFY_RUN_LIFECYCLE', 'SOURCE_NAMESPACE_AUTHORITY'] : [],
          supersededBy: null,
          mayGenerateNewWork: isAuthority,
        };
      })
      .sort((a, b) => a.changeId.localeCompare(b.changeId))
  : [];

const authorityCount = changes.filter((change) => change.queueClass === 'CURRENT_AUTHORITY').length;
const report = {
  schema: 'atlas.openspec-portfolio.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  currentAuthority,
  currentAuthorityCount: authorityCount,
  status: authorityCount === 1 ? 'PORTFOLIO_AUDIT_PROVEN' : 'PORTFOLIO_AUTHORITY_INVALID',
  changeCount: changes.length,
  changes,
  writesPerformed: false,
  canonicalAuthority: false,
};

mkdirSync(reportsDir, { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  currentAuthority: report.currentAuthority,
  currentAuthorityCount: report.currentAuthorityCount,
  changeCount: report.changeCount,
  writesPerformed: report.writesPerformed,
  report: reportPath,
}, null, 2));
