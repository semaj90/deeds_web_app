#!/usr/bin/env node
/** Read-only proof of the active semantic-grounding surface. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildLangExtractProbeInputV1 } from './lib/langextract-probe-input-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const observationPath = path.join(ROOT, 'docs/reports/workspace-source-binding-observation.json');
const reportPath = path.join(ROOT, 'docs/reports/langextract-grounding-v1.json');
const sidecarUrl = process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const observation = JSON.parse(fs.readFileSync(observationPath, 'utf8'));
const binding = (observation.bindings ?? observation.record?.bindings ?? []).find((row) => String(row.sourceRef).endsWith('langgraph-client.ts'));
if (!binding) throw new Error('GROUNDING_PROBE_SOURCE_NOT_FOUND');
const sourcePath = path.join(ROOT, binding.sourceRef);
const sourceBytes = fs.readFileSync(sourcePath);
const source = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
const sourceDigest = crypto.createHash('sha256').update(sourceBytes).digest('hex');
const maxInputChars = Math.max(1, Math.min(200_000, Number(process.env.ATLAS_GROUNDING_MAX_CHARS ?? 50_000)));
const probeInput = buildLangExtractProbeInputV1({
  sourceBytes,
  sourceRef: binding.sourceRef,
  sourceRevision: binding.sourceRevision,
  workspaceRevision: binding.workspaceRevision,
  packetKey: binding.packetKey,
  maxChars: maxInputChars,
});
const inputText = probeInput.text ?? null;
const requestTimeoutMs = Math.max(1000, Number(process.env.ATLAS_GROUNDING_TIMEOUT_MS ?? 90000));

const response = probeInput.status === 'READY_SOURCE_BYTES_BOUND'
  ? await fetch(`${sidecarUrl}/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(requestTimeoutMs), body: JSON.stringify({
      source_type: 'codebase', source_ref: binding.sourceRef, source_revision: binding.sourceRevision,
      workspace_revision: binding.workspaceRevision, packet_key: binding.packetKey, language: 'typescript',
      text: inputText, max_chars: maxInputChars, extraction_mode: 'concepts', grounded_extraction_required: true,
    }) })
  : null;
const payload = response ? await response.json() : null;
const entities = Array.isArray(payload?.entities) ? payload.entities : [];
const exactEntities = entities.filter((entity) => Number.isInteger(entity.start) && Number.isInteger(entity.end) && inputText.slice(entity.start, entity.end) === entity.text);
const groundedExtractions = Array.isArray(payload?.metadata?.grounded_extractions) ? payload.metadata.grounded_extractions : [];
const concepts = Array.isArray(payload?.structure?.concepts) ? payload.structure.concepts : [];
const report = {
  schema: 'atlas.langextract-grounding-receipt.v1', generatedAt: new Date().toISOString(), mode: 'READ_ONLY_SINGLE_SOURCE_PROBE',
  postgresWrites: false, qdrantWrites: false, neo4jWrites: false, valkeyWrites: false, relationshipWrites: false,
  sidecar: { url: sidecarUrl, endpoint: '/extract', requestMade: response !== null, httpStatus: response?.status ?? null, providerRevision: payload?.metadata?.provider_revision ?? null, modelId: payload?.metadata?.model_id ?? null },
  source: { sourceRef: binding.sourceRef, sourceRevision: binding.sourceRevision, byteLength: Buffer.byteLength(source), textSha256: sourceDigest, workspaceRevision: binding.workspaceRevision },
  request: { groundedExtractionRequired: true, bindingStatus: probeInput.status, bindingReason: probeInput.reason ?? null, extractionMode: 'concepts', inputCharCount: inputText?.length ?? 0, sourceCharCount: source.length, inputSha256: probeInput.inputChecksum ?? null, timeoutMs: requestTimeoutMs },
  output: { concepts: concepts.length, entities: entities.length, entitiesWithExactIntervals: exactEntities.length, groundedExtractions: groundedExtractions.length, groundedExtractionUsed: payload.metadata?.grounded_extraction_used === true, relationships: Array.isArray(payload.relationships) ? payload.relationships.length : 0 },
  semanticGrounding: { officialLangExtractProven: false, exactEntityOffsetsPresent: exactEntities.length > 0, groundedConceptExtractionsPresent: groundedExtractions.length > 0, sourceBytesBound: probeInput.status === 'READY_SOURCE_BYTES_BOUND', ontologyAdmissionAllowed: false },
  status: probeInput.status !== 'READY_SOURCE_BYTES_BOUND'
    ? probeInput.status
    : groundedExtractions.length > 0 && payload?.metadata?.grounded_extraction_used === true
      ? 'GROUNDED_SEMANTIC_EXTRACTION_PROVEN_BOUNDED'
      : 'STRUCTURAL_OFFSETS_ONLY_GROUNDED_SEMANTICS_NOT_PROVEN',
  nextGate: probeInput.status === 'UNAVAILABLE_BINDING_INCOMPLETE' ? 'RESOLVE_EXACT_PACKET_AND_WORKSPACE_BINDING' : 'CONFIGURE_OR_PROVE_OFFICIAL_LANGEXTRACT_GROUNDED_EXTRACTIONS',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, sourceRef: binding.sourceRef, concepts: concepts.length, exactEntityOffsets: exactEntities.length, groundedExtractions: groundedExtractions.length, groundedExtractionUsed: report.output.groundedExtractionUsed, reportPath: 'docs/reports/langextract-grounding-v1.json' }, null, 2));
