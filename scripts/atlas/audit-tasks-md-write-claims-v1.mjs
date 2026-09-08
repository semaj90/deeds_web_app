#!/usr/bin/env node
/**
 * Bounded first pass at the still-open validation item "No database, Qdrant,
 * graph, cache, or production mutation occurs during read-only gates" in
 * parent-atlas-retrieval-lineage-dag-convergence/tasks.md. That item's own
 * 2026-09-02 interim note explicitly says a full line-by-line audit of every
 * [x] item's underlying script was "left for the deliberate final pass" --
 * this is that pass's first, cheapest layer: a text-level scan of what each
 * REAL_TASK_ID block (reusing the same classifier as
 * audit-tasks-md-evidence-links-v2.mjs) itself explicitly claims about writes,
 * not a re-execution of the underlying scripts or a live DB/Qdrant diff.
 *
 * A block is UNCLEAR if its own text contains neither an explicit no-write
 * assertion NOR an explicit authorized-write acknowledgement -- those are the
 * only blocks that need a real manual/live-diff follow-up. A block with an
 * explicit assertion either way is NOT re-verified here against the live
 * system; this only checks internal consistency of the file's own claims.
 *
 * Zero writes. Prints only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.argv[2];
if (!path) {
  console.error('usage: node audit-tasks-md-write-claims-v1.mjs <tasks.md path>');
  process.exit(1);
}
const text = readFileSync(resolve(path), 'utf8');
const lines = text.split('\n');

const TASK_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+(?:\.\d+)?$/;

// \s+ (not a literal single space) between tokens -- bullets wrap across
// lines in this file, so "No\n  Postgres writes were made" is common and a
// literal " " misses it. Fixed after v2 of this checker found the same bug
// live against RETRIEVAL-01L's own text.
const NO_WRITE_RE = /writesPerformed['":\s]*false|no\s+writes|zero\s+writes|writes:\s*0\b|read[- ]only|no\s+(postgres|qdrant|neo4j|valkey|redis|database|db|graph|cache)[\w\s/,-]*(writes?|mutations?|changes?)\s*(occurred|were made|performed)?/i;
const AUTHORIZED_WRITE_RE = /writesPerformed['":\s]*true|authorized\s+(apply|canary|write|mutation)|applied\s+(live|via)|`APPLY_PROVEN`|APPLY_PROVEN|canary\s+(proves?|proved)|separately[- ]authorized|explicitly authorized/i;

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

const checkedTaskIdBlocks = blocks.filter((b) => b.checked && b.classification === 'REAL_TASK_ID');

const results = checkedTaskIdBlocks.map((b) => {
  const fullText = b.lines.join('\n');
  const hasNoWriteClaim = NO_WRITE_RE.test(fullText);
  const hasAuthorizedWriteClaim = AUTHORIZED_WRITE_RE.test(fullText);
  let verdict;
  if (hasNoWriteClaim && hasAuthorizedWriteClaim) verdict = 'MIXED_BOTH_CLAIMS_PRESENT';
  else if (hasNoWriteClaim) verdict = 'CLAIMS_NO_WRITE';
  else if (hasAuthorizedWriteClaim) verdict = 'CLAIMS_AUTHORIZED_WRITE';
  else verdict = 'UNCLEAR_NEEDS_MANUAL_REVIEW';
  return { id: b.id, verdict };
});

const summary = results.reduce((acc, r) => {
  acc[r.verdict] = (acc[r.verdict] ?? 0) + 1;
  return acc;
}, {});

console.log(JSON.stringify({
  schema: 'atlas.tasks-md-write-claims.v1',
  writesPerformed: false,
  totalRealTaskIdItemsChecked: results.length,
  summary,
  unclear: results.filter((r) => r.verdict === 'UNCLEAR_NEEDS_MANUAL_REVIEW').map((r) => r.id),
  mixed: results.filter((r) => r.verdict === 'MIXED_BOTH_CLAIMS_PRESENT').map((r) => r.id),
  note: 'This checks what each block CLAIMS about writes, not the live DB/Qdrant/Neo4j/Valkey state. A block with a clear claim either way is not independently re-verified here.',
}, null, 2));
