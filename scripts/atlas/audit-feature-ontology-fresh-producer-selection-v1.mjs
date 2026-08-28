#!/usr/bin/env node
/**
 * REL-01A7A: select a source producer for fresh ontology candidates.
 * Read-only: inventories existing producers and their proof artifacts; it
 * never calls a model, writes a database, or promotes ontology facts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(ROOT, 'docs', 'reports', 'feature-ontology-fresh-producer-selection-v1.json');
const approvalChecksum = '349253cdef7ba59e0a90d7fde6bfdec8526b6f4e1dbc9fb17797c9bd6120b79a';

function exists(relativePath) { return fs.existsSync(path.join(ROOT, relativePath)); }
function readJson(relativePath) {
  const absolute = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolute)) return null;
  try { return JSON.parse(fs.readFileSync(absolute, 'utf8')); } catch { return null; }
}

const observation = readJson('docs/reports/workspace-source-binding-observation.json');
const freshExtraction = readJson('docs/reports/feature-ontology-fresh-extraction-v1.json');
const structural = readJson('docs/reports/treesitter-structural-observation-v1.json');
const freshExtractor = readJson('docs/reports/feature-ontology-fresh-extractor-v1.json');
const sourceScope = readJson('docs/reports/source-scope-reconciliation-v1.json');

const producers = [
  {
    id: 'atlas-packets-ontology-v1',
    kind: 'DATABASE_PRODUCER',
    role: 'historical ontology tuples',
    status: 'STALE_DATABASE_INPUT',
    currentSourceBytes: false,
    exactCanonicalSourceRef: false,
    sourceRevisionSha256Bound: false,
    evidenceSpanGrounded: false,
    reviewOnly: false,
    canonicalAuthority: false,
    files: ['feature_ontology_tuples'],
  },
  {
    id: 'treesitter-chunker-structural-v1',
    kind: 'STRUCTURAL_ADAPTER',
    role: 'syntax spans, definitions, calls, imports, exports',
    status: exists('scripts/atlas/audit-treesitter-structural-observation-v1.mjs') && structural?.status === 'STRUCTURAL_OBSERVATIONS_PROVEN' ? 'REVIEW_ADAPTER_CANDIDATE_PROVEN_BOUNDED' : 'REVIEW_ADAPTER_CANDIDATE',
    currentSourceBytes: true,
    exactCanonicalSourceRef: true,
    sourceRevisionSha256Bound: true,
    evidenceSpanGrounded: true,
    reviewOnly: true,
    canonicalAuthority: false,
    files: ['scripts/atlas/audit-treesitter-structural-observation-v1.mjs', 'scripts/atlas/lib/treesitter-structural-observation-v1.mjs'],
  },
  {
    id: 'python-enrichment-v1',
    kind: 'NLP_ADAPTER',
    role: 'concept and entity proposals from the 8095 sidecar',
    status: exists('scripts/atlas/audit-feature-ontology-fresh-extraction-v1.mjs') && freshExtraction?.extractedSources === 6 ? 'REVIEW_ADAPTER_CANDIDATE_PROVEN_BOUNDED' : 'REVIEW_ADAPTER_CANDIDATE',
    currentSourceBytes: true,
    exactCanonicalSourceRef: true,
    sourceRevisionSha256Bound: true,
    evidenceSpanGrounded: false,
    evidenceQuality: 'TOKEN_DERIVED_NO_CHARACTER_SPANS',
    reviewOnly: true,
    canonicalAuthority: false,
    files: ['scripts/atlas/audit-feature-ontology-fresh-extraction-v1.mjs', 'sveltekit-frontend/scripts/atlas/langextract-code-enrich.py'],
  },
  {
    id: 'langextract-grounded-v1',
    kind: 'GROUNDED_SEMANTIC_ADAPTER',
    role: 'source-span-grounded semantic extraction',
    status: 'REVIEW_ADAPTER_CANDIDATE_NOT_PROVEN',
    currentSourceBytes: exists('sveltekit-frontend/scripts/atlas/langextract-code-enrich.py'),
    exactCanonicalSourceRef: true,
    sourceRevisionSha256Bound: true,
    evidenceSpanGrounded: false,
    evidenceQuality: 'NO_GROUNDED_ADAPTER_PROVEN',
    reviewOnly: true,
    canonicalAuthority: false,
    files: ['sveltekit-frontend/scripts/atlas/langextract-code-enrich.py'],
  },
  {
    id: 'feature-ontology-fresh-extractor-v1',
    kind: 'ORCHESTRATOR',
    role: 'normalization and review-candidate envelope',
    status: exists('scripts/atlas/lib/feature-ontology-fresh-candidate-v1.mjs') && exists('scripts/atlas/audit-feature-ontology-fresh-extraction-v1.mjs') ? 'PROPOSED_REVIEW_ONLY_OWNER' : 'MISSING',
    currentSourceBytes: true,
    exactCanonicalSourceRef: true,
    sourceRevisionSha256Bound: true,
    evidenceSpanGrounded: false,
    reviewOnly: true,
    canonicalAuthority: false,
    files: ['scripts/atlas/lib/feature-ontology-fresh-candidate-v1.mjs', 'scripts/atlas/audit-feature-ontology-fresh-extraction-v1.mjs'],
  },
];

const report = {
  schema: 'atlas.feature-ontology-fresh-producer-selection.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_PRODUCER_SELECTION',
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
  relationshipWrites: false,
  approval: { aliasSelectionChecksum: approvalChecksum, requiredForSourceScope: true },
  currentWorkspace: {
    workspaceRevision: observation?.record?.workspaceRevision ?? observation?.workspaceRevision ?? null,
    sourceCount: observation?.record?.sourceCount ?? observation?.sourceCount ?? null,
    sourceScopeReport: sourceScope ? 'PRESENT' : 'MISSING',
  },
  targetContract: {
    schema: 'atlas.feature-ontology-fresh-candidate.v1',
    predicate: 'USES_CONCEPT',
    status: 'REVIEW_REQUIRED',
    canonicalAuthority: false,
    requiredEvidence: ['CURRENT_SOURCE_BYTES_INPUT', 'EXACT_CANONICAL_SOURCE_REF', 'SOURCE_REVISION_SHA256_BOUND', 'WORKSPACE_REVISION_SHA256_BOUND', 'SOURCE_BYTES_DIGEST_REVERIFIED', 'STRUCTURAL_SPAN_GROUNDED_OR_TEXT_SPAN_GROUNDED'],
  },
  producers,
  observedProof: {
    freshExtractionStatus: freshExtraction?.status ?? null,
    freshExtractionSources: freshExtraction?.extractedSources ?? 0,
    freshExtractionCandidates: freshExtraction?.candidates ?? 0,
    groundedSources: freshExtraction?.groundedSources ?? 0,
    structuralStatus: structural?.status ?? null,
    structuralSources: structural?.extractedCount ?? 0,
    historicalExtractorStatus: freshExtractor?.status ?? null,
  },
  selectedOwner: 'feature-ontology-fresh-extractor-v1',
  permittedAdapters: ['treesitter-chunker-structural-v1', 'python-enrichment-v1', 'langextract-grounded-v1'],
  classifier: { status: 'DOWNSTREAM_NOT_SELECTED_AS_PRODUCER', authority: false, nextGate: 'REL-01A8_REVIEWED_FRESH_CANDIDATES' },
  status: 'PRODUCER_OWNER_SELECTED_REVIEW_ONLY',
  nextGate: 'REL_01A7B_SIX_SOURCE_MULTI_LANE_EXTRACTION',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, selectedOwner: report.selectedOwner, permittedAdapters: report.permittedAdapters, groundedSources: report.observedProof.groundedSources, reportPath: 'docs/reports/feature-ontology-fresh-producer-selection-v1.json' }, null, 2));
