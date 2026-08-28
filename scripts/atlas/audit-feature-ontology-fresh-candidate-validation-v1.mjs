#!/usr/bin/env node
/** REL-01A8: independent validation of fresh ontology review candidates. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateFreshOntologyCandidate } from './lib/feature-ontology-fresh-candidate-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const inputPath = path.join(ROOT, 'docs/reports/feature-ontology-fresh-extraction-multilane-v1.json');
const observationPath = path.join(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const reportPath = path.join(ROOT, 'docs/reports/feature-ontology-fresh-candidate-validation-v1.json');
const sha = /^sha256:[0-9a-f]{64}$/;
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const text = (v) => String(v ?? '').trim();
const observation = readJson(observationPath);
const input = readJson(inputPath);
const bindings = observation.bindings ?? observation.record?.bindings ?? [];
const workspaceRevision = text(observation.record?.workspaceRevision ?? observation.workspaceRevision);
const bindingBySource = new Map(bindings.map((row) => [text(row.sourceRef), row]));

const rows = (input.candidates ?? []).map((candidate) => {
  const binding = bindingBySource.get(text(candidate.sourceRef));
  const validation = validateFreshOntologyCandidate(candidate);
  const errors = [...validation.errors];
  if (text(candidate.workspaceRevision) !== workspaceRevision) errors.push('WORKSPACE_REVISION_MISMATCH');
  if (!sha.test(text(candidate.sourceRevision))) errors.push('SOURCE_REVISION_NOT_SHA256');
  if (!sha.test(workspaceRevision)) errors.push('WORKSPACE_REVISION_NOT_SHA256');
  if (!binding) errors.push('EXACT_SOURCE_BINDING_MISSING');
  if (binding && text(binding.workspaceRevision) !== workspaceRevision) errors.push('BINDING_WORKSPACE_REVISION_MISMATCH');
  if (binding && text(binding.sourceRevision) !== text(candidate.sourceRevision)) errors.push('SOURCE_REVISION_MISMATCH');
  if (binding && text(binding.contentDigest) !== text(candidate.sourceRevision).replace(/^sha256:/, '')) errors.push('SOURCE_DIGEST_MISMATCH');
  if (!Array.isArray(candidate.evidenceRefs) || candidate.evidenceRefs.length === 0) errors.push('EVIDENCE_REFERENCE_MISSING');
  const structuralEvidence = (candidate.evidenceRefs ?? []).some((ref) => text(ref).startsWith('structural-observation:'));
  const groundedEvidence = candidate.sourceSpanGrounded === true || (candidate.evidenceModes ?? []).includes('TEXT_GROUNDED');
  if (!structuralEvidence && !groundedEvidence) errors.push('GROUNDED_OR_STRUCTURAL_EVIDENCE_REQUIRED');
  return {
    candidateId: candidate.candidateId, sourceRef: candidate.sourceRef, objectId: candidate.objectId,
    workspaceRevision: candidate.workspaceRevision, sourceRevision: candidate.sourceRevision,
    structuralEvidence, groundedEvidence, sourceSpanGrounded: candidate.sourceSpanGrounded === true,
    sourceSpan: candidate.sourceSpan ?? null, evidenceModes: candidate.evidenceModes ?? [], errors: [...new Set(errors)],
    classification: errors.length ? (errors.includes('GROUNDED_OR_STRUCTURAL_EVIDENCE_REQUIRED') ? 'REJECTED_UNGROUNDED' : 'REJECTED_LINEAGE_OR_SHAPE') : 'VALID_REVIEW_CANDIDATE',
  };
});

const count = (classification) => rows.filter((row) => row.classification === classification).length;
const report = {
  schema: 'atlas.feature-ontology-fresh-candidate-validation.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_INDEPENDENT_VALIDATION',
  postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, relationshipWrites: false,
  workspaceRevision, input: path.relative(ROOT, inputPath).replaceAll('\\', '/'), selectionChecksum: input.selectionChecksum ?? null,
  counts: { examined: rows.length, validReviewCandidates: count('VALID_REVIEW_CANDIDATE'), rejectedUngrounded: count('REJECTED_UNGROUNDED'), rejectedLineageOrShape: count('REJECTED_LINEAGE_OR_SHAPE'), exactSourceBindings: rows.filter((row) => !row.errors.includes('EXACT_SOURCE_BINDING_MISSING')).length, structuralEvidence: rows.filter((row) => row.structuralEvidence).length, groundedEvidence: rows.filter((row) => row.groundedEvidence).length },
  admission: { freshEvidenceProven: false, relationshipPromotionAllowed: false, relationshipGraphRevision: null, status: 'REVIEW_ONLY' },
  classifications: rows.reduce((out, row) => { out[row.classification] = (out[row.classification] ?? 0) + 1; return out; }, {}),
  rows,
  status: rows.length > 0 && rows.every((row) => row.classification !== 'REJECTED_LINEAGE_OR_SHAPE') ? 'LINEAGE_VALID_REVIEW_CANDIDATES_WITH_GROUNDING_GATE' : 'FRESH_CANDIDATE_VALIDATION_FAILED',
  nextGate: 'HUMAN_REVIEW_AND_GROUNDED_SEMANTIC_VALIDATION_BEFORE_REL_01B',
  checksum: crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, examined: report.counts.examined, validReviewCandidates: report.counts.validReviewCandidates, rejectedUngrounded: report.counts.rejectedUngrounded, rejectedLineageOrShape: report.counts.rejectedLineageOrShape, exactSourceBindings: report.counts.exactSourceBindings, groundedEvidence: report.counts.groundedEvidence, reportPath: 'docs/reports/feature-ontology-fresh-candidate-validation-v1.json' }, null, 2));
