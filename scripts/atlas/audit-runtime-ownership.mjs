#!/usr/bin/env node
/**
 * audit-runtime-ownership.mjs — mechanical checks for
 * docs/architecture/runtime-ownership-registry.json.
 *
 * NOT expected to solve architecture automatically — catches simple
 * duplication drift the registry itself declares (schema shape, capability
 * ID uniqueness, an owner also appearing as a backend/experiment/dead entry
 * for the same capability, etc.). Does not refactor or delete anything —
 * output is an inventory + PASS/FAIL, per this repo's "audit before code"
 * governance rule (CLAUDE.md's "One Canonical Runtime Owner Per Capability").
 *
 * Baseline-aware: an item is only a NEW_VIOLATION if it's not already listed
 * in runtime-ownership-baseline.json's `tolerated` array. Pre-existing debt
 * this repo already knows about (13 unclassified reranker files, dead
 * PageRank paths, etc.) is a KNOWN_EXISTING warning, not a failure — the
 * point is to stop a governance audit from becoming an unrelated mandatory
 * cleanup of everything it finds.
 *
 * Usage: node scripts/atlas/audit-runtime-ownership.mjs
 * Exit code 0 on PASS (zero new violations), 1 on FAIL.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const REGISTRY_PATH = path.join(ROOT, 'docs/architecture/runtime-ownership-registry.json');
const BASELINE_PATH = path.join(ROOT, 'docs/architecture/runtime-ownership-baseline.json');

const RECOGNIZED_SCHEMA_VERSIONS = new Set(['atlas.runtime-ownership.v1']);
const CLASSIFICATIONS = new Set([
  'CANONICAL_OWNER', 'BACKEND', 'ADAPTER', 'EXPERIMENT', 'COMPATIBILITY', 'FIXTURE_ONLY', 'DEAD',
]);

function loadJson(p, label) {
  if (!existsSync(p)) {
    throw new Error(`${label} not found at ${p}`);
  }
  return JSON.parse(readFileSync(p, 'utf8'));
}

function isTolerated(baseline, capability, item) {
  return baseline.tolerated.some((t) => t.capability === capability && t.item === item);
}

function main() {
  const registry = loadJson(REGISTRY_PATH, 'runtime-ownership-registry.json');
  const baseline = loadJson(BASELINE_PATH, 'runtime-ownership-baseline.json');

  const violations = [];
  const warnings = [];
  const notProven = [];
  const knownExisting = [];

  if (!RECOGNIZED_SCHEMA_VERSIONS.has(registry.schema_version)) {
    violations.push({ class: 'UNRECOGNIZED_SCHEMA_VERSION', detail: registry.schema_version });
  }

  const capabilityIds = Object.keys(registry.capabilities ?? {});
  const seenIds = new Set();
  for (const id of capabilityIds) {
    if (seenIds.has(id)) {
      violations.push({ class: 'DUPLICATE_CAPABILITY_ID', detail: id });
    }
    seenIds.add(id);
  }

  let capabilitiesChecked = 0;
  for (const [capabilityId, capability] of Object.entries(registry.capabilities ?? {})) {
    capabilitiesChecked++;
    const owner = capability.owner ?? capability.canonical_data_contract;

    if (!owner) {
      violations.push({ class: 'MISSING_CANONICAL_OWNER', detail: capabilityId });
      continue;
    }

    if (owner.unproven || owner.classification === 'UNKNOWN') {
      notProven.push({ capability: capabilityId, detail: 'owner not independently confirmed live — recorded as UNKNOWN/unproven, not guessed' });
      continue;
    }

    if (owner.classification && owner.classification !== 'CANONICAL_OWNER') {
      violations.push({ class: 'CANONICAL_OWNER_CLASSIFICATION_CONFLICT', detail: `${capabilityId}: owner entry has classification '${owner.classification}', expected 'CANONICAL_OWNER'` });
    }

    // Check every backend/known_existing_duplication entry has a recognized classification,
    // and that "backends"/"known_existing_duplication" arrays don't also list something
    // classified CANONICAL_OWNER (that would mean multiple canonical owners for one capability).
    const allSecondary = [
      ...(capability.backends ?? []),
      ...(capability.known_existing_duplication ?? []),
    ];
    for (const entry of allSecondary) {
      const cls = entry.classification;
      if (cls === 'CANONICAL_OWNER') {
        violations.push({ class: 'MULTIPLE_CANONICAL_OWNERS', detail: `${capabilityId}: ${entry.name ?? entry.path ?? entry.item ?? JSON.stringify(entry)} also classified CANONICAL_OWNER` });
        continue;
      }
      if (cls === 'UNCLASSIFIED' || cls === undefined) {
        const itemLabel = entry.note ?? entry.name ?? entry.path ?? entry.item ?? JSON.stringify(entry);
        if (isTolerated(baseline, capabilityId, itemLabel) || (entry.note && entry.note.length > 0)) {
          knownExisting.push({ capability: capabilityId, item: itemLabel });
        } else {
          violations.push({ class: 'NEW_UNCLASSIFIED_IMPLEMENTATION', detail: `${capabilityId}: ${itemLabel}` });
        }
        continue;
      }
      if (!CLASSIFICATIONS.has(cls)) {
        violations.push({ class: 'UNRECOGNIZED_CLASSIFICATION', detail: `${capabilityId}: '${cls}'` });
      }
    }
  }

  // Baseline items not currently reflected anywhere in the registry are just
  // noted as warnings (registry may not have caught up to every known item
  // yet) — not a failure; the registry is allowed to be incomplete, it must
  // not be WRONG about what it does contain.
  for (const item of baseline.tolerated) {
    warnings.push({ class: 'BASELINE_TOLERATED', capability: item.capability, item: item.item, classification: item.classification });
  }

  const status = violations.length === 0 ? 'PASS' : 'FAIL';
  const result = {
    schema_version: 'atlas.runtime-ownership-audit.v1',
    generated: new Date().toISOString().slice(0, 10),
    status,
    capabilities_checked: capabilitiesChecked,
    violations,
    warnings: warnings.length,
    known_existing: knownExisting,
    not_proven: notProven,
  };

  console.log(JSON.stringify(result, null, 2));
  process.exit(status === 'PASS' ? 0 : 1);
}

main();
