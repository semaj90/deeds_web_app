/**
 * Codebase Scanner V2 — ts-morph primary + regex fallback + 20-step audit.
 *
 * Extends Phase 1 structural extraction with:
 * - ts-morph AST resolution (symbols, call graph, dynamic imports)
 * - 20-step audit metrics (up from 8)
 * - Dynamic import targets (resolved paths, not boolean)
 * - Auth/validation/cache/error handling detection
 * - Call depth and symbol count analysis
 */
import { Project, SyntaxKind } from 'ts-morph';
import { resolve, relative, basename, dirname, extname } from 'path';
import { readdirSync, statSync, readFileSync } from 'fs';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ScanNodeV2 {
	id: string;
	label: string;
	nodeLabel: string;
	type: string;
	filePath: string;
	cluster: string;
	lineCount: number;
	fileSize: number;
	complexity: number;
	classCount: number;
	importCount: number;
	exportCount: number;
	exports: string[];
	functions: string[];
	usedTables: string[];
	publishedQueues: string[];
	consumedQueues: string[];
	fetchedRoutes: string[];
	usesNative: boolean;
	hasDynamicImports: boolean;

	// 20-step audit: new 12 metrics
	dynamicImportTargets: string[]; // 9
	callees: string[]; // 10
	hasErrorHandling: boolean; // 11
	hasAuthGuard: boolean; // 12
	hasZodValidation: boolean; // 13
	hasCachePattern: boolean; // 14
	isSseEndpoint: boolean; // 15
	isWorkerBoundary: boolean; // 16
	isRouteFile: boolean; // 17
	routeType: 'api' | 'page' | 'layout' | 'server' | 'component' | 'util'; // 18
	symbolCount: number; // 19
	maxCallDepth: number; // 20
}

export interface ScanEdge {
	source: string;
	target: string;
	type: 'IMPORTS' | 'DYNAMIC_IMPORTS';
}

export interface ScanResultV2 {
	nodes: ScanNodeV2[];
	edges: ScanEdge[];
	metadata: {
		totalNodes: number;
		totalEdges: number;
		labelCounts: Record<string, number>;
		edgeTypeCounts: Record<string, number>;
		nodesWithErrors: number;
		scanTimeMs: number;
		maxFiles: number;
		generatedAt: string;
		scanMethod: 'ts-morph' | 'regex-fallback';
	};
}

// ── Known sets ────────────────────────────────────────────────────────────────
const KNOWN_TABLES = new Set([
	'users','sessions','cases','caseNotes','caseStatuteLinks',
	'evidence','evidenceRelationships','evidenceVectors',
	'documents','legalDocuments','documentChunks',
	'citations','statutes','statuteChunks','legalPrecedents',
	'ragSessions','ragMessages','searchQueries',
	'persons','organizations','routeHealth','errorTracking',
	'embeddingCache','workspaces',
]);

const KNOWN_QUEUES = new Set([
	'cache.invalidate','document.embed','evidence.process',
	'vector.index','chat.context','analytics.track','codebase.index',
]);

// ── Regex patterns (for fallback & additional detection) ────────────────────
const RE_IMPORT     = /^import\s+(?:type\s+)?(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]/gm;
const RE_REEXPORT   = /^export\s+(?:type\s+)?(?:\*|{[^}]*})\s+from\s+['"]([^'"]+)['"]/gm;
const RE_DYN_IMPORT = /\bimport\s*\(\s*['"`]([^'"`\n]+)['"`]\s*\)/gm;
const RE_EXPORT_FN  = /^export\s+(?:default\s+)?(?:async\s+)?function\s+(\w+)/gm;
const RE_EXPORT_CLS = /^export\s+(?:default\s+)?class\s+(\w+)/gm;
const RE_EXPORT_VAR = /^export\s+(?:const|let|var)\s+(\w+)/gm;
const RE_FN_NAME    = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
const RE_CLASS      = /\bclass\s+\w+/g;
const RE_BRANCH     = /\b(if|else|for|while|switch|case|catch)\b|&&|\|\||\?[^:]/g;
const RE_FETCH      = /\bfetch\s*\(\s*[`'"](\/api\/[^'"`\s,\n)]+)/gm;
const RE_PUBLISH    = /(?:publish|sendToQueue)\s*\(\s*['"`]([a-zA-Z][a-zA-Z0-9._-]{2,40})['"`]/gm;
const RE_CONSUME    = /consume\s*\(\s*['"`]([a-zA-Z][a-zA-Z0-9._-]{2,40})['"`]/gm;
const RE_TBL_FROM   = /\.from\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*[,)]/gm;
const RE_TBL_INS    = /\.insert\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*\)/gm;
const RE_TBL_UPD    = /\.update\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*\)/gm;
const RE_TBL_DEL    = /\.delete\s*\(\s*([a-z][a-zA-Z0-9]{2,})\s*\)/gm;
const RE_NATIVE     = /(?:fastJsonParse|computeGpuSimilarity|isCudaAvailable|isSimdJsonAvailable|tensorrt_bridge|libtorchCosineSimilarity)/;
const RE_TRY_CATCH  = /\b(try|catch|finally|throw)\b/g;
const RE_AUTH_GUARD = /locals\.user|requireAuth|getSession|checkAuth/;
const RE_ZOD        = /\bz\.|safeParse|parseAsync|schema\(|ZodSchema/;
const RE_CACHE      = /redis|loki|IndexedDB|localStorage|sessionStorage|cacheMap|Cache/i;
const RE_SSE        = /text\/event-stream|EventSource|ReadableStream/;
const RE_WORKER     = /worker_threads|new Worker\(|Worker\('/;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getNodeLabel(relPath: string): string {
	if (relPath.startsWith('routes/')) return 'Route';
	if (relPath.endsWith('.svelte') && relPath.includes('/components/')) return 'Component';
	if (relPath.includes('/stores/') || relPath.endsWith('.svelte.ts')) return 'Store';
	if (relPath.includes('/server/') || relPath.includes('/services/')) return 'ServerModule';
	return 'File';
}

function classifyType(relPath: string): string {
	if (relPath.includes('/routes/api/') || relPath.includes('+server.ts')) return 'api';
	if (relPath.startsWith('routes/')) return 'route';
	if (relPath.includes('/stores/') || relPath.endsWith('.svelte.ts')) return 'store';
	if (relPath.endsWith('.svelte') && relPath.includes('/components/')) return 'component';
	if (relPath.includes('/server/') || relPath.includes('/services/')) return 'service';
	return 'util';
}

function getRouteType(relPath: string): 'api' | 'page' | 'layout' | 'server' | 'component' | 'util' {
	if (relPath.includes('/routes/api/')) return 'api';
	if (relPath.includes('+page.')) return 'page';
	if (relPath.includes('+layout.')) return 'layout';
	if (relPath.includes('+server.')) return 'server';
	if (relPath.endsWith('.svelte') && relPath.includes('/components/')) return 'component';
	return 'util';
}

function deriveCluster(relPath: string): string {
	if (relPath.startsWith('routes/api/')) {
		const p = relPath.split('/');
		return p.length >= 4 ? 'api-' + p[2] : 'api';
	}
	if (relPath.startsWith('routes/(app)/')) {
		const p = relPath.split('/');
		return p.length >= 4 ? 'app-' + p[2] : 'app';
	}
	if (relPath.startsWith('routes/')) return 'routes';
	if (relPath.startsWith('lib/components/')) {
		const p = relPath.split('/');
		return p.length >= 4 ? 'comp-' + p[2] : 'components';
	}
	if (relPath.startsWith('lib/stores/')) return 'stores';
	if (relPath.startsWith('lib/server/')) {
		const p = relPath.split('/');
		return p.length >= 4 ? 'server-' + p[2] : 'server';
	}
	if (relPath.startsWith('lib/ai/')) return 'ai';
	return 'lib';
}

function collectFiles(dir: string, maxFiles: number): string[] {
	const files: string[] = [];
	function walk(d: string) {
		if (files.length >= maxFiles) return;
		let entries: string[];
		try { entries = readdirSync(d); } catch { return; }
		for (const entry of entries) {
			if (files.length >= maxFiles) return;
			const full = resolve(d, entry);
			let st;
			try { st = statSync(full); } catch { continue; }
			if (st.isDirectory()) {
				if (['node_modules', '.svelte-kit', 'deeds_labs', 'static', 'build', 'services'].includes(entry)) continue;
				walk(full);
			} else {
				const ext = extname(entry);
				if (['.ts', '.js', '.mts'].includes(ext) && !entry.endsWith('.d.ts')) files.push(full);
			}
		}
	}
	walk(dir);
	return files;
}

function resolveImport(spec: string, fromFile: string, srcRoot: string): string | null {
	if (spec.startsWith('$lib/')) return 'lib/' + spec.slice(5).replace(/\.js$/, '');
	if (spec.startsWith('$') || spec.startsWith('@') || !spec.startsWith('.')) return null;
	const fromDir = dirname(relative(srcRoot, fromFile));
	const resolved = resolve(srcRoot, fromDir, spec).replace(/\.js$/, '');
	const rel = relative(srcRoot, resolved).replace(/\\/g, '/');
	return rel.startsWith('..') ? null : rel;
}

function extractAll(re: RegExp, src: string): string[] {
	const out: string[] = [];
	re.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(src)) !== null) out.push(m[1]);
	return out;
}

function filterKnown(names: string[], set: Set<string>): string[] {
	return Array.from(new Set(names.filter(n => set.has(n))));
}

// ── ts-morph analysis ─────────────────────────────────────────────────────────
// Called ONCE before the file loop — pre-builds the AST map for all files.
// Returns a Map<absolutePath, analysisResult> so per-file lookup is O(1).
function buildTsMorphMap(filePaths: string[], srcRoot: string): Map<string, {
	dynamicImportTargets: string[];
	callees: string[];
	symbolCount: number;
	maxCallDepth: number;
}> {
	const empty = { dynamicImportTargets: [], callees: [], symbolCount: 0, maxCallDepth: 0 };
	const result = new Map<string, typeof empty>();

	let project: Project;
	try {
		project = new Project({
			compilerOptions: { allowJs: true, noEmit: true, skipLibCheck: true },
			skipFileDependencyResolution: true,
			skipLoadingLibFiles: true,
			useInMemoryFileSystem: false,
		});
		// Pre-add ALL files at once — ts-morph batches the parse, not per-file
		project.addSourceFilesAtPaths(filePaths);
		console.log(`[scanner-v2] ts-morph loaded ${project.getSourceFiles().length} source files`);
	} catch (err) {
		console.warn('[scanner-v2] ts-morph Project init failed:', (err as Error)?.message);
		return result;
	}

	for (const sourceFile of project.getSourceFiles()) {
		const fp = sourceFile.getFilePath();
		const dynamicTargets = new Set<string>();
		const externalCallees = new Set<string>();
		let symbolCount = 0;

		try {
			symbolCount = sourceFile.getExportedDeclarations().size;
		} catch { /* ignore */ }

		try {
			sourceFile.forEachDescendant(node => {
				if (node.getKind() !== SyntaxKind.CallExpression) return;
				const callExpr = node as any;
				if (!callExpr.getExpression) return;
				const expr = callExpr.getExpression();
				if (!expr) return;

				// Dynamic import() calls
				if (expr.getText && expr.getText() === 'import') {
					const args = callExpr.getArguments?.() ?? [];
					if (args.length > 0 && args[0].getKind?.() === SyntaxKind.StringLiteral) {
						const spec = args[0].getText().slice(1, -1);
						const resolved = resolveImport(spec, fp, srcRoot);
						if (resolved) dynamicTargets.add(resolved);
					}
					return;
				}

				// External callee names
				if (expr.getKind?.() === SyntaxKind.Identifier) {
					const name = expr.getText?.() ?? '';
					if (name && !/^(console|fetch|Promise|Object|Array|JSON|Math|Date|typeof|return|require|Symbol)/.test(name)) {
						externalCallees.add(name);
					}
				} else if (expr.getKind?.() === SyntaxKind.PropertyAccessExpression) {
					const obj = expr.getChildAtIndex?.(0);
					if (obj?.getKind?.() === SyntaxKind.Identifier) {
						externalCallees.add((obj.getText?.() ?? '') + '.*');
					}
				}
			});
		} catch { /* ignore per-file errors */ }

		result.set(fp, {
			dynamicImportTargets: Array.from(dynamicTargets).slice(0, 20),
			callees: Array.from(externalCallees).slice(0, 20),
			symbolCount,
			maxCallDepth: 0, // call depth requires type resolution — skip for now
		});
	}

	return result;
}

// ── Main export ───────────────────────────────────────────────────────────────
export function buildCodebaseGraphV2(options: { scanDir: string; srcRoot: string; maxFiles: number }): ScanResultV2 {
	const { scanDir, srcRoot, maxFiles } = options;
	const startMs = Date.now();
	console.log(`[codebase-scanner-v2] scanning ${scanDir} (max ${maxFiles} files)...`);

	const filePaths = collectFiles(scanDir, maxFiles);

	// Build ts-morph AST map ONCE (pre-loads all files → no per-file hang)
	let tsMorphMap: ReturnType<typeof buildTsMorphMap>;
	let usedTsMorph = false;
	try {
		tsMorphMap = buildTsMorphMap(filePaths, srcRoot);
		usedTsMorph = tsMorphMap.size > 0;
	} catch (err) {
		console.warn('[codebase-scanner-v2] buildTsMorphMap failed, AST metrics will be empty:', (err as Error)?.message);
		tsMorphMap = new Map();
	}
	const fileRelSet = new Set(filePaths.map(f => relative(srcRoot, f).replace(/\\/g, '/')));

	const nodeMap = new Map<string, ScanNodeV2>();
	const edges: ScanEdge[] = [];
	let errorCount = 0;

	for (const fp of filePaths) {
		let src: string;
		try { src = readFileSync(fp, 'utf8'); } catch { continue; }

		const relPath = relative(srcRoot, fp).replace(/\\/g, '/');
		const nodeId = relPath.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_.-]/g, '_');

		try {
			const importSpecs = [...extractAll(RE_IMPORT, src), ...extractAll(RE_REEXPORT, src)];
			const dynSpecs = extractAll(RE_DYN_IMPORT, src);

			const exportNames = [
				...extractAll(RE_EXPORT_FN, src),
				...extractAll(RE_EXPORT_CLS, src),
				...extractAll(RE_EXPORT_VAR, src),
			];
			const funcNames = extractAll(RE_FN_NAME, src);

			const rawTables = [
				...extractAll(RE_TBL_FROM, src),
				...extractAll(RE_TBL_INS, src),
				...extractAll(RE_TBL_UPD, src),
				...extractAll(RE_TBL_DEL, src),
			];
			const usedTables = filterKnown(rawTables, KNOWN_TABLES);
			const publishedQueues = filterKnown(extractAll(RE_PUBLISH, src), KNOWN_QUEUES);
			const consumedQueues = filterKnown(extractAll(RE_CONSUME, src), KNOWN_QUEUES);
			const fetchedRoutes = Array.from(new Set(extractAll(RE_FETCH, src))).slice(0, 20);
			const usesNative = RE_NATIVE.test(src);

			const lineCount = src.split('\n').length;
			const fileSize = src.length;
			const complexity = (src.match(RE_BRANCH) ?? []).length;
			const classCount = (src.match(RE_CLASS) ?? []).length;

			// 20-step audit metrics (12 new) — O(1) lookup from pre-built AST map
			const { dynamicImportTargets, callees, symbolCount, maxCallDepth } =
				tsMorphMap.get(fp) ?? { dynamicImportTargets: [], callees: [], symbolCount: 0, maxCallDepth: 0 };

			nodeMap.set(relPath, {
				id: nodeId,
				label: basename(fp),
				nodeLabel: getNodeLabel(relPath),
				type: classifyType(relPath),
				filePath: 'src/' + relPath,
				cluster: deriveCluster(relPath),
				lineCount,
				fileSize,
				complexity,
				classCount,
				importCount: importSpecs.length,
				exportCount: exportNames.length,
				exports: exportNames.slice(0, 20),
				functions: funcNames.slice(0, 20),
				usedTables,
				publishedQueues,
				consumedQueues,
				fetchedRoutes,
				usesNative,
				hasDynamicImports: dynSpecs.length > 0,

				// 20-step new metrics
				dynamicImportTargets,
				callees,
				hasErrorHandling: RE_TRY_CATCH.test(src),
				hasAuthGuard: RE_AUTH_GUARD.test(src),
				hasZodValidation: RE_ZOD.test(src),
				hasCachePattern: RE_CACHE.test(src),
				isSseEndpoint: RE_SSE.test(src),
				isWorkerBoundary: RE_WORKER.test(src),
				isRouteFile: /\+(?:page|layout|server)\.(?:ts|js|svelte)$/.test(fp),
				routeType: getRouteType(relPath),
				symbolCount,
				maxCallDepth
			});

			// Static IMPORTS edges
			for (const spec of importSpecs) {
				const t = resolveImport(spec, fp, srcRoot);
				if (!t) continue;
				for (const cand of [t, t + '.ts', t + '.js', t + '/index.ts', t + '/+server.ts', t + '/+page.server.ts']) {
					if (fileRelSet.has(cand) || nodeMap.has(cand)) {
						edges.push({
							source: nodeId,
							target: cand.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_.-]/g, '_'),
							type: 'IMPORTS',
						});
						break;
					}
				}
			}

			// DYNAMIC_IMPORTS edges (from dynamicImportTargets)
			for (const target of dynamicImportTargets) {
				for (const cand of [target, target + '.ts', target + '.js', target + '/index.ts']) {
					if (fileRelSet.has(cand) || nodeMap.has(cand)) {
						edges.push({
							source: nodeId,
							target: cand.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_.-]/g, '_'),
							type: 'DYNAMIC_IMPORTS',
						});
						break;
					}
				}
			}
		} catch (err) {
			console.error(`[codebase-scanner-v2] error processing ${relPath}:`, (err as Error)?.message);
			errorCount++;
		}
	}

	const nodes = Array.from(nodeMap.values());
	const nodeIdSet = new Set(nodes.map(n => n.id));

	const edgeSet = new Set<string>();
	const validEdges = edges
		.filter(e => {
			const key = e.type + ':' + e.source + '>' + e.target;
			if (edgeSet.has(key)) return false;
			edgeSet.add(key);
			return true;
		})
		.filter(e => nodeIdSet.has(e.source) && nodeIdSet.has(e.target));

	const labelCounts: Record<string, number> = {};
	for (const n of nodes) labelCounts[n.nodeLabel] = (labelCounts[n.nodeLabel] ?? 0) + 1;
	const edgeTypeCounts: Record<string, number> = {};
	for (const e of validEdges) edgeTypeCounts[e.type] = (edgeTypeCounts[e.type] ?? 0) + 1;

	const ms = Date.now() - startMs;
	console.log(`[codebase-scanner-v2] done: ${nodes.length} nodes, ${validEdges.length} edges, ${errorCount} errors in ${ms}ms`);

	return {
		nodes,
		edges: validEdges,
		metadata: {
			totalNodes: nodes.length,
			totalEdges: validEdges.length,
			labelCounts,
			edgeTypeCounts,
			nodesWithErrors: errorCount,
			scanTimeMs: ms,
			maxFiles,
			generatedAt: new Date().toISOString(),
			scanMethod: usedTsMorph ? 'ts-morph' : 'regex-fallback'
		},
	};
}
