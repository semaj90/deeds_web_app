#!/usr/bin/env node
/**
 * Task-ID-aware evidence-link checker for a tasks.md file (validation record
 * item "All completed items above have linked reports, not merely code
 * existence"). Supersedes audit-tasks-md-evidence-links-v1.mjs's task-ID
 * detection ONLY -- v1 is left in place unmodified (archive-not-delete
 * convention; other callers may still reference it) and this is a new,
 * additive file, not an edit to it.
 *
 * v1's block parser grouped every `- [x] <first-word>` bullet as a "task ID",
 * so generic prose bullets ("Classify the ten live...", "Keep source
 * lineage...") and bare numbered-list items ("13 Re-run the cohort audit...")
 * were counted as unevidenced task IDs even though they were never meant to
 * be independently-evidenced gates. This version classifies each bullet's
 * first token as REAL_TASK_ID only if it matches this file's own actual
 * task-ID shape (observed across ~170 real gates in this file: uppercase
 * segments joined by hyphens, e.g. LINEAGE-02, DAG-RUNTIME-01D.2,
 * MCP-OUTCOME-RECEIPT-OWNER-01, PKT-LINEAGE-08) and reports GENERIC_BULLET
 * items separately, informationally, without requiring evidence from them.
 *
 * Zero writes. Prints only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.argv[2];
if (!path) {
  console.error('usage: node audit-tasks-md-evidence-links-v2.mjs <tasks.md path>');
  process.exit(1);
}
const text = readFileSync(resolve(path), 'utf8');
const lines = text.split('\n');

const EVIDENCE_RE = /docs\/reports\/[\w./-]+\.json|`[\w./-]+\.(ts|mjs|mts|sql|py)`|\d+\/\d+\s+tests?\s+pass|tests?\s+passed/i;

// Matches the real task-ID shape used throughout this file: an uppercase-led
// token, at least one hyphen-joined uppercase/digit segment, and an optional
// dotted sub-index (e.g. "01D.2"). Deliberately does NOT match bare numbers
// ("13"), single prose words ("Classify"), or lowercase words -- those are
// the exact false-positive classes v1 mis-tagged as task IDs.
const TASK_ID_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+(?:\.\d+)?$/;

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
  // Strip a single trailing punctuation char some bullets carry right after
  // the token (e.g. "LINEAGE-02," or "PROMOTION-01:") before classifying.
  const token = b.firstToken.replace(/[,:;]$/, '');
  b.id = token;
  b.classification = TASK_ID_RE.test(token) ? 'REAL_TASK_ID' : 'GENERIC_BULLET';
}

const checkedBlocks = blocks.filter((b) => b.checked);
const checkedTaskIdBlocks = checkedBlocks.filter((b) => b.classification === 'REAL_TASK_ID');
const checkedGenericBlocks = checkedBlocks.filter((b) => b.classification === 'GENERIC_BULLET');

const missing = [];
for (const b of checkedTaskIdBlocks) {
  const fullText = b.lines.join('\n');
  if (!EVIDENCE_RE.test(fullText)) missing.push(b.id);
}

console.log(JSON.stringify({
  schema: 'atlas.tasks-md-evidence-links.v2',
  writesPerformed: false,
  totalCheckedItems: checkedBlocks.length,
  totalCheckedRealTaskIdItems: checkedTaskIdBlocks.length,
  totalCheckedGenericBulletItems: checkedGenericBlocks.length,
  itemsWithEvidenceReference: checkedTaskIdBlocks.length - missing.length,
  itemsWithoutEvidenceReference: missing,
  note: 'GENERIC_BULLET items are informational only and are not required to carry independent evidence -- they are narrative/continuation bullets under a parent gate, not standalone task IDs.',
}, null, 2));
