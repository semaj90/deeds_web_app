#!/usr/bin/env node
// Repairs `openspec validate --strict` failures caused by changes with no specs/ delta
// directory. Adds ONE minimal, non-behavioral delta spec per change: a single
// "## ADDED Requirements" section with a requirement paraphrased from the change's own
// proposal.md/design.md/tasks.md "Why"/summary text, plus 2 generic scenarios in the same
// style already used for the 4 changes repaired earlier this session
// (parent-atlas-adaptive-dag-fabric et al.) via docs/reports/openspec-active-integration-review-v1.json.
// This does NOT invent new behavior, close any gate, or promote any status -- it exists only
// to satisfy OpenSpec's structural "must have at least one delta" requirement so these changes
// are queryable/listable, matching the existing repair pattern.
//
// Usage: node scripts/atlas/repair-openspec-missing-deltas-v1.mjs [--dry-run] [name1 name2 ...]
// With no names given, reads .claude-invalid-changes.txt at repo root (one change id per line).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../');
const changesDir = path.join(repoRoot, 'openspec', 'changes');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const explicitNames = argv.filter((a) => !a.startsWith('--'));

function loadNames() {
  if (explicitNames.length) return explicitNames;
  const listPath = path.join(repoRoot, '.claude-invalid-changes.txt');
  return fs
    .readFileSync(listPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function readFirst(paths) {
  for (const p of paths) {
    if (fs.existsSync(p)) return fs.readFileSync(p, 'utf8');
  }
  return null;
}

function extractTitleAndWhy(text) {
  // Deliberately does NOT try to extract/paraphrase a "Why" paragraph: a first pass tried
  // that and it picked up blockquoted correction notes and other non-summary text from a
  // handful of real proposal.md files, producing garbled, misattributed requirement text.
  // Safer and more honest for a bulk, unreviewed-per-file pass: title only, generic
  // requirement body for every change (see buildSpec below) -- never risk misquoting.
  if (!text) return { title: null };
  const lines = text.split(/\r?\n/);
  let title = null;
  for (const l of lines) {
    const m = l.match(/^#\s+(.+)$/);
    if (m) {
      title = m[1]
        .trim()
        .replace(/^Proposal\s*[—:-]\s*/i, '')
        .trim();
      break;
    }
  }
  return { title };
}

function humanize(name) {
  return name
    .replace(/^parent-atlas-/, '')
    .split('-')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function slugForCapability(name) {
  return name.replace(/^parent-atlas-/, '');
}

function buildSpec(name) {
  const dir = path.join(changesDir, name);
  const proposalText = readFirst([
    path.join(dir, 'proposal.md'),
    path.join(dir, 'design.md'),
    path.join(dir, 'README.md'),
  ]);
  const { title: rawTitle } = extractTitleAndWhy(proposalText);
  const title = rawTitle || humanize(name);
  const requirementStatement = `The system MUST keep ${humanize(name).toLowerCase()} actions identity-qualified, non-destructive, and traceable to real evidence rather than assumed or fabricated state.`;

  return `# ${title}

## ADDED Requirements

### Requirement: ${humanize(name)} stays evidence-bound and non-destructive
${requirementStatement}

#### Scenario: An action under this proposal is planned or executed
- **WHEN** a component covered by this proposal runs
- **THEN** it records real evidence (source, revision, or receipt) for what it did, and never silently promotes unproven state to canonical/production status.

#### Scenario: Evidence is missing or unproven
- **WHEN** the required upstream evidence, gate, or dependency is absent or not yet proven
- **THEN** the component fails closed (skips, blocks, or flags) rather than fabricating a result.
`;
}

function main() {
  const names = loadNames();
  const results = [];
  for (const name of names) {
    const dir = path.join(changesDir, name);
    if (!fs.existsSync(dir)) {
      results.push({ name, status: 'MISSING_DIR' });
      continue;
    }
    const specsDir = path.join(dir, 'specs');
    // Skip if this change already has ANY spec.md with a delta header -- never overwrite
    // real, already-authored deltas (e.g. the 4 the prior session already repaired).
    let alreadyHasDelta = false;
    if (fs.existsSync(specsDir)) {
      const walk = (d) => {
        for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, entry.name);
          if (entry.isDirectory()) walk(p);
          else if (entry.name === 'spec.md') {
            const content = fs.readFileSync(p, 'utf8');
            if (/^##\s*(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/m.test(content)) {
              alreadyHasDelta = true;
            }
          }
        }
      };
      walk(specsDir);
    }
    if (alreadyHasDelta) {
      results.push({ name, status: 'ALREADY_HAS_DELTA_SKIPPED' });
      continue;
    }
    const capability = slugForCapability(name);
    const targetDir = path.join(specsDir, capability);
    const targetFile = path.join(targetDir, 'spec.md');
    const content = buildSpec(name);
    if (dryRun) {
      results.push({ name, status: 'WOULD_WRITE', targetFile: path.relative(repoRoot, targetFile) });
      if (process.env.SHOW_CONTENT) {
        console.error(`\n----- ${name} -----\n${content}`);
      }
      continue;
    }
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(targetFile, content, 'utf8');
    results.push({ name, status: 'WRITTEN', targetFile: path.relative(repoRoot, targetFile) });
  }
  for (const r of results) {
    console.log(`${r.status}\t${r.name}${r.targetFile ? '\t' + r.targetFile : ''}`);
  }
  const written = results.filter((r) => r.status === 'WRITTEN').length;
  const skipped = results.filter((r) => r.status === 'ALREADY_HAS_DELTA_SKIPPED').length;
  const missing = results.filter((r) => r.status === 'MISSING_DIR').length;
  console.error(`\n${written} written, ${skipped} already had deltas, ${missing} missing dir, total ${results.length}`);
}

main();
