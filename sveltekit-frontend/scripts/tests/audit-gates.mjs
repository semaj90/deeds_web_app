import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { buildDeepAuditSourceInventoryV1, classifyG4RouteV1, classifyG5WithImportedValidationV1, classifyG63ModelReferenceV1, resolveApiGuardEvidenceV1 } from '../lib/deep-audit-source-inventory-v1.mjs';

const ROOT = process.cwd();
const gate = process.argv.find((arg) => arg.startsWith('--gate='))?.split('=')[1]?.toUpperCase();

async function importedValidationRefs(source, routePath) {
	const refs = [];
	const imports = source.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g);
	for (const match of imports) {
		const [, names, specifier] = match;
		const moduleSourcePath = specifier.startsWith('$lib/')
			? resolve(ROOT, 'src/lib', specifier.slice('$lib/'.length))
			: specifier.startsWith('.')
				? resolve(ROOT, dirname(routePath), specifier)
				: null;
		if (!moduleSourcePath) continue;
		const candidates = /\.js$/.test(moduleSourcePath)
			? [moduleSourcePath.replace(/\.js$/, '.ts'), moduleSourcePath]
			: /\.[cm]?tsx?$/.test(moduleSourcePath)
				? [moduleSourcePath]
				: [`${moduleSourcePath}.ts`, `${moduleSourcePath}.js`, resolve(moduleSourcePath, 'index.ts')];
		let modulePath;
		let moduleSource;
		for (const candidate of candidates) {
			try { moduleSource = await readFile(candidate, 'utf8'); modulePath = candidate; break; } catch { /* try the next conventional extension */ }
		}
		if (!modulePath || !/\.(?:safeParse|parse)\s*\(/.test(moduleSource)) continue;
		for (const entry of names.split(',')) {
			const pair = entry.trim().match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
			if (!pair) continue;
			const [, exportedName, localName = exportedName] = pair;
			if (!/(?:parse|valid|schema|receipt)/i.test(exportedName)) continue;
			if (!new RegExp(`\\b${localName}\\s*\\(`).test(source)) continue;
			if (!new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let)\\s+${exportedName}\\b`).test(moduleSource)) continue;
			refs.push(`${modulePath.replaceAll('\\', '/')}#${exportedName}`);
		}
	}
	return refs;
}

async function runSourceGate() {
	const inventory = await buildDeepAuditSourceInventoryV1({ frontendRoot: ROOT });
	const entries = inventory.liveSource.files.filter(({ path }) => gate === 'G63'
		? (/^src\/routes\/api\//.test(path) && /(?:chat|synth|llm|model|gemma)/i.test(path) || /^src\/lib\/server\/(?:ai|features\/ai)\//.test(path)) && /\.(?:ts|tsx|js|jsx|mjs|cjs|svelte)$/.test(path) && !/(?:\.spec|\.test)\./.test(path)
		: path.startsWith('src/routes/api/') && /\+server\.(?:ts|js|mjs)$/.test(path));
	const hooksSource = gate === 'G4' ? await readFile(resolve(ROOT, 'src/hooks.server.ts'), 'utf8') : '';
	const accessSource = gate === 'G4' ? await readFile(resolve(ROOT, 'src/lib/server/auth/api-route-access.ts'), 'utf8') : '';
	const apiGuardEvidence = gate === 'G4' ? resolveApiGuardEvidenceV1({ hookSource: hooksSource, accessSource }) : null;
	const reports = [];
	for (const entry of entries) {
		const source = await readFile(resolve(ROOT, entry.path), 'utf8');
		if (gate === 'G63') {
			const refs = [...source.matchAll(/gemma4/gi)];
			if (refs.length === 0 && !/gemma4/i.test(entry.path)) continue;
			if (refs.length === 0) {
				reports.push(classifyG63ModelReferenceV1({ path: entry.path, source }));
			} else {
				for (const ref of refs) {
					const start = Math.max(0, ref.index - 120);
					const end = Math.min(source.length, ref.index + ref[0].length + 120);
					reports.push(classifyG63ModelReferenceV1({ path: entry.path, source, context: source.slice(start, end) }));
				}
			}
			continue;
		}
		const hasHandler = /export\s+(?:const|async\s+function|function)\s+(?:GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b/.test(source);
		if (!hasHandler) continue;
		if (gate === 'G4') {
			const routePath = entry.path.slice('src/routes'.length).replace(/\/\+server\.(?:ts|js|mjs)$/, '');
			const isPublic = apiGuardEvidence?.publicPrefixes.some((prefix) => routePath === prefix || routePath.startsWith(`${prefix}/`)) ?? false;
			const inheritedGuardRefs = apiGuardEvidence?.verified && !isPublic
				? apiGuardEvidence.guardRefs
				: [];
			reports.push(classifyG4RouteV1({ path: entry.path, source, publicRoute: isPublic, inheritedGuardRefs }));
		} else {
			const parsesBody = /request\.(?:json|formData|text|arrayBuffer|blob)\s*\(/.test(source);
			const trpcProcedure = /\.input\s*\(/.test(source) || /trpc/i.test(source);
			const inheritedValidationRefs = await importedValidationRefs(source, entry.path);
			const result = classifyG5WithImportedValidationV1({ path: entry.path, source, parsesBody, trpcProcedure, importedValidationRefs: inheritedValidationRefs });
			if (result.classification !== 'NOT_APPLICABLE') reports.push(result);
		}
	}
	const classes = gate === 'G63'
		? ['STALE_LABEL', 'REAL_GEMMA4_ARTIFACT', 'HARDCODED_MODEL_ID', 'NEEDS_MANUAL_REVIEW']
		: ['VERIFIED_PASS', 'VERIFIED_FAIL', 'NEEDS_MANUAL_REVIEW', 'PUBLIC', 'NOT_APPLICABLE'];
	const counts = Object.fromEntries(classes.map((status) => [status, reports.filter((row) => row.classification === status).length]));
	const passed = gate === 'G63'
		? counts.REAL_GEMMA4_ARTIFACT
		: counts.VERIFIED_PASS + counts.PUBLIC;
	const failed = gate === 'G63' ? counts.HARDCODED_MODEL_ID : counts.VERIFIED_FAIL;
	const warned = gate === 'G63'
		? counts.STALE_LABEL + counts.NEEDS_MANUAL_REVIEW
		: counts.NEEDS_MANUAL_REVIEW;
	const result = {
		schema: 'atlas.deep-audit-gate-classification.v1',
		gate,
		status: 'PROVISIONAL',
		inventorySha256: inventory.liveSource.inventorySha256,
		graphFreshness: inventory.freshness,
		admission: inventory.admission,
		denominator: reports.length,
		gateSummary: { attempted: reports.length, passed, warned, failed, notRun: 0 },
		counts,
		...(process.argv.includes('--summary') ? {} : { findings: reports })
	};
	process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	if (counts.VERIFIED_FAIL > 0) process.exitCode = 1;
}

if (gate === 'G4' || gate === 'G5' || gate === 'G63') {
	runSourceGate().catch((error) => {
		console.error(`[audit-gates] ${gate} source classification failed:`, error);
		process.exitCode = 2;
	});
} else {
	console.error('Supported source-verified gates: --gate=G4, --gate=G5, or --gate=G63. Other gate readers must provide their own currentness proof.');
	process.exitCode = 2;
}
