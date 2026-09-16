#!/usr/bin/env node
/**
 * Audits every tasks.md under openspec/changes/** and sveltekit-frontend/openspec/changes/**
 * (including each tree's archive/ subdirectory) for checkbox completion and structural
 * completeness, flags simple staleness signals, and writes:
 *   - docs/reports/openspec-tasks-md-audit-v1.json (machine-readable, overwritten each run)
 *   - next_steps/active/<YYYY-MM-DD>_openspec-tasks-md-audit.md (timestamped, human-readable)
 *
 * Read-only: never modifies any audited file. See
 * openspec/changes/parent-atlas-openspec-tasks-audit-fabric/ for the full contract.
 *
 * Usage: npx tsx scripts/atlas/audit-openspec-tasks-md-v1.mts
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// simdjson-bridge.ts has zero $lib imports — safe to import by relative path from a standalone
// tsx script with no SvelteKit context. See proposal.md for why this is safe here specifically.
import {
  fastJsonParse,
  isSimdJsonAvailable,
} from '../../sveltekit-frontend/src/lib/server/gpu/simdjson-bridge.js';

const REPO_ROOT = process.cwd();

const TREES = [
  { label: 'root', changesDir: join(REPO_ROOT, 'openspec', 'changes') },
  {
    label: 'sveltekit-frontend',
    changesDir: join(REPO_ROOT, 'sveltekit-frontend', 'openspec', 'changes'),
  },
];

// Case-sensitive, all-caps-only — a lowercase "stale"/"superseded" inside ordinary prose (e.g.
// "replace the stale claim with...") is not a self-declared document-staleness banner. Real
// banners in this repo use all-caps + emoji (e.g. "⛔ SUPERSEDED", "PREMISE SUPERSEDED"). This was
// verified empirically: the first version of this script (case-insensitive) matched 71/108
// changes on "stale" as an ordinary word, which was not a usable signal.
const STALENESS_MARKERS = ['⛔', 'SUPERSEDED', 'PREMISE SUPERSEDED', 'STATUS: STALE'];
const GAP_THRESHOLD = 80;

interface ChangeRecord {
  tree: string;
  changeName: string;
  archived: boolean;
  path: string;
  done: number;
  total: number;
  completionPct: number | null;
  noCheckboxes: boolean;
  hasProposal: boolean;
  hasSpecs: boolean;
  tasksNonTrivial: boolean;
  structuralScore: number;
  auditScore: number;
  stalenessMarkersFound: string[];
}

function countCheckboxes(text: string): { done: number; total: number } {
  const matches = text.match(/^\s*-\s*\[[ xX]\]/gm) ?? [];
  const done = (text.match(/^\s*-\s*\[[xX]\]/gm) ?? []).length;
  return { done, total: matches.length };
}

function isNonEmptyFile(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const stat = statSync(path);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function specsDirHasSpec(specsDir: string): boolean {
  if (!existsSync(specsDir)) return false;
  try {
    if (!statSync(specsDir).isDirectory()) return false;
  } catch {
    return false;
  }
  // specs/<capability>/spec.md — one level of nesting, per this repo's convention
  const entries = readdirSync(specsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const specFile = join(specsDir, entry.name, 'spec.md');
      if (isNonEmptyFile(specFile)) return true;
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      if (isNonEmptyFile(join(specsDir, entry.name))) return true;
    }
  }
  return false;
}

function tasksIsNonTrivial(text: string, total: number): boolean {
  if (total > 0) return true;
  // 0/0 file — non-trivial if it has real heading structure + substantive body, not just a stub
  const hasHeading = /^#{1,2}\s+\S/m.test(text);
  return hasHeading && text.trim().length > 200;
}

function findStalenessMarkers(text: string): string[] {
  return STALENESS_MARKERS.filter((marker) => text.includes(marker));
}

function discoverChanges(tree: { label: string; changesDir: string }): ChangeRecord[] {
  const records: ChangeRecord[] = [];
  if (!existsSync(tree.changesDir)) return records;

  const topLevel = readdirSync(tree.changesDir, { withFileTypes: true }).filter((e) =>
    e.isDirectory()
  );

  for (const entry of topLevel) {
    if (entry.name === 'archive') {
      const archiveDir = join(tree.changesDir, 'archive');
      const archived = readdirSync(archiveDir, { withFileTypes: true }).filter((e) =>
        e.isDirectory()
      );
      for (const a of archived) {
        const changeDir = join(archiveDir, a.name);
        const record = buildRecord(tree.label, a.name, changeDir, true);
        if (record) records.push(record);
      }
      continue;
    }
    const changeDir = join(tree.changesDir, entry.name);
    const record = buildRecord(tree.label, entry.name, changeDir, false);
    if (record) records.push(record);
  }

  return records;
}

function buildRecord(
  treeLabel: string,
  changeName: string,
  changeDir: string,
  archived: boolean
): ChangeRecord | null {
  const tasksPath = join(changeDir, 'tasks.md');
  if (!isNonEmptyFile(tasksPath)) return null;

  const text = readFileSync(tasksPath, 'utf-8');
  const { done, total } = countCheckboxes(text);
  const noCheckboxes = total === 0;
  const completionPct = noCheckboxes ? null : Math.round((done / total) * 100);

  const hasProposal = isNonEmptyFile(join(changeDir, 'proposal.md'));
  const hasSpecs = specsDirHasSpec(join(changeDir, 'specs'));
  const tasksNonTrivial = tasksIsNonTrivial(text, total);

  let structuralScore = 0;
  if (hasProposal) structuralScore += 40;
  if (hasSpecs) structuralScore += 30;
  if (tasksNonTrivial) structuralScore += 30;

  // Archived changes with 0/0 checkboxes (already-complete, checklist cleared on archive) are not
  // a gap — treat their completion component as 100, not the neutral midpoint.
  const completionComponent = noCheckboxes ? (archived ? 100 : 50) : (completionPct as number);
  const auditScore = Math.round(structuralScore * 0.4 + completionComponent * 0.6);

  return {
    tree: treeLabel,
    changeName,
    archived,
    path: relative(REPO_ROOT, tasksPath).replace(/\\/g, '/'),
    done,
    total,
    completionPct,
    noCheckboxes,
    hasProposal,
    hasSpecs,
    tasksNonTrivial,
    structuralScore,
    auditScore,
    stalenessMarkersFound: findStalenessMarkers(text),
  };
}

function findDuplicateNames(records: ChangeRecord[]): string[] {
  const byName = new Map<string, Set<string>>();
  for (const r of records) {
    if (!byName.has(r.changeName)) byName.set(r.changeName, new Set());
    byName.get(r.changeName)!.add(r.tree);
  }
  const dupes: string[] = [];
  for (const [name, trees] of byName) {
    if (trees.size > 1) dupes.push(name);
  }
  return dupes.sort();
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function timestampedMarkdownPath(): string {
  const now = new Date();
  const datePrefix = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const dir = join(REPO_ROOT, 'next_steps', 'active');
  let candidate = join(dir, `${datePrefix}_openspec-tasks-md-audit.md`);
  if (!existsSync(candidate)) return candidate;
  const hhmmss = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  candidate = join(dir, `${datePrefix}_${hhmmss}_openspec-tasks-md-audit.md`);
  return candidate;
}

function main(): void {
  const allRecords: ChangeRecord[] = [];
  for (const tree of TREES) {
    allRecords.push(...discoverChanges(tree));
  }

  const duplicateNames = findDuplicateNames(allRecords);

  const totalDone = allRecords.reduce((s, r) => s + r.done, 0);
  const totalTasks = allRecords.reduce((s, r) => s + r.total, 0);
  const aggregateCompletionPct =
    totalTasks > 0 ? Math.round((totalDone / totalTasks) * 10000) / 100 : null;

  const gaps = allRecords
    .filter((r) => r.auditScore < GAP_THRESHOLD)
    .sort((a, b) => a.auditScore - b.auditScore);

  const stalenessFlagged = allRecords.filter((r) => r.stalenessMarkersFound.length > 0);

  const report = {
    schema: 'atlas.openspec-tasks-md-audit.v1',
    mode: 'READ_ONLY_AUDIT',
    generatedAt: new Date().toISOString(),
    gapThreshold: GAP_THRESHOLD,
    aggregate: {
      totalChangesAudited: allRecords.length,
      totalDoneCheckboxes: totalDone,
      totalCheckboxes: totalTasks,
      aggregateCompletionPct,
      changesWithNoCheckboxes: allRecords.filter((r) => r.noCheckboxes).length,
      changesFullyComplete: allRecords.filter((r) => r.completionPct === 100).length,
      changesBelowGapThreshold: gaps.length,
      duplicateNamesAcrossTrees: duplicateNames,
      changesWithStalenessMarkers: stalenessFlagged.length,
    },
    changes: allRecords.sort((a, b) => a.auditScore - b.auditScore),
    gaps,
    stalenessFlagged: stalenessFlagged.map((r) => ({
      changeName: r.changeName,
      tree: r.tree,
      path: r.path,
      markers: r.stalenessMarkersFound,
    })),
  };

  const jsonPath = join(REPO_ROOT, 'docs', 'reports', 'openspec-tasks-md-audit-v1.json');
  const jsonString = JSON.stringify(report, null, 2);
  writeFileSync(jsonPath, jsonString, 'utf-8');

  // Round-trip through simdjson-bridge — record honestly whether native or fallback ran.
  const simdjsonAddonAvailable = isSimdJsonAvailable();
  const rehydrated = fastJsonParse<typeof report>(readFileSync(jsonPath, 'utf-8'));
  const roundTripOk = rehydrated.aggregate.totalChangesAudited === report.aggregate.totalChangesAudited;

  const finalReport = {
    ...report,
    simdjsonRoundTrip: {
      simdjsonAddonAvailable,
      parseMethod: simdjsonAddonAvailable ? 'native' : 'fallback',
      roundTripOk,
    },
  };
  writeFileSync(jsonPath, JSON.stringify(finalReport, null, 2), 'utf-8');

  const mdPath = timestampedMarkdownPath();
  const md = renderMarkdown(finalReport);
  writeFileSync(mdPath, md, 'utf-8');

  console.log(
    JSON.stringify(
      {
        status: 'AUDIT_COMPLETE',
        totalChangesAudited: report.aggregate.totalChangesAudited,
        aggregateCompletionPct,
        changesBelowGapThreshold: gaps.length,
        jsonReport: relative(REPO_ROOT, jsonPath).replace(/\\/g, '/'),
        markdownReport: relative(REPO_ROOT, mdPath).replace(/\\/g, '/'),
        simdjsonAddonAvailable,
        roundTripOk,
      },
      null,
      2
    )
  );
}

function renderMarkdown(report: {
  generatedAt: string;
  gapThreshold: number;
  aggregate: {
    totalChangesAudited: number;
    totalDoneCheckboxes: number;
    totalCheckboxes: number;
    aggregateCompletionPct: number | null;
    changesWithNoCheckboxes: number;
    changesFullyComplete: number;
    changesBelowGapThreshold: number;
    duplicateNamesAcrossTrees: string[];
    changesWithStalenessMarkers: number;
  };
  gaps: ChangeRecord[];
  stalenessFlagged: { changeName: string; tree: string; path: string; markers: string[] }[];
  simdjsonRoundTrip: { simdjsonAddonAvailable: boolean; parseMethod: string; roundTripOk: boolean };
}): string {
  const a = report.aggregate;
  const lines: string[] = [];
  lines.push(`# OpenSpec tasks.md Audit — ${report.generatedAt}`);
  lines.push('');
  lines.push(
    `Generated by \`scripts/atlas/audit-openspec-tasks-md-v1.mts\` (read-only; see ` +
      `\`openspec/changes/parent-atlas-openspec-tasks-audit-fabric/\` for the contract).`
  );
  lines.push('');
  lines.push('## Aggregate');
  lines.push('');
  lines.push(`- **Changes audited**: ${a.totalChangesAudited}`);
  lines.push(
    `- **Checkbox completion**: ${a.totalDoneCheckboxes}/${a.totalCheckboxes} ` +
      `(${a.aggregateCompletionPct ?? 'n/a'}%)`
  );
  lines.push(`- **Changes with no checkboxes (0/0)**: ${a.changesWithNoCheckboxes}`);
  lines.push(`- **Changes fully complete (100%)**: ${a.changesFullyComplete}`);
  lines.push(
    `- **Changes below gap threshold (auditScore < ${report.gapThreshold})**: ` +
      `${a.changesBelowGapThreshold}`
  );
  lines.push(
    `- **Duplicate change names across both trees**: ` +
      `${a.duplicateNamesAcrossTrees.length > 0 ? a.duplicateNamesAcrossTrees.join(', ') : 'none'}`
  );
  lines.push(`- **Changes with self-declared staleness markers**: ${a.changesWithStalenessMarkers}`);
  lines.push(
    `- **simdjson round-trip**: addon available = ${report.simdjsonRoundTrip.simdjsonAddonAvailable}, ` +
      `parse method = \`${report.simdjsonRoundTrip.parseMethod}\`, ` +
      `round-trip ok = ${report.simdjsonRoundTrip.roundTripOk}`
  );
  lines.push('');
  lines.push(`## Gaps (auditScore < ${report.gapThreshold}), lowest first`);
  lines.push('');
  lines.push('| auditScore | tree | change | completion | structural | flags |');
  lines.push('|---|---|---|---|---|---|');
  for (const g of report.gaps) {
    const completion = g.noCheckboxes ? `0/0${g.archived ? ' (archived)' : ''}` : `${g.done}/${g.total} (${g.completionPct}%)`;
    const flags: string[] = [];
    if (!g.hasProposal) flags.push('no proposal.md');
    if (!g.hasSpecs) flags.push('no specs/');
    if (g.stalenessMarkersFound.length > 0) flags.push(`stale: ${g.stalenessMarkersFound.join(',')}`);
    lines.push(
      `| ${g.auditScore} | ${g.tree} | ${g.changeName} | ${completion} | ${g.structuralScore} | ${flags.join('; ') || '-'} |`
    );
  }
  lines.push('');
  lines.push('## Staleness markers found (informational — not auto-corrected)');
  lines.push('');
  if (report.stalenessFlagged.length === 0) {
    lines.push('None found.');
  } else {
    for (const s of report.stalenessFlagged) {
      lines.push(`- \`${s.path}\` (${s.tree}): ${s.markers.join(', ')}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
