#!/usr/bin/env npx tsx
/**
 * agents-md-regen.ts — Phase A3 part 2 CLI shell.
 *
 * Thin wrapper over `src/lib/server/agents/regen/run::runRegen`. Adds the
 * operator-facing contract that already applies to `agents:index` and
 * `agents:cache`:
 *   - Startup banner with writers=<disabled|enabled>
 *   - Machine-parsable JSON summary line at the end
 *   - --dry-run guarantees zero writes (asserted by tests/agents-regen-cli.spec.ts)
 *
 * Reference: docs/design/2026-05-11_agents-directory-card-regen.md §3.
 *
 * Flags:
 *   --dir <path>     single-directory mode (mutually exclusive with --all)
 *   --all            full sweep across all dirs in codebase-graph.json
 *   --dry-run        compute everything, skip writes
 *   --force          re-encode even when contentHash matches existing card
 *   --limit N        cap dirs processed (smoke convenience)
 *   --limit=N        same, equals-form
 *   --redis-only     write Redis only (skip CouchDB / Qdrant in Phase A4)
 *   --quiet          suppress per-stage chatter (banner + summary still emit)
 *   --skip-activity  skip context_timeline rollup (faster smoke runs)
 *   --skip-clusters  skip ace:cluster:summary:* lookup
 */

import { runRegen, type RegenCliOptions, type RegenCliResult } from '../src/lib/server/agents/regen/run.js';

const argv = process.argv.slice(2);

interface CliFlags extends RegenCliOptions {
	quiet?: boolean;
}

function parseFlags(args: readonly string[]): CliFlags {
	const flag = (name: string) => args.includes(name);
	const valueOf = (name: string): string | null => {
		const eq = args.find((a) => a.startsWith(`${name}=`));
		if (eq) return eq.slice(name.length + 1);
		const idx = args.indexOf(name);
		if (idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
		return null;
	};
	const limitRaw = valueOf('--limit');
	const limitNum = limitRaw !== null ? parseInt(limitRaw, 10) : NaN;

	const opts: CliFlags = {
		dir:        valueOf('--dir') ?? undefined,
		all:        flag('--all'),
		dryRun:     flag('--dry-run'),
		force:      flag('--force'),
		limit:      Number.isFinite(limitNum) && limitNum > 0 ? limitNum : undefined,
		redisOnly:  flag('--redis-only'),
		quiet:      flag('--quiet'),
		ctxOptions: {
			skipActivity:         flag('--skip-activity'),
			skipClusterSummaries: flag('--skip-clusters'),
		},
	};
	// Default to --all when neither --dir nor --all given (single-mode is opt-in)
	if (!opts.dir && !opts.all) opts.all = true;
	return opts;
}

const flags = parseFlags(argv);
const writersState = flags.dryRun ? 'disabled' : 'enabled';
const limitDisplay = flags.limit ?? (flags.dir ? '1' : 'none');

// Banner — bypasses --quiet by design (operator-safety signal, not chatter)
console.log(`[agents:regen] dryRun=${!!flags.dryRun} force=${!!flags.force} limit=${limitDisplay} writers=${writersState}`);

if (!flags.quiet) {
	const mode = flags.dir ? `dir=${flags.dir}` : 'all';
	console.log(`[agents:regen] mode=${mode}`);
}

let result: RegenCliResult;
try {
	result = await runRegen(flags);
} catch (err) {
	const message = (err as Error)?.message ?? String(err);
	const failureSummary = {
		dryRun:          !!flags.dryRun,
		force:           !!flags.force,
		processed:       0,
		changedCount:    0,
		unchangedCount:  0,
		skippedCount:    0,
		failedCount:     0,
		redisWrites:     0,
		couchWrites:     0,
		qdrantWrites:    0,
		markdownWrites:  0,
		durationMs:      0,
		fatal:           message,
	};
	console.log(`[agents:regen] summary=${JSON.stringify(failureSummary)}`);
	console.error(`[agents:regen] fatal: ${message}`);
	process.exit(1);
}

if (!flags.quiet) {
	console.log('');
	console.log(`Regen summary:`);
	console.log(`- Dirs:        ${result.dirCount}`);
	console.log(`- Changed:     ${result.changedCount}`);
	console.log(`- Unchanged:   ${result.unchangedCount}`);
	console.log(`- Skipped:     ${result.skippedCount} (--dry-run)`);
	console.log(`- Failed:      ${result.failedCount}`);
	console.log(`- Redis writes:${result.redisWrites}`);
	console.log(`- Duration:    ${result.durationMs}ms`);
	const s = result.signalSourcesLoaded;
	console.log(`- Signals loaded: graph=${s.graphNodes} karpathy=${s.karpathyScores} clusters=${s.clusterSummaries} features=${s.featureRows} activity=${s.activityRows}`);
	for (const f of result.failures.slice(0, 5)) {
		console.error(`- FAIL ${f.dir}: ${f.error}`);
	}
	if (result.failures.length > 5) console.error(`- ...and ${result.failures.length - 5} more failures`);
}

// Machine-parsable contract summary — couchWrites/qdrantWrites/markdownWrites
// are reserved keys (always 0 today; Phase A4 / A5 will populate them).
const machineSummary = {
	dryRun:          result.dryRun,
	force:           result.force,
	processed:       result.dirCount,
	changedCount:    result.changedCount,
	unchangedCount:  result.unchangedCount,
	skippedCount:    result.skippedCount,
	failedCount:     result.failedCount,
	redisWrites:     result.redisWrites,
	couchWrites:     result.couchWrites,
	qdrantWrites:    result.qdrantWrites,
	markdownWrites:  result.markdownWrites,
	durationMs:      result.durationMs,
	graphNodes:      result.signalSourcesLoaded.graphNodes,
	karpathyScores:  result.signalSourcesLoaded.karpathyScores,
	clusterSummaries: result.signalSourcesLoaded.clusterSummaries,
	featureRows:     result.signalSourcesLoaded.featureRows,
	activityRows:    result.signalSourcesLoaded.activityRows,
};
console.log(`[agents:regen] summary=${JSON.stringify(machineSummary)}`);

process.exit(result.failedCount > 0 && !flags.dryRun ? 2 : 0);
