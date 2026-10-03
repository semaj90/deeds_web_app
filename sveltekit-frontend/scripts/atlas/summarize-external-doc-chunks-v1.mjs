#!/usr/bin/env node
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _a;
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
 *   --apply-frozen <cohort.json> --eligibility <evaluation.json> --limit N
 *                       BOUNDED persistent write of the admitted frozen candidates' EXACT text (needs env ATLAS_DOC_SUMMARY_AUTHORIZED=I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES). --limit is a ceiling. Never calls the model.
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
import { persistEligibleSummaryCandidatesV1, admitFrozenSummaryCandidateV1, SUMMARY_PERSISTENCE_POLICY_V1 } from '../../src/lib/server/atlas/docs/summary-candidate-persistence-v1.js';
import { CHUNK_IDENTITY_VERSION_V1, buildSummaryCandidateV1, computeCandidateCohortChecksumV1, computeChunkCohortChecksumV1 } from '../../src/lib/server/atlas/docs/summary-candidate-v1.js';
import { ExternalDocAnalysisV1Schema, externalDocAnalysisId } from '../../src/lib/server/atlas/docs/external-doc-intelligence-contracts-v1.js';
var ROOT = resolve(import.meta.dirname, '..', '..', '..');
var LLAMA = (_a = process.env.LLAMA_SERVER_URL) !== null && _a !== void 0 ? _a : 'http://127.0.0.1:8090';
var AUTH = 'I_AUTHORIZE_EXTERNAL_DOC_SUMMARIES';
var args = process.argv.slice(2);
var apply = args.includes('--apply');
var canary = args.includes('--rollback-canary');
var limIdx = args.indexOf('--limit');
var sample = limIdx >= 0 ? Number(args[limIdx + 1]) : 3;
var all = args.includes('--all');
var argAfter = function (flag) { var i = args.indexOf(flag); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null; };
var freezeOut = argAfter('--freeze-candidates');
var admitFrozenPath = argAfter('--admit-frozen');
var applyFrozenPath = argAfter('--apply-frozen');
var cohortSource = argAfter('--cohort');
var eligibilityPath = argAfter('--eligibility');
var PRODUCER_ID = 'atlas-external-doc-summarizer';
var PRODUCER_REVISION = 'external-doc-summary-writer-v1';
var SYSTEM_PROMPT = 'You summarize one chunk of technical documentation. Write 1-3 plain sentences that state only what the chunk says. Keep exact identifiers, setting names, function names and version numbers verbatim. Do not add facts, advice, or markdown headings.';
var PROMPT_NAME = 'external-doc-summary-prompt-v1';
var USER_TEMPLATE = 'Product: {product} {productVersion}\nPage: {title}\nSection: {headingPath}\nChunk evidence: {chunkEvidenceRevision}\nText:\n{text}';
var PROMPT_REVISION = "".concat(PROMPT_NAME, "@sha256:").concat(createHash('sha256').update(SYSTEM_PROMPT + '|' + USER_TEMPLATE + '|temp0.2|max300|seed1729').digest('hex'));
var MAX_SUMMARY_CHARS = 1500;
var PLACEHOLDER = /^(n\/a|none|summary:?|i (cannot|can't|am unable)|as an ai)/i;
var sha = function (t) { return createHash('sha256').update(t, 'utf8').digest('hex'); };
var userContent = function (c) { var _a; return USER_TEMPLATE.replace('{product}', c.product).replace('{productVersion}', c.product_version).replace('{title}', c.title).replace('{headingPath}', ((_a = c.heading_path) !== null && _a !== void 0 ? _a : []).join(' > ') || 'none').replace('{chunkEvidenceRevision}', c.evidence_revision).replace('{text}', function () { return c.text; }); };
function resolveModel() {
    return __awaiter(this, void 0, void 0, function () {
        var props, models, listed, file;
        var _a, _b, _c, _d, _e, _f;
        return __generator(this, function (_g) {
            switch (_g.label) {
                case 0: return [4 /*yield*/, fetch("".concat(LLAMA, "/props"))];
                case 1: return [4 /*yield*/, (_g.sent()).json()];
                case 2:
                    props = _g.sent();
                    return [4 /*yield*/, fetch("".concat(LLAMA, "/v1/models"))];
                case 3: return [4 /*yield*/, (_g.sent()).json()];
                case 4:
                    models = _g.sent();
                    listed = (_b = (_a = models.data) === null || _a === void 0 ? void 0 : _a.map(function (m) { return m.id; })) !== null && _b !== void 0 ? _b : [];
                    // Fail closed: the resolved model must be the approved Ornith 1.5 family from the live server (not a file name or label), and /props and /v1/models must agree.
                    if (!props.model_alias || !/^ornith-1[._-]?5/i.test(props.model_alias) || !listed.includes(props.model_alias))
                        throw new Error("SUMMARY_MODEL_NOT_APPROVED:".concat((_c = props.model_alias) !== null && _c !== void 0 ? _c : 'unresolved', ":").concat(listed.join(',')));
                    file = (_e = ((_d = props.model_path) !== null && _d !== void 0 ? _d : '').split(/[\\/]/).pop()) !== null && _e !== void 0 ? _e : 'unknown.gguf';
                    // The model FILE digest is not computed here (multi-GB); the revision pins alias + gguf file name + llama.cpp build as reported by the live server.
                    return [2 /*return*/, { modelId: props.model_alias, modelRevision: "".concat(props.model_alias, "@").concat(file, "@").concat((_f = props.build_info) !== null && _f !== void 0 ? _f : 'unknown-build') }];
            }
        });
    });
}
function summarize(chunk, modelId) {
    return __awaiter(this, void 0, void 0, function () {
        var res, body, raw, text, finish;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0: return [4 /*yield*/, fetch("".concat(LLAMA, "/v1/chat/completions"), {
                        method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(90000),
                        body: JSON.stringify({ model: modelId, temperature: 0.2, max_tokens: 300, stream: false, seed: 1729,
                            messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent(chunk) }] })
                    })];
                case 1:
                    res = _k.sent();
                    if (!res.ok)
                        throw new Error("LLAMA_HTTP_".concat(res.status));
                    return [4 /*yield*/, res.json()];
                case 2:
                    body = _k.sent();
                    raw = (_d = (_c = (_b = (_a = body.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) !== null && _d !== void 0 ? _d : '';
                    text = raw.replace(/<end_of_turn>|<start_of_turn>|<\|channel>|<\/?thinking>|<\|endthinking>/g, '').trim();
                    finish = (_g = (_f = (_e = body.choices) === null || _e === void 0 ? void 0 : _e[0]) === null || _f === void 0 ? void 0 : _f.finish_reason) !== null && _g !== void 0 ? _g : 'unknown';
                    if (!text || text.length < 20)
                        throw new Error('SUMMARY_EMPTY_OR_TOO_SHORT');
                    if (text.length > MAX_SUMMARY_CHARS)
                        throw new Error('SUMMARY_TOO_LONG');
                    if (PLACEHOLDER.test(text) || text.includes('�'))
                        throw new Error('SUMMARY_PLACEHOLDER_OR_INVALID_UTF8');
                    if (finish !== 'stop')
                        throw new Error("SUMMARY_NOT_COMPLETE:".concat(finish));
                    return [2 /*return*/, { text: text, finish: finish, tokens: (_j = (_h = body.usage) === null || _h === void 0 ? void 0 : _h.completion_tokens) !== null && _j !== void 0 ? _j : 0 }];
            }
        });
    });
}
function toAnalysis(chunk, out, model) {
    var inputChecksum = sha("".concat(PROMPT_REVISION, "\n").concat(userContent(chunk)));
    var base = { chunkEvidenceRevision: chunk.evidence_revision, analysisType: 'SUMMARY', producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION, modelId: model.modelId, modelRevision: model.modelRevision, promptRevision: PROMPT_REVISION, inputChecksum: inputChecksum };
    return ExternalDocAnalysisV1Schema.parse(__assign(__assign({ schema: 'atlas.external-doc-analysis.v1', analysisId: externalDocAnalysisId(base), chunkId: chunk.chunk_id }, base), { outputChecksum: sha(out.text), summaryText: out.text, metadata: { backend: 'llama-server', baseUrl: LLAMA, temperature: 0.2, seed: 1729, maxTokens: 300, finishReason: out.finish, completionTokens: out.tokens, product: chunk.product, productVersion: chunk.product_version }, canonicalAuthority: false, createdAt: new Date().toISOString() }));
}
var INSERT = "INSERT INTO atlas_external_doc_analyses (analysis_id, chunk_id, chunk_evidence_revision, analysis_type, producer_id, producer_revision, model_id, model_revision, prompt_revision,\n\tinput_checksum, output_checksum, summary_text, entities, relations, metadata, canonical_authority) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'[]','[]',$13,false) ON CONFLICT (analysis_id) DO NOTHING";
var params = function (a) { return [a.analysisId, a.chunkId, a.chunkEvidenceRevision, a.analysisType, a.producerId, a.producerRevision, a.modelId, a.modelRevision, a.promptRevision, a.inputChecksum, a.outputChecksum, a.summaryText, JSON.stringify(a.metadata)]; };
function runAdmission(items) {
    var _a, _b, _c;
    if (items.length === 0)
        return new Map();
    var r = spawnSync('python', [resolve(ROOT, 'python/atlas_summary_admission_v1.py')], { cwd: resolve(ROOT, 'python'), input: JSON.stringify({ items: items }), encoding: 'utf8', timeout: 1800000, maxBuffer: 256 * 1024 * 1024, env: __assign(__assign({}, process.env), { PYTHONIOENCODING: 'utf-8' }) });
    if (r.error || r.status !== 0)
        throw new Error("ADMISSION_PROCESS_FAILED:".concat((_b = (_a = r.error) === null || _a === void 0 ? void 0 : _a.message) !== null && _b !== void 0 ? _b : "exit ".concat(r.status, ": ").concat(((_c = r.stderr) !== null && _c !== void 0 ? _c : '').slice(-300))));
    var reports = JSON.parse(r.stdout).reports;
    return new Map(reports.map(function (rep) { return ["".concat(rep.chunkId, "|").concat(rep.chunkEvidenceRevision), rep]; }));
}
var readJson = function (path) { return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')); };
var writeReceipt = function (path, value) { return writeFileSync(resolve(ROOT, path), JSON.stringify(value, null, 2) + '\n'); };
var NO_WRITES = { postgres: 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 };
var CHUNK_SQL = "SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id WHERE c.chunk_id = $1 AND c.evidence_revision = $2";
/** generateSummaryCandidateV1: the ONLY place in the persistence chain that calls the model. Read-only database access; writes only the JSON file it is given. */
function freezeMode() {
    return __awaiter(this, void 0, void 0, function () {
        var pairs, model, pool, client, failures, candidates, modelCalls, _i, pairs_1, pair, chunk, out, e_1, cohort;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!freezeOut || !cohortSource)
                        throw new Error('FREEZE_REQUIRES: --freeze-candidates <out.json> --cohort <faithfulness.json>');
                    if (!process.env.DATABASE_URL)
                        throw new Error('DATABASE_URL not set');
                    pairs = readJson(cohortSource).items.map(function (i) { return ({ chunkId: i.chunkId, chunkEvidenceRevision: i.chunkEvidenceRevision }); });
                    return [4 /*yield*/, resolveModel()];
                case 1:
                    model = _a.sent();
                    pool = new Pool({ connectionString: process.env.DATABASE_URL });
                    return [4 /*yield*/, pool.connect()];
                case 2:
                    client = _a.sent();
                    failures = [];
                    candidates = [];
                    modelCalls = 0;
                    _a.label = 3;
                case 3:
                    _a.trys.push([3, , 11, 13]);
                    _i = 0, pairs_1 = pairs;
                    _a.label = 4;
                case 4:
                    if (!(_i < pairs_1.length)) return [3 /*break*/, 10];
                    pair = pairs_1[_i];
                    return [4 /*yield*/, client.query(CHUNK_SQL, [pair.chunkId, pair.chunkEvidenceRevision])];
                case 5:
                    chunk = (_a.sent()).rows[0];
                    if (!chunk) {
                        failures.push("".concat(pair.chunkId, ":CHUNK_NOT_FOUND_AT_REVISION"));
                        return [3 /*break*/, 9];
                    }
                    _a.label = 6;
                case 6:
                    _a.trys.push([6, 8, , 9]);
                    modelCalls += 1;
                    return [4 /*yield*/, summarize(chunk, model.modelId)];
                case 7:
                    out = _a.sent();
                    candidates.push(buildSummaryCandidateV1({
                        chunkId: chunk.chunk_id, chunkEvidenceRevision: chunk.evidence_revision, identityVersion: CHUNK_IDENTITY_VERSION_V1, producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION,
                        modelId: model.modelId, modelRevision: model.modelRevision, promptRevision: PROMPT_REVISION, inputChecksum: sha("".concat(PROMPT_REVISION, "\n").concat(userContent(chunk))), summaryText: out.text,
                        generationMetadata: { backend: 'llama-server', baseUrl: LLAMA, temperature: 0.2, seed: 1729, maxTokens: 300, finishReason: out.finish, completionTokens: out.tokens, productName: chunk.product || 'unknown', versionLabel: chunk.product_version || 'unknown' }
                    }));
                    return [3 /*break*/, 9];
                case 8:
                    e_1 = _a.sent();
                    failures.push("".concat(pair.chunkId, ":").concat(e_1 instanceof Error ? e_1.message : e_1));
                    return [3 /*break*/, 9];
                case 9:
                    _i++;
                    return [3 /*break*/, 4];
                case 10: return [3 /*break*/, 13];
                case 11:
                    client.release();
                    return [4 /*yield*/, pool.end()];
                case 12:
                    _a.sent();
                    return [7 /*endfinally*/];
                case 13:
                    if (failures.length) {
                        console.error(JSON.stringify({ result: 'FREEZE_FAILED', failures: failures }));
                        process.exitCode = 1;
                        return [2 /*return*/];
                    }
                    cohort = {
                        schema: 'atlas.summary-candidate-cohort.v1', generatedAt: new Date().toISOString(), source: cohortSource, identityVersion: CHUNK_IDENTITY_VERSION_V1,
                        generator: { producerId: PRODUCER_ID, producerRevision: PRODUCER_REVISION, promptRevision: PROMPT_REVISION, modelId: model.modelId, modelRevision: model.modelRevision, backend: 'llama-server (NOT Ollama)' },
                        chunkCohortChecksum: computeChunkCohortChecksumV1(pairs), candidateCohortChecksum: computeCandidateCohortChecksumV1(candidates.map(function (c) { return c.candidateId; })),
                        pairs: pairs,
                        modelCalls: modelCalls,
                        writes: NO_WRITES,
                        candidates: candidates
                    };
                    writeReceipt(freezeOut, cohort);
                    console.log(JSON.stringify({ result: 'CANDIDATES_FROZEN', candidates: candidates.length, modelCalls: modelCalls, chunkCohortChecksum: cohort.chunkCohortChecksum, candidateCohortChecksum: cohort.candidateCohortChecksum }, null, 2));
                    return [2 /*return*/];
            }
        });
    });
}
function loadFrozen(cohortPath, evalPath) {
    var _a;
    var cohort = readJson(cohortPath);
    var evaluation = readJson(evalPath);
    var problems = [];
    if (computeCandidateCohortChecksumV1(cohort.candidates.map(function (c) { return c.candidateId; })) !== cohort.candidateCohortChecksum)
        problems.push('CANDIDATE_COHORT_CHECKSUM_MISMATCH');
    if (computeChunkCohortChecksumV1(cohort.pairs) !== cohort.chunkCohortChecksum)
        problems.push('CHUNK_COHORT_CHECKSUM_MISMATCH');
    if (((_a = evaluation.cohort) === null || _a === void 0 ? void 0 : _a.candidateCohortChecksum) !== cohort.candidateCohortChecksum)
        problems.push('EVALUATION_FOR_DIFFERENT_COHORT');
    var byId = new Map(evaluation.entries.map(function (e) { return [e.candidateId, e]; }));
    var items = cohort.candidates.map(function (candidate) { var e = byId.get(candidate.candidateId); return { candidate: candidate, claimSet: e === null || e === void 0 ? void 0 : e.claimSet, eligibility: e === null || e === void 0 ? void 0 : e.eligibility }; });
    return { cohort: cohort, evaluation: evaluation, items: items, problems: problems };
}
/** Pure admission of the frozen evidence: no database, no model. */
function admitFrozenMode() {
    if (!admitFrozenPath || !eligibilityPath)
        throw new Error('ADMIT_FROZEN_REQUIRES: --admit-frozen <cohort.json> --eligibility <evaluation.json>');
    var _a = loadFrozen(admitFrozenPath, eligibilityPath), cohort = _a.cohort, items = _a.items, problems = _a.problems;
    var decisions = items.map(function (item) { return admitFrozenSummaryCandidateV1(item, SUMMARY_PERSISTENCE_POLICY_V1); });
    var may = decisions.filter(function (d) { return d.decision === 'MAY_PERSIST'; }).length;
    var receipt = { schema: 'atlas.summary-candidate-writer-admission.v1', gate: 'VAL10B_SAME_CANDIDATE_WRITER_ADMISSION', generatedAt: new Date().toISOString(), candidateCohortChecksum: cohort.candidateCohortChecksum, chunkCohortChecksum: cohort.chunkCohortChecksum,
        cohortProblems: problems, candidates: decisions.length, mayPersist: may, notAuthorized: decisions.length - may,
        decisions: decisions.map(function (d) { return (d.decision === 'MAY_PERSIST' ? { candidateId: d.candidate.candidateId, chunkId: d.candidate.chunkId, decision: d.decision } : { candidateId: d.candidateId, decision: d.decision, reasons: d.reasons }); }),
        modelCalls: 0, databaseConnections: 0, writes: NO_WRITES, persistedSummaries: 0 };
    writeReceipt('docs/reports/parent-atlas/summary-candidate-writer-admission-v1.json', receipt);
    console.log(JSON.stringify({ candidates: receipt.candidates, mayPersist: may, notAuthorized: receipt.notAuthorized, cohortProblems: problems, modelCalls: 0, databaseConnections: 0 }, null, 2));
    if (problems.length)
        process.exitCode = 1;
}
/** persistEligibleSummaryCandidatesV1 wiring. NEVER calls the model. Needs authorization; NOT run in the freeze/admission tranche. */
function applyFrozenMode() {
    return __awaiter(this, void 0, void 0, function () {
        var _a, cohort, items, problems, pool, client, before, deps, result, ids, rb_1, byCand_1, readbackOk, after, ok, receipt;
        var _this = this;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!applyFrozenPath || !eligibilityPath || limIdx < 0)
                        throw new Error('APPLY_FROZEN_REQUIRES: --apply-frozen <cohort.json> --eligibility <evaluation.json> --limit N');
                    if (process.env.ATLAS_DOC_SUMMARY_AUTHORIZED !== AUTH)
                        throw new Error("SUMMARIES_NOT_AUTHORIZED: set ATLAS_DOC_SUMMARY_AUTHORIZED=".concat(AUTH));
                    if (!process.env.DATABASE_URL)
                        throw new Error('DATABASE_URL not set');
                    _a = loadFrozen(applyFrozenPath, eligibilityPath), cohort = _a.cohort, items = _a.items, problems = _a.problems;
                    if (problems.length)
                        throw new Error("FROZEN_COHORT_INCONSISTENT:".concat(problems.join(',')));
                    pool = new Pool({ connectionString: process.env.DATABASE_URL });
                    return [4 /*yield*/, pool.connect()];
                case 1:
                    client = _b.sent();
                    _b.label = 2;
                case 2:
                    _b.trys.push([2, , 9, 11]);
                    return [4 /*yield*/, client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')];
                case 3:
                    before = (_b.sent()).rows[0].n;
                    return [4 /*yield*/, client.query('BEGIN')];
                case 4:
                    _b.sent();
                    deps = {
                        chunkRevisionIsCurrent: function (chunkId, revision) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, client.query('SELECT 1 FROM atlas_external_doc_chunks WHERE chunk_id = $1 AND evidence_revision = $2', [chunkId, revision])];
                                case 1: return [2 /*return*/, ((_a = (_b.sent()).rowCount) !== null && _a !== void 0 ? _a : 0) > 0];
                            }
                        }); }); },
                        insertAnalysis: function (row) { return __awaiter(_this, void 0, void 0, function () { var _a; return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0: return [4 /*yield*/, client.query(INSERT, params(row))];
                                case 1: return [2 /*return*/, (_a = (_b.sent()).rowCount) !== null && _a !== void 0 ? _a : 0];
                            }
                        }); }); },
                        now: function () { return new Date().toISOString(); }
                    };
                    return [4 /*yield*/, persistEligibleSummaryCandidatesV1(items, SUMMARY_PERSISTENCE_POLICY_V1, deps, sample)];
                case 5:
                    result = _b.sent();
                    ids = result.persisted.map(function (p) { return p.analysisId; });
                    return [4 /*yield*/, client.query('SELECT analysis_id, chunk_id, chunk_evidence_revision, analysis_type, input_checksum, output_checksum, summary_text, canonical_authority FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])', [ids])];
                case 6:
                    rb_1 = (_b.sent()).rows;
                    byCand_1 = new Map(cohort.candidates.map(function (c) { return [c.candidateId, c]; }));
                    readbackOk = rb_1.length === ids.length && result.persisted.every(function (p) {
                        var r = rb_1.find(function (x) { return x.analysis_id === p.analysisId; });
                        var c = byCand_1.get(p.candidateId);
                        return !!r && !!c && r.chunk_id === c.chunkId && r.chunk_evidence_revision === c.chunkEvidenceRevision && r.analysis_type === 'SUMMARY' && r.input_checksum === c.inputChecksum && r.output_checksum === c.outputChecksum && sha(r.summary_text) === c.outputChecksum && r.canonical_authority === false;
                    });
                    return [4 /*yield*/, client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')];
                case 7:
                    after = (_b.sent()).rows[0].n;
                    ok = readbackOk && after - before === result.persisted.length;
                    return [4 /*yield*/, client.query(ok ? 'COMMIT' : 'ROLLBACK')];
                case 8:
                    _b.sent();
                    receipt = { schema: 'atlas.summary-candidate-persistence.v1', generatedAt: new Date().toISOString(), candidateCohortChecksum: cohort.candidateCohortChecksum, ceiling: sample, before: before, after: ok ? after : before, persisted: result.persisted, refused: result.refused, insertCalls: result.insertCalls, readbackOk: readbackOk, committed: ok, modelCalls: 0 };
                    writeReceipt('docs/reports/parent-atlas/summary-candidate-persistence-v1.json', receipt);
                    console.log(JSON.stringify({ committed: ok, persisted: result.persisted.length, refused: result.refused.length, readbackOk: readbackOk }, null, 2));
                    if (!ok)
                        process.exitCode = 1;
                    return [3 /*break*/, 11];
                case 9:
                    client.release();
                    return [4 /*yield*/, pool.end()];
                case 10:
                    _b.sent();
                    return [7 /*endfinally*/];
                case 11: return [2 /*return*/];
            }
        });
    });
}
function main() {
    return __awaiter(this, void 0, void 0, function () {
        var model, pool, client, failures, before, rows, step_1, work, analyses, latencies, _i, work_1, chunk, t0, _a, _b, _c, _d, e_2, keyOf_1, reports_1, _e, admitted, rejected, admittedAnalyses_2, admissionSummary, written, readbackOk, afterRollback, _f, admittedAnalyses_1, a, _g, rb, mode, receipt;
        var _h, _j;
        return __generator(this, function (_k) {
            switch (_k.label) {
                case 0:
                    if (apply || all)
                        throw new Error('APPLY_REQUIRES_FROZEN_CANDIDATES: a plain --apply/--all would regenerate summaries the validation never saw; use --freeze-candidates, then --apply-frozen');
                    if (admitFrozenPath) {
                        admitFrozenMode();
                        return [2 /*return*/];
                    }
                    if (!freezeOut) return [3 /*break*/, 2];
                    return [4 /*yield*/, freezeMode()];
                case 1:
                    _k.sent();
                    return [2 /*return*/];
                case 2:
                    if (!applyFrozenPath) return [3 /*break*/, 4];
                    return [4 /*yield*/, applyFrozenMode()];
                case 3:
                    _k.sent();
                    return [2 /*return*/];
                case 4:
                    if (!process.env.DATABASE_URL)
                        throw new Error('DATABASE_URL not set');
                    if (apply && !all && limIdx < 0)
                        throw new Error('APPLY_REQUIRES_LIMIT: use --apply --limit N (bounded) or --apply --all (full corpus, separately authorized)');
                    if (apply && process.env.ATLAS_DOC_SUMMARY_AUTHORIZED !== AUTH)
                        throw new Error("SUMMARIES_NOT_AUTHORIZED: set ATLAS_DOC_SUMMARY_AUTHORIZED=".concat(AUTH));
                    return [4 /*yield*/, resolveModel()];
                case 5:
                    model = _k.sent();
                    pool = new Pool({ connectionString: process.env.DATABASE_URL });
                    return [4 /*yield*/, pool.connect()];
                case 6:
                    client = _k.sent();
                    failures = [];
                    _k.label = 7;
                case 7:
                    _k.trys.push([7, , 29, 31]);
                    return [4 /*yield*/, client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')];
                case 8:
                    before = (_k.sent()).rows[0].n;
                    return [4 /*yield*/, client.query("SELECT c.chunk_id, c.evidence_revision, c.text, c.heading_path, p.title, p.product, p.product_version FROM atlas_external_doc_chunks c JOIN atlas_external_doc_pages p ON p.id = c.page_id\n\t\t\t  WHERE NOT EXISTS (SELECT 1 FROM atlas_external_doc_analyses a WHERE a.chunk_evidence_revision = c.evidence_revision AND a.analysis_type = 'SUMMARY'\n\t\t\t        AND a.producer_id = $1 AND a.producer_revision = $2 AND a.model_revision = $3 AND a.prompt_revision = $4)\n\t\t\t  ORDER BY c.chunk_id", [PRODUCER_ID, PRODUCER_REVISION, model.modelRevision, PROMPT_REVISION])];
                case 9:
                    rows = (_k.sent()).rows;
                    step_1 = Math.max(1, Math.floor(rows.length / Math.max(sample, 1)));
                    work = apply && all ? rows : rows.filter(function (_, i) { return i % step_1 === 0; }).slice(0, sample);
                    analyses = [];
                    latencies = [];
                    _i = 0, work_1 = work;
                    _k.label = 10;
                case 10:
                    if (!(_i < work_1.length)) return [3 /*break*/, 15];
                    chunk = work_1[_i];
                    t0 = Date.now();
                    _k.label = 11;
                case 11:
                    _k.trys.push([11, 13, , 14]);
                    _b = (_a = analyses).push;
                    _c = toAnalysis;
                    _d = [chunk];
                    return [4 /*yield*/, summarize(chunk, model.modelId)];
                case 12:
                    _b.apply(_a, [_c.apply(void 0, _d.concat([_k.sent(), model]))]);
                    latencies.push(Date.now() - t0);
                    if (apply && analyses.length % 50 === 0)
                        console.error("progress ".concat(analyses.length, "/").concat(work.length));
                    return [3 /*break*/, 14];
                case 13:
                    e_2 = _k.sent();
                    failures.push("".concat(chunk.chunk_id, ":").concat(e_2 instanceof Error ? e_2.message : e_2));
                    return [3 /*break*/, 14];
                case 14:
                    _i++;
                    return [3 /*break*/, 10];
                case 15:
                    keyOf_1 = function (a) { return "".concat(a.chunkId, "|").concat(a.chunkEvidenceRevision); };
                    reports_1 = runAdmission(analyses.map(function (a) { var _a; return ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, summaryInputChecksum: a.inputChecksum, summaryText: (_a = a.summaryText) !== null && _a !== void 0 ? _a : '' }); }));
                    _e = partitionByAdmissionV1(analyses.map(function (a) { return ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, inputChecksum: a.inputChecksum, outputSha256: a.outputChecksum, analysis: a }); }), reports_1, keyOf_1), admitted = _e.admitted, rejected = _e.rejected;
                    admittedAnalyses_2 = admitted.map(function (c) { var rep = reports_1.get(keyOf_1(c)); return __assign(__assign({}, c.analysis), { metadata: __assign(__assign({}, c.analysis.metadata), { admission: { admissionChecksum: rep.admissionChecksum, resolverRevision: rep.resolverRevision, claimCount: rep.claimCount, splitterRevision: rep.splitterRevision } }) }); });
                    admissionSummary = { evaluated: analyses.length, admitted: admittedAnalyses_2.length, rejected: rejected.map(function (x) { return ({ chunkId: x.candidate.chunkId, chunkEvidenceRevision: x.candidate.chunkEvidenceRevision, reasons: x.reasons }); }), ceiling: apply ? sample : null };
                    written = 0;
                    readbackOk = null;
                    afterRollback = null;
                    if (!(canary || apply)) return [3 /*break*/, 28];
                    return [4 /*yield*/, client.query('BEGIN')];
                case 16:
                    _k.sent();
                    _f = 0, admittedAnalyses_1 = admittedAnalyses_2;
                    _k.label = 17;
                case 17:
                    if (!(_f < admittedAnalyses_1.length)) return [3 /*break*/, 20];
                    a = admittedAnalyses_1[_f];
                    _g = written;
                    return [4 /*yield*/, client.query(INSERT, params(a))];
                case 18:
                    written = _g + ((_h = (_k.sent()).rowCount) !== null && _h !== void 0 ? _h : 0);
                    _k.label = 19;
                case 19:
                    _f++;
                    return [3 /*break*/, 17];
                case 20: return [4 /*yield*/, client.query("SELECT analysis_id, output_checksum, summary_text, canonical_authority FROM atlas_external_doc_analyses WHERE analysis_id = ANY($1::text[])", [admittedAnalyses_2.map(function (a) { return a.analysisId; })])];
                case 21:
                    rb = (_k.sent()).rows;
                    readbackOk = rb.length === admittedAnalyses_2.length && rb.every(function (r) { return admittedAnalyses_2.some(function (a) { return a.analysisId === r.analysis_id && a.outputChecksum === r.output_checksum && sha(r.summary_text) === r.output_checksum; }) && r.canonical_authority === false; });
                    if (!readbackOk)
                        failures.push('READBACK_MISMATCH');
                    if (!(canary && !apply)) return [3 /*break*/, 24];
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 22:
                    _k.sent();
                    return [4 /*yield*/, client.query('SELECT count(*)::int n FROM atlas_external_doc_analyses')];
                case 23:
                    afterRollback = (_k.sent()).rows[0].n;
                    if (afterRollback !== before)
                        failures.push('ROLLBACK_NOT_CLEAN');
                    return [3 /*break*/, 28];
                case 24:
                    if (!!readbackOk) return [3 /*break*/, 26];
                    return [4 /*yield*/, client.query('ROLLBACK')];
                case 25:
                    _k.sent();
                    return [3 /*break*/, 28];
                case 26: return [4 /*yield*/, client.query('COMMIT')];
                case 27:
                    _k.sent(); // generation failures are reported (a rerun resumes them); only a readback mismatch aborts the write
                    _k.label = 28;
                case 28:
                    mode = apply ? 'APPLY' : canary ? 'ROLLBACK_CANARY' : 'DRY_RUN';
                    receipt = {
                        schema: 'atlas.external-doc-summary-writer.v1', generatedAt: new Date().toISOString(),
                        mode: mode,
                        backend: __assign({ kind: 'llama-server (NOT Ollama)', url: LLAMA }, model),
                        producer: { id: PRODUCER_ID, revision: PRODUCER_REVISION, promptRevision: PROMPT_REVISION }, admission: admissionSummary, analysesBefore: before, considered: work.length, generated: analyses.length, admitted: admittedAnalyses_2.length,
                        written: written,
                        readbackOk: readbackOk,
                        afterRollback: afterRollback,
                        medianLatencyMs: (_j = latencies.sort(function (a, b) { return a - b; })[Math.floor(latencies.length / 2)]) !== null && _j !== void 0 ? _j : null,
                        failures: failures,
                        samples: analyses.slice(0, 3).map(function (a) { return ({ chunkId: a.chunkId, chunkEvidenceRevision: a.chunkEvidenceRevision, analysisId: a.analysisId, summary: a.summaryText }); }),
                        writes: { postgres: apply ? { table: 'atlas_external_doc_analyses', rows: written } : canary ? 'ROLLED_BACK' : 0, qdrant: 0, valkey: 0, neo4j: 0, graphify: 0 },
                        result: failures.length ? 'EXTERNAL_DOC_SUMMARY_WRITER_FAILED' : apply ? 'EXTERNAL_DOC_SUMMARIES_WRITTEN' : canary ? 'EXTERNAL_DOC_SUMMARY_WRITER_ROLLBACK_PROVEN' : 'EXTERNAL_DOC_SUMMARY_WRITER_DRY_RUN_READY'
                    };
                    writeFileSync(resolve(ROOT, "docs/reports/external-doc-summary-writer-".concat(mode.toLowerCase().replace('_', '-'), "-v1.json")), JSON.stringify(receipt, null, 2) + '\n');
                    console.log(JSON.stringify({ result: receipt.result, mode: mode, before: before, considered: work.length, generated: analyses.length, written: written, readbackOk: readbackOk, afterRollback: afterRollback, medianLatencyMs: receipt.medianLatencyMs, failures: failures, samples: receipt.samples }, null, 2));
                    if (failures.length)
                        process.exitCode = 1;
                    return [3 /*break*/, 31];
                case 29:
                    client.release();
                    return [4 /*yield*/, pool.end()];
                case 30:
                    _k.sent();
                    return [7 /*endfinally*/];
                case 31: return [2 /*return*/];
            }
        });
    });
}
main().catch(function (e) { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
