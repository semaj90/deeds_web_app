#!/usr/bin/env node
/**
 * Export the production-hardening route crawl (logs/task-output/route-hardening/*.json) as NDJSON error records.
 * Local file only: writes NOTHING to Postgres/Valkey. A later, separately approved step may ingest these into error_logs.
 *
 *   node scripts/atlas/export-route-hardening-ndjson-v1.mjs [--out <file>]
 *
 * One record per distinct (route, signal, normalized message). Stable `fingerprint` = sha256(route|signal|message) so reruns
 * dedupe. Records are sorted by (severity rank, route, signal, fingerprint) for deterministic diffs.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const IN_DIR = path.join(REPO, 'logs', 'task-output', 'route-hardening');
const outIdx = process.argv.indexOf('--out');
const OUT = outIdx >= 0 ? process.argv[outIdx + 1] : path.join(REPO, 'logs', 'task-output', 'route-hardening-errors.ndjson');
const RANK = { critical: 0, high: 1, medium: 2, low: 3 };

const norm = (s) => String(s).replace(/\s+/g, ' ').replace(/\b\d{2,}\b/g, '#').trim().slice(0, 300);
const out = new Map();
function add(route, signal, severity, message, extra = {}) {
	const m = norm(message);
	const fingerprint = createHash('sha256').update(`${route}|${signal}|${m}`).digest('hex');
	const prev = out.get(fingerprint);
	if (prev) { prev.occurrences += extra.occurrences ?? 1; return; }
	const loc = extra.loc ? { filePath: extra.loc.filePath, sourceRef: extra.loc.sourceRef, lineNumber: extra.loc.lineNumber } : {};
	out.set(fingerprint, { schema: 'atlas.route-hardening-error.v1', source: 'playwright-production-hardening-routes', route, signal, severity, message: m, occurrences: extra.occurrences ?? 1, fingerprint, ...loc, canonicalAuthority: false });
}

// Browser-reported location -> repo convention used by existing error_logs rows (file_path 'src/...' relative to
// sveltekit-frontend, source_ref 'sveltekit-frontend/src/...'). Only first-party /src/ files; deps and Vite internals are ignored.
// Deterministic regex; no model, no file-name guessing.
function toLoc(urlOrFrame, line) {
	const m = /\/(src\/[^\s?#:)]+\.(?:svelte|ts|mts|js|mjs))(?:[?#][^\s:)]*)?(?::(\d+):\d+)?/.exec(String(urlOrFrame ?? ''));
	if (!m) return null;
	const lineNumber = Number(m[2] ?? line ?? 0) || null;
	return { filePath: m[1], sourceRef: `sveltekit-frontend/${m[1]}`, lineNumber };
}

const files = fs.readdirSync(IN_DIR).filter((f) => f.endsWith('.json'));
for (const f of files) {
	const d = JSON.parse(fs.readFileSync(path.join(IN_DIR, f), 'utf8'));
	const r = d.route;
	if (d.navError) add(r, 'navigation_error', /timeout/i.test(d.navError) ? 'high' : 'critical', d.navError);
	if (d.status >= 500) add(r, 'http_5xx_document', 'critical', `document status HTTP_${d.status}`);
	else if (d.status >= 400) add(r, 'http_4xx_document', 'high', `document status HTTP_${d.status}`);
	d.pageErrors.forEach((e, i) => add(r, 'uncaught_page_error', 'critical', e, { loc: toLoc(d.pageErrorFrames?.[i]) }));
	if (!d.navError && (d.layout?.bodyTextLen ?? 1) === 0) add(r, 'empty_body', 'high', 'no rendered text after 20s');
	if (d.layout && !d.layout.hasMain) add(r, 'layout_no_main_landmark', 'low', 'no <main> or role=main');
	if (d.layout && d.layout.h1 === 0) add(r, 'layout_no_h1', 'low', 'no <h1>');
	d.consoleErrors.forEach((e, i) => {
		const l = d.consoleErrorLocations?.[i];
		// net::ERR_BLOCKED_BY_CLIENT is the crawl's own mutation fence aborting a request, not an application error.
		const artifact = /ERR_BLOCKED_BY_CLIENT/.test(e);
		add(r, artifact ? 'harness_artifact' : 'console_error', artifact ? 'low' : 'medium', e, { loc: toLoc(l?.url, l?.line) ?? toLoc(e) });
	});
	for (const x of d.failedResponses) add(r, x.status >= 500 ? 'http_5xx_subrequest' : 'http_4xx_subrequest', x.status >= 500 ? 'high' : 'medium', `${x.status} ${x.url.split('?')[0]}`);
	for (const x of d.requestFailures) add(r, 'request_failed', 'medium', x);
	for (const x of d.blockedMutations) add(r, 'mutation_attempt_blocked_by_fence', 'medium', x);
	for (const x of d.blockedHeavyGet) add(r, 'heavy_get_blocked_by_fence', 'low', x);
	for (const b of d.buttons) {
		if (b.result === 'click-failed') add(r, 'button_click_failed', 'low', `${b.label}: ${b.error ?? ''}`);
		else if (b.result === 'no-observable-effect') add(r, 'button_no_observable_effect', 'low', b.label ?? `#${b.i}`);
	}
}
const rows = [...out.values()].sort((a, b) =>
	RANK[a.severity] - RANK[b.severity] || a.route.localeCompare(b.route) || a.signal.localeCompare(b.signal) || a.fingerprint.localeCompare(b.fingerprint));
fs.writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
const bySev = rows.reduce((m, r) => ((m[r.severity] = (m[r.severity] ?? 0) + 1), m), {});
const bySig = rows.reduce((m, r) => ((m[r.signal] = (m[r.signal] ?? 0) + 1), m), {});
console.log(JSON.stringify({ out: path.relative(REPO, OUT), routesRead: files.length, records: rows.length, bySeverity: bySev, bySignal: bySig, writesToDatabase: false }, null, 2));
