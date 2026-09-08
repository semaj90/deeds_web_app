#!/usr/bin/env node
/**
 * v2 of the write-claims scan: for every REAL_TASK_ID checked block that v1
 * classified UNCLEAR_NEEDS_MANUAL_REVIEW (no inline no-write/authorized-write
 * phrase in the block's own prose), extract every cited `docs/reports/*.json`
 * path from that block and open each one, looking for a `writesPerformed`
 * (or close variant) boolean field -- the actual machine-checkable signal,
 * rather than trusting prose phrasing. This is the deeper layer the
 * validation item's 2026-09-02 note called "left for the deliberate final
 * pass": still text/file-level, not a live DB/Qdrant/Neo4j/Valkey diff, but
 * one level more authoritative than v1's prose-only scan.
 *
 * A block resolves to:
 *  - NO_WRITE_CONFIRMED_BY_REPORT: every cited report with a writesPerformed-
 *    shaped field says false, and at least one report was found and readable.
 *  - WRITE_CONFIRMED_BY_REPORT: at least one cited report says writes did
 *    occur (writesPerformed: true, or a mutation-count field > 0).
 *  - REPORT_FIELD_ABSENT: report(s) found and readable, but none carries a
 *    recognizable writesPerformed-shaped field -- still not resolved from
 *    the artifact alone.
 *  - REPORT_MISSING_OR_UNREADABLE: no cited report path resolved to a real,
 *    parseable file.
 *  - NO_REPORT_CITED: the block cites no docs/reports/*.json path at all.
 *
 * Zero writes. Prints only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const path = process.argv[2];
if (!path) {
  console.error('usage: node audit-tasks-md-write-claims-v2.mjs <tasks.md path>');
  process.exit(1);
}
const repoRoot = process.cwd();
const text = readFileSync(resolve(path), 'utf8');
const lines = text.split('\n');

const TASK_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+(?:\.\d+)?$/;
// \s+ (not a literal single space) between tokens throughout -- tasks.md
// bullets wrap across lines, so "No\n  Postgres/Qdrant writes were made" is
// common and a literal " " would miss it (found live: RETRIEVAL-01L's own
// "...paragraph. No\n  Postgres/Qdrant/Neo4j/Valkey writes were made by this
// closing pass." was missed by an earlier single-space version of this regex).
const NO_WRITE_RE = /writesPerformed['":\s]*false|no\s+writes|zero\s+writes|writes:\s*0\b|read[- ]only|no\s+(postgres|qdrant|neo4j|valkey|redis|database|db|graph|cache)[\w\s/,-]*(writes?|mutations?|changes?)\s*(occurred|were made|performed)?/i;
const AUTHORIZED_WRITE_RE = /writesPerformed['":\s]*true|authorized\s+(apply|canary|write|mutation)|applied\s+(live|via)|`APPLY_PROVEN`|APPLY_PROVEN|canary\s+(proves?|proved)|separately[- ]authorized|explicitly authorized/i;
const REPORT_PATH_RE = /docs\/reports\/[\w./-]+\.json/g;

const blocks = [];
let current = null;
for (const line of lines) {
  const bulletMatch = line.match(/^- \[( |x)\] (\S+)/);
  if (bulletMatch) {
    if (current) blocks.push(current);
    current = { checked: bulletMatch[1] === 'x', firstToken: bulletMatch[2], lines: [line] };
    continue;
  }
  if (current) {
    if (/^\s+\S/.test(line)) {
      current.lines.push(line);
    } else {
      blocks.push(current);
      current = null;
    }
  }
}
if (current) blocks.push(current);

for (const b of blocks) {
  const token = b.firstToken.replace(/[,:;]$/, '');
  b.id = token;
  b.classification = TASK_ID_RE.test(token) ? 'REAL_TASK_ID' : 'GENERIC_BULLET';
}

// Boolean writesPerformed-style fields, plus numeric write-count fields this
// file's own reports actually use (pointsWritten, rowsWritten, written,
// registered, applied-as-count) -- a numeric value is interpreted as "wrote"
// if > 0, "did not write" if === 0. This was widened after finding
// pkt-lineage-11's real reports use `pointsWritten: 6`, not `writesPerformed`.
// Matches writesPerformed, databaseWrites, productionWrites, qdrantWrites, etc.
// -- this file's reports use several variant names for the same boolean signal.
const BOOLEAN_FIELD_RE = /writes?(performed)?$/i;
const NUMERIC_FIELD_RE = /^(pointsWritten|rowsWritten|rowsUpdated|rowsInserted|written|registered|applied|mutationsApplied)$/i;

// A key prefixed "no"/"zero" (noWrites, zeroWritesConfirmed) inverts the
// boolean's meaning: noWrites=true means NO write occurred, not that one did.
// Found live: projection_registry_v1.noWrites=true was initially misread as a
// write confirmation before this fix -- fixed here, not worked around.
const NEGATED_KEY_RE = /^(no|zero)[A-Z]/;

function findWritesPerformed(obj, depth = 0) {
  if (depth > 3 || obj === null || typeof obj !== 'object') return [];
  const hits = [];
  for (const [key, value] of Object.entries(obj)) {
    if (BOOLEAN_FIELD_RE.test(key) && typeof value === 'boolean') {
      hits.push(NEGATED_KEY_RE.test(key) ? !value : value);
    } else if (NUMERIC_FIELD_RE.test(key) && typeof value === 'number') {
      hits.push(value > 0);
    } else if (typeof value === 'object') {
      hits.push(...findWritesPerformed(value, depth + 1));
    }
  }
  return hits;
}

const checkedTaskIdBlocks = blocks.filter((b) => b.checked && b.classification === 'REAL_TASK_ID');

const results = checkedTaskIdBlocks.map((b) => {
  const fullText = b.lines.join('\n');
  const hasNoWriteClaim = NO_WRITE_RE.test(fullText);
  const hasAuthorizedWriteClaim = AUTHORIZED_WRITE_RE.test(fullText);

  if (hasNoWriteClaim || hasAuthorizedWriteClaim) {
    return { id: b.id, verdict: hasAuthorizedWriteClaim ? 'CLAIMS_AUTHORIZED_WRITE_INLINE' : 'CLAIMS_NO_WRITE_INLINE' };
  }

  const reportPaths = [...new Set(fullText.match(REPORT_PATH_RE) ?? [])];
  if (reportPaths.length === 0) {
    return { id: b.id, verdict: 'NO_REPORT_CITED', reportPaths };
  }

  const readable = [];
  const missing = [];
  for (const rp of reportPaths) {
    const abs = join(repoRoot, rp);
    if (!existsSync(abs)) { missing.push(rp); continue; }
    try {
      const parsed = JSON.parse(readFileSync(abs, 'utf8'));
      readable.push({ path: rp, writesPerformedValues: findWritesPerformed(parsed) });
    } catch {
      missing.push(rp);
    }
  }

  if (readable.length === 0) {
    return { id: b.id, verdict: 'REPORT_MISSING_OR_UNREADABLE', reportPaths, missing };
  }

  const allValues = readable.flatMap((r) => r.writesPerformedValues);
  if (allValues.length === 0) {
    return { id: b.id, verdict: 'REPORT_FIELD_ABSENT', reportPaths: readable.map((r) => r.path) };
  }
  if (allValues.some((v) => v === true)) {
    return { id: b.id, verdict: 'WRITE_CONFIRMED_BY_REPORT', reportPaths: readable.map((r) => r.path) };
  }
  return { id: b.id, verdict: 'NO_WRITE_CONFIRMED_BY_REPORT', reportPaths: readable.map((r) => r.path) };
});

const summary = results.reduce((acc, r) => {
  acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
  return acc;
}, {});

const stillUnresolved = results.filter((r) =>
  ['REPORT_FIELD_ABSENT', 'REPORT_MISSING_OR_UNREADABLE', 'NO_REPORT_CITED'].includes(r.verdict)
);
const writeConfirmed = results.filter((r) => r.verdict === 'WRITE_CONFIRMED_BY_REPORT');

console.log(JSON.stringify({
  schema: 'atlas.tasks-md-write-claims.v2',
  writesPerformed: false,
  totalRealTaskIdItemsChecked: results.length,
  summary,
  writeConfirmedItems: writeConfirmed,
  stillUnresolved,
  note: 'Reads each cited docs/reports/*.json for a writesPerformed-shaped field. Does not re-execute scripts or diff live Postgres/Qdrant/Neo4j/Valkey state -- that remains a further, deeper layer if stillUnresolved or writeConfirmed items need it.',
}, null, 2));
