#!/usr/bin/env node
/**
 * build-golden-label-proposals-v1.mjs
 *
 * Read-only helper that maps the 40 unresolved crosswalk labels from
 * docs/reports/domain-crosswalk-unresolved-review-v1.json into PROPOSAL_ONLY
 * taxonomy candidates (PENDING_HUMAN_REVIEW, goldDomainId: null) for
 * golden retrieval, domain-classifier, and QLoRA review queues.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IN_PATH = path.join(ROOT, 'docs/reports/domain-crosswalk-unresolved-review-v1.json');
const OUT_PATH = path.join(ROOT, 'docs/reports/golden-domain-label-proposals-v1.json');

const PROPOSED_TAXONOMY_MAP = {
  backend: 'ATLASDOM:api-backend',
  infrastructure: 'ATLASTECH:infrastructure',
  utility: 'ATLASDOM:utilities',
  documentation: 'ATLASDOM:documentation',
  UI: 'ATLASDOM:frontend',
  tool: 'ATLASDOM:agentic-tools',
  rag_retrieval: 'ATLASDOM:retrieval',
  agent: 'ATLASDOM:agentic-workflows',
  agent_orchestration: 'ATLASDOM:agentic-workflows',
  mcp: 'ATLASTECH:mcp',
  mcp_agents: 'ATLASTECH:mcp',
  graph_topology: 'ATLASDOM:graph',
  cache_layer: 'ATLASDOM:cache',
  embedding_indexing: 'ATLASDOM:retrieval',
  repair_workflow: 'ATLASDOM:diagnostics-repair',
  evidence_upload_storage: 'ATLASDOM:evidence-storage',
  case_management: 'ATLASDOM:case-management',
  document_processing: 'ATLASDOM:documentation',
  citation_engine: 'ATLASDOM:citations',
  Authentication: 'ATLASDOM:auth',
  auth_login_register: 'ATLASDOM:auth',
  cluster_analysis: 'ATLASDOM:clustering',
  Library: 'ATLASDOM:documentation',
  Other: null,
  '': null,
};

const input = JSON.parse(fs.readFileSync(IN_PATH, 'utf8'));
const proposals = (input.rows ?? []).map((row) => ({
  sourceVocab: row.source_vocab,
  sourceValue: row.source_value,
  sourceRowCount: row.source_row_count,
  proposedTaxonomyId: Object.prototype.hasOwnProperty.call(PROPOSED_TAXONOMY_MAP, row.source_value)
    ? PROPOSED_TAXONOMY_MAP[row.source_value]
    : null,
  reviewStatus: 'PENDING_HUMAN_REVIEW',
  goldDomainId: null,
  canonicalAuthority: false,
  eligibleFor: ['domain_classifier', 'golden_retrieval', 'qlora_sft'],
}));

const out = {
  schema: 'atlas.golden-domain-label-proposals.v1',
  generatedAt: new Date().toISOString(),
  canonicalAuthority: false,
  writesPerformed: false,
  note: 'PROPOSAL_ONLY: goldDomainId remains null until human approval on /admin/domain-calibration (target 200+ reviewed rows, 30+ per class).',
  totalProposals: proposals.length,
  mappedProposals: proposals.filter((p) => p.proposedTaxonomyId !== null).length,
  unmappedProposals: proposals.filter((p) => p.proposedTaxonomyId === null).length,
  proposals,
};

fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outPath: path.relative(ROOT, OUT_PATH).replace(/\\/g, '/'),
  totalProposals: out.totalProposals,
  mappedProposals: out.mappedProposals,
  unmappedProposals: out.unmappedProposals,
}, null, 2));
