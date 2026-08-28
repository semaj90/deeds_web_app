#!/usr/bin/env node

/**
 * REL-01A7: bounded fresh ontology extraction dry run.
 *
 * Uses the existing CPU NLP/Tree-sitter sidecar as an observation producer.
 * Output is review-only candidate data; no Atlas table or projection is
 * mutated. Historical feature_ontology_tuples are never rewritten.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeFreshOntologyCandidate } from './lib/feature-ontology-fresh-candidate-v1.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const reportPath = path.join(root, 'docs/reports/feature-ontology-fresh-extraction-v1.json');
const approvalPath = path.join(root, 'docs/reports/feature-ontology-explicit-alias-approval-v1.json');
const observationPath = path.join(root, 'docs/reports/workspace-source-binding-observation.json');
const batchPath = path.join(root, '.tmp/atlas/graphify-source-inventory-batch-v1.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL || 'http://127.0.0.1:8095';
const perSourceLimit = Number(process.env.ATLAS_FRESH_ONTOLOGY_CONCEPT_LIMIT || 128);
const groundedWindowChars = Number(process.env.ATLAS_FRESH_ONTOLOGY_WINDOW_CHARS || 4000);
const requestTimeoutMs = Number(process.env.ATLAS_FRESH_ONTOLOGY_TIMEOUT_MS || 90000);
const groundedRequired = process.env.ATLAS_FRESH_ONTOLOGY_GROUNDED_REQUIRED !== '0';
const extractionConcurrency = Math.max(1, Math.min(4, Number(process.env.ATLAS_FRESH_ONTOLOGY_CONCURRENCY || (groundedRequired ? 2 : 4))));
const groundingRetries = Math.max(1, Math.min(5, Number(process.env.ATLAS_FRESH_ONTOLOGY_GROUNDED_RETRIES || (groundedRequired ? 3 : 1))));

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const text = (value) => {
  const result = String(value ?? '').trim();
  return result || null;
};
const singleSource = text(process.env.ATLAS_FRESH_ONTOLOGY_SOURCE);
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex');
const slug = (value) => String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 120);

async function extract(sourceRef, sourceRevision) {
  const file = path.join(root, sourceRef.replaceAll('/', path.sep));
  const source = fs.readFileSync(file, 'utf8');
  const inputText = source.slice(0, groundedWindowChars);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  let response;
  try {
    response = await fetch(`${sidecarUrl}/extract`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        text: inputText,
        source_type: 'codebase',
        extraction_mode: 'concepts',
        source_ref: sourceRef,
        document_id: sourceRef,
        language: 'typescript',
        max_chars: groundedWindowChars,
        grounded_extraction_required: groundedRequired,
      }),
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`SIDECAR_EXTRACT_HTTP_${response.status}`);
  const payload = await response.json();
  const providerRevision = text(payload.metadata?.provider_revision) || 'unknown-provider';
  const concepts = [...new Set((payload.structure?.concepts ?? []).map(text).filter(Boolean))].sort().slice(0, perSourceLimit);
  const sourceDigest = digest(source);
  const groundedExtractions = Array.isArray(payload.metadata?.grounded_extractions)
    ? payload.metadata.grounded_extractions
    : [];
  const groundedByConcept = new Map();
  for (const item of groundedExtractions) {
    const keys = [
      text(item.extraction_text ?? item.text),
      text(item.attributes?.concept_id ?? item.concept_id),
    ].filter(Boolean).map((value) => value.toLowerCase());
    for (const key of keys) groundedByConcept.set(key, item);
  }
  const conceptSpecs = new Map(concepts.map((concept) => [concept.toLowerCase(), { value: concept, objectId: `concept:${slug(concept)}` }]));
  for (const item of groundedExtractions) {
    const conceptId = text(item.attributes?.concept_id ?? item.concept_id);
    const conceptValue = text(item.extraction_text ?? item.text);
    if (conceptId && conceptValue) conceptSpecs.set(conceptId.toLowerCase(), { value: conceptValue, objectId: `concept:${slug(conceptId)}` });
  }
  const candidates = [...conceptSpecs.values()].map(({ value: concept, objectId }, index) => {
    const grounded = groundedByConcept.get(concept.toLowerCase()) || groundedByConcept.get(objectId.replace(/^concept:/, '').toLowerCase());
    const startChar = Number(grounded?.char_interval?.start_pos ?? grounded?.start_char);
    const endChar = Number(grounded?.char_interval?.end_pos ?? grounded?.end_char);
    const sourceSpan = grounded && Number.isInteger(startChar) && Number.isInteger(endChar)
      ? { startChar, endChar, text: inputText.slice(startChar, endChar) }
      : undefined;
    return normalizeFreshOntologyCandidate({
    candidateId: `fresh:${digest(`${sourceRef}|${sourceRevision}|${concept}`).slice(0, 32)}`,
    packetKey: `source:${sourceRef}`,
    sourceRef,
    sourceRevision,
    workspaceRevision: text(observationWorkspaceRevision),
    subjectId: `source:${sourceRef}`,
    objectId: objectId || `concept:${slug(concept) || `unnamed-${index}`}`,
    objectValue: concept,
    evidenceRefs: [
      `source-observation:${sourceRef}:${sourceDigest}`,
      `sidecar:${providerRevision}:${sourceRef}:${index}`,
      ...(sourceSpan ? [`langextract-grounded:${sourceRef}:${startChar}:${endChar}:${digest(sourceSpan.text)}`] : []),
    ],
    extractorRevision: `parent-atlas-fresh-ontology:${providerRevision}`,
    confidence: 0.5,
    evidenceModes: sourceSpan ? ['TEXT_GROUNDED', 'SEMANTIC_INFERRED'] : ['SEMANTIC_INFERRED'],
    sourceSpanGrounded: Boolean(sourceSpan),
    sourceSpan,
  });
  });
  return {
    sourceRef,
    sourceRevision,
    sourceDigest,
    inputDigest: digest(inputText),
    inputCharCount: inputText.length,
    sourceCharCount: source.length,
    providerRevision,
    groundedExtractionUsed: payload.metadata?.grounded_extraction_used === true,
    groundedExtractionCount: groundedExtractions.length,
    syntaxStatus: text(payload.structure?.syntax_status ?? payload.syntax_status) || null,
    conceptsReturned: Array.isArray(payload.structure?.concepts) ? payload.structure.concepts.length : 0,
    candidates,
  };
}

let observationWorkspaceRevision = null;

async function main() {
  const approval = readJson(approvalPath);
  const observation = readJson(observationPath);
  const batch = fs.existsSync(batchPath) ? readJson(batchPath) : null;
  observationWorkspaceRevision = text(observation.record?.workspaceRevision ?? observation.workspaceRevision);
  if (!/^sha256:[0-9a-f]{64}$/i.test(observationWorkspaceRevision || '')) throw new Error('FRESH_EXTRACTION_WORKSPACE_REVISION_REQUIRED');
  const batchRefs = new Set((batch?.sourceRefs ?? []).map((value) => text(typeof value === 'string' ? value : value.sourceRef)).filter(Boolean));
  const approved = (approval.approvedPairs ?? []).map((pair) => text(pair.canonicalSourceRef))
    .filter((ref) => ref && batchRefs.has(ref) && (!singleSource || ref === singleSource))
    .sort();
  const sourceRevisions = new Map((observation.bindings ?? []).map((row) => [text(row.sourceRef), text(row.sourceRevision)]));
  const groups = [];
  const failures = [];
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < approved.length) {
      const sourceRef = approved[nextIndex++];
      try {
        const sourceRevision = sourceRevisions.get(sourceRef);
        if (!sourceRevision) throw new Error('SOURCE_REVISION_MISSING');
        const attempts = [];
        const maxAttempts = groundedRequired ? groundingRetries : 1;
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
          try {
            const candidate = await extract(sourceRef, sourceRevision);
            attempts.push({ attempt, candidate });
          } catch (error) {
            attempts.push({ attempt, error: String(error?.message ?? error) });
          }
          if (attempts.at(-1)?.candidate?.groundedExtractionCount > 0) break;
        }
        const successful = attempts.filter((item) => item.candidate).sort((a, b) => (b.candidate.groundedExtractionCount - a.candidate.groundedExtractionCount) || (a.attempt - b.attempt));
        if (!successful[0]) throw new Error(attempts.map((item) => item.error).filter(Boolean).join('; ') || 'GROUNDING_EXTRACTION_FAILED');
        groups.push({ ...successful[0].candidate, groundingAttempts: attempts.length, selectedGroundingAttempt: successful[0].attempt });
      } catch (error) {
        failures.push({ sourceRef, error: String(error?.message ?? error) });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(extractionConcurrency, approved.length) }, () => worker()));
  groups.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  failures.sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const candidates = groups.flatMap((group) => group.candidates).sort((a, b) => a.candidateId.localeCompare(b.candidateId));
  const report = {
    schema: 'atlas.feature-ontology-fresh-extraction.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_DRY_RUN',
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    sidecar: { url: sidecarUrl, endpoint: '/extract', extractionMode: 'concepts', groundedWindowChars, requestTimeoutMs, extractionConcurrency, groundingRetries },
    resolverRevision: text(approval.resolverRevision),
    selectionChecksum: text(approval.selectionChecksum),
    workspaceRevision: observationWorkspaceRevision,
    taxonomyVersion: 'atlas-domain-ontology-taxonomy:v1',
    policy: { preserveHistoricalTuples: true, rewriteHistoricalTuples: false, materializeRelationships: false, canonicalAuthority: false, status: 'REVIEW_REQUIRED' },
    counts: {
      approvedSources: approved.length,
      extractedSources: groups.length,
      failedSources: failures.length,
      candidates: candidates.length,
      groundedSources: groups.filter((group) => group.groundedExtractionUsed).length,
    },
    groups: groups.map(({ candidates: rows, ...group }) => ({ ...group, candidateCount: rows.length })),
    failures,
    candidates,
    status: groups.length === approved.length && candidates.length > 0 ? 'FRESH_ONTOLOGY_CANDIDATES_READY_FOR_REVIEW' : 'FRESH_ONTOLOGY_EXTRACTION_INCOMPLETE',
    nextGate: candidates.length > 0
      ? (groundedRequired ? 'REVIEW_FRESH_ONTOLOGY_CANDIDATES_BEFORE_REL_01B' : 'GROUNDED_EXTRACTION_REQUIRED_FOR_ADMISSION')
      : 'REPAIR_FRESH_ONTOLOGY_EXTRACTION_INPUTS',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, approvedSources: approved.length, extractedSources: groups.length, candidates: candidates.length, failedSources: failures.length, reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/') }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
