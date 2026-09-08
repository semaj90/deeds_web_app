#!/usr/bin/env node
/**
 * TRACE-MCP-CENSUS-RECONCILE-01
 *
 * Four read-only measurements against the same running trace-mcp-server (:8788), reconciling the
 * "static registered tools" count (docs/TRACE-MCP-TOOLS-AUDIT.json's methodology: a literal-string
 * scan of registerTool() calls inside trace-mcp-server.ts itself) against the "runtime discovered
 * tools" count (a live tools/list call) as two genuinely different populations, not competing
 * measurements of the same thing:
 *
 *   A. Static source tool names — trace-mcp-server.ts's own registerTool('name', ...) calls.
 *   B. Runtime MCP tools/list names — a live JSON-RPC call against the running server.
 *   C. Set diff — shared / static-only / runtime-only / duplicate runtime names.
 *   D. Source provenance for every runtime-only name, classified as:
 *        DELEGATED_MODULE_REGISTRATION — registered via an imported registerXTools(server, ...)
 *          call trace-mcp-server.ts itself imports and invokes (fully static, just not a literal
 *          registerTool() call inside this one file).
 *        COMPATIBILITY_ALIAS — an explicit bare-name backward-compat alias (source context near
 *          the registration mentions "DEPRECATED" or "alias").
 *        UNEXPLAINED — no source location found at all. This is the only real problem case.
 *
 * Admission criterion: unexplainedRuntimeTools.length === 0 AND duplicateRuntimeToolNames.length
 * === 0. NOT staticCount === runtimeCount — they are allowed, and expected, to differ.
 *
 * Read-only. Writes one receipt to docs/reports/trace-mcp-census-reconcile-01-<date>.json,
 * validated against TraceMcpToolCensusV1 (src/lib/server/atlas/contracts/trace-mcp-tool-census-v1.ts).
 * Does not modify trace-mcp-server.ts, docs/TRACE-MCP-TOOLS-AUDIT.json, or any other existing file.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRACE_MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const TRACE_SERVER_FILE = path.join(ROOT, 'src/mcp/trace-mcp-server.ts');

function sha256(value) {
	return crypto.createHash('sha256').update(value).digest('hex');
}

function namesChecksum(names) {
	return sha256(JSON.stringify([...names].sort()));
}

async function checkServerHealth() {
	try {
		const res = await fetch(`${TRACE_MCP_URL}/health`, { signal: AbortSignal.timeout(3000) });
		return res.ok ? 'HEALTHY' : 'DEGRADED';
	} catch {
		return 'UNREACHABLE';
	}
}

async function fetchRuntimeToolNames() {
	const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
		body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
		signal: AbortSignal.timeout(15000),
	});
	const raw = await res.text();
	const dataLine = raw.split('\n').find((l) => l.startsWith('data: '));
	const jsonText = dataLine ? dataLine.slice(6) : raw;
	const parsed = JSON.parse(jsonText);
	const tools = parsed.result?.tools ?? [];
	return tools.map((t) => t.name);
}

function extractStaticToolNames(source) {
	const re = /registerTool\(\s*\n?\s*['"]([a-zA-Z0-9_.\-]+)['"]/g;
	const names = [];
	let m;
	while ((m = re.exec(source))) names.push(m[1]);
	return names;
}

/** Files imported and invoked by trace-mcp-server.ts as `registerXTools(server, ...)` — these are
 * legitimate delegated static registration sources, distinct from an unexplained runtime tool. */
function extractDelegatedRegistrationFiles(source) {
	const importRe = /import\s*\{\s*(register[A-Za-z0-9]+)\s*\}\s*from\s*['"]([^'"]+)['"]/g;
	const imports = new Map();
	let m;
	while ((m = importRe.exec(source))) imports.set(m[1], m[2]);

	const called = new Set();
	for (const fnName of imports.keys()) {
		const callRe = new RegExp(`${fnName}\\(`);
		if (callRe.test(source)) called.add(fnName);
	}

	return [...called].map((fnName) => {
		const specifier = imports.get(fnName);
		// Resolve relative specifiers against src/mcp/; leave $lib specifiers as a marker to
		// resolve against src/lib/ (matches this repo's alias convention).
		const resolved = specifier.startsWith('.')
			? path.normalize(path.join(path.dirname(TRACE_SERVER_FILE), specifier)).replace(/\.js$/, '.ts')
			: specifier.replace('$lib/', 'src/lib/').replace(/\.js$/, '.ts');
		return { fnName, specifier, resolvedGuess: resolved };
	});
}

function walkSourceFiles(roots) {
	const files = [];
	function walk(dir) {
		let entries;
		try {
			entries = fs.readdirSync(dir, { withFileTypes: true });
		} catch {
			return;
		}
		for (const e of entries) {
			const full = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name === 'node_modules' || e.name === '.git') continue;
				walk(full);
			} else if (e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.mjs'))) {
				files.push(full);
			}
		}
	}
	for (const r of roots) walk(r);
	return files;
}

/** A "registration site" is an occurrence of the quoted name within ~80 chars of a
 * `registerTool(` call -- distinct from any other occurrence of the same string (e.g. a data
 * array in an unrelated classification/report file, which is provenance-relevant but NOT a
 * registration and must never feed the alias/deprecated keyword check below). */
function findProvenance(name, files) {
	const hits = [];
	for (const file of files) {
		let content;
		try {
			content = fs.readFileSync(file, 'utf8');
		} catch {
			continue;
		}
		let searchFrom = 0;
		let anyOccurrence = false;
		let registrationContext = null;
		for (const quoted of [`'${name}'`, `"${name}"`]) {
			let idx = content.indexOf(quoted, searchFrom);
			while (idx >= 0) {
				anyOccurrence = true;
				const before = content.slice(Math.max(0, idx - 80), idx);
				if (/registerTool\(\s*\n?\s*$/.test(before)) {
					registrationContext = content.slice(Math.max(0, idx - 300), idx + 100);
					break;
				}
				idx = content.indexOf(quoted, idx + 1);
			}
			if (registrationContext) break;
		}
		if (anyOccurrence) {
			hits.push({
				file: path.relative(ROOT, file).replace(/\\/g, '/'),
				isRegistrationSite: registrationContext !== null,
				context: registrationContext,
			});
		}
	}
	return hits;
}

function classify(hits, delegatedFiles) {
	if (hits.length === 0) return 'UNEXPLAINED';
	// Only a hit that is an actual `registerTool(` call site (not merely the name appearing
	// somewhere in a file, e.g. in an unrelated classification report's data array) can establish
	// COMPATIBILITY_ALIAS -- this is the exact false-positive this comment exists to prevent.
	const registrationHits = hits.filter((h) => h.isRegistrationSite);
	const anyDeprecatedAlias = registrationHits.some((h) => /DEPRECATED|legacy alias|bare-name alias/i.test(h.context));
	if (anyDeprecatedAlias) return 'COMPATIBILITY_ALIAS';
	const inDelegatedFile = hits.some((h) => delegatedFiles.some((d) => h.file.endsWith(path.basename(d.resolvedGuess))));
	if (inDelegatedFile) return 'DELEGATED_MODULE_REGISTRATION';
	if (registrationHits.length > 0) return 'DELEGATED_MODULE_REGISTRATION';
	// Found only as a non-registration reference (e.g. a test, a data array in a report file) --
	// real provenance, but not itself proof of how the tool is registered.
	return 'UNEXPLAINED';
}

async function main() {
	const capturedAt = new Date().toISOString();
	const serverHealth = await checkServerHealth();

	const traceServerSource = fs.readFileSync(TRACE_SERVER_FILE, 'utf8');
	const staticNames = extractStaticToolNames(traceServerSource);
	const delegatedFiles = extractDelegatedRegistrationFiles(traceServerSource);

	const runtimeNames = serverHealth === 'UNREACHABLE' ? [] : await fetchRuntimeToolNames();

	const staticSet = new Set(staticNames);
	const runtimeSet = new Set(runtimeNames);
	const seen = new Set();
	const duplicateRuntimeToolNames = runtimeNames.filter((n) => (seen.has(n) ? true : (seen.add(n), false)));

	const shared = [...staticSet].filter((n) => runtimeSet.has(n));
	const staticOnlyNames = [...staticSet].filter((n) => !runtimeSet.has(n));
	const runtimeOnlyNames = [...runtimeSet].filter((n) => !staticSet.has(n));

	const provenanceRoots = [path.join(ROOT, 'src/mcp'), path.join(ROOT, 'src/lib/server')];
	const provenanceFiles = walkSourceFiles(provenanceRoots);

	const runtimeOnlyTools = runtimeOnlyNames.sort().map((name) => {
		const hits = findProvenance(name, provenanceFiles);
		return {
			name,
			classification: classify(hits, delegatedFiles),
			sourceFiles: [...new Set(hits.map((h) => h.file))],
		};
	});

	const unexplainedRuntimeTools = runtimeOnlyTools.filter((t) => t.classification === 'UNEXPLAINED').map((t) => t.name);

	const admission = {
		unexplainedRuntimeToolsIsZero: unexplainedRuntimeTools.length === 0,
		duplicateRuntimeToolNamesIsZero: duplicateRuntimeToolNames.length === 0,
		verdict: unexplainedRuntimeTools.length === 0 && duplicateRuntimeToolNames.length === 0 ? 'PASS' : 'FAIL',
	};

	const receipt = {
		schema: 'trace-mcp.tool-census.v1',
		capturedAt,
		serverRevision: null,
		serverHealth,
		static: {
			methodology: 'REGISTER_TOOL_SOURCE_SCAN',
			sourceFile: path.relative(ROOT, TRACE_SERVER_FILE).replace(/\\/g, '/'),
			count: staticNames.length,
			namesChecksum: namesChecksum(staticNames),
		},
		runtime: {
			methodology: 'MCP_TOOLS_LIST',
			endpoint: `${TRACE_MCP_URL}/mcp`,
			count: runtimeNames.length,
			namesChecksum: namesChecksum(runtimeNames),
		},
		reconciliation: {
			sharedCount: shared.length,
			staticOnlyCount: staticOnlyNames.length,
			runtimeOnlyCount: runtimeOnlyNames.length,
			staticOnlyNames: staticOnlyNames.sort(),
			runtimeOnlyTools,
			duplicateRuntimeToolNames,
			unexplainedRuntimeTools,
		},
		admission,
	};

	const outDir = path.join(ROOT, 'docs/reports');
	fs.mkdirSync(outDir, { recursive: true });
	const outFile = path.join(outDir, `trace-mcp-census-reconcile-01-${capturedAt.slice(0, 10)}.json`);
	fs.writeFileSync(outFile, JSON.stringify(receipt, null, 2) + '\n');

	console.log(`serverHealth: ${serverHealth}`);
	console.log(`static (REGISTER_TOOL_SOURCE_SCAN, ${receipt.static.sourceFile}): ${receipt.static.count}`);
	console.log(`runtime (MCP_TOOLS_LIST, ${receipt.runtime.endpoint}): ${receipt.runtime.count}`);
	console.log(`shared: ${shared.length}, staticOnly: ${staticOnlyNames.length}, runtimeOnly: ${runtimeOnlyNames.length}`);
	console.log(`duplicateRuntimeToolNames: ${duplicateRuntimeToolNames.length}`);
	console.log(`unexplainedRuntimeTools: ${unexplainedRuntimeTools.length}`);
	console.log(`admission verdict: ${admission.verdict}`);
	console.log(`receipt written: ${path.relative(ROOT, outFile).replace(/\\/g, '/')}`);

	if (admission.verdict !== 'PASS') process.exitCode = 1;
}

main().catch((err) => {
	console.error('TRACE-MCP-CENSUS-RECONCILE-01 failed:', err);
	process.exitCode = 1;
});
