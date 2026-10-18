/**
 * Read-only query-lifecycle fixture: one real Svelte a11y warning -> classification -> evidence -> manifest -> Ornith -> citation check -> receipt.
 *
 *   cd sveltekit-frontend && npx tsx ../scripts/atlas/query-lifecycle-fixture-v1.mts
 *
 * Reuses classifyAtlasQuery, SynthesisOutputV1Schema and validateSynthesisCitations. Writes ONE local JSON receipt
 * (logs/task-output/query-lifecycle-fixture-v1.json). No database, Valkey, Qdrant or source-file writes.
 * Stages that are not run (graph, SearchRuntime, DSPy, ContextManifestV2) are reported as NOT_RUN, never faked.
 * Source revision here is a fixture-local sha256 of the file bytes; it is NOT a database revision write.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { buildPromptPlanV1 } from '../../sveltekit-frontend/src/lib/server/atlas/prefill/prompt-plan-v1.js';
import { prepareOrnithPromptPlanV1 } from '../../packages/atlas-core/src/langgraph/ornith-prompt-plan-adapter.js';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { classifyAtlasQuery } from '../../sveltekit-frontend/src/lib/server/atlas/agentic-file-compiler/query-classifier.js';
import { SynthesisOutputV1Schema, validateSynthesisCitations } from '../../sveltekit-frontend/src/lib/server/atlas/research/synthesis-receipt-v1.js';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const FE = path.join(ROOT, 'sveltekit-frontend');
const require = createRequire(path.join(FE, 'package.json'));
const { compile } = require('svelte/compiler');
const ORNITH_URL = (process.env.ORNITH_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const SOURCE_REF = 'sveltekit-frontend/src/lib/components/forms/EnhancedFileUpload.svelte';
const QUERY = 'Fix the svelte a11y_label_has_associated_control warnings in EnhancedFileUpload.svelte';
const sha = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const stages: Record<string, unknown> = {};
const receiptPath = path.join(ROOT, 'logs', 'task-output', 'query-lifecycle-fixture-v1.json');

// 1. QueryClassificationV1 (existing owner)
const requestId = `query-fixture:${sha(QUERY).slice(0, 16)}`;
const classification = classifyAtlasQuery({ requestId, query: QUERY });
stages.QUERY_01 = { status: 'RAN', classification };

// 2. Evidence: real compiler warnings, exact UTF-8 byte spans against the exact file bytes
const bytes = fs.readFileSync(path.join(ROOT, SOURCE_REF));
const text = bytes.toString('utf8');
const sourceRevision = `sha256:${sha(bytes)}`;
const compiled = compile(text, { filename: SOURCE_REF, generate: false });
const warnings = compiled.warnings.filter((w: any) => w.code === 'a11y_label_has_associated_control');
const byteOffset = (charIdx: number) => Buffer.byteLength(text.slice(0, charIdx), 'utf8');
const lines = text.split('\n');
const evidence = warnings.map((w: any) => {
	const byteStart = byteOffset(w.start.character);
	const byteEnd = byteOffset(w.end.character);
	const from = Math.max(0, w.start.line - 3);
	const to = Math.min(lines.length, w.end.line + 2);
	const snippet = lines.slice(from, to).map((l, i) => `${from + i + 1}: ${l}`).join('\n');
	const id = `sha256:${sha(`${SOURCE_REF}|${byteStart}|${byteEnd}|${sourceRevision}`)}`;
	return { kind: 'code', externalEvidenceId: id, sourceRef: SOURCE_REF, sourceRevision, code: w.code, line: w.start.line, byteStart, byteEnd, snippet };
});
const spanCheck = evidence.filter((e: any) => e.kind === 'code').every((e: any) => bytes.subarray(e.byteStart, e.byteEnd).toString('utf8') === text.slice(
	Buffer.from(bytes.subarray(0, e.byteStart)).toString('utf8').length, Buffer.from(bytes.subarray(0, e.byteEnd)).toString('utf8').length));
// External rule evidence: untrusted documentation text fetched locally (no database write); cited by URL + raw-page SHA-256.
const ruleDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'logs', 'task-output', 'svelte-a11y-rule-evidence-v1.json'), 'utf8'));
evidence.push({ kind: 'external_rule', externalEvidenceId: `sha256:${sha(`${ruleDoc.url}|${ruleDoc.rawSha256}|${ruleDoc.rule}`)}`, sourceRef: ruleDoc.url, sourceRevision: `sha256:${ruleDoc.rawSha256}`,
	code: ruleDoc.rule, line: null, byteStart: null, byteEnd: null, snippet: ruleDoc.text, fetcher: ruleDoc.fetcher, retrievedAt: ruleDoc.retrievedAt });
stages.EVIDENCE_01 = { status: evidence.length ? 'RAN' : 'NO_EVIDENCE', count: evidence.length, spanRoundTrip: spanCheck, retrieval: 'direct svelte compiler (not SearchRuntime)' };
stages.GRAPH_01 = { status: 'NOT_RUN', reason: 'no GraphQueryRequestV1 contract; classification requested graph=' + classification.retrievalNeeds.graph };
stages.SEARCH_RUNTIME = { status: 'NOT_RUN', reason: 'fixture uses the compiler as the exact lexical/AST source' };

// 3. Fixture manifest (NOT ContextManifestV2)
const manifestBody = { schema: 'atlas.query-fixture-context.v0', requestId, sourceRef: SOURCE_REF, sourceRevision, evidenceIds: evidence.map((e: any) => e.externalEvidenceId), tokenBudgetHint: 4096 };
const manifest = { ...manifestBody, checksum: `sha256:${sha(JSON.stringify(manifestBody))}`, canonicalAuthority: false };
stages.ACE_01 = { status: 'BLOCKED', reason: 'The producer chain is proven for a real 200-packet cohort (docs/reports/ace-producer-trace-01-v1.json, ACE_PRODUCER_CHAIN_REAL_TRACE_PROVEN). This file IS in that cohort (ordinal 11225, packet:14e9e2f85768) but its mapped sourceRevision (sha256:5dc94e09...) does not match the current file bytes (changed 2026-10-15, commit ee756a3bcd), so the packet is stale and admission must fail closed. Graph admission is also NOT_SAFE_TO_PROJECT. Fixture manifest v0 (not authoritative) is bound into the PromptPlan instead.', fixtureManifestChecksum: manifest.checksum };
stages.PREFILL_01 = { status: 'NOT_RUN', reason: 'no DSPy/PromptPlanV1; plain bounded prompt' };

// 4. Real Ornith requests (up to 3 attempts; every raw output is kept, including rejected ones)
const FixtureOutputSchema = SynthesisOutputV1Schema.extend({
	citations: SynthesisOutputV1Schema.shape.citations.min(1),
	patches: z.array(z.object({ externalEvidenceId: z.string().startsWith('sha256:'), find: z.string().min(1), replace: z.string() }).strict()).min(1),
}).strict();
const prompt = `You are given Svelte compiler warnings with exact source windows (each line prefixed "N: ") plus one external documentation excerpt. For each warning give a minimal fix. Return JSON only: {"answer": string, "citations": [{"externalEvidenceId": string, "quote": string}], "confidence": number, "patches": [{"externalEvidenceId": string, "find": string, "replace": string}]}.\nRules: cite EVERY evidence item at least once, including the documentation excerpt; externalEvidenceId must be exactly one of the evidence_id values (E1, E2, ...), never a URL; each quote must be copied verbatim from that window's source text (without the "N: " prefix); each patch "find" must be an exact substring of the file that occurs exactly once and lies inside that window; Use the documentation evidence for what counts as a valid fix; patches must target only code evidence; do not invent IDs.\n\n` +
	evidence.map((e: any, i: number) => `evidence_id: E${i + 1}\nkind: ${e.kind === 'code' ? `compiler warning ${e.code} at line ${e.line}` : `documentation excerpt from ${e.sourceRef}`}\ntext:\n${e.snippet}`).join('\n\n');
// PromptPlanV1 segments: INSTRUCTION, one EVIDENCE segment per item, USER_QUERY (+ checker feedback on repair attempts).
const instructionText = prompt.slice(0, prompt.indexOf('evidence_id: E1')).trimEnd();
const evidenceBlocks = evidence.map((e: any, i: number) => `evidence_id: E${i + 1}\nkind: ${e.kind === 'code' ? `compiler warning ${e.code} at line ${e.line}` : `documentation excerpt from ${e.sourceRef}`}\ntext:\n${e.snippet}`);
const countTokens = async (content: string): Promise<number> => {
	const r = await fetch(`${ORNITH_URL}/tokenize`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }), signal: AbortSignal.timeout(10_000) });
	if (!r.ok) throw new Error(`TOKENIZE_HTTP_${r.status}`);
	return ((await r.json()) as any).tokens.length;
};
const allowed = new Set<string>(evidence.map((e: any) => e.externalEvidenceId as string));
const byId = new Map<string, any>(evidence.map((e: any) => [e.externalEvidenceId as string, e]));
const stripPrefix = (snippet: string) => snippet.split('\n').map((l) => l.replace(/^\d+: /, '')).join('\n');
const warningCodes = (src: string) => compile(src, { filename: SOURCE_REF, generate: false }).warnings.map((w: any) => w.code);
const baseline = warningCodes(text);

function checkAttempt(output: any) {
	const unsupported = validateSynthesisCitations(output, allowed);
	const badQuotes = output.citations.filter((c: any) => byId.has(c.externalEvidenceId) && !stripPrefix(byId.get(c.externalEvidenceId).snippet).includes(c.quote)).map((c: any) => c.externalEvidenceId);
	const uncited = [...allowed].filter((id) => !output.citations.some((c: any) => c.externalEvidenceId === id));
	// Strict checker: apply patches to an in-memory copy, recompile, require no target warnings and no new warning codes.
	let patched = text; const patchErrors: string[] = [];
	for (const pt of output.patches) {
		const ev = byId.get(pt.externalEvidenceId);
		if (!ev || ev.kind !== 'code') { patchErrors.push('PATCH_TARGET_NOT_CODE_EVIDENCE'); continue; }
		const occurrences = patched.split(pt.find).length - 1;
		if (occurrences !== 1) { patchErrors.push(`PATCH_FIND_OCCURS_${occurrences}x`); continue; }
		const at = patched.indexOf(pt.find);
		const startLine = patched.slice(0, at).split('\n').length;
		if (startLine < ev.line - 3 || startLine > ev.line + 3) { patchErrors.push('PATCH_OUTSIDE_WINDOW'); continue; }
		patched = patched.replace(pt.find, () => pt.replace);
	}
	let after: string[] = []; let compileError: string | null = null;
	try { after = warningCodes(patched); } catch (e: any) { compileError = String(e.message).slice(0, 160); }
	const target = (arr: string[]) => arr.filter((c) => c === 'a11y_label_has_associated_control').length;
	const newCodes = [...new Set(after)].filter((c) => !baseline.includes(c));
	// The compiler only checks that `for` exists, not that it points at anything: reject patches that leave a dangling label target.
	const forTargets = [...patched.matchAll(/<label\b[^>]*\bfor=["']([^"']+)["']/g)].map((m) => m[1]!);
	// A label's `for` must reference a labelable form control (input/select/textarea/button/meter/output/progress), not any element with that id.
	const LABELABLE = new Set(['input', 'select', 'textarea', 'button', 'meter', 'output', 'progress']);
	const danglingLabelTargets = forTargets.filter((id) => {
		const esc = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const owner = new RegExp(`<([A-Za-z][\\w:-]*)\\b[^>]*\\bid=["']${esc}["']`).exec(patched);
		return !owner || !LABELABLE.has(owner[1]!);
	});
	return { unsupportedCitationIds: unsupported, citationsWithQuoteNotInSource: badQuotes, uncitedEvidenceIds: uncited, patchErrors, compileError,
		targetWarningsBefore: target(baseline), targetWarningsAfter: target(after), newWarningCodes: newCodes,
		danglingLabelTargets,
		strictCheckerPass: !compileError && patchErrors.length === 0 && target(after) === 0 && newCodes.length === 0 && danglingLabelTargets.length === 0,
		groundedPass: unsupported.length === 0 && badQuotes.length === 0 && uncited.length === 0 };
}

const attempts: any[] = [];
// Repair loop: after a failed attempt, the next prompt gets the strict checker's own deterministic findings (never model-written text).
let feedback = '';
function feedbackFrom(rec: any): string {
	const f: string[] = [];
	if (rec.error) f.push(`Your last output was rejected by schema validation: ${String(rec.error).replace(/\s+/g, ' ').slice(0, 200)}`);
	if (rec.danglingLabelTargets?.length) f.push(`These label "for" targets have no element with a matching id in the patched file: ${rec.danglingLabelTargets.join(', ')}. A "find" string that only covers the <label> cannot add the id; either include the input (or an element carrying that id) in "find"/"replace" so the id exists, or wrap the control inside the label instead.`);
	if (rec.newWarningCodes?.length) f.push(`Your patch introduced new compiler warnings: ${rec.newWarningCodes.join(', ')}. Keep the markup valid.`);
	if (rec.patchErrors?.length) f.push(`Patch errors: ${[...new Set(rec.patchErrors)].join(', ')}.`);
	if (rec.uncitedEvidenceIds?.length) f.push('You did not cite every evidence item.');
	if (rec.citationsWithQuoteNotInSource?.length) f.push('Some quotes were not verbatim from the cited evidence.');
	if (rec.targetWarningsAfter > 0) f.push(`${rec.targetWarningsAfter} a11y_label_has_associated_control warning(s) remain after your patches.`);
	return f.length ? `\n\nA previous attempt failed the checker for these reasons. Fix them:\n- ${f.join('\n- ')}` : '';
}
let winner: any = null;
if (evidence.length) {
	const models = await (await fetch(`${ORNITH_URL}/v1/models`, { signal: AbortSignal.timeout(5000) })).json() as any;
	const model = models.models?.[0]?.model ?? models.data?.[0]?.id;
	for (let attempt = 1; attempt <= 3 && !winner; attempt++) {
		const rec: any = { attempt, seed: 16 + attempt, model, promptChecksum: `sha256:${sha(prompt + feedback)}`, feedbackGiven: feedback || null };
		try {
			const segTexts = [instructionText, ...evidenceBlocks, `Task: ${QUERY}${feedback}`];
			const tokenCounts = await Promise.all(segTexts.map(countTokens));
			const plan = buildPromptPlanV1({
				requestId, contextManifestChecksum: manifest.checksum.replace('sha256:', ''), tokenizerRevision: `llama-server:/tokenize@${model}`,
				promptTemplateRevision: 'query-fixture-template-v1', instructionRevision: `sha256:${sha(instructionText)}`,
				segments: segTexts.map((content, ordinal) => ({
					ordinal, kind: ordinal === 0 ? 'INSTRUCTION' : ordinal === segTexts.length - 1 ? 'USER_QUERY' : 'EVIDENCE', packetKey: null,
					evidenceRefs: ordinal > 0 && ordinal < segTexts.length - 1 ? [evidence[ordinal - 1].externalEvidenceId] : [],
					contentChecksum: sha(content), tokenCount: tokenCounts[ordinal]!,
				})),
			});
			const prepared = prepareOrnithPromptPlanV1({ promptPlan: plan as any, segmentContent: segTexts.map((content, ordinal) => ({ ordinal, content })) });
			rec.promptPlanChecksum = plan.checksumSha256; rec.promptPlanTotalTokens = plan.totalTokens; rec.promptPlanSegments = plan.segments.length;
			rec.promptChecksum = `sha256:${plan.checksumSha256}`;
			const res = await fetch(`${ORNITH_URL}/v1/chat/completions`, {
				method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(180_000),
				body: JSON.stringify({ model, messages: prepared.messages, tools: [], tool_choice: 'none', temperature: attempt === 1 ? 0 : 0.3, seed: rec.seed, max_tokens: 1500, stream: false,
					response_format: { type: 'json_schema', json_schema: { name: 'atlas_query_fixture_v2', strict: true, schema: { type: 'object', additionalProperties: false, required: ['answer', 'citations', 'confidence', 'patches'], properties: {
						answer: { type: 'string' }, confidence: { type: 'number' },
						citations: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['externalEvidenceId', 'quote'], properties: { externalEvidenceId: { type: 'string' }, quote: { type: 'string' } } } },
						patches: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['externalEvidenceId', 'find', 'replace'], properties: { externalEvidenceId: { type: 'string' }, find: { type: 'string' }, replace: { type: 'string' } } } } } } } } }),
			});
			const raw = await res.json() as any;
			rec.httpStatus = res.status; rec.finishReason = raw.choices?.[0]?.finish_reason; rec.usage = raw.usage ?? null;
			rec.rawContent = raw.choices?.[0]?.message?.content ?? '';
			const aliasToId = new Map<string, string>(evidence.map((e: any, i: number) => [`E${i + 1}`, e.externalEvidenceId as string]));
			const parsed = JSON.parse(rec.rawContent);
			const resolve = (x: any) => ({ ...x, externalEvidenceId: aliasToId.get(String(x.externalEvidenceId)) ?? x.externalEvidenceId });
			rec.output = FixtureOutputSchema.parse({ ...parsed, citations: (parsed.citations ?? []).map(resolve), patches: (parsed.patches ?? []).map(resolve) });
			Object.assign(rec, checkAttempt(rec.output));
			if (rec.groundedPass && rec.strictCheckerPass) winner = rec;
		} catch (e: any) { rec.error = String(e.message).slice(0, 300); }
		attempts.push(rec);
		if (!winner) feedback = feedbackFrom(rec);
	}
}
const planned = attempts.filter((a: any) => a.promptPlanChecksum);
stages.PREFILL_01 = { status: planned.length ? 'RAN' : 'NOT_RUN', method: 'buildPromptPlanV1 + prepareOrnithPromptPlanV1 (segment checksums, real /tokenize counts); no DSPy',
	plans: planned.map((a: any) => ({ attempt: a.attempt, promptPlanChecksum: a.promptPlanChecksum, totalTokens: a.promptPlanTotalTokens, segments: a.promptPlanSegments, ornithReportedPromptTokens: a.usage?.prompt_tokens ?? null })) };
const best = winner ?? attempts[attempts.length - 1] ?? null;
stages.DECODE_01 = { status: winner ? 'RAN_PASS' : attempts.length ? 'RAN_NO_PASSING_ATTEMPT' : 'NOT_RUN', attemptsRun: attempts.length, passingAttempt: winner?.attempt ?? null, attempts };
stages.CHECK_01 = { status: attempts.length ? 'RAN' : 'NOT_RUN', method: 'in-memory patch + svelte/compiler recompile', baselineWarningCodes: baseline,
	groundedPass: !!winner, strictCheckerPass: !!winner, bestAttempt: best ? { attempt: best.attempt, groundedPass: best.groundedPass ?? false, strictCheckerPass: best.strictCheckerPass ?? false } : null };

// 5. Receipt (local only)
const receiptBody = { schema: 'atlas.query-lifecycle-fixture-receipt.v1', generatedAt: new Date().toISOString(), requestId, query: QUERY, sourceRef: SOURCE_REF, sourceRevision, stages,
	advisoryOnly: true, writesPerformed: false, mutationAuthority: false, canonicalAuthority: false, sourceFileModified: false };
const receipt = { ...receiptBody, receiptChecksum: `sha256:${sha(JSON.stringify(receiptBody))}` };
fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
// 6. Save citations (local NDJSON, append-only; one line per citation from every attempt, with accepted flag and receipt checksum)
const citationsPath = path.join(ROOT, 'logs', 'task-output', 'query-lifecycle-citations-v1.ndjson');
const saved: string[] = [];
for (const a of attempts) for (const c of a.output?.citations ?? []) {
	const ev = byId.get(c.externalEvidenceId);
	saved.push(JSON.stringify({ schema: 'atlas.query-citation.v1', requestId, receiptChecksum: receipt.receiptChecksum, attempt: a.attempt, accepted: a === winner,
		externalEvidenceId: c.externalEvidenceId, quote: c.quote, resolved: !!ev, sourceRef: ev?.sourceRef ?? null, sourceRevision: ev?.sourceRevision ?? null,
		byteStart: ev?.byteStart ?? null, byteEnd: ev?.byteEnd ?? null, quoteInSource: ev ? stripPrefix(ev.snippet).includes(c.quote) : false, model: a.model, savedAt: new Date().toISOString() }));
}
if (saved.length) fs.appendFileSync(citationsPath, saved.join('\n') + '\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(stages).map(([k, v]: any) => [k, v.status])), null, 1));
console.log(JSON.stringify({ evidence: evidence.length, spanRoundTrip: spanCheck, passingAttempt: (stages.DECODE_01 as any).passingAttempt, attempts: attempts.length, citationsSaved: saved.length, receipt: path.relative(ROOT, receiptPath), citations: path.relative(ROOT, citationsPath) }));
