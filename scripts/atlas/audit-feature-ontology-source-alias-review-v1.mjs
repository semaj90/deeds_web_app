#!/usr/bin/env node
/** Read-only review receipt for the legacy feature-ontology source-ref alias. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AST_SOURCE_REF_POLICY_V1 } from './lib/ast-source-ref-policy.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const INPUT = resolve(ROOT, 'docs/reports/feature-ontology-current-cohort-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/feature-ontology-source-alias-review-v1.json');

const clean = (value) => {
  const text = String(value ?? '').trim();
  return text || null;
};

function main() {
  const cohort = JSON.parse(readFileSync(INPUT, 'utf8'));
  const rows = Array.isArray(cohort.aliasReview?.candidates) ? cohort.aliasReview.candidates : [];
  const bySource = new Map();
  for (const row of rows) {
    const sourceRef = clean(row.sourceRef);
    if (!sourceRef || bySource.has(sourceRef)) continue;
    bySource.set(sourceRef, {
      sourceRef,
      proposedCanonicalSourceRef: clean(row.aliasSourceRef),
      observedInWorkspace: row.aliasObservedInWorkspace === true,
      resolution: row.aliasObservedInWorkspace === true ? 'EXPLICIT_ALIAS_REVIEW_ONLY' : 'UNRESOLVED',
      promotable: false,
    });
  }
  const candidates = [...bySource.values()].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const report = {
    schema: 'atlas.feature-ontology-source-alias-review.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_REVIEW',
    readOnly: true,
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    canonicalAuthorityChanged: false,
    approvalRequired: true,
    approved: false,
    policy: AST_SOURCE_REF_POLICY_V1,
    sourcePopulation: 'feature_ontology_tuples predicate USES_CONCEPT',
    inputReport: 'docs/reports/feature-ontology-current-cohort-v1.json',
    aliasRule: 'sveltekit-frontend/<frontend-relative-source-ref>',
    counts: {
      sourceRefsExamined: candidates.length,
      observedAliasSourceRefs: candidates.filter((row) => row.observedInWorkspace).length,
      unresolvedSourceRefs: candidates.filter((row) => !row.observedInWorkspace).length,
      promotableBindings: 0,
    },
    candidates,
    decision: 'REVIEW_REQUIRED_BEFORE_GRAPHIFY_LINEAGE_BINDING',
    nextGate: 'APPROVE_EXPLICIT_SOURCE_REF_ALIAS_OR_CLASSIFY_LEGACY_TUPLES',
  };
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ schema: report.schema, status: report.decision, counts: report.counts, reportPath: REPORT }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 2;
}
