#!/usr/bin/env node
/**
 * LINEAGE-E2E-01 (READ ONLY, proposal-only: no datastore writes, no cache, no authorization phrase). One revision-qualified chunk is carried through the EXISTING owners:
 *   hydrate -> qualifyEvidenceV1 -> JsonlParsedEvidenceV1 -> sidecar /pos -> sidecar /classify -> buildPosConceptTaggingPacket (PosTaggerOutputV1 / DomainClassificationV1 /
 *   FeatureMatrixSetupV1 / FeatureVector5Static) -> routing (not exercised) -> pgvector retrieval, and the identity fields are compared at every stage.
 * representationRevision has NO canonical producer. The only existing label is the full-repo indexer's hard-coded 'semantic_768@v1' (a label, not a derived identity); it is
 * used here ONLY so the existing contracts accept input, it is flagged on every stage, and it keeps the whole slice proofUsable=false.
 * Run from sveltekit-frontend/:  npx tsx ../scripts/atlas/prove-e2e-01-derivation-slice-v1.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
for (const f of ['.env.local', '.env']) { try { process.loadEnvFile(path.join(ROOT, f)); } catch { /* absent */ } }
const SRC = '../../sveltekit-frontend/src/lib/server';
const { qualifyEvidenceV1 } = await import(`${SRC}/atlas/identity/lineage-qualification-v1.js`);
const { JsonlParsedEvidenceV1Schema } = await import(`${SRC}/atlas/contracts/feature-extraction-v1.js`);
const { buildPosConceptTaggingPacket } = await import(`${SRC}/atlas/pos-concept-tagging-lane.js`);
const { executeUnifiedRetrieval } = await import(`${SRC}/retrieval/unified-orchestrator.js`);
const { proveDomainClassifierPassV1 } = await import('./lib/domain-classifier-pass-proof-v1.mjs');
const { default: pg } = await import('pg');

const REPORT = path.join(ROOT, 'docs/reports/lineage-e2e-01-derivation-slice-v1.json');
const SIDECAR = process.env.NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095';
const LEGACY_REPRESENTATION_LABEL = 'semantic_768@v1'; // hard-coded label in scripts/atlas/index-full-repo-for-search.mjs; NOT a derived RepresentationRevision
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const admission = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const WS: string = admission.workspaceRevision;
const proof = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/reports/kernel-real-02-orchestrator-live-proof-v1.json'), 'utf8'));
const pick = proof.cases.flatMap((c: any) => c.candidates.filter((k: any) => k.proofUsable).map((k: any) => ({ caseId: c.id, query: c.query, chunkId: k.canonicalId })))[0];
if (!pick) throw new Error('NO_QUALIFIED_CANDIDATE_IN_PROOF_REPORT');

const stages: any[] = [];
const idOf = (o: any) => ({ packetKey: o?.packetKey ?? o?.packet_key ?? null, sourceRef: o?.sourceRef ?? o?.source_ref ?? null, sourceRevision: o?.sourceRevision ?? o?.source_revision ?? null,
  workspaceRevision: o?.workspaceRevision ?? o?.workspace_revision ?? null, representationRevision: o?.representationRevision ?? o?.representation_revision ?? null });
let baseline: any = null;
const record = (name: string, status: string, identity: any, extra: Record<string, unknown> = {}) => {
  const cmp = baseline && identity ? Object.fromEntries(Object.keys(baseline).map((k) => [k, identity[k] == null ? 'ABSENT' : identity[k] === baseline[k] ? 'SAME' : 'DIFFERENT'])) : null;
  stages.push({ stage: name, status, identity, vsBaseline: cmp, ...extra });
};

const pool = new pg.Pool({ host: process.env.POSTGRES_HOST ?? '127.0.0.1', port: Number(process.env.POSTGRES_PORT ?? 5434), user: process.env.POSTGRES_USER ?? 'legal_admin', password: process.env.POSTGRES_PASSWORD, database: process.env.POSTGRES_DB ?? 'legal_ai_db', max: 1 });
const out: any = { schema: 'atlas.lineage-e2e-01-derivation-slice.v1', generatedAt: new Date().toISOString(), gate: 'LINEAGE-E2E-01', canonicalAuthority: false, writesPerformed: false, proofUsable: false,
  representationRevisionSource: `LEGACY_LABEL ${LEGACY_REPRESENTATION_LABEL} (not a derived identity; no producer exists)`, picked: pick, stages, findings: [] };
try {
  // 1 hydrate (SELECT only)
  const r = (await pool.query(`SELECT cc.id, cc.source_ref, cc.relative_path, cc.symbol, cc.kind, cc.line_start, cc.content, cc.summary, cc.content_hash,
        l.packet_key, l.canonical_chunk_id, l.source_revision AS bridge_source_revision, l.revision_status, l.evidence_refs,
        a.feature_id, a.feature_label, a.workspace_revision_key, a.source_revision AS packet_source_revision,
        b.source_revision AS admitted_source_revision, b.workspace_revision AS admitted_workspace_revision, b.binding_checksum
      FROM codebase_chunk_index cc
      JOIN atlas_packet_chunk_lineage l ON l.chunk_row_id = cc.id AND l.revision_status = 'PROVEN'
      JOIN atlas_packets a ON a.packet_key = l.packet_key
      JOIN atlas_workspace_source_bindings b ON b.workspace_revision = $2 AND b.canonical_source_ref = cc.source_ref
     WHERE cc.id = $1::uuid`, [pick.chunkId, WS])).rows[0];
  if (!r) throw new Error('HYDRATION_EMPTY');
  baseline = { packetKey: r.packet_key, sourceRef: r.source_ref, sourceRevision: r.admitted_source_revision, workspaceRevision: r.admitted_workspace_revision, representationRevision: LEGACY_REPRESENTATION_LABEL };
  record('0_HYDRATE_BASELINE', 'OK', baseline, { chunkId: pick.chunkId, canonicalChunkId: r.canonical_chunk_id, evidenceRefs: r.evidence_refs, featureId: r.feature_id });

  // 2 canonical qualification
  const q = qualifyEvidenceV1({ packet: { packetKey: r.packet_key, workspaceRevisionKey: r.workspace_revision_key, sourceRevision: r.packet_source_revision, sourceRef: r.source_ref },
    memberships: [{ packetKey: r.packet_key, canonicalChunkId: r.canonical_chunk_id, revisionStatus: r.revision_status, sourceRevision: r.bridge_source_revision }], expected: { workspaceRevision: WS, sourceRevision: r.admitted_source_revision } });
  record('1_QUALIFY_qualifyEvidenceV1', q.eligibility === 'CHUNK_REVISION_QUALIFIED' ? 'OK' : 'BLOCKED', { ...baseline, sourceRevision: r.packet_source_revision, workspaceRevision: r.workspace_revision_key }, { eligibility: q.eligibility, chunkIdentity: q.chunkIdentity.status });

  // 3 JSONL parsed evidence (proposal-only record validated by the existing schema)
  const text: string = r.content ?? '';
  const jsonl = JsonlParsedEvidenceV1Schema.parse({ schema_version: 'atlas.feature-extraction.v1', kind: 'jsonl_parsed_evidence', packet_key: r.packet_key, source_ref: r.source_ref, source_revision: r.admitted_source_revision,
    workspace_revision: WS, parser_revision: 'lineage-e2e-01-readonly-jsonl-v1', record_index: 0, line_number: r.line_start ?? 0, raw_json: { chunkRowId: pick.chunkId, canonicalChunkId: r.canonical_chunk_id, symbol: r.symbol, kind: r.kind, textSha256: sha(text) },
    content_hash: r.content_hash ?? sha(text), created_at: new Date().toISOString() });
  record('2_JSONL_JsonlParsedEvidenceV1', 'OK', idOf(jsonl), { contentHash: jsonl.content_hash, recordsWritten: 0 });

  // 4 sidecar POS (real spaCy output; byte spans)
  const posText = (r.summary && String(r.summary).trim().length > 20 ? String(r.summary) : text).slice(0, 1200);
  let pos: any = null;
  try { const res = await fetch(`${SIDECAR}/pos`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: posText }), signal: AbortSignal.timeout(20000) }); pos = res.ok ? await res.json() : null; } catch { pos = null; }
  record('3_POS_sidecar_/pos', pos?.source === 'spacy' ? 'OK' : 'UNAVAILABLE', null, { textSource: r.summary && String(r.summary).trim().length > 20 ? 'chunk.summary' : 'chunk.content', tokens: pos?.token_assertions?.length ?? 0, coordinateBasis: pos?.coordinate_basis ?? null,
    spansAreUtf8Bytes: pos?.coordinate_basis === 'UTF8_BYTES', nounPhrases: (pos?.noun_phrases ?? []).slice(0, 3) });

  // 5 invoke the existing classifier pass through /analyze; retain its actual
  // output as diagnostic evidence rather than converting it into taxonomy truth.
  const classifierPacket = { packetKey: r.packet_key, sourceRef: r.source_ref, sourceRevision: r.admitted_source_revision, workspaceRevision: WS, evidenceRefs: r.evidence_refs ?? [] };
  let analysis: any = null;
  try {
    if (text.length === 0 || text.length > 200_000) throw new Error('CLASSIFIER_INPUT_EMPTY_OR_OVERSIZED');
    const res = await fetch(`${SIDECAR}/analyze`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      text, document_id: r.packet_key, source_type: 'plain_text', source_ref: r.source_ref,
      sourceRevision: r.admitted_source_revision, workspaceRevision: WS, packet_key: r.packet_key,
      model_id: null, passes: ['classify'], max_chars: Math.max(1, text.length),
    }), signal: AbortSignal.timeout(30000) });
    analysis = res.ok ? await res.json() : { httpStatus: res.status };
  } catch (error: any) { analysis = { requestError: String(error?.message ?? error) }; }
  const classifierProof = proveDomainClassifierPassV1({ packet: classifierPacket, text, response: analysis });
  out.domainClassifierPass = classifierProof;
  const classifierIdentity = classifierProof.pass ? {
    packetKey: analysis.pass_results.find((p: any) => p.family === 'classify' && p.pass_name === 'domain_classifier')?.packet_key ?? null,
    sourceRef: analysis.pass_results.find((p: any) => p.family === 'classify' && p.pass_name === 'domain_classifier')?.source_ref ?? null,
    sourceRevision: analysis.pass_results.find((p: any) => p.family === 'classify' && p.pass_name === 'domain_classifier')?.source_revision ?? null,
    workspaceRevision: analysis.pass_results.find((p: any) => p.family === 'classify' && p.pass_name === 'domain_classifier')?.workspace_revision ?? null,
    representationRevision: null,
  } : null;
  record('4_DOMAIN_sidecar_/analyze:classify', classifierProof.status, classifierIdentity, {
    backend: classifierProof.pass?.backend ?? null,
    modelRevision: classifierProof.pass?.modelRevision ?? null,
    naiveBayesProbability: classifierProof.pass?.naiveBayesDomainProbability ?? null,
    logisticRegressionProbability: classifierProof.pass?.logisticRegressionDomainProbability ?? null,
    selectedLabel: classifierProof.pass?.selectedLabel ?? null,
    failures: classifierProof.failures,
  });

  // 6 existing feature packet builder; workspaceRevision passed EXPLICITLY (the builder otherwise substitutes graphRevision/sourceRevision)
  const firstContent = (pos?.token_assertions ?? []).find((t: any) => ['NOUN', 'PROPN', 'VERB'].includes(t.pos));
  const built = buildPosConceptTaggingPacket({ schemaVersion: 'pos-concept-tagging-lane.v1', packetKey: r.packet_key, sourceRef: r.source_ref, sourceRevision: r.admitted_source_revision, workspaceRevision: WS, featureId: r.feature_id ?? 'unknown', featureLabel: r.feature_label ?? r.symbol ?? 'unknown',
    representationId: undefined as any, representationRevision: LEGACY_REPRESENTATION_LABEL, producerRevision: 'lineage-e2e-01-readonly-v1', featureRevision: 'lineage-e2e-01-readonly-features-v1',
    partOfSpeech: firstContent?.pos ?? null, astSymbols: r.symbol ? [String(r.symbol)] : [], semanticConceptIds: [], ontologyIds: [], posCandidateLabels: [], citations: [], screenshots: [], mcpToolCalls: [], rankingSignals: {}, participants: [], concepts: [], sourceTables: ['codebase_chunk_index', 'atlas_packet_chunk_lineage', 'atlas_workspace_source_bindings', 'atlas_packets'] } as any);
  const fb: any = (built as any).featureBundle ?? (built as any).feature_bundle ?? built;
  const pto = fb.posTaggerOutput, dc = fb.domainClassification, fms = fb.featureMatrixSetup, f5 = fb.featureVector5Static;
  record('5_POS_PosTaggerOutputV1', pto ? 'OK' : 'MISSING', idOf(pto), { confidence: pto?.confidence, confidenceSource: 'BUILDER_DEFAULT_NOT_MODEL_OUTPUT', surface: pto?.surface, tokenIndex: pto?.token_index });
  record('6_DOMAIN_DomainClassificationV1', dc ? 'BUILDER_DERIVED_NOT_CLASSIFIER' : 'NULL', idOf(dc), { confidence: dc?.confidence ?? null, classifierEvidenceAttached: false });
  record('7_FEATURE_FeatureMatrixSetupV1', fms ? 'OK' : 'MISSING', idOf(fms), { featureRevision: fms?.feature_revision, graphRevision: fms?.graph_revision ?? null });
  record('8_FEATURE_FeatureVector5Static', f5 ? 'OK' : 'MISSING', idOf(f5), { presenceMask: f5?.presence_mask ?? null, features: f5?.features ?? null });
  record('9_ROUTING', 'NOT_EXERCISED', null, { reason: 'no routing owner was invoked: domain -> lane policy is a separate owner (query-routing-classifier); this slice stops at the feature packet' });

  // 7 pgvector retrieval carrying the same identity
  const ret: any = await executeUnifiedRetrieval({ query: pick.query, limit: 8, executionMode: 'READ_ONLY' });
  const hit = (ret.candidates ?? []).find((c: any) => c.identity?.candidateId === pick.chunkId);
  record('10_RETRIEVAL_pgvector', hit ? 'OK' : 'CHUNK_NOT_RETRIEVED', hit ? idOf(hit.identity) : null, { executor: ret.lanes?.semantic?.executor ?? null, laneStatus: ret.lanes?.semantic?.status, rank: hit ? (ret.candidates.indexOf(hit) + 1) : null, evidenceRefs: hit?.identity?.evidenceRefs ?? null });

  // findings
  out.findings.push({ code: 'POS_CONFIDENCE_IS_BUILDER_DEFAULT', detail: 'buildPosConceptTaggingPacket assigns 0.94 when partOfSpeech is given and 0.5 otherwise; spaCy returns no score, so PosTaggerOutputV1.confidence is not model output' });
  out.findings.push({ code: 'POS_OUTPUT_IS_FEATURE_LABEL_NOT_TOKEN', detail: 'PosTaggerOutputV1 uses surface=featureLabel and token_index=0; the sidecar token assertions with UTF8 byte spans are not consumed by the builder' });
  out.findings.push({ code: 'WORKSPACE_REVISION_SILENT_FALLBACK', detail: 'the builder uses workspaceRevision ?? graphRevision ?? sourceRevision (feature setup and FeatureVector5Static); a missing workspace revision is replaced silently by a different revision kind. This slice passed it explicitly.' });
  out.findings.push({ code: 'REPRESENTATION_REVISION_REQUIRED_BY_CONTRACTS', detail: 'PosTaggerOutputV1, FeatureMatrixSetupV1 and FeatureVector5Static require a non-empty representation_revision; with no producer the feature path cannot be proof-usable' });
  const same = (k: string) => stages.filter((s) => s.vsBaseline).every((s) => s.vsBaseline[k] === 'SAME' || s.vsBaseline[k] === 'ABSENT');
  out.identityPreserved = Object.fromEntries(['packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision', 'representationRevision'].map((k) => [k, same(k) ? 'NO_STAGE_DIFFERS' : 'DIFFERS_AT_SOME_STAGE']));
  out.verdict = stages.every((s) => ['OK', 'NOT_EXERCISED'].includes(s.status)) ? 'E2E_01_SLICE_COMPLETE_DIAGNOSTIC_ONLY' : 'E2E_01_SLICE_PARTIAL';
} catch (e: any) { out.verdict = 'E2E_01_FAILED'; out.error = String(e?.message ?? e).slice(0, 300); } finally { await pool.end(); }
fs.writeFileSync(REPORT, JSON.stringify(out, null, 2) + '\n');
for (const s of stages) console.log(`${s.stage.padEnd(36)} ${String(s.status).padEnd(18)} ${s.vsBaseline ? Object.entries(s.vsBaseline).map(([k, v]) => `${k.slice(0, 4)}=${String(v).slice(0, 4)}`).join(' ') : ''}`);
console.log(out.verdict, out.error ?? '', JSON.stringify(out.identityPreserved ?? {}));
process.exit(0);
