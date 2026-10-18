#!/usr/bin/env node
/**
 * Soft-failure runner for `graphify:daily:chain`: logs a failing step to error_logs and keeps running the rest.
 *
 *   node scripts/atlas/graphify-daily-chain-soft-v1.mjs [--dry-run] [--no-db] [--hard=N] [--chain "<a && b>"]
 *
 * Steps come from the `graphify:daily:chain` script in sveltekit-frontend/package.json (split on " && "), so the two never drift.
 * The first --hard steps (default 3: admission, dedup-validation, materialize) are gates: if one fails the run stops, because the
 * later apply steps consume what they produce. Every later step that fails is recorded in error_logs and the run continues.
 * Exit code is 1 if ANY step failed, so a degraded run is never reported as complete by the caller (lifecycle close stays
 * fail-closed). Admission is never skipped. Does not change any step's own behaviour.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const val = (n, d) => { const a = argv.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
const FE = path.join(REPO_ROOT, 'sveltekit-frontend');
const chain = argv.includes('--chain')
	? argv[argv.indexOf('--chain') + 1]
	: JSON.parse(fs.readFileSync(path.join(FE, 'package.json'), 'utf8')).scripts['graphify:daily:chain'];
const steps = chain.split(/\s+&&\s+/).map((s) => s.trim()).filter(Boolean);
const HARD = Number(val('hard', 3));
const RUN_ID = `graphify-daily-soft-${new Date().toISOString().replace(/[:.]/g, '-')}`;

if (flag('dry-run')) {
	steps.forEach((s, i) => console.log(`${i < HARD ? 'GATE' : 'soft'} ${i + 1}/${steps.length}  ${s}`));
	process.exit(0);
}

let pool = null;
if (!flag('no-db')) {
	const env = loadRepoEnv(process.env);
	pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
}
async function logStep(step, index, code, tail) {
	const msg = `graphify daily step ${index + 1}/${steps.length} failed (exit ${code}): ${step}`;
	console.error(`[soft-chain] ${msg}`);
	if (!pool) return;
	try {
		const fp = createHash('sha256').update(`${step}|${code}`).digest('hex');
		await pool.query(
			`INSERT INTO error_logs (error_category, severity, message, stack, diagnostic_run_id, diagnostic_code, diagnostic_fingerprint, context_key, workspace_id)
			 VALUES ('daily_graphify_step_failure', 'ERROR', $1, $2, $3, 'GRAPHIFY_DAILY_STEP_FAILED', $4, $5, $6)`,
			[msg.slice(0, 500), tail.slice(-4000), RUN_ID, fp, step.slice(0, 200), process.env.ATLAS_WORKSPACE_ID || 'deeds-web-app']);
	} catch (e) {
		console.error(`[soft-chain] error_logs write failed (continuing): ${e.message}`);
	}
}

const failed = [];
let ran = 0;
for (let i = 0; i < steps.length; i++) {
	console.log(`[soft-chain] ${i + 1}/${steps.length} ${i < HARD ? '(gate) ' : ''}${steps[i]}`);
	ran++;
	const r = spawnSync(steps[i], { cwd: FE, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 3 * 60 * 60 * 1000 });
	if (r.stdout) process.stdout.write(r.stdout);
	if (r.stderr) process.stderr.write(r.stderr);
	if (r.status !== 0) {
		failed.push(steps[i]);
		await logStep(steps[i], i, r.status ?? `signal:${r.signal}`, `${r.stderr ?? ''}\n${r.stdout ?? ''}`);
		if (i < HARD) { console.error('[soft-chain] gate step failed - stopping (later steps depend on it)'); break; }
	}
}
if (pool) await pool.end();
console.log(`[soft-chain] done: ${ran - failed.length}/${steps.length} ok (${ran} run)${failed.length ? `, ${failed.length} failed (logged to error_logs)` : ''}`);
process.exit(failed.length ? 1 : 0);
