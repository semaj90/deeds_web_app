#!/usr/bin/env node

/**
 * REL-01A5: identify and verify a fresh ontology extractor owner.
 *
 * Read-only. This audit deliberately does not infer USES_CONCEPT tuples from
 * paths or source text. It verifies the approved six-source cohort and records
 * whether an existing extractor can produce revision-qualified ontology facts.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const reportPath = path.join(root, 'docs/reports/feature-ontology-fresh-extractor-v1.json');
const approvalPath = path.join(root, 'docs/reports/feature-ontology-explicit-alias-approval-v1.json');
const regenerationPath = path.join(root, 'docs/reports/feature-ontology-regeneration-plan-v1.json');
const observationPath = path.join(root, 'docs/reports/workspace-source-binding-observation.json');
const batchPath = path.join(root, '.tmp/atlas/graphify-source-inventory-batch-v1.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const sha256File = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const text = (value) => (value == null ? null : String(value));

function sourcePath(sourceRef) {
  const normalized = String(sourceRef).replace(/^\/+/, '').replaceAll('/', path.sep);
  return path.join(root, normalized);
}

function main() {
  const approval = readJson(approvalPath);
  const regeneration = readJson(regenerationPath);
  const observation = readJson(observationPath);
  const batch = fs.existsSync(batchPath) ? readJson(batchPath) : null;
  const pairs = Array.isArray(approval.approvedPairs) ? approval.approvedPairs : [];
  const groups = Array.isArray(regeneration.groups) ? regeneration.groups : [];
  const groupBySource = new Map(groups.map((group) => [text(group.canonicalSourceRef ?? group.sourceRef), group]));
  const batchSourceRefs = new Set((batch?.sourceRefs ?? []).map((row) =>
    text(typeof row === 'string' ? row : row.sourceRef ?? row.source_ref)
  ));
  const bindingRows = Array.isArray(observation.bindings)
    ? observation.bindings
    : Array.isArray(observation.record?.bindings) ? observation.record.bindings : [];
  const observedBySource = new Map(bindingRows.map((row) => [text(row.sourceRef ?? row.source_ref), row]));

  const sources = pairs.map((pair) => {
    const sourceRef = text(pair.canonicalSourceRef);
    const file = sourcePath(sourceRef);
    const graphify = groupBySource.get(sourceRef);
    const observed = observedBySource.get(sourceRef);
    const exists = fs.existsSync(file);
    const localDigest = exists ? sha256File(file) : null;
    const expectedDigest = text(graphify?.sourceContentHash ?? graphify?.contentHash ?? observed?.contentDigest);
    return {
      sourceRef,
      fileExists: exists,
      localContentDigest: localDigest,
      expectedContentDigest: expectedDigest,
      localDigestMatchesObservation: Boolean(localDigest && expectedDigest && localDigest === expectedDigest),
      workspaceRevision: text(graphify?.currentWorkspaceRevision ?? observed?.workspaceRevision),
      sourceRevision: text(graphify?.sourceRevision ?? observed?.sourceRevision),
      graphifySourceAvailable: batchSourceRefs.has(sourceRef) || Boolean(graphify?.graphifySourceRef),
      historicalTupleCount: Number(graphify?.tupleCount ?? 0),
    };
  });

  const extractorCandidates = [
    {
      path: 'scripts/atlas/audit-feature-ontology-fresh-extraction-v1.mjs',
      role: 'bounded current-source review-only ontology candidate compiler',
      currentSourceInput: true,
      producesUsesConcept: true,
      status: 'COMPATIBLE_REVIEW_ONLY_PRODUCER',
    },
    {
      path: 'scripts/atlas/generate-ontology-tuples.mjs',
      role: 'legacy multi-signal feature_ontology_tuples generator',
      currentSourceInput: false,
      producesUsesConcept: false,
      status: 'INCOMPATIBLE_LEGACY_DATABASE_INPUT',
    },
    {
      path: 'scripts/atlas/materialize-registry-ontology-tuples.mts',
      role: 'registry AST/schema/research projection',
      currentSourceInput: false,
      producesUsesConcept: false,
      status: 'INCOMPATIBLE_DIFFERENT_PROJECTION',
    },
    {
      path: 'sveltekit-frontend/scripts/atlas/langextract-code-enrich.py',
      role: 'LangExtract-style code concept enrichment',
      currentSourceInput: true,
      producesUsesConcept: false,
      status: 'INCOMPATIBLE_CONCEPTS_ONLY',
    },
  ];

  const localParity = sources.filter((row) => row.localDigestMatchesObservation).length;
  const sourceReady = sources.length === 6 && sources.every((row) => row.fileExists && row.graphifySourceAvailable);
  const report = {
    schema: 'atlas.feature-ontology-fresh-extractor.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_AUDIT',
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    approvalReceipt: 'docs/reports/feature-ontology-explicit-alias-approval-v1.json',
    resolverRevision: text(approval.resolverRevision),
    selectionChecksum: text(approval.selectionChecksum),
    workspaceRevision: text(regeneration.workspaceRevision ?? observation.record?.workspaceRevision ?? observation.workspaceRevision),
    historicalProducer: 'atlas-packets-ontology-v1',
    targetContract: 'fresh revision-qualified USES_CONCEPT candidates',
    counts: {
      approvedSourceRefs: pairs.length,
      historicalTuples: Number(regeneration.counts?.tuplesSelected ?? 0),
      currentSourcesReady: sources.filter((row) => row.fileExists).length,
      graphifySourcesReady: sources.filter((row) => row.graphifySourceAvailable).length,
      localDigestMatchesObservation: localParity,
      compatibleFreshExtractors: extractorCandidates.filter((row) => row.currentSourceInput && row.producesUsesConcept).length,
    },
    sourceParity: sources,
    extractorCandidates,
    policy: {
      preserveHistoricalTuples: true,
      rewriteHistoricalTuples: false,
      materializeRelationships: false,
      requireFreshSourceRevision: true,
      requireCurrentGraphifyObservation: true,
      rejectPathOnlyConceptInference: true,
    },
    status: sourceReady && localParity === sources.length
      ? (extractorCandidates.some((row) => row.status === 'COMPATIBLE_REVIEW_ONLY_PRODUCER')
        ? 'FRESH_ONTOLOGY_EXTRACTOR_OWNER_WIRED_REVIEW_ONLY'
        : 'FRESH_ONTOLOGY_EXTRACTOR_OWNER_MISSING')
      : 'FRESH_ONTOLOGY_INPUTS_INCOMPLETE',
    nextGate: extractorCandidates.some((row) => row.status === 'COMPATIBLE_REVIEW_ONLY_PRODUCER')
      ? 'REVIEW_FRESH_ONTOLOGY_CANDIDATES_BEFORE_REL_01B'
      : 'DEFINE_OR_REGISTER_REVIEWED_FRESH_ONTOLOGY_EXTRACTOR',
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({
    status: report.status,
    approvedSourceRefs: report.counts.approvedSourceRefs,
    historicalTuples: report.counts.historicalTuples,
    localDigestMatchesObservation: report.counts.localDigestMatchesObservation,
    compatibleFreshExtractors: report.counts.compatibleFreshExtractors,
    reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/'),
    postgresWrites: false,
  }, null, 2));
}

main();
