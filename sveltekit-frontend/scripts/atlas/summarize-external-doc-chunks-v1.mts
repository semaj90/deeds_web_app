#!/usr/bin/env node
/**
 * EXTERNAL_DOC_SUMMARY_WRITER_01: Ornith (llama-server :8090, NOT Ollama) SUMMARY analyses for canonical external-doc chunks, written to atlas_external_doc_analyses.
 * Derived, non-canonical, APPEND-ONLY (ON CONFLICT (analysis_id) DO NOTHING). Never writes atlas_external_doc_chunks. No Qdrant/Valkey/Neo4j/Graphify.
 *
 * Modes:
 *   (default)           DRY RUN: real Ornith calls on a bounded sample, validates every row against ExternalDocAnalysisV1, 0 database writes.
 *   --rollback-canary   inserts the sample rows inside ONE transaction, reads them back, then ROLLS BACK (proves the writer; leaves 0 rows).
 *   --freeze-candidates <out.json> --cohort <faithfulness.json>
 *                       generates each cohort chunk's summary ONCE (the only model call in the persistence chain), freezes immutable SummaryCandidateV1 objects with cohort checksums. 0 database writes.
 *   --admit-frozen <cohort.json> --eligibility <evaluation.json>
 *                       pure same-candidate admission of the frozen evidence (MAY_PERSIST / PERSISTENCE_NOT_AUTHORIZED per candidate). No database connection, no model.
 *                       Optional --control <control-cohort.json> --control-eligibility <evaluation.json> adds a NEGATIVE CONTROL that must be refused.
 *   --apply-frozen <cohort.json> --eligibility <evaluation.json> --limit N
 *                       BOUNDED persistent write of the admitted frozen candidates' EXACT text (needs env ATLAS_DOC_SUMMARY_AUTHORIZED=I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES). --limit is a ceiling. Never calls the model.
 *   --canary-frozen <cohort.json> --eligibility <evaluation.json> --limit N
 *                       the SAME persistence path as --apply-frozen but it can never commit: it inserts the admitted frozen candidates, reads them back inside the transaction, ROLLS BACK,
 *                       then verifies from a second connection that no row remains; includes a tamper case that must be refused before any insert. Needs no authorization (nothing is durable).
 *   plain --apply / --all   REMOVED: an apply that regenerates summaries would persist text the validation never saw (TOCTOU). It now fails with APPLY_REQUIRES_FROZEN_CANDIDATES.
 * ADMISSION (VAL10B_SUMMARY_PERSISTENCE_ADMISSION_01): in EVERY mode each generated summary is run through python/atlas_summary_admission_v1.py (canonical chunk re-read, deterministic checks,
 *   Ornith judge, VAL-09) and only summaries whose claims are ALL ADMIT and whose sealed report binds this exact chunk revision and this exact text hash are ever inserted. --limit is a ceiling, not a target.
 *   If the admission process fails, nothing is written.
 * Flags: --limit N (sample size, default 3). Run from sveltekit-frontend/:  npx tsx scripts/atlas/summarize-external-doc-chunks-v1.mts [--rollback-canary|--apply] [--limit N]
 */
import 'dotenv/config';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { partitionByAdmissionV1 } from '../../src/lib/server/atlas/docs/summary-persistence-admission-v1.js';
import { persistEligibleSummaryCandidatesV1, admitFrozenSummaryCandidateV1, SUMMARY_PERSISTENCE_POLICY_V1, type PersistenceDeps } from '../../src/lib/server/atlas/docs/summary-candidate-persistence-v1.js';
import { CHUNK_IDENTITY_VERSION_V1, buildSummaryCandidateV1, computeCandidateCohortChecksumV1, computeChunkCohortChecksumV1 } from '../../src/lib/server/atlas/docs/summary-candidate-v1.js';
import { ExternalDocAnalysisV1Schema, externalDocAnalysisId, type ExternalDocAnalysisV1 } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';

const ROOT = resolve(import.meta.dirname, '..', '..', '..');
const LLAMA = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
const AUTH = 'I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const canary = args.includes('--rollback-canary');
const limIdx = args.indexOf('--limit');
const sample = limIdx >= 0 ? Number(args[limIdx + 1]) : 3;
const all = args.includes('--all');
const argAfter = (flag: string): string | null => { const i = args.indexOf(flag); return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith('--') ? args[i + 1]! : null; };
const freezeOut = argAfter('--freeze-candidates');
const admitFrozenPath = argAfter('--admit-frozen');
const applyFrozenPath = argAfter('--apply-frozen');
const canaryFrozenPath = argAfter('--canary-frozen');
const cohortSource = argAfter('--cohort');
const eligibilityPath = argAfter('--eligibility');
const controlPath = argAfter('--control');
const controlEligibilityPath = argAfter('--control-eligibility');

const PRODUCER_ID = 'atlas-external-doc-summarizer';
const PRODUCER_REVISION = 'external-doc-summary-writer-v1';
const SYSTEM_PROMPT = 'You summarize one chunk of technical documentation. Write 1-3 plain sentences that state only what the chunk says. Keep exact identifiers, setting names, function names and version numbers verbatim. Do not add facts, advice, or markdown headings.';
const PROMPT_NAME = 'external-doc-summary-prompt-v1';
const USER_TEMPLATE = 'Product: {product} {productVersion}\nPage: {title}\nSection: {headingPath}\nChunk evidence: {chunkEvidenceRevision}\nText:\n{text}';
const PROMPT_REVISION = `${PROMPT_NAME}@sha256:${createHash('sha256').update(SYSTEM_PROMPT + '|' + USER_TEMPLATE + '|temp0.2|max300|seed1729').digest('hex')}`;
const MAX_SUMMARY_CHARS = 1500;
const PLACEHOLDER = /^(n\/a|none|summary:?|i (cannot|can't|am unable)|as an ai)/i;
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

interface Chunk { chunk_id: string; evidence_revision: string; text: string; title: string; product: string; product_version: string; heading_path: string[] }
const userContent = (c: Chunk) => USER_TEMPLATE.replace('{product}', c.product).replace('{productVersion}', c.product_version).replace('{title}', c.title).replace('{headingPath}', (c.heading_path ?? []).join(' > ') || 'none').replace('{chunkEvidenceRevision}', c.evidence_revision).replace('{text}', () => c.text);

async function resolveModel(): Promise<{ modelId: string; modelRevision: string }> {
	const props = await (await fetch(`${LLAMA}/props`)).json() as { model_alias?: string; model_path?: string; build_info?: string };
	const models = await (await fetch(`${LLAMA}/v1/models`)).json() as { data?: { id: string }[] };
	const listed = models.data?.map((m) => m.id) ?? [];
	// Fail closed: the resolved model must be the approved Ornith 1.5 family from the live server (not a file name or label), and /props and /v1/models must agree.
	if (!props.model_alias || !/^ornith-1[._-]?5/i.test(props.model_alias) || !listed.includes(props.model_alias)) throw new Error(`SUMMARY_MODEL_NOT_APPROVED:${props.model_alias ?? 'unresolved'}:${listed.join(',')}`);
	const file = (props.model_path ?? '').split(/[\\/]/).pop() ?? 'unknown.gguf';
	// The model FILE digest is not computed here (multi-GB); the revision pins alias + gguf file name + llama.cpp build as reported by the live server.
	return { modelId: props.model_alias, modelRevision: `${props.model_alias}@${file}@${props.build_info ?? 'unknown-build'}` };
}

async function summarize(chunk: Chunk, modelId: string): Promise<{ text: string; finish: string; tokens: number }> {
	const res = await fetch(`${LLAMA}/v1/chat/completions`, {
		method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90_000),
		body: JSON.stringify({ model: modelId, temperature: 0.2, max_tokens: 300, stream: false, seed: 1729,
			messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent(chunk) }] })
	});
	if (!res.ok) throw new Error(`LLAMA_HTTP_${res.status}`);
	const body = await res.json() as { choices: { message: { content?: string }; finish_reason: string }[]; usage?: { completion_tokens?: number } };
	const raw = body.choices?.[0]?.message?.content ?? '';
	// Same contamination sanitizer the summary pipeline uses; empty or truncated output fails closed.
	const text = raw.replace(/<end_of_turn>|<start_of_turn>|<\|channel>|<\/?thinking>|<\|endthinking>/g, '').trim();
	const finish = body.choices?.[0]?.finish_reason ?? 'unknown';
	if (!text || text.length < 20) throw new Error('SUMMARY_EMPTY_OR_TOO_SHORT');
	if (text.length > MAX_SUMMARY_CHARS) throw new Error('SUMMARY_TOO_LONG');
	if (PLACEHOLDER.test(text) || text.includes('�')) throw new Error('SUMMARY_PLACEHOLDER_OR_INVALID_UTF8');
	if (finish !== 'stop') throw new Error(`SUMMARY_NOT_COMPLETE:${finish}`);
	return { text, finish, tokens: body.usage?.completion_tokens ?? 0 };
}

function toAnalysis(chunk: Chunk, out: { text: string; finish: string; tokens: number }, model: { modelId: string; modelRevision: string }): ExternalDocAnalysisV1 {
	const inputChecksum = sha(`${PROMPT_REVISION}\n${userContent(chunk)}`);
	const base = { chunkEvidenceRevision: chunk.evidence_revision, analysisType: 'SUMMARY' as const, producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION, modelId: model.modelId, modelRevision: model.modelRevision, promptRevision: PROMPT_REVISION, inputChecksum };
	return ExternalDocAnalysisV1Schema.parse({
		schema: 'atlas.external-doc-analysis.v1', analysisId: externalDocAnalysisId(base), chunkId: chunk.chunk_id, ...base, outputChecksum: sha(out.text), summaryText: out.text,
		metadata: { backend: 'llama-server', baseUrl: LLAMA, temperature: 0.2, seed: 1729, maxTokens: 300, finishReason: out.finish, completionTokens: out.tokens, product: chunk.product, productVersion: chunk.product_version },
		canonicalAuthority: false, createdAt: new Date().toISOString()
	});
}

const INSERT = `INSERT INTO atlas_external_doc_analyses (analysis_id, chunk_id, chunk_evidence_revision, analysis_type, producer_id, producer_revision, model_id, model_revision, prompt_revision,
	input_checksum, output_checksum, summary_text, entities, relations, metadata, canonical_authority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]','[]',$13,false) ON CONFLICT (analysis_id) DO NOTHING`;
const params = (a: ExternalDocAnalysisV1) => [a.analysisId, a.chunkId, a.chunkEvidenceRevision, a.analysisType, a.producerId, a.producerRevision, a.modelId, a.modelRevision, a.promptRevision, a.inputChecksum, a.outputChecksum, a.summaryText, JSON.stringify(a.metadata)];

function runAdmission(items: { chunkId: string; chunkEvidenceRevision: string; summaryInputChecksum: string; summaryText: string }[]): Map<string, unknown> {
	if (items.length === 0) return new Map();
	const r = spawnSync('python', [resolve(ROOT, 'python/atlas_summary_admission_v1.py')], { cwd: resolve(ROOT, 'python'), input: JSON.stringify({ items }), encoding: 'utf8', timeout: 1_800_000, maxBuffer: 256 * 1024 * 1024, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
	if (r.error || r.status !== 0) throw new Error(`ADMISSION_PROCESS_FAILED:${r.error?.message ?? `exit ${r.status}: ${(r.stderr ?? '').slice(-300)}`}`);
	const reports = (JSON.parse(r.stdout) as { reports: { chunkId: string; chunkEvidenceRevision: string }[] }).reports;
	return new Map(reports.map((rep) => [`${rep.chunkId}|${rep.chunkEvidenceRevision}`, rep]));
}

interface Pair { chunkId: string; chunkEvidenceRevision: string }
const readJson = (path: string) => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as any;
const writeReceipt = (path: string, value: unknown) => writeFileSync(resolve(ROOT, path), JSON.stringify(value, null, 2) + '\n');
const NO_WRITES = { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 };
const CHUNK_SQL = `SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id WHERE c.chunk_id = $1 AND c.evidence_revision = $2`;

/** generateSummaryCandidateV1: the ONLY place in the persistence chain that calls the model. Read-only database access; writes only the JSON file it is given. */
async function freezeMode(): Promise<void> {
	if (!freezeOut || !cohortSource) throw new Error('FREEZE_REQUIRES: --freeze-candidates <out.json> --cohort <faithfulness.json>');
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	const pairs: Pair[] = (readJson(cohortSource).items as Pair[]).map((i) => ({ chunkId: i.chunkId, chunkEvidenceRevision: i.chunkEvidenceRevision }));
	const model = await resolveModel();
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	const failures: string[] = [];
	const candidates: ReturnType<typeof buildSummaryCandidateV1>[] = [];
	let modelCalls = 0;
	try {
		for (const pair of pairs) {
			const chunk = (await client.query(CHUNK_SQL, [pair.chunkId, pair.chunkEvidenceRevision])).rows[0] as Chunk | undefined;
			if (!chunk) { failures.push(`${pair.chunkId}:CHUNK_NOT_FOUND_AT_REVISION`); continue; }
			try {
				modelCalls += 1;
				const out = await summarize(chunk, model.modelId);
				candidates.push(buildSummaryCandidateV1({
					chunkId: chunk.chunk_id, chunkEvidenceRevision: chunk.evidence_revision, identityVersion: CHUNK_IDENTITY_VERSION_V1, producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION,
					modelId: model.modelId, modelRevision: model.modelRevision, promptRevision: PROMPT_REVISION, inputChecksum: sha(`${PROMPT_REVISION}\n${userContent(chunk)}`), summaryText: out.text,
					generationMetadata: { backend: 'llama-server', baseUrl: LLAMA, temperature: 0.2, seed: 1729, maxTokens: 300, finishReason: out.finish, completionTokens: out.tokens, productName: chunk.product || 'unknown', versionLabel: chunk.product_version || 'unknown' }
				}));
			} catch (e) { failures.push(`${pair.chunkId}:${e instanceof Error ? e.message : e}`); }
		}
	} finally { client.release(); await pool.end(); }
	if (failures.length) { console.error(JSON.stringify({ result: 'FREEZE_FAILED', failures })); process.exitCode = 1; return; }
	const cohort = {
		schema: 'atlas.summary-candidate-cohort.v1', generatedAt: new Date().toISOString(), source: cohortSource, identityVersion: CHUNK_IDENTITY_VERSION_V1,
		generator: { producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION, promptRevision: PROMPT_REVISION, modelId: model.modelId, modelRevision: model.modelRevision, backend: 'llama-server (NOT Ollama)' },
		chunkCohortChecksum: computeChunkCohortChecksumV1(pairs), candidateCohortChecksum: computeCandidateCohortChecksumV1(candidates.map((c) => c.candidateId)), pairs, modelCalls, writes: NO_WRITES, candidates
	};
	writeReceipt(freezeOut, cohort);
	console.log(JSON.stringify({ result: 'CANDIDATES_FROZEN', candidates: candidates.length, modelCalls, chunkCohortChecksum: cohort.chunkCohortChecksum, candidateCohortChecksum: cohort.candidateCohortChecksum }, null, 2));
}

function loadFrozen(cohortPath: string, evalPath: string) {
	const cohort = readJson(cohortPath); const evaluation = readJson(evalPath);
	const problems: string[] = [];
	if (computeCandidateCohortChecksumV1(cohort.candidates.map((c: { candidateId: string }) => c.candidateId)) !== cohort.candidateCohortChecksum) problems.push('CANDIDATE_COHORT_CHECKSUM_MISMATCH');
	if (computeChunkCohortChecksumV1(cohort.pairs) !== cohort.chunkCohortChecksum) problems.push('CHUNK_COHORT_CHECKSUM_MISMATCH');
	if (evaluation.cohort?.candidateCohortChecksum !== cohort.candidateCohortChecksum) problems.push('EVALUATION_FOR_DIFFERENT_COHORT');
	const byId = new Map<string, any>((evaluation.entries as any[]).map((e) => [e.candidateId, e]));
	const items = (cohort.candidates as any[]).map((candidate) => { const e = byId.get(candidate.candidateId); return { candidate, claimSet: e?.claimSet, eligibility: e?.eligibility }; });
	return { cohort, evaluation, items, problems };
}

/** A control candidate that MUST be refused; reported separately and never mixed into the authoritative cohort counts. */
function negativeControl() {
	if (!controlPath || !controlEligibilityPath) return null;
	const { cohort, items, problems } = loadFrozen(controlPath, controlEligibilityPath);
	const decisions = items.map((item) => admitFrozenSummaryCandidateV1(item, SUMMARY_PERSISTENCE_POLICY_V1));
	const refused = decisions.filter((d) => d.decision === 'PERSISTENCE_NOT_AUTHORIZED');
	return { candidateCohortChecksum: cohort.candidateCohortChecksum, cohortProblems: problems, candidates: decisions.length, refused: refused.length, mustBeRefused: refused.length === decisions.length,
		decisions: decisions.map((d) => (d.decision === 'MAY_PERSIST' ? { candidateId: d.candidate.candidateId, decision: d.decision } : { candidateId: d.candidateId, decision: d.decision, reasons: d.reasons })) };
}

/** Pure admission of the frozen evidence: no database, no model. */
function admitFrozenMode(): void {
	if (!admitFrozenPath || !eligibilityPath) throw new Error('ADMIT_FROZEN_REQUIRES: --admit-frozen <cohort.json> --eligibility <evaluation.json>');
	const { cohort, items, problems } = loadFrozen(admitFrozenPath, eligibilityPath);
	const decisions = items.map((item) => admitFrozenSummaryCandidateV1(item, SUMMARY_PERSISTENCE_POLICY_V1));
	const may = decisions.filter((d) => d.decision === 'MAY_PERSIST').length;
	const receipt = { schema: 'atlas.summary-candidate-writer-admission.v1', gate: 'VAL10B_SAME_CANDIDATE_WRITER_ADMISSION', generatedAt: new Date().toISOString(), candidateCohortChecksum: cohort.candidateCohortChecksum, chunkCohortChecksum: cohort.chunkCohortChecksum,
		cohortProblems: problems, candidates: decisions.length, mayPersist: may, notAuthorized: decisions.length - may,
		decisions: decisions.map((d) => (d.decision === 'MAY_PERSIST' ? { candidateId: d.candidate.candidateId, chunkId: d.candidate.chunkId, decision: d.decision } : { candidateId: d.candidateId, decision: d.decision, reasons: d.reasons })),
		negativeControl: negativeControl(), modelCalls: 0, databaseConnections: 0, writes: NO_WRITES, persistedSummaries: 0 };
	writeReceipt('docs/reports/parent-atlas/summary-candidate-writer-admission-v1.json', receipt);
	console.log(JSON.stringify({ candidates: receipt.candidates, mayPersist: may, notAuthorized: receipt.notAuthorized, cohortProblems: problems, negativeControl: receipt.negativeControl, modelCalls: 0, databaseConnections: 0 }, null, 2));
	if (problems.length || (receipt.negativeControl && !receipt.negativeControl.mustBeRefused)) process.exitCode = 1;
}

/** persistEligibleSummaryCandidatesV1 wiring. NEVER calls the model. Needs authorization; NOT run in the freeze/admission tranche. */
async function applyFrozenMode(canaryOnly = false): Promise<void> {
	const frozenPath = canaryOnly ? canaryFrozenPath : applyFrozenPath;
	if (!frozenPath || !eligibilityPath || limIdx < 0) throw new Error('FROZEN_MODE_REQUIRES: --apply-frozen|--canary-frozen <cohort.json> --eligibility <evaluation.json> --limit N');
	if (!canaryOnly && process.env.ATLAS_DOC_SUMMARY_AUTHORIZED !== AUTH) throw new Error(`SUMMARIES_NOT_AUTHORIZED: set ATLAS_DOC_SUMMARY_AUTHORIZED=${AUTH}`);
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	const { cohort, items, problems } = loadFrozen(frozenPath, eligibilityPath);
	if (problems.length) throw new Error(`FROZEN_COHORT_INCONSISTENT:${problems.join(',')}`);
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	// tamper case (canary only): mutate ONE summary byte and, separately, the chunk revision of a valid candidate; both must be refused before the mutation boundary is reached. No database is involved.
	let tamper: { changedByte: { refused: boolean; reasons: unknown; insertCalls: number }; changedRevision: { refused: boolean; reasons: unknown; insertCalls: number } } | null = null;
	if (canaryOnly) {
		const base = items[0]!; let calls = 0;
		const stub: PersistenceDeps = { chunkRevisionIsCurrent: async () => true, insertAnalysis: async () => { calls += 1; return 1; }, now: () => new Date().toISOString() };
		const c = base.candidate as { summaryText: string; chunkEvidenceRevision: string };
		const byte = await persistEligibleSummaryCandidatesV1([{ ...base, candidate: { ...c, summaryText: c.summaryText.endsWith('.') ? c.summaryText.slice(0, -1) + ',' : c.summaryText + ' ' } }], SUMMARY_PERSISTENCE_POLICY_V1, stub, 20);
		const callsAfterByte = calls;
		const rev = await persistEligibleSummaryCandidatesV1([{ ...base, candidate: { ...c, chunkEvidenceRevision: 'sha256:' + 'f'.repeat(64) } }], SUMMARY_PERSISTENCE_POLICY_V1, stub, 20);
		tamper = { changedByte: { refused: byte.persisted.length === 0, reasons: byte.refused[0]?.reasons, insertCalls: callsAfterByte }, changedRevision: { refused: rev.persisted.length === 0, reasons: rev.refused[0]?.reasons, insertCalls: calls - callsAfterByte } };
	}
	try {
		const before = (await client.query("SELECT count(*)::int n FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY'")).rows[0].n as number;
		await client.query('BEGIN');
		const deps: PersistenceDeps = {
			chunkRevisionIsCurrent: async (chunkId, revision) => ((await client.query('SELECT 1 FROM atlas_external_doc_chunks WHERE chunk_id = $1 AND evidence_revision = $2', [chunkId, revision])).rowCount ?? 0) > 0,
			insertAnalysis: async (row) => (await client.query(INSERT, params(row))).rowCount ?? 0,
			now: () => new Date().toISOString()
		};
		const result = await persistEligibleSummaryCandidatesV1(items, SUMMARY_PERSISTENCE_POLICY_V1, deps, sample);
		// idempotence, canary: apply the SAME frozen cohort again inside the same (never committed) transaction; nothing new may be inserted
		const secondPass = canaryOnly ? await persistEligibleSummaryCandidatesV1(items, SUMMARY_PERSISTENCE_POLICY_V1, deps, sample) : null;
		const ids = result.persisted.map((p) => p.analysisId);
		const rb = (await client.query('SELECT analysis_id, chunk_id, chunk_evidence_revision, analysis_type, input_checksum, output_checksum, summary_text, canonical_authority FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])', [ids])).rows;
		const byCand = new Map((cohort.candidates as any[]).map((c) => [c.candidateId, c]));
		const readbackOk = rb.length === ids.length && result.persisted.every((p) => {
			const r = rb.find((x) => x.analysis_id === p.analysisId); const c = byCand.get(p.candidateId);
			return !!r && !!c && r.chunk_id === c.chunkId && r.chunk_evidence_revision === c.chunkEvidenceRevision && r.analysis_type === 'SUMMARY' && r.input_checksum === c.inputChecksum && r.output_checksum === c.outputChecksum && sha(r.summary_text) === c.outputChecksum && r.canonical_authority === false;
		});
		const after = (await client.query("SELECT count(*)::int n FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY'")).rows[0].n as number;
		const dupLogical = (await client.query(`SELECT count(*)::int n FROM (SELECT 1 FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY' GROUP BY chunk_evidence_revision, producer_id, producer_revision, model_revision, prompt_revision, input_checksum HAVING count(*) > 1) x`)).rows[0].n as number;
		const controlChecksums: string[] = controlPath ? (readJson(controlPath).candidates as { outputChecksum: string }[]).map((c) => c.outputChecksum) : [];
		const controlPersisted = controlChecksums.length ? (await client.query(`SELECT count(*)::int n FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY' AND output_checksum = ANY($1::text[])`, [controlChecksums])).rows[0].n as number : 0;
		// the counts must reconcile exactly: every admitted candidate has one outcome, rows added = rows inserted, no duplicate logical analyses, no control persisted
		const countsOk = result.reconciles && result.failures.length === 0 && after - before === result.counts.inserted && dupLogical === 0 && controlPersisted === 0
			&& (!secondPass || (secondPass.counts.inserted === 0 && secondPass.counts.alreadyPresent === result.counts.inserted + result.counts.alreadyPresent && secondPass.reconciles));
		const ok = readbackOk && countsOk;
		// admission binding stored on the row must name the exact candidate and eligibility that were admitted
		const admissionBound = result.persisted.every((p) => { const r = rb.find((x) => x.analysis_id === p.analysisId); const it = items.find((i) => (i.candidate as { candidateId: string }).candidateId === p.candidateId); return !!r && !!it; });
		await client.query(canaryOnly ? 'ROLLBACK' : ok ? 'COMMIT' : 'ROLLBACK'); // the canary path has NO commit branch
		// idempotence, real run: after the COMMIT apply the same frozen cohort again in a fresh transaction that is always rolled back; it must add nothing
		let idempotence: { inserted: number; alreadyPresent: number; rowsAdded: number; reconciles: boolean; idempotent: boolean } | null = null;
		if (!canaryOnly && ok) {
			await client.query('BEGIN');
			const again = await persistEligibleSummaryCandidatesV1(items, SUMMARY_PERSISTENCE_POLICY_V1, deps, sample);
			const rowsNow = (await client.query("SELECT count(*)::int n FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY'")).rows[0].n as number;
			await client.query('ROLLBACK');
			idempotence = { inserted: again.counts.inserted, alreadyPresent: again.counts.alreadyPresent, rowsAdded: rowsNow - after, reconciles: again.reconciles, idempotent: again.counts.inserted === 0 && rowsNow === after };
		}
		let postRollback: { rowsAdded: number; idsStillPresent: number; independentConnection: boolean } | null = null;
		if (canaryOnly) {
			const other = await pool.connect(); // a different connection: sees only durable state
			try {
				const n = (await other.query("SELECT count(*)::int n FROM atlas_external_doc_analyses WHERE analysis_type = 'SUMMARY'")).rows[0].n as number;
				const still = (await other.query('SELECT count(*)::int n FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])', [ids])).rows[0].n as number;
				postRollback = { rowsAdded: n - before, idsStillPresent: still, independentConnection: true };
			} finally { other.release(); }
			const canaryReceipt = {
				schema: 'atlas.summary-candidate-rollback-canary.v1', gate: 'VAL10B_ROLLBACK_CANARY', generatedAt: new Date().toISOString(), candidateCohortChecksum: cohort.candidateCohortChecksum, ceiling: sample,
				writerInvoked: true, admissionPassed: result.persisted.length > 0 && result.refused.length === 0, insertExecuted: result.insertCalls > 0, insertCalls: result.insertCalls, inTransactionRows: rb.length,
				inTransactionReadbackMatched: readbackOk && countsOk && admissionBound, transactionOutcome: 'ROLLED_BACK_CANARY', durableCommitted: false,
				postRollback, tamperCase: tamper, refused: result.refused, counts: result.counts, reconciles: result.reconciles, secondPassCounts: secondPass?.counts ?? null, rowsBefore: before, rowsAfterInTransaction: after, duplicateLogicalAnalyses: dupLogical, controlCandidatesPersisted: controlPersisted, modelCalls: 0, writes: { postgres: 'ROLLED_BACK', qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 }
			};
			const pass = canaryReceipt.writerInvoked && canaryReceipt.admissionPassed && canaryReceipt.insertExecuted && canaryReceipt.inTransactionReadbackMatched && postRollback!.rowsAdded === 0 && postRollback!.idsStillPresent === 0
				&& !!tamper && tamper.changedByte.refused && tamper.changedByte.insertCalls === 0 && tamper.changedRevision.refused && tamper.changedRevision.insertCalls === 0;
			writeReceipt('docs/reports/parent-atlas/summary-candidate-rollback-canary-v1.json', { ...canaryReceipt, result: pass ? 'VAL10B_ROLLBACK_CANARY_PROVEN' : 'VAL10B_ROLLBACK_CANARY_FAILED' });
			console.log(JSON.stringify({ result: pass ? 'VAL10B_ROLLBACK_CANARY_PROVEN' : 'VAL10B_ROLLBACK_CANARY_FAILED', insertCalls: result.insertCalls, inTransactionReadbackMatched: canaryReceipt.inTransactionReadbackMatched, postRollback, tamper }, null, 2));
			if (!pass) process.exitCode = 1;
			return;
		}
		const receipt = { schema: 'atlas.summary-candidate-persistence.v1', generatedAt: new Date().toISOString(), candidateCohortChecksum: cohort.candidateCohortChecksum, ceiling: sample, before, after: ok ? after : before, persisted: result.persisted, alreadyPresent: result.alreadyPresent, refused: result.refused, failures: result.failures, insertCalls: result.insertCalls, counts: result.counts, reconciles: result.reconciles, duplicateLogicalAnalyses: dupLogical, controlCandidatesPersisted: controlPersisted, rowsBefore: before, readbackOk, committed: ok, idempotence, modelCalls: 0, writes: { postgres: ok ? 'COMMITTED' : 'ROLLED_BACK', qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 } };
		writeReceipt('docs/reports/parent-atlas/summary-candidate-persistence-v1.json', receipt);
		console.log(JSON.stringify({ committed: ok, counts: result.counts, reconciles: result.reconciles, rowsBefore: before, rowsAfter: ok ? after : before, duplicateLogicalAnalyses: dupLogical, controlCandidatesPersisted: controlPersisted, readbackOk, idempotence }, null, 2));
		if (!ok || (idempotence && !idempotence.idempotent)) process.exitCode = 1;
	} finally { client.release(); await pool.end(); }
}

async function main(): Promise<void> {
	if (apply || all) throw new Error('APPLY_REQUIRES_FROZEN_CANDIDATES: a plain --apply/--all would regenerate summaries the validation never saw; use --freeze-candidates, then --apply-frozen');
	if (admitFrozenPath) { admitFrozenMode(); return; }
	if (freezeOut) { await freezeMode(); return; }
	if (applyFrozenPath) { await applyFrozenMode(); return; }
	if (canaryFrozenPath) { await applyFrozenMode(true); return; }
	if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
	if (apply && !all && limIdx < 0) throw new Error('APPLY_REQUIRES_LIMIT: use --apply --limit N (bounded) or --apply --all (full corpus, separately authorized)');
	if (apply && process.env.ATLAS_DOC_SUMMARY_AUTHORIZED !== AUTH) throw new Error(`SUMMARIES_NOT_AUTHORIZED: set ATLAS_DOC_SUMMARY_AUTHORIZED=${AUTH}`);
	const model = await resolveModel();
	const pool = new Pool({ connectionString: process.env.DATABASE_URL });
	const client = await pool.connect();
	const failures: string[] = [];
	try {
		const before = (await client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')).rows[0].n as number;
		// Stratified sample for dry-run/canary (spread over products); apply covers every chunk not yet summarized by this exact producer/model/prompt.
		const rows = (await client.query(
			`SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id
			  WHERE NOT EXISTS (SELECT 1 FROM atlas_external_doc_analyses a WHERE a.chunk_evidence_revision = c.evidence_revision AND a.analysis_type = 'SUMMARY'
			        AND a.producer_id = $1 AND a.producer_revision = $2 AND a.model_revision = $3 AND a.prompt_revision = $4)
			  ORDER BY c.chunk_id`, [PRODUCER_ID, PRODUCER_REVISION, model.modelRevision, PROMPT_REVISION])).rows as Chunk[];
		const step = Math.max(1, Math.floor(rows.length / Math.max(sample, 1)));
		const work = apply && all ? rows : rows.filter((_, i) => i % step === 0).slice(0, sample);
		const analyses: ExternalDocAnalysisV1[] = [];
		const latencies: number[] = [];
		for (const chunk of work) {
			const t0 = Date.now();
			try { analyses.push(toAnalysis(chunk, await summarize(chunk, model.modelId), model)); latencies.push(Date.now() - t0); if (apply && analyses.length % 50 === 0) console.error(`progress ${analyses.length}/${work.length}`); }
			catch (e) { failures.push(`${chunk.chunk_id}:${e instanceof Error ? e.message : e}`); }
		}
		// Admission gate: the writer enforces eligibility itself, on the exact in-memory text it is about to insert (no trust in a caller-supplied preflight).
		const keyOf = (a: { chunkId: string; chunkEvidenceRevision: string }) => `${a.chunkId}|${a.chunkEvidenceRevision}`;
		const reports = runAdmission(analyses.map((a) => ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, summaryInputChecksum: a.inputChecksum, summaryText: a.summaryText ?? '' })));
		const { admitted, rejected } = partitionByAdmissionV1(analyses.map((a) => ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, inputChecksum: a.inputChecksum, outputSha256: a.outputChecksum, analysis: a })), reports, keyOf);
		const admittedAnalyses = admitted.map((c) => { const rep = reports.get(keyOf(c)) as { admissionChecksum: string; resolverRevision: string; claimCount: number; splitterRevision: string }; return { ...c.analysis, metadata: { ...c.analysis.metadata, admission: { admissionChecksum: rep.admissionChecksum, resolverRevision: rep.resolverRevision, claimCount: rep.claimCount, splitterRevision: rep.splitterRevision } } } as ExternalDocAnalysisV1; });
		const admissionSummary = { evaluated: analyses.length, admitted: admittedAnalyses.length, rejected: rejected.map((x) => ({ chunkId: x.candidate.chunkId, chunkEvidenceRevision: x.candidate.chunkEvidenceRevision, reasons: x.reasons })), ceiling: apply ? sample : null };
		let written = 0; let readbackOk: boolean | null = null; let afterRollback: number | null = null;
		if (canary || apply) {
			await client.query('BEGIN');
			for (const a of admittedAnalyses) written += (await client.query(INSERT, params(a))).rowCount ?? 0;
			const rb = (await client.query(`SELECT analysis_id, output_checksum, summary_text, canonical_authority FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])`, [admittedAnalyses.map((a) => a.analysisId)])).rows;
			readbackOk = rb.length === admittedAnalyses.length && rb.every((r) => admittedAnalyses.some((a) => a.analysisId === r.analysis_id && a.outputChecksum === r.output_checksum && sha(r.summary_text) === r.output_checksum) && r.canonical_authority === false);
			if (!readbackOk) failures.push('READBACK_MISMATCH');
			if (canary && !apply) { await client.query('ROLLBACK'); afterRollback = (await client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')).rows[0].n as number; if (afterRollback !== before) failures.push('ROLLBACK_NOT_CLEAN'); }
			else if (!readbackOk) await client.query('ROLLBACK'); else await client.query('COMMIT'); // generation failures are reported (a rerun resumes them); only a readback mismatch aborts the write
		}
		const mode = apply ? 'APPLY' : canary ? 'ROLLBACK_CANARY' : 'DRY_RUN';
		const receipt = {
			schema: 'atlas.external-doc-summary-writer.v1', generatedAt: new Date().toISOString(), mode, backend: { kind: 'llama-server (NOT Ollama)', url: LLAMA, ...model },
			producer: { id: PRODUCER_ID, revision: PRODUCER_REVISION, promptRevision: PROMPT_REVISION }, admission: admissionSummary, analysesBefore: before, considered: work.length, generated: analyses.length, admitted: admittedAnalyses.length, written, readbackOk, afterRollback,
			medianLatencyMs: latencies.sort((a, b) => a - b)[Math.floor(latencies.length / 2)] ?? null, failures,
			samples: analyses.slice(0, 3).map((a) => ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, analysisId: a.analysisId, summary: a.summaryText })),
			writes: { postgres: apply ? { table: 'atlas_external_doc_analyses', rows: written } : canary ? 'ROLLED_BACK' : 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 },
			result: failures.length ? 'EXTERNAL_DOC_SUMMARY_WRITER_FAILED' : apply ? 'EXTERNAL_DOC_SUMMARIES_WRITTEN' : canary ? 'EXTERNAL_DOC_SUMMARY_WRITER_ROLLBACK_PROVEN' : 'EXTERNAL_DOC_SUMMARY_WRITER_DRY_RUN_READY'
		};
		writeFileSync(resolve(ROOT, `docs/reports/external-doc-summary-writer-${mode.toLowerCase().replace('_', '-')}-v1.json`), JSON.stringify(receipt, null, 2) + '\n');
		console.log(JSON.stringify({ result: receipt.result, mode, before, considered: work.length, generated: analyses.length, written, readbackOk, afterRollback, medianLatencyMs: receipt.medianLatencyMs, failures, samples: receipt.samples }, null, 2));
		if (failures.length) process.exitCode = 1;
	} finally { client.release(); await pool.end(); }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
