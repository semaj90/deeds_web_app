/**
 * AST Graph Worker — offloads ts-morph scanning to a worker thread.
 *
 * Protocol: receives { taskId, type: 'ast-graph', payload: { scanDir, maxFiles } }
 *           sends back { taskId, result: { nodes, edges, metadata } }
 *
 * This worker handles CPU-intensive TypeScript AST parsing to avoid
 * blocking the Node.js event loop during graph generation.
 */
import { parentPort } from 'worker_threads';
import { resolve, relative, basename, dirname, extname } from 'path';
import { readdirSync, statSync } from 'fs';

/** @param {string} relPath */
function classifyFile(relPath) {
	if (relPath.includes('/routes/api/') || relPath.includes('+server.ts')) return 'api';
	if (relPath.includes('/routes/')) return 'route';
	if (relPath.includes('/stores/') || relPath.includes('.svelte.ts')) return 'store';
	if (relPath.includes('/components/')) return 'component';
	if (relPath.includes('/server/') || relPath.includes('/services/')) return 'service';
	return 'util';
}

/** @param {string} relPath */
function deriveCluster(relPath) {
	if (relPath.startsWith('routes/api/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `api-${parts[2]}` : 'api';
	}
	if (relPath.startsWith('routes/(app)/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `app-${parts[2]}` : 'app';
	}
	if (relPath.startsWith('routes/')) return 'routes';
	if (relPath.startsWith('lib/components/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `comp-${parts[2]}` : 'components';
	}
	if (relPath.startsWith('lib/stores/')) return 'stores';
	if (relPath.startsWith('lib/server/')) {
		const parts = relPath.split('/');
		return parts.length >= 4 ? `server-${parts[2]}` : 'server';
	}
	if (relPath.startsWith('lib/ai/')) return 'ai';
	return 'lib';
}

/**
 * @param {string} dir
 * @param {number} maxFiles
 * @returns {string[]}
 */
function collectFiles(dir, maxFiles) {
	const files = [];
	function walk(d) {
		if (files.length >= maxFiles) return;
		let entries;
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
				if (['.ts', '.js', '.mts'].includes(ext) && !entry.endsWith('.d.ts')) {
					files.push(full);
				}
			}
		}
	}
	walk(dir);
	return files;
}

/**
 * @param {string} importSpec
 * @param {string} fromFile
 * @param {string} srcRoot
 * @returns {string|null}
 */
function resolveImportPath(importSpec, fromFile, srcRoot) {
	if (importSpec.startsWith('$lib/')) {
		return 'lib/' + importSpec.slice(5).replace(/\.js$/, '');
	}
	if (importSpec.startsWith('$') || importSpec.startsWith('@')) return null;
	if (importSpec.startsWith('.')) {
		const fromDir = dirname(relative(srcRoot, fromFile));
		const resolved = resolve(srcRoot, fromDir, importSpec).replace(/\.js$/, '');
		const rel = relative(srcRoot, resolved).replace(/\\/g, '/');
		if (rel.startsWith('..')) return null;
		return rel;
	}
	return null;
}

/**
 * Build the AST graph using ts-morph.
 * @param {{ scanDir: string, srcRoot: string, maxFiles: number }} opts
 */
async function buildGraph({ scanDir, srcRoot, maxFiles }) {
	const startMs = Date.now();

	// Dynamic import ts-morph (heavy module)
	const { Project, SyntaxKind } = await import('ts-morph');

	const filePaths = collectFiles(scanDir, maxFiles);

	const project = new Project({
		skipAddingFilesFromTsConfig: true,
		compilerOptions: { allowJs: true, noEmit: true, skipLibCheck: true }
	});

	const nodeMap = new Map();
	const edges = [];

	for (const fp of filePaths) {
		let sourceFile;
		try { sourceFile = project.addSourceFileAtPath(fp); } catch { continue; }

		const relPath = relative(srcRoot, fp).replace(/\\/g, '/');
		const nodeId = relPath.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_-]/g, '_');

		// Extract exports
		const exportNames = [];
		for (const fn of sourceFile.getFunctions()) {
			if (fn.isExported()) exportNames.push(fn.getName() ?? '');
		}
		for (const cls of sourceFile.getClasses()) {
			if (cls.isExported()) exportNames.push(cls.getName() ?? '');
		}
		for (const vd of sourceFile.getVariableDeclarations()) {
			const stmt = vd.getFirstAncestorByKind(SyntaxKind.VariableStatement);
			if (stmt?.isExported()) exportNames.push(vd.getName());
		}

		// Extract function names
		const funcNames = [];
		for (const fn of sourceFile.getFunctions()) {
			const name = fn.getName();
			if (name) funcNames.push(name);
		}

		// Extract import specifiers
		const importPaths = [];
		for (const imp of sourceFile.getImportDeclarations()) {
			importPaths.push(imp.getModuleSpecifierValue());
		}

		// Compute richer metadata
		const fullText = sourceFile.getFullText();
		const lineCount = fullText.split('\n').length;
		const fileSize = fullText.length;

		// Estimate cyclomatic complexity: count branching keywords
		const branchKeywords = fullText.match(/\b(if|else|for|while|switch|case|catch|&&|\|\||\?)\b/g);
		const complexity = branchKeywords ? branchKeywords.length : 0;

		// Count classes
		const classCount = sourceFile.getClasses().length;

		nodeMap.set(relPath, {
			id: nodeId,
			label: basename(fp),
			type: classifyFile(relPath),
			errorCount: 0, // Skip diagnostics in worker for speed
			filePath: 'src/' + relPath,
			cluster: deriveCluster(relPath),
			imports: importPaths.slice(0, 20),
			exports: exportNames.filter(Boolean).slice(0, 20),
			functions: funcNames.slice(0, 20),
			// Extended metadata
			lineCount,
			fileSize,
			complexity,
			classCount,
			importCount: importPaths.length,
			exportCount: exportNames.filter(Boolean).length,
		});

		// Build edges
		for (const spec of importPaths) {
			const targetRel = resolveImportPath(spec, fp, srcRoot);
			if (!targetRel) continue;
			const candidates = [
				targetRel,
				targetRel + '.ts',
				targetRel + '/index.ts',
				targetRel + '/+server.ts',
				targetRel + '/+page.server.ts'
			];
			for (const cand of candidates) {
				if (nodeMap.has(cand) || filePaths.some(f => relative(srcRoot, f).replace(/\\/g, '/') === cand)) {
					const targetId = cand.replace(/\.(ts|js|mts)$/, '').replace(/[^a-zA-Z0-9/_-]/g, '_');
					edges.push({ source: nodeId, target: targetId, type: 'import' });
					break;
				}
			}
		}

		try { project.removeSourceFile(sourceFile); } catch { /* ok */ }
	}

	const nodes = Array.from(nodeMap.values());

	// Deduplicate edges
	const edgeSet = new Set();
	const uniqueEdges = edges.filter(e => {
		const key = `${e.source}→${e.target}`;
		if (edgeSet.has(key)) return false;
		edgeSet.add(key);
		return true;
	});

	const nodeIds = new Set(nodes.map(n => n.id));
	const validEdges = uniqueEdges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));

	return {
		nodes,
		edges: validEdges,
		metadata: {
			totalNodes: nodes.length,
			totalEdges: validEdges.length,
			nodesWithErrors: 0,
			scanTimeMs: Date.now() - startMs,
			maxFiles,
			generatedAt: new Date().toISOString()
		}
	};
}

// ── Message Handler ──────────────────────────────────────────
parentPort?.on('message', async (msg) => {
	const { taskId, type, payload } = msg;

	if (type !== 'ast-graph') {
		parentPort?.postMessage({ taskId, error: `Unknown task type: ${type}` });
		return;
	}

	try {
		const result = await buildGraph(payload);
		parentPort?.postMessage({ taskId, result });
	} catch (err) {
		parentPort?.postMessage({ taskId, error: String(err) });
	}
});
