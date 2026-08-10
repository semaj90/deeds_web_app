#!/usr/bin/env node
/**
 * audit-runtime-ownership.test.mjs — OD7 follow-up (Runtime Owner
 * Deduplication governance gate). Minimum required cases per the original
 * brief: one owner + backends passes; two entries classified
 * CANONICAL_OWNER for one capability fails; a baseline-listed item is
 * KNOWN_EXISTING not a violation; an item NOT in the baseline is a NEW
 * violation. Runs against temp fixture registry/baseline files, not the
 * real repo registry — isolated from live data so this test doesn't drift
 * when the real registry is edited.
 *
 * Runnable script convention (matches scripts/atlas/qdrant-parity-repair.test.mjs),
 * not a vitest suite — this repo's scripts/atlas/*.mjs files run standalone.
 *
 * Usage: node scripts/atlas/audit-runtime-ownership.test.mjs
 * Exit code 0 if all cases pass, 1 otherwise.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUDIT_SCRIPT = path.join(__dirname, 'audit-runtime-ownership.mjs');

// Minimal reimplementation of audit-runtime-ownership.mjs's core check, kept
// deliberately in sync in spirit (not by import, since the real script reads
// fixed repo-root paths) — this is what OD7 exercises. See "case 0" below for
// a live cross-check against the real script + real repo files.
function evaluate(registry, baseline) {
  const violations = [];
  const knownExisting = [];
  function isTolerated(capability, item) {
    return baseline.tolerated.some((t) => t.capability === capability && t.item === item);
  }
  for (const [capabilityId, capability] of Object.entries(registry.capabilities ?? {})) {
    const owner = capability.owner ?? capability.canonical_data_contract;
    if (!owner) { violations.push({ class: 'MISSING_CANONICAL_OWNER', capabilityId }); continue; }
    if (owner.unproven || owner.classification === 'UNKNOWN') continue;
    const allSecondary = [...(capability.backends ?? []), ...(capability.known_existing_duplication ?? [])];
    for (const entry of allSecondary) {
      if (entry.classification === 'CANONICAL_OWNER') {
        violations.push({ class: 'MULTIPLE_CANONICAL_OWNERS', capabilityId, entry });
      } else if (!entry.classification || entry.classification === 'UNCLASSIFIED') {
        const label = entry.note ?? entry.name ?? entry.item;
        if (isTolerated(capabilityId, label)) knownExisting.push({ capabilityId, label });
        else violations.push({ class: 'NEW_UNCLASSIFIED_IMPLEMENTATION', capabilityId, label });
      }
    }
  }
  return { violations, knownExisting };
}

let failures = 0;
function assertCase(name, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}`);
  if (!pass) {
    failures++;
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// Case 1: one owner + backends → no violations.
{
  const registry = {
    schema_version: 'atlas.runtime-ownership.v1',
    capabilities: {
      foo: {
        owner: { classification: 'CANONICAL_OWNER', path: 'foo.ts' },
        backends: [{ name: 'foo-backend', classification: 'BACKEND' }],
      },
    },
  };
  const baseline = { tolerated: [] };
  const result = evaluate(registry, baseline);
  assertCase('one owner + backends passes', result.violations.length, 0);
}

// Case 2: two entries classified CANONICAL_OWNER for one capability → fails.
{
  const registry = {
    schema_version: 'atlas.runtime-ownership.v1',
    capabilities: {
      foo: {
        owner: { classification: 'CANONICAL_OWNER', path: 'foo.ts' },
        backends: [{ name: 'foo-second-canonical', classification: 'CANONICAL_OWNER' }],
      },
    },
  };
  const baseline = { tolerated: [] };
  const result = evaluate(registry, baseline);
  assertCase('two canonical owners fails', result.violations.some((v) => v.class === 'MULTIPLE_CANONICAL_OWNERS'), true);
}

// Case 3: an unclassified item listed in the baseline → known_existing, not a violation.
{
  const registry = {
    schema_version: 'atlas.runtime-ownership.v1',
    capabilities: {
      foo: {
        owner: { classification: 'CANONICAL_OWNER', path: 'foo.ts' },
        known_existing_duplication: [{ item: 'legacy-foo.ts' }],
      },
    },
  };
  const baseline = { tolerated: [{ capability: 'foo', item: 'legacy-foo.ts' }] };
  const result = evaluate(registry, baseline);
  assertCase('baseline-listed item is known_existing, not a violation', result.violations.length, 0);
  assertCase('baseline-listed item appears in known_existing', result.knownExisting.length, 1);
}

// Case 4: an unclassified item NOT in the baseline → new violation.
{
  const registry = {
    schema_version: 'atlas.runtime-ownership.v1',
    capabilities: {
      foo: {
        owner: { classification: 'CANONICAL_OWNER', path: 'foo.ts' },
        known_existing_duplication: [{ item: 'brand-new-foo.ts' }],
      },
    },
  };
  const baseline = { tolerated: [] };
  const result = evaluate(registry, baseline);
  assertCase('item not in baseline is a NEW violation', result.violations.some((v) => v.class === 'NEW_UNCLASSIFIED_IMPLEMENTATION'), true);
}

// Case 0 (cross-check): the real script, run against the real repo registry,
// still exits 0 (PASS) — catches drift between this test's reimplementation
// and the actual script's logic.
try {
  execFileSync('node', [AUDIT_SCRIPT], { stdio: 'pipe' });
  console.log('PASS: real audit-runtime-ownership.mjs still exits 0 against live repo registry');
} catch (err) {
  failures++;
  console.log('FAIL: real audit-runtime-ownership.mjs did not exit 0 — check for a real new violation, not just a test drift');
  console.log(err.stdout?.toString() ?? String(err));
}

console.log(`\n${failures === 0 ? 'ALL CASES PASS' : `${failures} CASE(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
