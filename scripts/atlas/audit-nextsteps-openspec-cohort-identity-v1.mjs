#!/usr/bin/env node
/**
 * Read-only identity comparison between the frozen 6,527 OpenSpec cohort and
 * the extracted nextsteps checklist tasks. It does not infer aliases or write
 * to a datastore.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OPENSPEC_PATH = path.join(ROOT, '.tmp/atlas/openspec-cohort-6527-members-v1.jsonl');
const NEXTSTEPS_PATH = path.join(ROOT, '.tmp/atlas/next-steps-task-extract-v1/20261108T181650Z/tasks.jsonl');
const REPORT_PATH = path.join(ROOT, 'docs/reports/nextsteps-openspec-prefill-identity-crosswalk-v1.json');

function readJsonl(filePath, identityField) {
  const bytes = fs.readFileSync(filePath);
  const lines = bytes.toString('utf8').split(/\r?\n/).filter((line) => line.trim());
  const rows = lines.map((line, index) => {
    let row;
    try {
      row = JSON.parse(line);
    } catch (error) {
      throw new Error(`INVALID_JSONL:${path.relative(ROOT, filePath)}:${index + 1}:${error.message}`);
    }
    if (typeof row[identityField] !== 'string' || !row[identityField].trim()) {
      throw new Error(`MISSING_IDENTITY:${path.relative(ROOT, filePath)}:${index + 1}:${identityField}`);
    }
    return row;
  });
  return {
    bytes,
    rows,
    identities: rows.map((row) => row[identityField]),
    sha256: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`,
  };
}

function duplicates(values) {
  const seen = new Set();
  const repeated = new Set();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

function suffix(identity) {
  return identity.slice(identity.lastIndexOf('#') + 1);
}

const openspec = readJsonl(OPENSPEC_PATH, 'canonical_task_key');
const nextsteps = readJsonl(NEXTSTEPS_PATH, 'taskKey');
const openspecIds = new Set(openspec.identities);
const openspecSuffixes = new Set(openspec.identities.map(suffix));
const exactMatches = nextsteps.identities.filter((identity) => openspecIds.has(identity)).sort();
const sharedSuffixes = nextsteps.identities.filter((identity) => openspecSuffixes.has(suffix(identity))).sort();
const nextstepsNamespaceViolations = nextsteps.rows.filter((row) =>
  typeof row.featureId !== 'string' || !row.featureId.startsWith('nextsteps:')
).length;

const report = {
  schema: 'atlas.nextsteps-openspec-prefill-identity-crosswalk.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  writesPerformed: false,
  inputs: {
    openspec: {
      path: path.relative(ROOT, OPENSPEC_PATH).replaceAll('\\', '/'),
      rows: openspec.rows.length,
      uniqueIdentities: openspecIds.size,
      duplicateIdentityCount: duplicates(openspec.identities).length,
      sha256: openspec.sha256,
    },
    nextsteps: {
      path: path.relative(ROOT, NEXTSTEPS_PATH).replaceAll('\\', '/'),
      rows: nextsteps.rows.length,
      uniqueIdentities: new Set(nextsteps.identities).size,
      duplicateIdentityCount: duplicates(nextsteps.identities).length,
      namespaceViolations: nextstepsNamespaceViolations,
      sha256: nextsteps.sha256,
    },
  },
  crosswalk: {
    exactIdentityMatches: exactMatches.length,
    sharedHashSuffixes: sharedSuffixes.length,
    sampleExactMatches: exactMatches.slice(0, 10),
    sampleSharedHashSuffixes: sharedSuffixes.slice(0, 10),
    aliasInferencePerformed: false,
  },
  status: exactMatches.length === 0 && sharedSuffixes.length === 0 &&
    openspecIds.size === openspec.rows.length && new Set(nextsteps.identities).size === nextsteps.rows.length &&
    nextstepsNamespaceViolations === 0 ? 'PASS_SEPARATE_IDENTITY_COHORTS' : 'REVIEW_REQUIRED',
  interpretation: 'No task identity mapping is established between these cohorts. Do not seed or claim nextsteps tasks from the OpenSpec prefill cohort using fuzzy, line-number, hash-suffix, ordinal, or generated aliases.',
};

fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  openspecRows: report.inputs.openspec.rows,
  nextstepsRows: report.inputs.nextsteps.rows,
  exactIdentityMatches: report.crosswalk.exactIdentityMatches,
  sharedHashSuffixes: report.crosswalk.sharedHashSuffixes,
  reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
}, null, 2));
process.exit(report.status === 'REVIEW_REQUIRED' ? 1 : 0);
