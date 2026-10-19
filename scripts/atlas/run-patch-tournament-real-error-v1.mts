#!/usr/bin/env node
/**
 * Real-error patch tournament (PATCH-TOURNAMENT-REAL-ERROR-01). Takes a REAL tsc error from a small self-contained repo file,
 * copies ONLY that file into a temp git repo (the original is never touched, hash-checked before and after), asks the local
 * Ornith server for three independent minimal repairs, applies each as exact find/replace edits in its own worktree, runs the
 * real tsc plus a scope check, ranks with the existing planner and builds outcome receipts (PATCH-OUTCOME-RECEIPT-01).
 *
 * Boundaries: no auto-apply; no commit path to any database (`--rehearse-db` is BEGIN ... ROLLBACK only); only the model's final
 * `content` is used (reasoning_content is discarded and never stored); outputs are evidence for human review.
 *
 *   cd sveltekit-frontend && npx tsx ../scripts/atlas/run-patch-tournament-real-error-v1.mts [--file=<repo-relative .ts>] [--rehearse-db] [--keep]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPatchTournamentPlan, resolveVerifiedEvidenceRefsFromVerifierResults } from '../../sveltekit-frontend/src/lib/server/agent/patch-tournament.ts';
import {
  PATCH_CHECK_SCHEMA, buildCheckReceiptV1, checkCommandIdentityV1, editsDigestV1, fileDigestV1, observedFromReplayV1,
  persistCheckReceiptV1, persistVerifierResultV1, verifyCheckReceiptV1, type CheckKindV1, type ReplayResultV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/execution/patch-check-receipt-v1.ts';
import { buildPatchOutcomesV1, persistPatchOutcomeReceiptV1, toPatchOutcomeReceiptRowV1 } from '../../sveltekit-frontend/src/lib/server/atlas/execution/patch-tournament-outcome-receipt-v1.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const FE = join(ROOT, 'sveltekit-frontend');
const TSC = join(FE, 'node_modules', 'typescript', 'lib', 'tsc.js');
const TYPES = join(FE, 'node_modules', '@types');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const TARGET_REL = arg('file') ?? 'sveltekit-frontend/src/lib/utils/file-uploader.ts';
const LLAMA = process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090';
const reportPath = join(ROOT, 'docs', 'reports', 'patch-tournament-real-error-run-v1.json');
const sha256 = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const git = (args: string[], cwd: string) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const keep = process.argv.includes('--keep');

function tsc(cwd: string): { errors: string[]; clean: boolean } {
  try {
    execFileSync('node', [TSC, '-p', 'tsconfig.json', '--noEmit'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { errors: [], clean: true };
  } catch (e) {
    const out = `${(e as { stdout?: string }).stdout ?? ''}`;
    return { errors: out.split(/\r?\n/).filter((l) => /error TS\d+/.test(l)), clean: false };
  }
}

type Edit = { find: string; replace: string };
async function askOrnith(model: string, system: string, user: string, seed: number): Promise<{ content: string; ms: number }> {
  const started = Date.now();
  const res = await fetch(`${LLAMA}/v1/chat/completions`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(300_000),
    body: JSON.stringify({ model, stream: true, temperature: 0.8, top_p: 0.95, seed, max_tokens: 3000,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
  });
  if (!res.ok || !res.body) throw new Error(`ORNITH_HTTP_${res.status}`);
  const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ''; let content = '';
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim(); if (data === '[DONE]') continue;
      try { content += JSON.parse(data).choices?.[0]?.delta?.content ?? ''; } catch { /* partial frame */ }   // reasoning_content intentionally ignored
    }
  }
  return { content, ms: Date.now() - started };
}

function parseEdits(raw: string): { summary: string; edits: Edit[] } | null {
  const cleaned = raw.replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('```') ? '' : m)).replace(/```[\s\S]*$/, '').trim();
  const start = cleaned.indexOf('{'); const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const j = JSON.parse(cleaned.slice(start, end + 1));
    if (!Array.isArray(j.edits) || j.edits.length === 0 || j.edits.length > 8) return null;
    const edits = j.edits.map((e: any) => ({ find: String(e.find ?? ''), replace: String(e.replace ?? '') }));
    if (edits.some((e: Edit) => !e.find)) return null;
    return { summary: String(j.summary ?? '').slice(0, 300), edits };
  } catch { return null; }
}

function applyEdits(text: string, edits: Edit[]): { ok: true; text: string } | { ok: false; reason: string } {
  let out = text;
  for (const [i, e] of edits.entries()) {
    const n = out.split(e.find).length - 1;
    if (n !== 1) return { ok: false, reason: `EDIT_${i}_FIND_MATCHES_${n}` };
    out = out.replace(e.find, () => e.replace);
  }
  return { ok: true, text: out };
}

/**
 * Independent replay used by the verifier: a FRESH temp git repo per call, built only from the recorded base text and edits
 * (no state from the executing worktree). It shares the tsc/apply helpers with the executor, so it proves reproducibility
 * from the recorded inputs, not that those helpers are bug-free.
 */
let replayCounter = 0;
const CHECK_COMMANDS: Record<CheckKindV1, string> = { apply: 'apply-edits', tsc: 'node tsc.js -p tsconfig.json --noEmit', scope: 'git diff --numstat HEAD' };
function makeReplay(tsconfigText: string, name: string, replayRoot: string) {
  return (text: string, edits: readonly Edit[]): ReplayResultV1 => {
    const dir = join(replayRoot, `replay-${++replayCounter}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, name), text); writeFileSync(join(dir, 'tsconfig.json'), tsconfigText);
    git(['init', '--initial-branch=main'], dir); git(['config', 'user.email', 'atlas-replay@example.invalid'], dir); git(['config', 'user.name', 'Atlas Replay'], dir);
    git(['add', '.'], dir); git(['commit', '-m', 'replay base'], dir);
    const applied = applyEdits(text, [...edits]);
    if (!applied.ok) return { applyOk: false, applyReason: applied.reason, finalFileDigest: null, tscErrors: [], changedFiles: [], changedLines: 0 };
    writeFileSync(join(dir, name), applied.text);
    const changedFiles = [
      ...git(['diff', '--name-only', 'HEAD', '--'], dir).split(/\r?\n/).filter(Boolean),
      ...git(['ls-files', '--others', '--exclude-standard'], dir).split(/\r?\n/).filter(Boolean),
    ];
    const changedLines = git(['diff', '--numstat', 'HEAD', '--'], dir).split(/\r?\n/).filter(Boolean).reduce((n, l) => { const [a, d] = l.split('\t'); return n + Number(a) + Number(d); }, 0);
    return { applyOk: true, applyReason: null, finalFileDigest: sha256(applied.text), tscErrors: tsc(dir).errors, changedFiles, changedLines };
  };
}

const targetAbs = join(ROOT, TARGET_REL);
if (!existsSync(targetAbs)) throw new Error(`TARGET_MISSING:${TARGET_REL}`);
const originalHashBefore = sha256(readFileSync(targetAbs));
const fixtureRoot = mkdtempSync(join(ROOT, '.tmp', 'atlas', 'patch-tournament-real-'));
const repo = join(fixtureRoot, 'repo'); const wts = join(fixtureRoot, 'worktrees');
mkdirSync(repo, { recursive: true }); mkdirSync(wts, { recursive: true });
const fileName = basename(TARGET_REL);

try {
  // 1. isolate: LF-normalised copy of the single target file in a temp git repo
  const original = readFileSync(targetAbs, 'utf8');
  const eolNormalized = /\r\n/.test(original);
  const baseText = original.replace(/\r\n/g, '\n');
  writeFileSync(join(repo, fileName), baseText);
  const tsconfigText = JSON.stringify({ compilerOptions: { strict: true, target: 'es2022', module: 'esnext', moduleResolution: 'bundler', types: ['node'], typeRoots: [TYPES], skipLibCheck: true, noEmit: true, allowImportingTsExtensions: true }, include: [fileName] }, null, 1);
  writeFileSync(join(repo, 'tsconfig.json'), tsconfigText);
  const replayRoot = join(fixtureRoot, 'replays'); mkdirSync(replayRoot, { recursive: true });
  const replay = makeReplay(tsconfigText, fileName, replayRoot);
  git(['init', '--initial-branch=main'], repo); git(['config', 'user.email', 'atlas-real@example.invalid'], repo); git(['config', 'user.name', 'Atlas Real Error'], repo);
  git(['add', '.'], repo); git(['commit', '-m', 'real error baseline'], repo);
  const baseRevision = git(['rev-parse', 'HEAD'], repo);
  const baseline = tsc(repo);
  if (baseline.clean) throw new Error('BASELINE_HAS_NO_TSC_ERROR');
  const compileError = baseline.errors.join('\n');

  // 2. Ornith must be idle and identified from /v1/models (never hard-coded)
  const slots = await (await fetch(`${LLAMA}/slots`)).json() as Array<{ is_processing?: boolean }>;
  if (slots.some((s) => s.is_processing)) throw new Error('ORNITH_BUSY');
  const model = ((await (await fetch(`${LLAMA}/v1/models`)).json()) as { models?: Array<{ model: string }>; data?: Array<{ id: string }> });
  const modelId = model.models?.[0]?.model ?? model.data?.[0]?.id;
  if (!modelId) throw new Error('ORNITH_MODEL_UNRESOLVED');

  const system = 'You repair TypeScript compile errors with the smallest possible edit. Reply with ONLY one JSON object, no markdown, no commentary: {"summary": string, "edits": [{"find": string, "replace": string}]}. Every "find" must be copied exactly from the file and must occur exactly once in it. Do not change behaviour beyond what the compiler error requires.';
  const user = `Compiler errors (tsc --strict):\n${compileError}\n\nFile ${fileName}:\n${baseText}`;
  const promptDigest = sha256(system + '\n' + user);

  const candidates: any[] = [];
  for (const [i, seed] of [101, 202, 303].entries()) {
    const candidateId = `ornith-candidate-${i + 1}`;
    const answer = await askOrnith(modelId, system, user, seed);
    const parsed = parseEdits(answer.content);
    const wt = join(wts, candidateId);
    git(['worktree', 'add', '-b', `real/${candidateId}`, wt, baseRevision], repo);
    let applyReason: string | null = parsed ? null : 'MODEL_OUTPUT_NOT_PARSEABLE';
    let finalText = baseText;
    if (parsed) { const applied = applyEdits(baseText, parsed.edits); if (applied.ok) finalText = applied.text; else applyReason = applied.reason; }
    if (!applyReason) writeFileSync(join(wt, fileName), finalText);
    const after = applyReason ? { errors: baseline.errors, clean: false } : tsc(wt);
    const changed = [
      ...git(['diff', '--name-only', 'HEAD', '--'], wt).split(/\r?\n/).filter(Boolean),
      ...git(['ls-files', '--others', '--exclude-standard'], wt).split(/\r?\n/).filter(Boolean),
    ];
    const diffLines = applyReason ? 0 : git(['diff', '--numstat', 'HEAD', '--'], wt).split(/\r?\n/).filter(Boolean).reduce((n, l) => { const [a, d] = l.split('\t'); return n + Number(a) + Number(d); }, 0);
    // What the executing worktree observed, as a replay-shaped result; the SAME observedFromReplayV1 derives every check's value.
    const exec: ReplayResultV1 = {
      applyOk: !applyReason, applyReason, finalFileDigest: applyReason ? null : sha256(finalText),
      tscErrors: applyReason ? [] : after.errors, changedFiles: applyReason ? [] : changed, changedLines: diffLines,
    };
    const runId = `real-error-${sha256(`${baseRevision}:${seed}`).slice(0, 12)}`;
    const kinds: CheckKindV1[] = ['apply', 'tsc', 'scope'];
    // Receipts only exist when there are recorded edits to replay (an unparseable answer has nothing replayable).
    const checkReceipts = parsed ? kinds.map((kind) => buildCheckReceiptV1({
      preimage: { schema: PATCH_CHECK_SCHEMA, kind, candidateId, runId, targetPath: TARGET_REL, baseFileDigest: fileDigestV1(baseText),
        editsDigest: editsDigestV1(parsed.edits), finalFileDigest: exec.finalFileDigest, commandIdentity: checkCommandIdentityV1(CHECK_COMMANDS[kind]),
        observed: observedFromReplayV1(kind, exec, fileName) },
    })) : [];
    const ref = (kind: CheckKindV1) => checkReceipts.find((c) => c.preimage.kind === kind)?.row.execution_receipt_id ?? `real:${candidateId}:${kind}:no-receipt`;
    const obs = (kind: CheckKindV1) => observedFromReplayV1(kind, exec, fileName).passed;
    candidates.push({
      candidateId, runId, sourceRevision: `git:${baseRevision}`,
      patchDigest: `sha256:${sha256(applyReason ? `${candidateId}:${applyReason}:${sha256(answer.content)}` : finalText)}`,
      branchName: `real/${candidateId}`, worktreePath: wt, patchSummary: parsed?.summary || applyReason || 'no summary', compileError, touchedFiles: [fileName],
      staticChecks: [
        { name: 'apply edits (each find matches exactly once)', passed: obs('apply'), command: CHECK_COMMANDS.apply, evidenceRef: ref('apply') },
        { name: 'tsc --strict clean', passed: obs('tsc'), command: CHECK_COMMANDS.tsc, evidenceRef: ref('tsc') },
      ],
      focusedTests: [{ name: 'scope: only the target file changed, <= 40 changed lines', passed: obs('scope'), command: CHECK_COMMANDS.scope, evidenceRef: ref('scope') }],
      evidenceRefs: kinds.map((k) => ref(k)),
      riskSignals: [...(applyReason ? ['apply-failed'] : []), ...(!applyReason && !after.clean ? ['tsc-still-failing'] : []), ...(diffLines > 20 ? ['large-diff'] : [])],
      _checks: { receipts: checkReceipts, edits: parsed?.edits ?? null },
      _evidence: { seed, ornithMs: answer.ms, responseContentDigest: sha256(answer.content), responseChars: answer.content.length, applyReason, edits: parsed?.edits ?? null,
        remainingTscErrors: after.errors.length, remainingErrorSample: after.errors.slice(0, 3), changedFiles: changed, changedLines: diffLines, finalFileDigest: sha256(finalText) },
    });
  }

  const planInput = candidates.map(({ _evidence, _checks, ...c }) => c);
  const plan = buildPatchTournamentPlan({
    objective: `repair real tsc errors in ${TARGET_REL}`, workspaceId: 'real-error-temp-repo', workspaceRevision: `temp-repo:git:${baseRevision}`,
    baseBranch: 'main', compileError, candidates: planInput as any,
  });
  const outcomes = buildPatchOutcomesV1({ plan, verifiedEvidenceRefs: new Set<string>() });   // evidence is not in the independent verifier table
  const originalHashAfter = sha256(readFileSync(targetAbs));

  let dbRehearsal: Record<string, unknown> | null = null;
  if (process.argv.includes('--rehearse-db')) {
    let dsn = '';
    for (const f of ['sveltekit-frontend/.env.local', 'sveltekit-frontend/.env', '.env']) {
      try { const m = /^DATABASE_URL=(.*)$/m.exec(readFileSync(resolve(ROOT, f), 'utf8')); if (m) { dsn = m[1].trim().replace(/^["']|["']$/g, ''); break; } } catch { /* next */ }
    }
    const pg = createRequire(join(FE, 'package.json'))('pg');
    const client = new pg.Client({ connectionString: dsn }); await client.connect();
    const lane = async () => Number((await client.query("select count(*)::int n from atlas_algorithm_execution_receipts where logical_lane = 'agentic_repair'")).rows[0].n);
    const before = await lane(); const first: string[] = []; const again: string[] = []; let inside = -1;
    const count = async (sql: string) => Number((await client.query(sql)).rows[0].n);
    const checkBefore = await count("select count(*)::int n from atlas_test_execution_receipts where framework like 'patch-check/%'");
    const verBefore = await count("select count(*)::int n from atlas_receipt_verifier_results_v1 where verifier_id = 'patch-check-replay-independent-verifier-v1'");
    let verified: Record<string, unknown> | null = null;
    try {
      await client.query('BEGIN');
      // 1. check receipts -> 2. independent replay verification -> 3. resolver (the existing, unchanged SQL) -> 4. verified plan + outcomes
      const verdicts: Record<string, string> = {}; const receiptStatus: string[] = []; const verifierStatus: string[] = [];
      for (const c of candidates) {
        for (const rc of c._checks.receipts) {
          receiptStatus.push(await persistCheckReceiptV1(client, rc.row));
          const v = await verifyCheckReceiptV1({ row: rc.row, preimage: rc.preimage, baseText, edits: c._checks.edits, replay, workspaceRevision: `temp-repo:git:${baseRevision}` });
          verifierStatus.push(await persistVerifierResultV1(client, v.result));
          verdicts[`${c.candidateId}:${rc.preimage.kind}`] = `${rc.row.status}/${v.result.verification_status}`;
        }
      }
      const allRefs = candidates.flatMap((c) => c._checks.receipts.map((rc: any) => rc.row.execution_receipt_id));
      const resolved = await resolveVerifiedEvidenceRefsFromVerifierResults(client, allRefs);
      const vPlan = buildPatchTournamentPlan({
        objective: `repair real tsc errors in ${TARGET_REL}`, workspaceId: 'real-error-temp-repo', workspaceRevision: `temp-repo:git:${baseRevision}`,
        baseBranch: 'main', compileError, candidates: planInput as any,
      }, { verifiedEvidenceRefs: resolved });
      const vOutcomes = buildPatchOutcomesV1({ plan: vPlan, verifiedEvidenceRefs: resolved });
      verified = {
        verdicts, resolvedRefCount: allRefs.filter((r: string) => resolved.has(r)).length, receiptCount: allRefs.length,
        ranking: vPlan.rankedCandidates.map((c) => `${c.rank}:${c.candidateId}:${c.reviewStatus}:score=${c.score}`),
        outcomes: vOutcomes.map((o) => `${o.candidateId}:${o.outcome}`), receiptWrites: receiptStatus, verifierWrites: verifierStatus,
      };
      for (const r of vOutcomes.map(toPatchOutcomeReceiptRowV1)) first.push((await persistPatchOutcomeReceiptV1(client, r)).status);
      for (const r of vOutcomes.map(toPatchOutcomeReceiptRowV1)) again.push((await persistPatchOutcomeReceiptV1(client, r)).status);
      inside = await lane();
    } finally { await client.query('ROLLBACK'); }
    const after = await lane();
    const checkAfter = await count("select count(*)::int n from atlas_test_execution_receipts where framework like 'patch-check/%'");
    const verAfter = await count("select count(*)::int n from atlas_receipt_verifier_results_v1 where verifier_id = 'patch-check-replay-independent-verifier-v1'");
    await client.end();
    dbRehearsal = { mode: 'BEGIN_ROLLBACK_ONLY', before, firstPass: first, secondPass: again, insideTx: inside, afterRollback: after, leftBehind: after - before,
      checkReceiptsLeftBehind: checkAfter - checkBefore, verifierRowsLeftBehind: verAfter - verBefore, verifiedRehearsal: verified };
  }

  const byId = Object.fromEntries(outcomes.map((o) => [o.candidateId, o]));
  const report = {
    schema: 'atlas.patch-tournament-real-error-run.v1', generatedAt: new Date().toISOString(), mode: 'REAL_TSC_ERROR_ISOLATED_COPY_ORNITH_CANDIDATES',
    authority: false, canonicalWrites: false, autoApply: false, training: false, hiddenReasoningStored: false,
    target: { file: TARGET_REL, originalFileSha256Before: originalHashBefore, originalFileSha256After: originalHashAfter, originalUntouched: originalHashBefore === originalHashAfter, eolNormalizedForIsolation: eolNormalized },
    baseline: { baseRevision, tscErrorCount: baseline.errors.length, errors: baseline.errors },
    ornith: { endpoint: LLAMA, model: modelId, stream: true, temperature: 0.8, seeds: [101, 202, 303], promptDigest },
    ranking: plan.rankedCandidates.map((c) => ({ candidateId: c.candidateId, rank: c.rank, score: c.score, reviewStatus: c.reviewStatus, rationale: c.rationale })),
    candidates: candidates.map(({ candidateId, patchSummary, _evidence }) => ({ candidateId, patchSummary, outcome: byId[candidateId]?.outcome, ..._evidence })),
    outcomeReceipts: outcomes.map((o) => ({ executionId: o.executionId, candidateId: o.candidateId, outcome: o.outcome, rank: o.rank, reviewStatus: o.reviewStatus })),
    dbRehearsal, noAutoApply: plan.noAutoApply,
    limits: 'one real error, three samples from a 9B model; shows the loop runs end to end, not that the tournament picks correct patches in general. Passes are PASSED_UNVERIFIED (evidence refs are not in the independent verifier table). Edits are stored; model reasoning is not.',
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ target: TARGET_REL, baselineErrors: baseline.errors.length, ranking: report.ranking.map((r) => `${r.rank}:${r.candidateId}:${r.reviewStatus}`),
    outcomes: outcomes.map((o) => `${o.candidateId}:${o.outcome}`), remaining: report.candidates.map((c: any) => `${c.candidateId}:tscErrors=${c.remainingTscErrors}:apply=${c.applyReason ?? 'ok'}`),
    originalUntouched: report.target.originalUntouched, dbRehearsal, reportPath }, null, 2));
  if (!report.target.originalUntouched) process.exitCode = 2;
} finally {
  if (!keep) rmSync(fixtureRoot, { recursive: true, force: true });
}
