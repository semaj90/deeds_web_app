#!/usr/bin/env node

/**
 * GROUND-DET-02: three-run determinism proof for the strict grounded
 * extraction envelope. This is read-only and never promotes ontology facts.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const sourceRef = process.env.ATLAS_GROUNDING_FIXTURE || 'sveltekit-frontend/src/lib/server/ai/trace-reranker.ts';
const sidecarUrl = (process.env.ATLAS_NLP_SIDECAR_URL || 'http://127.0.0.1:8095').replace(/\/+$/, '');
const windowChars = Number(process.env.ATLAS_GROUNDING_WINDOW_CHARS || 4000);
const timeoutMs = Number(process.env.ATLAS_GROUNDING_DETERMINISM_TIMEOUT_MS || 120000);
const seed = Number(process.env.LANGEXTRACT_SEED || 1729);
const temperature = Number(process.env.LANGEXTRACT_TEMPERATURE || 0);
const topP = Number(process.env.LANGEXTRACT_TOP_P || 1);
const promptRevision = 'atlas-grounded-extraction-prompt:v1';
const schemaRevision = 'atlas.grounded-extraction-model-output:v1';
const reportPath = path.join(root, 'docs/reports/grounded-extraction-determinism-v1.json');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonicalJson = (value) => JSON.stringify(value, Object.keys(value).sort());
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const text = (value) => String(value ?? '').trim() || null;

function normalizedExactSet(payload, inputText) {
  const items = Array.isArray(payload?.metadata?.grounded_extractions)
    ? payload.metadata.grounded_extractions
    : [];
  const rows = [];
  const rejected = [];
  for (const item of items) {
    const extractionText = text(item?.extraction_text ?? item?.text);
    const start = Number(item?.char_interval?.start_pos ?? item?.start_char);
    const end = Number(item?.char_interval?.end_pos ?? item?.end_char);
    const extractionClass = text(item?.extraction_class ?? item?.class ?? item?.label);
    const aligned = item?.alignment_status == null || String(item.alignment_status).toLowerCase() === 'match_exact';
    const exact = extractionText && extractionClass && Number.isInteger(start) && Number.isInteger(end)
      && start >= 0 && end > start && end <= inputText.length
      && inputText.slice(start, end) === extractionText && aligned;
    if (!exact) {
      rejected.push({ extractionClass, extractionText, start, end, alignmentStatus: item?.alignment_status ?? null });
      continue;
    }
    rows.push({ extractionClass, extractionText, start, end });
  }
  rows.sort((a, b) => a.start - b.start || a.end - b.end || a.extractionClass.localeCompare(b.extractionClass) || a.extractionText.localeCompare(b.extractionText));
  const deduped = rows.filter((row, index) => index === 0 || JSON.stringify(row) !== JSON.stringify(rows[index - 1]));
  return { rows: deduped, rejected, checksum: sha256(JSON.stringify(deduped)) };
}

async function runOnce(inputText, sourceRevision, workspaceRevision, runNumber) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  let response;
  let rawText = '';
  let payload = null;
  let errorCode = null;
  let errorMessage = null;
  try {
    response = await fetch(`${sidecarUrl}/extract`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-request-id': `ground-det-02-${runNumber}` },
      body: JSON.stringify({
        text: inputText,
        source_type: 'codebase',
        extraction_mode: 'concepts',
        source_ref: sourceRef,
        document_id: sourceRef,
        language: 'typescript',
        max_chars: inputText.length,
        grounded_extraction_required: true,
      }),
    });
    rawText = await response.text();
    try { payload = JSON.parse(rawText); } catch { errorCode = 'RESPONSE_JSON_PARSE_FAILED'; }
    if (!response.ok) errorCode = errorCode || `SIDECAR_HTTP_${response.status}`;
  } catch (error) {
    errorCode = error?.name === 'AbortError' ? 'SIDECAR_TIMEOUT' : 'SIDECAR_REQUEST_FAILED';
    errorMessage = String(error?.message ?? error);
  } finally {
    clearTimeout(timeout);
  }
  const exact = normalizedExactSet(payload, inputText);
  return {
    runNumber,
    elapsedMs: Date.now() - started,
    sourceRef,
    sourceRevision,
    workspaceRevision,
    modelId: text(payload?.metadata?.model_id) || 'ornith-1.5-9b',
    providerRevision: text(payload?.metadata?.provider_revision),
    rawResponseChecksum: sha256(rawText),
    rawResponsePreview: rawText.slice(0, 1200),
    httpStatus: response?.status ?? null,
    parseStatus: payload ? 'PARSED' : 'FAILED',
    modelExtractionCount: Array.isArray(payload?.metadata?.grounded_extractions) ? payload.metadata.grounded_extractions.length : 0,
    alignedExtractionCount: exact.rows.length,
    exactExtractionCount: exact.rows.length,
    rejectedExtractionCount: exact.rejected.length,
    groundedExtractionUsed: payload?.metadata?.grounded_extraction_used === true,
    groundedExtractionError: text(payload?.metadata?.grounded_extraction_error),
    normalizedExactSetChecksum: exact.checksum,
    normalizedExactSet: exact.rows,
    rejectedExtractions: exact.rejected,
    errorCode,
    errorMessage,
  };
}

async function main() {
  const observation = readJson(path.join(root, 'docs/reports/workspace-source-binding-observation.json'));
  const workspaceRevision = text(observation.record?.workspaceRevision ?? observation.workspaceRevision);
  if (!/^sha256:[0-9a-f]{64}$/i.test(workspaceRevision || '')) throw new Error('GROUND_DET_WORKSPACE_REVISION_REQUIRED');
  const binding = (observation.bindings || []).find((row) => row.sourceRef === sourceRef);
  const sourceRevision = text(binding?.sourceRevision);
  if (!/^sha256:[0-9a-f]{64}$/i.test(sourceRevision || '')) throw new Error('GROUND_DET_SOURCE_REVISION_REQUIRED');
  const sourcePath = path.join(root, sourceRef.replaceAll('/', path.sep));
  const source = fs.readFileSync(sourcePath, 'utf8');
  const inputText = source.slice(0, windowChars);
  const runs = [];
  for (let runNumber = 1; runNumber <= 3; runNumber += 1) {
    runs.push(await runOnce(inputText, sourceRevision, workspaceRevision, runNumber));
  }
  const checksums = runs.map((run) => run.normalizedExactSetChecksum);
  const allSame = checksums.every((checksum) => checksum === checksums[0]);
  const allNonEmpty = runs.every((run) => run.exactExtractionCount > 0);
  const noRequestErrors = runs.every((run) => !run.errorCode && run.parseStatus === 'PARSED');
  const report = {
    schema: 'atlas.grounded-extraction-determinism.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_THREE_RUN_PROOF',
    sourceRef,
    sourceRevision,
    workspaceRevision,
    sourceDigest: sha256(source),
    inputDigest: sha256(inputText),
    inputCharCount: inputText.length,
    promptRevision,
    schemaRevision,
    modelId: runs.find((run) => run.modelId)?.modelId || 'ornith-1.5-9b',
    controls: { temperature, topP, seed, reasoning: false, chatTemplateKwargs: { enable_thinking: false }, providerTransportShim: 'llama-chat-template-v1', enableFuzzyAlignment: false, acceptMatchLesser: false, exactAlignmentAlgorithm: 'dp' },
    sidecar: { url: sidecarUrl, endpoint: '/extract', timeoutMs },
    runs,
    normalizedExactSetChecksums: checksums,
    acceptance: { allThreeParsed: noRequestErrors, identicalExactSets: allSame, allRunsNonEmpty: allNonEmpty },
    postgresWrites: false,
    qdrantWrites: false,
    neo4jWrites: false,
    valkeyWrites: false,
    relationshipWrites: false,
    canonicalAuthority: false,
    status: noRequestErrors && allSame && allNonEmpty ? 'GROUNDING_DETERMINISM_PROVEN_BOUNDED' : (!allSame ? 'GROUNDING_NONDETERMINISTIC' : 'GROUNDING_EXACT_EMPTY_OR_REQUEST_FAILED'),
    nextGate: noRequestErrors && allSame && allNonEmpty ? 'GROUND_DET_03_SIX_SOURCE_REPLAY' : 'REPAIR_GROUNDING_DETERMINISM_BEFORE_PROMOTION',
  };
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ status: report.status, sourceRef, exactCounts: runs.map((run) => run.exactExtractionCount), checksums, reportPath: path.relative(root, reportPath).replaceAll(path.sep, '/') }, null, 2));
}

main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
