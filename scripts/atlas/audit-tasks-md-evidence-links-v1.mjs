#!/usr/bin/env node
/**
 * Interim, read-only evidence-link spot check for a tasks.md file (validation
 * record item 44 -- "all completed items above have linked reports, not
 * merely code existence"). Run as an interim check, not a final checkoff:
 * the validation record's own checkbox stays unchecked until a full pass is
 * done deliberately, per operator instruction.
 *
 * Groups each `- [x] TASK-ID —` bullet with its full indented continuation
 * text (up to the next top-level `- [ ]`/`- [x]` bullet or a blank line
 * followed by a heading), then checks whether that full block cites at
 * least one of: a docs/reports/*.json path, a source file path in backticks
 * ending .ts/.mjs/.mts/.sql, or an explicit test-pass phrase ("tests
 * passed", "N/N tests").
 *
 * Zero writes. Prints only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const path = process.argv[2];
if (!path) { console.error('usage: node audit-tasks-md-evidence-links-v1.mjs <tasks.md path>'); process.exit(1); }
const text = readFileSync(resolve(path), 'utf8');
const lines = text.split('\n');

const EVIDENCE_RE = /docs\/reports\/[\w./-]+\.json|`[\w./-]+\.(ts|mjs|mts|sql|py)`|\d+\/\d+\s+tests?\s+pass|tests?\s+passed/i;

const blocks = [];
let current = null;
for (const line of lines) {
  const bulletMatch = line.match(/^- \[( |x)\] (\S+)/);
  if (bulletMatch) {
    if (current) blocks.push(current);
    current = { checked: bulletMatch[1] === 'x', id: bulletMatch[2], lines: [line] };
    continue;
  }
  if (current) {
    // Continuation lines are indented (start with whitespace) or blank-then-more-indent.
    if (/^\s+\S/.test(line)) {
      current.lines.push(line);
    } else {
      blocks.push(current);
      current = null;
    }
  }
}
if (current) blocks.push(current);

const checkedBlocks = blocks.filter((b) => b.checked);
const missing = [];
for (const b of checkedBlocks) {
  const fullText = b.lines.join('\n');
  if (!EVIDENCE_RE.test(fullText)) missing.push(b.id);
}

console.log(JSON.stringify({
  totalCheckedItems: checkedBlocks.length,
  itemsWithEvidenceReference: checkedBlocks.length - missing.length,
  itemsWithoutEvidenceReference: missing,
}, null, 2));
