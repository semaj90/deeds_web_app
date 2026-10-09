/**
 * Agentic repair evidence-readiness scaffold.
 *
 * Read-only helper for scripts/atlas/run-agentic-error-fixing-v1.mjs.
 * Not a new retrieval, AST, LSP, model, or mutation owner.
 * Accepts a manifest of already-produced receipts, never fabricates them.
 *
 * TODO(P0): bind frozen DIR-INDEX-01/02 source membership and exact byte-spans.
 * TODO(P0): bind existing ast-grep + Tree-sitter/CST + ts-morph/LSP symbol owners.
 * TODO(P0): bind CandidateOrdinalMapV1 and same-revision ContextManifestV1.
 * TODO(P0): bind LangExtract / 8095 exact byte-grounded extraction + task/evidence receipts.
 * TODO(P1): inventory actual safetensors/XGBoost/MLP/cross-encoder checkpoint manifests.
 * TODO(P1): add actual query-first recall evaluation (not supplied-set reranking).
 * TODO(P1): compare EmbeddingGemma native MRL vs learned latent as distinct families.
 * TODO(P1): verify Ornith :8090 answer citations, abstention, latency, and model revision.
 * TODO(P2): run leak-controlled LongMemEval with separate retrieve/generate scoring.
 * TODO(P2): orchestrate existing tools through Deep Agents/Mastra only after validated owner links.
 * TODO: .okf/OpenWiki is reference data; Firecrawl/BeautifulSoup corpus is not source truth.
 * TODO: Pydantic validates Python payload; Zod validates TS boundaries.
 * TODO: sed/rg output is diagnostic; byte reader, ast-grep and LSP prove their own observations.
 */
import { createHash } from 'node:crypto';

const REQUIRED = Object.freeze({
  source: ['workspaceRevision','sourceRevision','sourceRef','sourceSha256','byteStart','byteEnd','chunkId','packetKey'],
  structural: ['treeSitterRevision','astGrepRevision','symbolVersionId','structuralEvidenceRef'],
  retrieval: ['candidateSnapshotRevision','ordinalMapChecksum','contextManifestChecksum','representationRevision','retrievalReceiptRef'],
  grounding: ['extractorRevision','evidenceSpanChecksum','groundedReceiptRef','canonicalPacketReadbackRef'],
  synthesis: ['ornithModelRevision','promptManifestChecksum','answerEvidenceRefs','answerEvaluationRef'],
});
const DEFERRED = Object.freeze({
  modelInventory: 'TODO: checkpoint paths, sha256, training cohort and inference caller for XGBoost/MLP/cross-encoder/safetensors',
  retrievalBenchmark: 'TODO: real first-stage Qdrant/pgvector/exact search on frozen relevance labels; account for missed candidates',
  dimensionParity: 'TODO: distinguish native EmbeddingGemma MRL 768/256/128 from learned latent 256/128/64',
  longMemEval: 'TODO: official dataset/scorer, leakage isolation, retrieval/generation metrics and latency',
  documentation: 'TODO: exact approved .okf URLs + hashes; generated corpus is noncanonical',
  orchestration: 'TODO: current request caller, task/evidence receipt, approved repair tournament and independent validator',
});
const nonblank = (value) => typeof value === 'string' && value.trim().length > 0;
const stable = (value) => JSON.stringify(value, Object.keys(value).sort());
export function evaluateRepairEvidenceReadiness(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { status:'BLOCKED_INVALID_INPUT', canMutate:false, canonicalAuthority:false, writesPerformed:false, checks:{}, todos:['TODO: provide JSON object of existing evidence receipts'] };
  }
  const checks = {};
  const todos = [];
  for (const [stage, keys] of Object.entries(REQUIRED)) {
    const record = manifest[stage];
    const absent = keys.filter(key => !nonblank(record?.[key]) && !(key === 'answerEvidenceRefs' && Array.isArray(record?.[key]) && record[key].length > 0));
    checks[stage] = { status: absent.length ? 'BLOCKED' : 'FIELDS_PRESENT_UNVERIFIED', missing: absent };
    if (absent.length) todos.push(`TODO(${stage}): fetch existing owner receipt fields: ${absent.join(', ')}`);
  }
  const src = manifest.source;
  if (Number.isInteger(src?.byteStart) && Number.isInteger(src?.byteEnd) && src.byteEnd < src.byteStart) {
    checks.source = { status:'BLOCKED', missing:['VALID_BYTE_RANGE'] };
    todos.push('TODO(source): verify nonnegative exact source-byte range against frozen bytes');
  }
  // Fields only establish presence, never authority. Readback must occur in existing owners.
  for (const [stage, note] of Object.entries(DEFERRED)) if (manifest[stage]?.status !== 'EXTERNALLY_VERIFIED') todos.push(note);
  const status = Object.values(checks).some(v => v.status === 'BLOCKED') ? 'BLOCKED_MISSING_EVIDENCE' : 'REVIEW_ONLY_OWNER_READBACK_REQUIRED';
  const output = { schema:'atlas.agentic-repair-readiness.v1', status, canMutate:false, canonicalAuthority:false, writesPerformed:false, checks, todos, nextGate:'EXISTING_OPEN_SPEC_OWNER_READBACK' };
  return { ...output, checksum:'sha256:'+createHash('sha256').update(stable(output)).digest('hex') };
}
export function smokeRepairEvidenceReadiness() {
  const empty = evaluateRepairEvidenceReadiness({});
  const malformed = evaluateRepairEvidenceReadiness(null);
  if (empty.status !== 'BLOCKED_MISSING_EVIDENCE' || empty.canMutate !== false || malformed.status !== 'BLOCKED_INVALID_INPUT') throw new Error('REPAIR_READINESS_SMOKE_FAILED');
  return { status:'PASS', assertions:3 };
}
