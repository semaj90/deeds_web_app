#!/usr/bin/env node
/**
 * handoff-to-claude.mjs — companion to run-loop.mjs (Phase C, Lane 5+)
 *
 * Records a `synthesis_handoff` event in `context_timeline` so every
 * Gemma4 → Claude Code handoff is auditable. Intentionally separate
 * from run-loop.mjs to keep the synth loop free of DB writes (the
 * loop runs local-only by design; this companion is the audit hook
 * the operator opts into).
 *
 * Usage:
 *   node scripts/synth/handoff-to-claude.mjs --run <RUN_TS>
 *     reads scratch/synthesis-runs/<RUN_TS>/lane4-synthesis.json,
 *     records the handoff, prints the operator-runnable command.
 *
 *   node scripts/synth/handoff-to-claude.mjs --brief <path>
 *     records a handoff for an arbitrary brief file (no Lane 4 metadata).
 *
 *   $env:HANDOFF_RUN="2026-05-09T18-00-00"; npm run synth:handoff
 *
 * Hard rules:
 *   - Read-only against scratch/ + memory/ (never mutates briefs)
 *   - Single fire-and-forget INSERT to context_timeline; failure logs
 *     a warning but does not exit non-zero (audit miss != functional miss)
 *   - No MCP call, no LLM call, no network beyond Postgres
 *   - DATABASE_URL must be set (read from env directly — no Drizzle import,
 *     keeps this script .mjs-only with no tsx dependency)
 *
 * Exit codes:
 *   0 = handoff recorded (or warned but continued)
 *   1 = bad input (--run not provided, file not found, malformed)
 *   2 = uncaught error
 */

import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const PG_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const SESSION_ID = process.env.SYNTH_SESSION_ID ?? '';

function parseArgs(argv) {
	const args = { run: null, brief: null };
	for (let i = 0; i < argv.length; i += 1) {
		const t = argv[i];
		if (t === '--run')         { args.run = argv[i + 1]; i += 1; continue; }
		if (t.startsWith('--run=')) args.run = t.slice('--run='.length);
		if (t === '--brief')         { args.brief = argv[i + 1]; i += 1; continue; }
		if (t.startsWith('--brief=')) args.brief = t.slice('--brief='.length);
	}
	if (!args.run && process.env.HANDOFF_RUN)  args.run = process.env.HANDOFF_RUN;
	if (!args.brief && process.env.HANDOFF_BRIEF) args.brief = process.env.HANDOFF_BRIEF;
	return args;
}

async function loadSynthMeta(runTs) {
	const path = resolve(ROOT, 'scratch', 'synthesis-runs', runTs, 'lane4-synthesis.json');
	try {
		const text = await readFile(path, 'utf8');
		return JSON.parse(text);
	} catch (e) {
		throw new Error(`Could not read ${path}: ${e.message}`);
	}
}

async function recordHandoff(payload) {
	let pgPkg;
	try { pgPkg = await import('pg'); }
	catch { console.warn('[handoff] pg not installed — audit row NOT written'); return false; }
	const { Pool } = pgPkg.default ?? pgPkg;

	const pool = new Pool({ connectionString: PG_URL, max: 1, connectionTimeoutMillis: 4000, idleTimeoutMillis: 1000 });
	try {
		await pool.query(
			`INSERT INTO context_timeline (event_type, pipeline, session_id, payload)
			 VALUES ($1, $2, $3, $4::jsonb)`,
			['synthesis_handoff', 'synth', SESSION_ID, JSON.stringify(payload)],
		);
		return true;
	} catch (e) {
		console.warn(`[handoff] context_timeline INSERT failed (non-fatal): ${e.message}`);
		return false;
	} finally {
		await pool.end().catch(() => {});
	}
}

async function main() {
	const args = parseArgs(process.argv.slice(2));

	let payload;
	let briefPath;

	if (args.run) {
		const meta = await loadSynthMeta(args.run);
		briefPath = meta.briefPath;
		payload = {
			run_ts:           args.run,
			brief_path:       briefPath,
			brief_name:       briefPath ? basename(briefPath) : null,
			backend:          meta.backend ?? null,
			usage:            meta.usage ?? null,
			cited_paths:      meta.cited_paths ?? [],
			verified_paths:   meta.verified_paths ?? [],
			verification_pct: meta.verification_pct ?? null,
			duration_ms:      meta.duration_ms ?? null,
			handoff_at:       new Date().toISOString(),
		};
	} else if (args.brief) {
		const briefAbs = resolve(args.brief);
		try { await stat(briefAbs); } catch { throw new Error(`Brief not found: ${briefAbs}`); }
		briefPath = briefAbs;
		payload = {
			brief_path:  briefAbs,
			brief_name:  basename(briefAbs),
			backend:     'unknown',
			handoff_at:  new Date().toISOString(),
		};
	} else {
		console.error('[handoff] need --run <RUN_TS> or --brief <path>');
		process.exit(1);
	}

	const ok = await recordHandoff(payload);
	console.log(`[handoff] ${ok ? 'recorded' : 'recorded (audit miss)'}: ${payload.brief_name ?? payload.brief_path}`);
	console.log(`[handoff] hand off to Claude Code:`);
	console.log(`  claude code --prompt-file "${briefPath}"`);
	console.log(`[handoff] OR paste the brief into the Claude Code chat panel.`);
}

main().catch((err) => {
	console.error(`[handoff] fatal: ${err.message}`);
	process.exit(2);
});
