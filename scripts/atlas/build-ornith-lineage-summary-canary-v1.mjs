#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { computeSourceIdentityKeyV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/stable-file-identity-mint-v1.ts';
import { buildSummaryProposalV1, selectStratifiedCandidates, sha256Hex, stableJsonV1, validateSummaryOutput } from './lib/summary-proposal-candidate-v1.mjs';
import { analyzeSummaryContaminationV1 } from './lib/summary-quality-v1.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const i = arg.indexOf('=');
  return i < 0 ? [arg.replace(/^--/, ''), 'true'] : [arg.slice(2, i), arg.slice(i + 1)];
}));
const required = (name) => {
  const value = args.get(name);
  if (!value) throw new Error(`REQUIRED_ARGUMENT_MISSING:${name}`);
  return value;
};
const inputPath = path.resolve(ROOT, required('input'));
const cohortReportPath = path.resolve(ROOT, required('cohort-report'));
const repositoryId = required('repository-id');
const workspaceRevision = required('workspace-revision');
const baseUrl = args.get('base-url') ?? 'http://127.0.0.1:8090';
const sampleCount = Number(args.get('samples') ?? 12);
const maxInputBytes = Number(args.get('max-input-bytes') ?? 65536);
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 20) throw new Error('SAMPLES_MUST_BE_1_TO_20');
if (!Number.isInteger(maxInputBytes) || maxInputBytes < 1) throw new Error('INVALID_MAX_INPUT_BYTES');
if (!/^sha256:[0-9a-f]{64}$/.test(workspaceRevision)) throw new Error('INVALID_WORKSPACE_REVISION');

const hashPrefixed = (value) => `sha256:${sha256Hex(value)}`;
const inputBytes = await fs.readFile(inputPath);
const cohortReport = JSON.parse(await fs.readFile(cohortReportPath, 'utf8'));
const actualInputChecksum = hashPrefixed(inputBytes);
if (cohortReport.checksums?.ndjsonChecksum !== actualInputChecksum) throw new Error('COHORT_FILE_CHECKSUM_MISMATCH');
if (cohortReport.selection?.workspaceRevision !== workspaceRevision) throw new Error('COHORT_WORKSPACE_REVISION_MISMATCH');
const rows = inputBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const targetIds = args.get('target-chunk-row-ids')?.split(',').filter(Boolean) ?? null;
const legacyComparison = args.get('legacy-comparison') === 'true';
const candidates = legacyComparison ? rows.filter((row) => {
  const legacy = row.legacySummaryColumn?.trim();
  return row.revisionStatus === 'PROVEN' && legacy && !row.metadata?.phase8_5_quarantine && analyzeSummaryContaminationV1(legacy).clean;
}).map((row) => ({ ...row, legacyComparisonEligible: true })) : rows;
const comparisonExcluded = legacyComparison ? {
  noLegacyText: rows.filter((row) => !row.legacySummaryColumn?.trim()).length,
  lineageUnqualified: rows.filter((row) => row.legacySummaryColumn?.trim() && row.revisionStatus !== 'PROVEN').length,
  quarantineFlagged: rows.filter((row) => row.legacySummaryColumn?.trim() && row.metadata?.phase8_5_quarantine).length,
  contaminationDetected: rows.filter((row) => row.legacySummaryColumn?.trim() && !row.metadata?.phase8_5_quarantine && !analyzeSummaryContaminationV1(row.legacySummaryColumn).clean).length,
} : null;
if (legacyComparison && candidates.length === 0) throw new Error('NO_CLEAN_REVISION_QUALIFIED_LEGACY_COMPARISONS');
const selectorOptions = { allowLegacyForComparison: legacyComparison };
const selectedResult = selectStratifiedCandidates(candidates, sampleCount, maxInputBytes, selectorOptions);
if (targetIds) {
  // Frozen-target mode: same eligibility gate (adds inputTextSha256/inputByteLength), then EXACTLY these chunk rows.
  const all = selectStratifiedCandidates(candidates, candidates.length, maxInputBytes, selectorOptions).selected;
  const byId = new Map(all.map((row) => [row.chunkRowId, row]));
  const missing = targetIds.filter((id) => !byId.has(id));
  if (missing.length) throw new Error(`FROZEN_TARGET_INELIGIBLE_OR_ABSENT:${missing.join(',')}`);
  selectedResult.selected = targetIds.map((id) => byId.get(id));
}
const created = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const outDir = path.join(ROOT, '.tmp/atlas/ornith-summary-proposals-v1', created);
await fs.mkdir(outDir, { recursive: true });
const prompt = [
  'Summarize only the supplied source artifact in one or two concise sentences.',
  'Describe what this source says or implements; do not claim that it describes the current repository/runtime unless the source itself establishes that.',
  'Preserve historical, tentative, and proposed status. Do not reconcile old model or dimension claims against current runtime facts.',
  'Do not invent details, identities, revisions, or behavior. Return only the summary text.',
].join(' ');
const promptRevision = hashPrefixed(prompt);
const generationParameters = Object.freeze({ temperature: 0, top_p: 1, seed: 20260925, max_tokens: 192, stream: false, presence_penalty: 0, frequency_penalty: 0 });
const schemaRevision = 'atlas.chunk-summary-proposal.v1';

const propsResponse = await fetch(`${baseUrl}/props`, { signal: AbortSignal.timeout(10000) });
if (!propsResponse.ok) throw new Error(`LLAMA_PROPS_HTTP_${propsResponse.status}`);
const props = await propsResponse.json();
const modelsResponse = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(10000) });
if (!modelsResponse.ok) throw new Error(`LLAMA_MODELS_HTTP_${modelsResponse.status}`);
const modelsPayload = await modelsResponse.json();
const modelId = String(props.model_alias ?? '');
const modelListing = (modelsPayload.data ?? []).find((model) => model.id === modelId || model.model === modelId);
if (!modelId || !modelListing) throw new Error('EXPECTED_ORNITH_MODEL_NOT_LOADED');
const modelDigest = modelListing.digest || props.model_sha256 || null;
const modelRevision = typeof modelDigest === 'string' && modelDigest.trim() ? modelDigest.trim() : null;
const model = { id: modelId, revision: modelRevision, parameterCount: modelListing.meta?.n_params ?? null };
const runtimeBuildRevision = props.build_info || null;

const proposals = [];
const failedByReason = {};
for (const row of selectedResult.selected) {
  if (row.workspaceRevision !== workspaceRevision) {
    failedByReason.WORKSPACE_REVISION_MISMATCH = (failedByReason.WORKSPACE_REVISION_MISMATCH ?? 0) + 1;
    continue;
  }
  if (path.posix.isAbsolute(row.sourceRef) || row.sourceRef.includes('\\') || row.sourceRef.split('/').includes('..')) {
    failedByReason.NON_CANONICAL_SOURCE_REF = (failedByReason.NON_CANONICAL_SOURCE_REF ?? 0) + 1;
    continue;
  }
  const sourceIdentityKey = computeSourceIdentityKeyV1(repositoryId, row.sourceRef);
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: `source_ref: ${row.sourceRef}\nsource_revision: ${row.sourceRevision}\nchunk content follows:\n\n${row.content}` },
        ],
        ...generationParameters,
      }),
    });
    if (!response.ok) throw new Error(`LLAMA_COMPLETION_HTTP_${response.status}`);
    const result = await response.json();
    const summary = result.choices?.[0]?.message?.content;
    const invalid = validateSummaryOutput(summary, row.content);
    if (invalid) { failedByReason[invalid] = (failedByReason[invalid] ?? 0) + 1; continue; }
    const proposal = buildSummaryProposalV1({
      row,
      sourceIdentityKey,
      summary,
      model,
      promptRevision,
      schemaRevision,
      generationParameters,
      runtimeBuildRevision,
      latencyMs: performance.now() - started,
      usage: result.usage ?? null,
    });
    if (legacyComparison) {
      proposal.legacyComparison = {
        status: 'HINT_ONLY_NOT_ADMITTED',
        text: row.legacySummaryColumn,
        digest: hashPrefixed(row.legacySummaryColumn),
        updatedAt: row.metadata?.summary_updated_at ?? null,
      };
      const { proposalChecksum: _oldChecksum, ...proposalBody } = proposal;
      proposal.proposalChecksum = hashPrefixed(stableJsonV1(proposalBody));
    }
    proposals.push(proposal);
  } catch (error) {
    const reason = error.name === 'TimeoutError' ? 'MODEL_TIMEOUT' : String(error.message || 'MODEL_FAILURE').slice(0, 100);
    failedByReason[reason] = (failedByReason[reason] ?? 0) + 1;
  }
}

const proposalBytes = Buffer.from(proposals.map((proposal) => JSON.stringify(proposal)).join('\n') + (proposals.length ? '\n' : ''), 'utf8');
const shardName = 'chunk-summary-proposals-00001.ndjson';
await fs.writeFile(path.join(outDir, shardName), proposalBytes, { flag: 'wx' });
const counts = {
  inputRows: rows.length,
  exactLineageRowsWithText: rows.filter((row) => row.content && row.revisionStatus === 'PROVEN').length,
  alreadySummarized: rows.filter((row) => row.chunkSummaryText?.trim()).length,
  legacySummaryColumnPopulated: rows.filter((row) => row.legacySummaryColumn?.trim()).length,
  legacyComparisonEligible: legacyComparison ? candidates.length : null,
  legacyComparisonExcluded: comparisonExcluded,
  proposalEligible: selectedResult.eligibleCount,
  selectedCanaryRows: selectedResult.selected.length,
  generated: proposals.length,
  failed: Object.values(failedByReason).reduce((sum, count) => sum + count, 0),
};
const manifestBody = {
  schema: 'atlas.ornith-lineage-bound-summary-proposal-manifest.v1',
  status: proposals.length === selectedResult.selected.length && proposals.length > 0 ? 'BOUNDED_CANARY_PROVEN' : 'CANARY_INCOMPLETE',
  canonicalAuthority: false,
  databaseWrites: 0,
  projectionWrites: 0,
  graphifyRuns: 0,
  input: { path: path.relative(ROOT, inputPath).replaceAll('\\', '/'), sha256: actualInputChecksum, sourceCohortChecksum: cohortReport.checksums.chunkSetChecksum ?? null, sourceSetChecksum: cohortReport.checksums.sourceSetChecksum ?? null },
  scope: { repositoryId, workspaceRevision, executionId: null, note: 'Cohort export is constrained by workspace revision and exact source binding/chunk lineage; no execution id is selected by the exporter.' },
  counts,
  legacyComparison: legacyComparison ? { enabled: true, legacyTextUsedAsModelInput: false, eligibility: 'PROVEN_CURRENT_LINEAGE + SHARED_QUALITY_CLEAN + NO_QUARANTINE_FLAG', storedInProposalAs: 'HINT_ONLY_NOT_ADMITTED' } : { enabled: false },
  selectedExtensions: [...new Set(selectedResult.selected.map((row) => row.sourceRef.split('.').pop()?.toLowerCase() ?? 'none'))].sort(),
  excludedByReason: selectedResult.excludedByReason,
  failedByReason,
  model: { modelId, modelRevision, modelParameterCount: model.parameterCount, runtimeBuildRevision },
  promptTemplateRevision: promptRevision,
  summarySchemaRevision: schemaRevision,
  generationParameters,
  shards: [{ path: shardName, rows: proposals.length, sha256: hashPrefixed(proposalBytes) }],
  rootChecksum: hashPrefixed(JSON.stringify(proposals.map((proposal) => proposal.summarySha256))),
  generatedAt: new Date().toISOString(),
  nextGate: 'SUMMARY_PROPOSAL_ADMISSION_PLAN_01',
};
const manifestPath = path.join(outDir, 'manifest.json');
await fs.writeFile(manifestPath, `${JSON.stringify(manifestBody, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ manifestPath: path.relative(ROOT, manifestPath).replaceAll('\\', '/'), status: manifestBody.status, counts, failedByReason, model: manifestBody.model }, null, 2));
