#!/usr/bin/env node
/** REL-01A7B: merge six-source evidence lanes into review-only candidates. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = path.join(ROOT, 'docs', 'reports', 'feature-ontology-fresh-extraction-multilane-v1.json');
const extractionPath = path.join(ROOT, 'docs', 'reports', 'feature-ontology-fresh-extraction-v1.json');
const structuralPath = path.join(ROOT, 'docs', 'reports', 'treesitter-structural-observation-v1.json');
const producerPath = path.join(ROOT, 'docs', 'reports', 'feature-ontology-fresh-producer-selection-v1.json');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function digest(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function text(value) { return String(value ?? '').trim(); }

const extraction = readJson(extractionPath);
const structural = readJson(structuralPath);
const producer = readJson(producerPath);
const structuralBySource = new Map((structural.results ?? []).map((row) => [text(row.sourceRef), row]));
const groups = new Map();

for (const row of extraction.candidates ?? []) {
  const key = `${text(row.sourceRef)}|${text(row.objectId)}`;
  const current = groups.get(key) ?? {
    sourceRef: text(row.sourceRef), sourceRevision: text(row.sourceRevision), workspaceRevision: text(row.workspaceRevision),
    packetKey: text(row.packetKey), subjectId: text(row.subjectId), predicate: 'USES_CONCEPT', objectId: text(row.objectId),
    conceptLabel: text(row.objectValue), evidenceRefs: new Set(), lanes: new Set(), evidenceModes: new Set(), confidences: [],
    sourceSpanGrounded: row.sourceSpanGrounded === true, sourceSpan: row.sourceSpan ?? null,
  };
  for (const ref of row.evidenceRefs ?? []) current.evidenceRefs.add(text(ref));
  current.lanes.add('python-enrichment-v1');
  current.evidenceModes.add(...(row.evidenceModes ?? ['SEMANTIC_INFERRED']));
  if (row.sourceSpanGrounded === true) {
    current.sourceSpanGrounded = true;
    current.sourceSpan = row.sourceSpan;
  }
  if (Number.isFinite(Number(row.confidence))) current.confidences.push(Number(row.confidence));
  groups.set(key, current);
}

const candidates = [...groups.values()].map((row) => {
  const ast = structuralBySource.get(row.sourceRef);
  if (ast) {
    row.lanes.add('treesitter-chunker-structural-v1');
    row.evidenceRefs.add(`structural-observation:${row.sourceRef}:${ast.observationChecksum}`);
    row.evidenceModes.add('STRUCTURAL_EXACT');
  }
  const evidenceRefs = [...row.evidenceRefs].sort();
  const lanes = [...row.lanes].sort();
  const evidenceModes = [...row.evidenceModes].sort();
  return {
    schema: 'atlas.feature-ontology-fresh-candidate.v1',
    candidateId: `fresh-multilane:${digest([row.sourceRef, row.sourceRevision, row.objectId]).slice(0, 32)}`,
    packetKey: row.packetKey, sourceRef: row.sourceRef, sourceRevision: row.sourceRevision, workspaceRevision: row.workspaceRevision,
    subjectType: 'SOURCE', subjectId: row.subjectId, predicate: row.predicate, objectType: 'CONCEPT', objectId: row.objectId,
    objectValue: row.conceptLabel, evidenceRefs, evidenceModes, extractorKinds: lanes,
    extractorRevision: 'parent-atlas-fresh-ontology:multilane-merger-v1',
    // A shared source file is not semantic agreement. Agreement requires a
    // reviewed deterministic AST-to-concept mapping, which does not exist yet.
    crossLaneAgreement: 0,
    structuralEvidenceCoLocated: Boolean(ast),
    sourceSpanGrounded: row.sourceSpanGrounded === true,
    sourceSpan: row.sourceSpan ?? null,
    groundedExtractionCount: Number((extraction.groups ?? []).find((group) => text(group.sourceRef) === row.sourceRef)?.groundedExtractionCount ?? 0),
    confidence: row.confidences.length ? Math.max(...row.confidences) : null,
    status: 'REVIEW_REQUIRED', canonicalAuthority: false,
  };
});

const sources = [...new Set(candidates.map((row) => row.sourceRef))].sort();
const report = {
  schema: 'atlas.feature-ontology-fresh-extraction-multilane.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_REVIEW_CANDIDATES',
  postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, relationshipWrites: false,
  producerOwner: producer.selectedOwner ?? 'feature-ontology-fresh-extractor-v1',
  workspaceRevision: extraction.workspaceRevision ?? null, selectionChecksum: extraction.selectionChecksum ?? null,
  selectedSources: sources, sourceCount: sources.length,
  lanes: {
    structural: { adapter: 'treesitter-chunker-structural-v1', sources: structural.extractedCount ?? 0, chunks: (structural.results ?? []).reduce((n, row) => n + Number(row.chunkCount ?? 0), 0), edges: (structural.results ?? []).reduce((n, row) => n + Number(row.edgeCount ?? 0), 0), unresolvedEdges: (structural.results ?? []).reduce((n, row) => n + Number(row.unresolvedEdgeCount ?? 0), 0), ontologyMappingAutomatic: false },
    pythonEnrichment: { adapter: 'python-enrichment-v1', sources: extraction.counts?.extractedSources ?? 0, candidates: extraction.candidates?.length ?? 0, groundedSources: extraction.counts?.groundedSources ?? 0, evidenceMode: 'SEMANTIC_INFERRED' },
    langextract: { adapter: 'langextract-grounded-v1', sources: 0, groundedCandidates: 0, status: 'NOT_PROVEN' },
  },
  merge: { rawCandidates: extraction.candidates?.length ?? 0, uniqueCandidates: candidates.length, structuralEvidenceCoLocated: candidates.filter((row) => row.structuralEvidenceCoLocated).length, crossLaneAgreement: 0, crossLaneDisagreement: 0, identityConflicts: 0 },
  candidates, relationshipGraphRevision: null, rel01bAllowed: false,
  status: candidates.length > 0 && sources.length === 6 ? 'MULTILANE_REVIEW_CANDIDATES_READY' : 'MULTILANE_EXTRACTION_INCOMPLETE',
  nextGate: 'REL_01A8_INDEPENDENT_SOURCE_SPAN_REVISION_VALIDATION',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, sourceCount: report.sourceCount, rawCandidates: report.merge.rawCandidates, uniqueCandidates: report.merge.uniqueCandidates, crossLaneAgreement: report.merge.crossLaneAgreement, groundedSources: report.lanes.pythonEnrichment.groundedSources, reportPath: 'docs/reports/feature-ontology-fresh-extraction-multilane-v1.json' }, null, 2));
