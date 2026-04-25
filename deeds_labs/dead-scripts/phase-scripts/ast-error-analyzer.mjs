#!/usr/bin/env node
/**
 * Phase 72 - AST-Based Error Analyzer
 *
 * Uses ts-morph to perform deep code analysis:
 * - Import/export graph mapping
 * - Type relationship analysis
 * - Symbol resolution and usage tracking
 * - Scope and dependency analysis
 * - Dead code detection
 * - Circular dependency detection
 *
 * Usage:
 *   npm install --save-dev ts-morph
 *   node scripts/ast-error-analyzer.mjs --file src/lib/auth/auth-store.ts
 *   node scripts/ast-error-analyzer.mjs --dir src/lib/services
 *   node scripts/ast-error-analyzer.mjs --graph import-graph.json
 */

import fs from 'fs';
import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse arguments
const args = process.argv.slice(2);
const fileArg = args.includes('--file') ? args[args.indexOf('--file') + 1] : null;
const dirArg = args.includes('--dir') ? args[args.indexOf('--dir') + 1] : null;
const errorsArg = args.includes('--errors') ? args[args.indexOf('--errors') + 1] : null;
const graphOutput = args.includes('--graph') ? args[args.indexOf('--graph') + 1] : 'ast-analysis.json';

console.log('🔍 Phase 72 - AST-Based Error Analyzer\n');

// Initialize ts-morph project
const project = new Project({
	tsConfigFilePath: path.join(__dirname, '..', 'tsconfig.json'),
	skipAddingFilesFromTsConfig: false
});

/**
 * Recursively find Svelte files
 */
function findSvelteFiles(dir, fileList = []) {
	const files = fs.readdirSync(dir);
	files.forEach(file => {
		const filePath = path.join(dir, file);
		const stat = fs.statSync(filePath);
		if (stat.isDirectory()) {
			if (file !== 'node_modules' && file !== '.svelte-kit' && file !== '.git') {
				findSvelteFiles(filePath, fileList);
			}
		} else {
			if (file.endsWith('.svelte')) {
				fileList.push(filePath);
			}
		}
	});
	return fileList;
}

/**
 * Add Svelte files to project as virtual TS files
 */
function addSvelteFiles(project, searchDir) {
	const svelteFiles = findSvelteFiles(searchDir);
	let added = 0;
	svelteFiles.forEach(file => {
		try {
			const content = fs.readFileSync(file, 'utf-8');
			// Extract script content
			const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
			if (scriptMatch) {
				const scriptContent = scriptMatch[1];
				// Create virtual file with .ts extension so ts-morph processes it
				// We append .ts to the original path
				project.createSourceFile(file + '.ts', scriptContent, { overwrite: true });
				added++;
			}
		} catch (e) {
			// Ignore read errors
		}
	});
	if (added > 0) {
		console.log(`   ➕ Added ${added} Svelte files (virtual TS)`);
	}
}

/**
 * Load external errors from JSONL file
 */
function loadExternalErrors(filePath) {
	if (!fs.existsSync(filePath)) return;

	const absPath = path.isAbsolute(filePath) ? filePath : path.join(__dirname, '..', filePath);
	if (!fs.existsSync(absPath)) return;

	console.log(`   📥 Loading external errors from ${filePath}`);
	const content = fs.readFileSync(absPath, 'utf-8');
	const lines = content.split('\n');
	let count = 0;

	lines.forEach(line => {
		if (!line.trim()) return;
		try {
			const error = JSON.parse(line);
			// Normalize path
			let normalizedPath = error.file.replace(/\\/g, '/');

			// Handle relative paths
			if (!path.isAbsolute(normalizedPath) && !normalizedPath.startsWith('src')) {
				// Try to resolve relative to project root
			}

			// If it's a svelte file, our analysis key might have .ts appended
			// But wait, analyzeFile uses sourceFile.getFilePath() which comes from ts-morph
			// If we created it as file.svelte.ts, the key is file.svelte.ts

			// Try exact match first
			let targetKey = null;

			// Check if we have this file in our analysis
			// We need to check relative paths
			const projectRoot = path.join(__dirname, '..').replace(/\\/g, '/');

			// Convert error path to absolute if needed, then relative to root
			let absErrorPath = path.isAbsolute(normalizedPath)
				? normalizedPath
				: path.join(projectRoot, normalizedPath).replace(/\\/g, '/');

			// Try to find a matching key in analysis.files
			// analysis.files keys are absolute paths from ts-morph

			// Direct match
			if (analysis.files[absErrorPath]) {
				targetKey = absErrorPath;
			}
			// Svelte match (error says .svelte, analysis says .svelte.ts)
			else if (analysis.files[absErrorPath + '.ts']) {
				targetKey = absErrorPath + '.ts';
			}
			// Try relative match
			else {
				// Iterate keys to find suffix match
				const keys = Object.keys(analysis.files);
				const match = keys.find(k => k.endsWith(normalizedPath) || k.endsWith(normalizedPath + '.ts'));
				if (match) targetKey = match;
			}

			if (targetKey && analysis.files[targetKey]) {
				analysis.files[targetKey].errors.push({
					line: error.line,
					code: error.code || 'EXTERNAL',
					message: error.message,
					category: 1,
					source: error.tool
				});
				count++;
			}
		} catch (e) {}
	});
	console.log(`   ✅ Mapped ${count} external errors to graph`);
}


const analysis = {
	timestamp: new Date().toISOString(),
	files: {},
	importGraph: {},
	typeRelationships: {},
	circularDependencies: [],
	unusedExports: [],
	undeclaredImports: [],
	// Knowledge base formats for graph-to-tree analysis
	knowledgeBase: {
		nodes: [],        // Graph nodes (files, types, symbols)
		edges: [],        // Relationships (imports, extends, implements)
		trees: [],        // Hierarchical structures (directory tree, type hierarchy)
		clusters: []      // Semantic groupings (by domain, by feature)
	},
	stats: {
		totalFiles: 0,
		totalImports: 0,
		totalExports: 0,
		totalSymbols: 0,
		circularDeps: 0,
		totalNodes: 0,
		totalEdges: 0
	}
};

/**
 * Build knowledge base graph structure
 */
function buildKnowledgeBaseGraph() {
	console.log('\n🧠 Building knowledge base graph...');

	const nodeMap = new Map();
	let nodeId = 0;

	// Create nodes for each file
	Object.entries(analysis.files).forEach(([filePath, fileData]) => {
		const node = {
			id: nodeId++,
			type: 'file',
			label: filePath,
			path: filePath,
			metadata: {
				importCount: fileData.imports.length,
				exportCount: fileData.exports.length,
				symbolCount: fileData.symbols.length,
				errorCount: fileData.errors.length
			}
		};
		nodeMap.set(filePath, node);
		analysis.knowledgeBase.nodes.push(node);
	});

	// Create edges for imports
	Object.entries(analysis.importGraph).forEach(([source, targets]) => {
		targets.forEach(target => {
			if (nodeMap.has(source)) {
				analysis.knowledgeBase.edges.push({
					source: nodeMap.get(source).id,
					target: target,
					type: 'imports',
					weight: 1
				});
			}
		});
	});

	// Build directory tree structure
	const tree = buildDirectoryTree(Array.from(nodeMap.keys()));
	analysis.knowledgeBase.trees.push({
		type: 'directory',
		root: tree
	});

	// Create semantic clusters by directory
	const clusters = clusterByDirectory(Array.from(nodeMap.keys()));
	analysis.knowledgeBase.clusters = clusters;

	analysis.stats.totalNodes = analysis.knowledgeBase.nodes.length;
	analysis.stats.totalEdges = analysis.knowledgeBase.edges.length;

	console.log(`✅ Built knowledge graph: ${analysis.stats.totalNodes} nodes, ${analysis.stats.totalEdges} edges`);
}

/**
 * Build hierarchical directory tree
 */
function buildDirectoryTree(filePaths) {
	const root = { name: 'src', children: [] };

	filePaths.forEach(filePath => {
		const parts = filePath.split('/');
		let current = root;

		parts.forEach((part, idx) => {
			if (idx === parts.length - 1) {
				current.children = current.children || [];
				current.children.push({ name: part, path: filePath, type: 'file' });
			} else {
				let child = (current.children || []).find(c => c.name === part);
				if (!child) {
					child = { name: part, children: [], type: 'directory' };
					current.children = current.children || [];
					current.children.push(child);
				}
				current = child;
			}
		});
	});

	return root;
}

/**
 * Cluster files by directory structure
 */
function clusterByDirectory(filePaths) {
	const clusters = {};

	filePaths.forEach(filePath => {
		const dir = path.dirname(filePath);
		if (!clusters[dir]) {
			clusters[dir] = {
				name: dir,
				files: [],
				type: 'semantic-cluster'
			};
		}
		clusters[dir].files.push(filePath);
	});

	return Object.values(clusters);
}

/**
 * Export graph in multiple formats for adapters
 */
function exportKnowledgeBaseFormats(baseOutputPath) {
	const outputDir = path.dirname(baseOutputPath);
	const baseName = path.basename(baseOutputPath, '.json');

	// 1. Neo4j Cypher format
	const cypherPath = path.join(outputDir, `${baseName}.cypher`);
	const cypherStatements = [];

	analysis.knowledgeBase.nodes.forEach(node => {
		cypherStatements.push(
			`CREATE (n${node.id}:File {id: ${node.id}, path: "${node.path}", imports: ${node.metadata.importCount}, exports: ${node.metadata.exportCount}})`
		);
	});

	analysis.knowledgeBase.edges.forEach(edge => {
		cypherStatements.push(
			`MATCH (a:File {id: ${edge.source}}), (b) WHERE b.path = "${edge.target}" CREATE (a)-[:IMPORTS]->(b)`
		);
	});

	fs.writeFileSync(cypherPath, cypherStatements.join(';\n'));
	console.log(`   📊 Neo4j: ${cypherPath}`);

	// 2. D3.js hierarchical format
	const d3Path = path.join(outputDir, `${baseName}.d3.json`);
	const d3Format = {
		nodes: analysis.knowledgeBase.nodes,
		links: analysis.knowledgeBase.edges.map(e => ({
			source: e.source,
			target: e.target,
			type: e.type
		})),
		tree: analysis.knowledgeBase.trees[0]?.root
	};
	fs.writeFileSync(d3Path, JSON.stringify(d3Format, null, 2));
	console.log(`   🌳 D3.js: ${d3Path}`);

	// 3. Graphviz DOT format
	const dotPath = path.join(outputDir, `${baseName}.dot`);
	const dotLines = ['digraph ImportGraph {', '  rankdir=LR;', '  node [shape=box];'];

	analysis.knowledgeBase.nodes.forEach(node => {
		const label = node.path.split('/').pop();
		dotLines.push(`  n${node.id} [label="${label}"];`);
	});

	analysis.knowledgeBase.edges.forEach(edge => {
		const targetNode = analysis.knowledgeBase.nodes.find(n => n.path === edge.target);
		if (targetNode) {
			dotLines.push(`  n${edge.source} -> n${targetNode.id};`);
		}
	});

	dotLines.push('}');
	fs.writeFileSync(dotPath, dotLines.join('\n'));
	console.log(`   📈 Graphviz: ${dotPath}`);

	// 4. Tree adapter format (for RAG/KAG integration)
	const treePath = path.join(outputDir, `${baseName}.tree.json`);
	const treeFormat = {
		version: '1.0',
		metadata: {
			timestamp: analysis.timestamp,
			nodeCount: analysis.stats.totalNodes,
			edgeCount: analysis.stats.totalEdges
		},
		tree: analysis.knowledgeBase.trees[0],
		clusters: analysis.knowledgeBase.clusters,
		graph: {
			nodes: analysis.knowledgeBase.nodes,
			edges: analysis.knowledgeBase.edges
		}
	};
	fs.writeFileSync(treePath, JSON.stringify(treeFormat, null, 2));
	console.log(`   🔗 Tree Adapter: ${treePath}`);
}

/**
 * Analyze a single source file
 */
function analyzeFile(sourceFile) {
	const filePath = sourceFile.getFilePath().replace(/\\/g, '/');
	const relativePath = path.relative(path.join(__dirname, '..'), filePath).replace(/\\/g, '/');

	// console.log(`📄 Analyzing: ${relativePath}`);

	const fileAnalysis = {
		path: relativePath,
		imports: [],
		exports: [],
		symbols: [],
		types: [],
		errors: []
	};

	// Extract imports
	const importDeclarations = sourceFile.getImportDeclarations();
	importDeclarations.forEach(imp => {
		try {
			// Handle dynamic imports gracefully
			let moduleSpecifier;
			try {
				moduleSpecifier = imp.getModuleSpecifierValue();
			} catch (e) {
				// Dynamic import (e.g., import(variable)) - skip it
				return;
			}

			const namedImports = imp.getNamedImports().map(ni => ni.getName());
			const defaultImport = imp.getDefaultImport()?.getText();

			fileAnalysis.imports.push({
				module: moduleSpecifier,
				named: namedImports,
				default: defaultImport,
				line: imp.getStartLineNumber()
			});

			// Track import graph
			if (!analysis.importGraph[relativePath]) {
				analysis.importGraph[relativePath] = [];
			}
			analysis.importGraph[relativePath].push(moduleSpecifier);
		} catch (e) {
			// Skip invalid imports
		}
	});

	// Extract exports
	const exportDeclarations = sourceFile.getExportDeclarations();
	exportDeclarations.forEach(exp => {
		const moduleSpecifier = exp.getModuleSpecifierValue();
		const namedExports = exp.getNamedExports().map(ne => ne.getName());

		fileAnalysis.exports.push({
			module: moduleSpecifier,
			named: namedExports,
			line: exp.getStartLineNumber()
		});
	});

	// Extract exported functions/classes/variables
	sourceFile.getFunctions().forEach(fn => {
		if (fn.isExported()) {
			fileAnalysis.exports.push({
				type: 'function',
				name: fn.getName(),
				line: fn.getStartLineNumber()
			});
		}
	});

	sourceFile.getClasses().forEach(cls => {
		if (cls.isExported()) {
			fileAnalysis.exports.push({
				type: 'class',
				name: cls.getName(),
				line: cls.getStartLineNumber()
			});
		}
	});

	sourceFile.getVariableStatements().forEach(varStmt => {
		if (varStmt.isExported()) {
			varStmt.getDeclarations().forEach(decl => {
				fileAnalysis.exports.push({
					type: 'variable',
					name: decl.getName(),
					line: decl.getStartLineNumber()
				});
			});
		}
	});

	// Extract symbols (identifiers)
	const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier);
	const symbolSet = new Set();
	identifiers.forEach(id => {
		symbolSet.add(id.getText());
	});
	fileAnalysis.symbols = Array.from(symbolSet);

	// Extract type aliases and interfaces
	sourceFile.getTypeAliases().forEach(ta => {
		fileAnalysis.types.push({
			type: 'alias',
			name: ta.getName(),
			line: ta.getStartLineNumber()
		});
	});

	sourceFile.getInterfaces().forEach(iface => {
		fileAnalysis.types.push({
			type: 'interface',
			name: iface.getName(),
			line: iface.getStartLineNumber()
		});
	});

	// Detect errors via diagnostics
	const diagnostics = sourceFile.getPreEmitDiagnostics();
	diagnostics.forEach(diag => {
		const line = diag.getLineNumber();
		const message = diag.getMessageText().toString();
		const code = diag.getCode();

		fileAnalysis.errors.push({
			line,
			code: `TS${code}`,
			message,
			category: diag.getCategory()
		});
	});

	// Update stats
	analysis.stats.totalImports += fileAnalysis.imports.length;
	analysis.stats.totalExports += fileAnalysis.exports.length;
	analysis.stats.totalSymbols += fileAnalysis.symbols.length;

	analysis.files[relativePath] = fileAnalysis;
	analysis.stats.totalFiles++;
}

/**
 * Detect circular dependencies using DFS
 */
function detectCircularDependencies() {
	console.log('\n🔄 Detecting circular dependencies...');

	const visited = new Set();
	const recursionStack = new Set();
	const cycles = [];

	function dfs(node, traversalPath = []) {
		if (recursionStack.has(node)) {
			// Found cycle
			const cycleStart = traversalPath.indexOf(node);
			const cycle = traversalPath.slice(cycleStart).concat(node);
			cycles.push(cycle);
			return;
		}

		if (visited.has(node)) return;

		visited.add(node);
		recursionStack.add(node);
		traversalPath.push(node);

		const dependencies = analysis.importGraph[node] || [];
		dependencies.forEach(dep => {
			// Resolve relative paths
			const resolvedDep = dep.startsWith('.')
				? path.resolve(path.dirname(String(node)), dep).replace(/\\/g, '/')
				: dep;

			if (analysis.importGraph[resolvedDep]) {
				dfs(resolvedDep, [...traversalPath]);
			}
		});

		recursionStack.delete(node);
	}

	Object.keys(analysis.importGraph).forEach(file => {
		if (!visited.has(file)) {
			dfs(file);
		}
	});

	analysis.circularDependencies = cycles;
	analysis.stats.circularDeps = cycles.length;

	if (cycles.length > 0) {
		console.log(`⚠️  Found ${cycles.length} circular dependencies:`);
		cycles.slice(0, 5).forEach((cycle, idx) => {
			console.log(`   ${idx + 1}. ${cycle.join(' → ')}`);
		});
		if (cycles.length > 5) {
			console.log(`   ... and ${cycles.length - 5} more`);
		}
	} else {
		console.log('✅ No circular dependencies detected');
	}
}

/**
 * Find unused exports
 */
function findUnusedExports() {
	console.log('\n🔍 Finding unused exports...');

	const exportedSymbols = {};
	const importedSymbols = new Set();

	// Collect all exports
	Object.entries(analysis.files).forEach(([filePath, fileData]) => {
		fileData.exports.forEach(exp => {
			if (exp.named) {
				exp.named.forEach(name => {
					exportedSymbols[`${filePath}:${name}`] = { file: filePath, name, line: exp.line };
				});
			}
			if (exp.name) {
				exportedSymbols[`${filePath}:${exp.name}`] = { file: filePath, name: exp.name, line: exp.line };
			}
		});
	});

	// Collect all imports
	Object.values(analysis.files).forEach(fileData => {
		fileData.imports.forEach(imp => {
			if (imp.named) {
				imp.named.forEach(name => importedSymbols.add(name));
			}
			if (imp.default) {
				importedSymbols.add(imp.default);
			}
		});
	});

	// Find unused
	Object.entries(exportedSymbols).forEach(([key, data]) => {
		if (!importedSymbols.has(data.name)) {
			analysis.unusedExports.push(data);
		}
	});

	console.log(`📊 Found ${analysis.unusedExports.length} potentially unused exports`);
	analysis.unusedExports.slice(0, 10).forEach(exp => {
		console.log(`   - ${exp.name} in ${exp.file}:${exp.line}`);
	});
	if (analysis.unusedExports.length > 10) {
		console.log(`   ... and ${analysis.unusedExports.length - 10} more`);
	}
}

/**
 * Main execution
 */
async function main() {
	try {
		let targetFiles = [];

		if (fileArg) {
			// Analyze single file
			const absPath = path.resolve(path.join(__dirname, '..', fileArg));
			const sourceFile = project.getSourceFile(absPath);
			if (sourceFile) {
				targetFiles.push(sourceFile);
			} else {
				console.error(`❌ File not found: ${absPath}`);
				process.exit(1);
			}
		} else if (dirArg) {
			// Analyze directory
			const absPath = path.resolve(path.join(__dirname, '..', dirArg));
			// Normalize path for ts-morph (replace backslashes with forward slashes)
			const normalizedPath = absPath.replace(/\\/g, '/');

			// Add Svelte files first
			addSvelteFiles(project, absPath);

			const globPattern = `${normalizedPath}/**/*.ts`;

			// Ensure files are added to the project
			project.addSourceFilesAtPaths(globPattern);

			targetFiles = project.getSourceFiles(globPattern);
			console.log(`📂 Found ${targetFiles.length} files (TS + Svelte) in ${dirArg}\n`);
		} else {
			// Analyze all project files
			const srcPath = path.join(__dirname, '..', 'src');
			addSvelteFiles(project, srcPath);

			targetFiles = project.getSourceFiles();
			console.log(`📂 Analyzing entire project (${targetFiles.length} files)\n`);
		}

		// Analyze each file
		console.log('🚀 Starting analysis...');
		let processed = 0;
		const total = targetFiles.length;
		const updateInterval = Math.max(1, Math.floor(total / 20)); // Update every 5%

		targetFiles.forEach(file => {
			analyzeFile(file);
			processed++;
			if (processed % updateInterval === 0 || processed === total) {
				const percent = Math.round((processed / total) * 100);
				process.stdout.write(`\r⏳ Analyzing files: ${processed}/${total} (${percent}%)`);
			}
		});
		process.stdout.write('\n');

		// Load external errors
		if (errorsArg) {
			loadExternalErrors(errorsArg);
		}

		// Post-analysis
		detectCircularDependencies();
		findUnusedExports();

		// Build knowledge base graph
		buildKnowledgeBaseGraph();

		// Save results
		const outputPath = path.join(__dirname, '..', 'reports', 'latest', graphOutput);
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));

		// Export knowledge base in multiple formats
		console.log('\n📦 Exporting knowledge base formats...');
		exportKnowledgeBaseFormats(outputPath);

		console.log('\n═'.repeat(60));
		console.log('\n✅ AST Analysis Complete!\n');
		console.log('📊 Summary:');
		console.log(`   Files analyzed: ${analysis.stats.totalFiles}`);
		console.log(`   Total imports: ${analysis.stats.totalImports}`);
		console.log(`   Total exports: ${analysis.stats.totalExports}`);
		console.log(`   Unique symbols: ${analysis.stats.totalSymbols}`);
		console.log(`   Circular deps: ${analysis.stats.circularDeps}`);
		console.log(`   Unused exports: ${analysis.unusedExports.length}`);
		console.log(`   Graph nodes: ${analysis.stats.totalNodes}`);
		console.log(`   Graph edges: ${analysis.stats.totalEdges}\n`);
		console.log(`📁 Results saved to: ${outputPath}`);
		console.log(`📊 Knowledge base formats exported (Neo4j, D3.js, Graphviz, Tree)\n`);
		console.log('═'.repeat(60) + '\n');

	} catch (error) {
		console.error(`\n❌ FATAL ERROR: ${error.message}`);
		console.error(error.stack);
		process.exit(1);
	}
}

main();
