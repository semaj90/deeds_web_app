import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { promisify } from 'node:util';
import { isAbsolute, normalize, relative, resolve, sep } from 'node:path';

const execFileAsync = promisify(execFile);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.svelte', '.css', '.scss', '.json']);
const EXCLUDED_SEGMENTS = new Set(['backup', 'backups', 'archive', 'archives', 'generated', 'build', 'dist', '.svelte-kit']);
const GRAPH_RELATIVE_PATH = 'docs/graph/codebase-graph.json';
const FRESHNESS_MS = 24 * 60 * 60 * 1000;

function normalizeRepoPath(input) {
	let value = String(input ?? '').replaceAll('\\', '/').replace(/^\.\//, '');
	value = value.replace(/^sveltekit-frontend\//, '');
	value = normalize(value).replaceAll('\\', '/');
	if (value.startsWith('../') || value === '..' || isAbsolute(value)) return null;
	if (!value.startsWith('src/')) return null;
	if (value.split('/').some((segment) => EXCLUDED_SEGMENTS.has(segment.toLowerCase()))) return null;
	if (/\.(bak|backup|old|orig|tmp)$/i.test(value)) return null;
	return value;
}

function graphFiles(graph) {
	const files = Array.isArray(graph) ? graph : graph?.files;
	if (!Array.isArray(files)) return [];
	return [...new Set(files.map((file) => normalizeRepoPath(file?.rel ?? file?.path ?? file)).filter(Boolean))].sort();
}

export async function buildDeepAuditSourceInventoryV1({ frontendRoot, now = new Date() }) {
	const root = resolve(frontendRoot);
	const { stdout } = await execFileAsync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src'], { cwd: root, maxBuffer: 32 * 1024 * 1024 });
	const paths = [...new Set(stdout.split(/\r?\n/).map(normalizeRepoPath).filter(Boolean))]
		.filter((path) => SOURCE_EXTENSIONS.has(resolveExtension(path)))
		.sort();
	const entries = [];
	for (const path of paths) {
		const bytes = await readFile(resolve(root, path));
		entries.push({ path, byteLength: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
	}
	const digest = createHash('sha256').update(entries.map((entry) => `${entry.path}\0${entry.byteLength}\0${entry.sha256}\n`).join('')).digest('hex');

	const graphPath = resolve(root, GRAPH_RELATIVE_PATH);
	const graphBytes = await readFile(graphPath).catch(() => null);
	let graph = null;
	let graphHash = null;
	let graphMtime = null;
	let declaredSourceRevision = null;
	let graphPaths = [];
	if (graphBytes) {
		graphHash = createHash('sha256').update(graphBytes).digest('hex');
		graph = JSON.parse(graphBytes.toString('utf8'));
		graphPaths = graphFiles(graph);
		const info = await stat(graphPath);
		graphMtime = info.mtime.toISOString();
		declaredSourceRevision = graph?.sourceRevision ?? graph?.workspaceRevision ?? graph?.metadata?.sourceRevision ?? null;
	}
	const ageMs = graphMtime ? Math.max(0, now.getTime() - Date.parse(graphMtime)) : null;
	const livePaths = new Set(entries.map((entry) => entry.path));
	const indexedPaths = new Set(graphPaths);
	const missingFromGraph = [...livePaths].filter((path) => !indexedPaths.has(path)).sort();
	const absentFromLiveTree = [...indexedPaths].filter((path) => !livePaths.has(path)).sort();
	const freshness = !graph
		? 'BLOCKED'
		: ageMs > FRESHNESS_MS || missingFromGraph.length > 0 || absentFromLiveTree.length > 0
			? 'STALE'
			: 'PROVISIONAL';

	return {
		schema: 'atlas.deep-audit-source-inventory.v1',
		generatedAt: now.toISOString(),
		workspace: 'sveltekit-frontend',
		inventoryStatus: 'PROVISIONAL',
		freshness,
		admission: 'BLOCKED_NO_MATCHING_ADMITTED_SNAPSHOT_RECEIPT',
		canonicalGraph: {
			path: GRAPH_RELATIVE_PATH,
			sha256: graphHash,
			mtime: graphMtime,
			ageMs,
			declaredSourceRevision,
			fileCount: graphPaths.length
		},
		liveSource: { fileCount: entries.length, inventorySha256: digest, files: entries },
		comparison: {
			missingFromGraph,
			absentFromLiveTree,
			missingFromGraphCount: missingFromGraph.length,
			absentFromLiveTreeCount: absentFromLiveTree.length
		},
		gateCounts: null,
		gateCountStatus: 'NOT_RUN_SOURCE_INVENTORY_ONLY'
	};
}

function resolveExtension(path) {
	const filename = path.slice(path.lastIndexOf('/') + 1);
	const dot = filename.lastIndexOf('.');
	return dot < 0 ? '' : filename.slice(dot).toLowerCase();
}

export function classifyG4RouteV1({ path, source = '', inheritedGuardRefs = [], publicRoute = false, dependencyInventoryComplete = false }) {
	const normalized = normalizeRepoPath(path) ?? String(path ?? '').replaceAll('\\', '/');
	if (publicRoute || /(?:^|\/)\.well-known(?:\/|$)|(?:^|\/)api\/auth(?:\/|$)|(?:^|\/)api\/health(?:\/|$)/.test(normalized)) {
		return { classification: 'PUBLIC', path: normalized, guardRefs: [], reason: 'Explicit public route class; input validation and rate limits remain separate checks.' };
	}
	const directPatterns = [
		/if\s*\(\s*!\s*(?:event\.)?locals\.user\s*\)[\s\S]{0,180}?\b(?:return|throw)\b/,
		/if\s*\(\s*!\s*locals\.user\?\.id\s*\)[\s\S]{0,180}?\b(?:return|throw)\b/,
		/\b(?:await\s+)?requireAdmin\s*\(/,
		/\b(?:await\s+)?requireAuth\s*\(/,
		/\b(?:await\s+)?authorizeCase\s*\(/,
		/\bgetAuthorizedCase\s*\(/ 
	];
	const direct = directPatterns.map((pattern) => pattern.exec(source)).filter(Boolean).sort((a, b) => a.index - b.index)[0];
	if (direct) {
		const firstRead = /\b(?:db|tx)\.(?:select|query|execute|insert|update|delete)\b|\b(?:findFirst|findMany)\s*\(/.exec(source);
		if (!firstRead || direct.index < firstRead.index) {
			return { classification: 'VERIFIED_PASS', path: normalized, guardRefs: [`${normalized}#${direct[0]}`], reason: 'Recognized authorization check appears before the first locally visible database read.' };
		}
	}
	if (inheritedGuardRefs.length > 0) return { classification: 'VERIFIED_PASS', path: normalized, guardRefs: inheritedGuardRefs, reason: 'Caller supplied an explicit inherited-guard proof reference.' };
	if (dependencyInventoryComplete) return { classification: 'VERIFIED_FAIL', path: normalized, guardRefs: [], reason: 'Complete route and inherited-guard inventory found no applicable authorization guard.' };
	return { classification: 'NEEDS_MANUAL_REVIEW', path: normalized, guardRefs: [], reason: 'Static source alone cannot establish whether a wrapper, hook, or route-group guard applies.' };
}

export function classifyG5HandlerV1({ path, source = '', parsesBody = false, trpcProcedure = false }) {
	const normalized = normalizeRepoPath(path) ?? String(path ?? '').replaceAll('\\', '/');
	if (!parsesBody && !trpcProcedure) return { classification: 'NOT_APPLICABLE', path: normalized, validationRefs: [], reason: 'No request body or typed procedure input was identified.' };
	const patterns = [
		/\.safeParse\s*\(/,
		/\b(?:z\.)?object\s*\([\s\S]{0,180}?\)\.parse\s*\(/,
		/\b[A-Za-z_$][\w$]*\s*=\s*z\.object\s*\([\s\S]{0,500}?\)[\s\S]{0,180}?\b[A-Za-z_$][\w$]*\.parse\s*\(/,
		/\b[A-Za-z_$][\w$]*(?:Schema|schema)\.parse\s*\(/,
		/\.input\s*\(\s*(?:z\.|[A-Za-z_$][\w$]*Schema)/,
		/validate(?:d|Body|Request)\s*\(/,
		/parse(?:d|Body|Request)\s*\(/i
	];
	const match = patterns.map((pattern) => pattern.exec(source)).find(Boolean);
	if (match) return { classification: 'VERIFIED_PASS', path: normalized, validationRefs: [`${normalized}#${match[0]}`], reason: 'Recognized schema or validated-wrapper call is present.' };
	return { classification: 'NEEDS_MANUAL_REVIEW', path: normalized, validationRefs: [], reason: 'No local schema call was found; router-level or trusted-wrapper validation may still apply.' };
}

export function classifyG5WithImportedValidationV1({ path, source = '', parsesBody = false, trpcProcedure = false, importedValidationRefs = [] }) {
	const local = classifyG5HandlerV1({ path, source, parsesBody, trpcProcedure });
	if (local.classification === 'VERIFIED_PASS' || local.classification === 'NOT_APPLICABLE') return local;
	if (importedValidationRefs.length > 0) {
		return {
			...local,
			classification: 'VERIFIED_PASS',
			validationRefs: importedValidationRefs,
			reason: 'The handler calls an imported validator whose implementation applies a schema check.'
		};
	}
	return local;
}

export function classifyG63ModelReferenceV1({ path, source = '', context = source }) {
	const normalized = normalizeRepoPath(path) ?? String(path ?? '').replaceAll('\\', '/');
	const artifact = /gemma4:e\d+b|gemma4[^\n]{0,80}(?:artifact|weights?|\.gguf|\.safetensors)|(?:8085|vlm)[^\n]{0,80}gemma4/i.exec(context);
	if (artifact) return { classification: 'REAL_GEMMA4_ARTIFACT', path: normalized, evidenceRef: `${normalized}#${artifact[0]}`, reason: 'Reference identifies a model artifact, weights, VLM endpoint, or stored artifact identity.' };
	const literal = /\bmodel\s*:\s*['"`]gemma4[^'"`]*['"`]/i.exec(context);
	if (literal) return { classification: 'HARDCODED_MODEL_ID', path: normalized, evidenceRef: `${normalized}#${literal[0]}`, reason: 'A literal Gemma4 model ID is assigned to a model field.' };
	const resolver = /(?:resolve[A-Za-z]*Model|llamaServerModelResolver|SERVER_CHAT_MODEL)\b/.exec(source);
	if (resolver) return { classification: 'STALE_LABEL', path: normalized, evidenceRef: `${normalized}#${resolver[0]}`, reason: 'Gemma4 appears as a label/path while model selection is routed through the configured resolver.' };
	return { classification: 'NEEDS_MANUAL_REVIEW', path: normalized, evidenceRef: null, reason: 'A Gemma4 reference exists, but this source does not establish whether it is a label, artifact, or selected model ID.' };
}

export function resolveApiGuardEvidenceV1({ hookSource = '', accessSource = '' }) {
	const hookAppliesToApi = /if\s*\(\s*event\.url\.pathname\.startsWith\(['"]\/api\/['"]\)\s*\)/.test(hookSource)
		&& /evaluateApiRouteAccess\(path,\s*event\.locals\.user\)/.test(hookSource);
	const denyByDefault = /if\s*\(!user\)\s*return\s*\{\s*status:\s*401/.test(accessSource);
	const publicBlock = accessSource.match(/const\s+PUBLIC_API_PREFIXES\s*=\s*\[([\s\S]*?)\]\s+as\s+const/);
	const publicPrefixes = publicBlock ? [...publicBlock[1].matchAll(/['"]([^'"]+)['"]/g)].map((match) => match[1]) : [];
	const verified = hookAppliesToApi && denyByDefault && publicPrefixes.length > 0;
	return {
		verified,
		guardRefs: verified ? ['src/hooks.server.ts#evaluateApiRouteAccess', 'src/lib/server/auth/api-route-access.ts#evaluateApiRouteAccess'] : [],
		publicPrefixes
	};
}
