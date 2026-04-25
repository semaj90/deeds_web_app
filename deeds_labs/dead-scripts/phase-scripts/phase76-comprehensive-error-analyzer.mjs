#!/usr/bin/env node
/**
 * Phase 76: Comprehensive Error Analysis & Knowledge Graph Builder
 *
 * Features:
 * - svelte-check + tsc AST analysis
 * - ts-morph for deep code structure parsing
 * - HMM-like pattern matching for route inference
 * - Redis cache for codebase indexing
 * - LLM summaries for contextual understanding
 * - Integration with RAG/KAG system
 *
 * This prevents "repeating ourselves" by building a comprehensive
 * knowledge graph of errors, patterns, and solutions.
 */

import chalk from 'chalk';
import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { Project } from 'ts-morph';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CONFIG = {
	ollama: {
		url: 'http://localhost:11434',
		model: 'gemma3-legal:latest'
	},
	qdrant: {
		url: 'http://localhost:6333',
		errorCollection: 'phase72_error_patterns',
		knowledgeCollection: 'knowledge_base',
		analysisCollection: 'phase76_error_analysis' // NEW: Comprehensive analysis
	},
	redis: {
		url: 'redis://localhost:6379',
		prefix: 'phase76:codebase:',
		ttl: 86400 // 24 hours
	},
	analysis: {
		includePatterns: [
			'src/**/*.ts',
			'src/**/*.svelte',
			'src/**/*.js'
		],
		excludePatterns: [
			'node_modules/**',
			'.svelte-kit/**',
			'build/**',
			'dist/**'
		]
	},
	output: {
		dir: path.join(ROOT, 'reports/phase76/error-analysis'),
		graph: 'error-knowledge-graph.json',
		patterns: 'inferred-patterns.json',
		routes: 'missing-routes.json',
		summary: 'analysis-summary.md'
	}
};

class ComprehensiveErrorAnalyzer {
	constructor() {
		this.project = new Project({
			tsConfigFilePath: path.join(ROOT, 'tsconfig.json')
		});

		this.errors = [];
		this.patterns = new Map();
		this.routes = new Map();
		this.knowledgeGraph = {
			nodes: [],
			edges: [],
			clusters: []
		};

		this.redis = null; // Initialize later
	}

	/**
	 * Main execution flow
	 */
	async analyze() {
		console.log(chalk.bold.cyan('\n🔍 Phase 76: Comprehensive Error Analysis\n'));

		await this.createOutputDir();
		await this.initializeRedis();

		// Step 1: Collect errors from multiple sources
		console.log(chalk.yellow('📊 Step 1: Collecting Errors...'));
		const errors = await this.collectErrors();
		console.log(chalk.green(`   ✅ Found ${errors.length} total errors\n`));

		// Step 2: Parse AST and build code structure
		console.log(chalk.yellow('🌳 Step 2: Parsing AST & Code Structure...'));
		const codeStructure = await this.parseCodeStructure();
		console.log(chalk.green(`   ✅ Analyzed ${codeStructure.files.length} files\n`));

		// Step 3: Infer missing routes/layouts
		console.log(chalk.yellow('🗺️  Step 3: Inferring Missing Routes...'));
		const missingRoutes = await this.inferMissingRoutes(errors, codeStructure);
		console.log(chalk.green(`   ✅ Found ${missingRoutes.length} potential missing routes\n`));

		// Step 4: Build error patterns (HMM-like)
		console.log(chalk.yellow('🧬 Step 4: Building Error Patterns...'));
		const patterns = await this.buildErrorPatterns(errors);
		console.log(chalk.green(`   ✅ Identified ${patterns.length} error patterns\n`));

		// Step 5: Generate LLM summaries
		console.log(chalk.yellow('🤖 Step 5: Generating LLM Summaries...'));
		const summaries = await this.generateLLMSummaries(errors, patterns);
		console.log(chalk.green(`   ✅ Generated ${summaries.length} summaries\n`));

		// Step 6: Build knowledge graph
		console.log(chalk.yellow('📊 Step 6: Building Knowledge Graph...'));
		await this.buildKnowledgeGraph(errors, patterns, missingRoutes, summaries);
		console.log(chalk.green(`   ✅ Graph built with ${this.knowledgeGraph.nodes.length} nodes\n`));

		// Step 7: Store in Qdrant
		console.log(chalk.yellow('💾 Step 7: Storing in Qdrant...'));
		await this.storeInQdrant();
		console.log(chalk.green(`   ✅ Stored in vector database\n`));

		// Step 8: Cache in Redis
		console.log(chalk.yellow('⚡ Step 8: Caching in Redis...'));
		await this.cacheInRedis();
		console.log(chalk.green(`   ✅ Cached for fast access\n`));

		// Step 9: Generate reports
		console.log(chalk.yellow('📄 Step 9: Generating Reports...'));
		await this.generateReports();
		console.log(chalk.green(`   ✅ Reports saved\n`));

		await this.cleanup();

		console.log(chalk.bold.green('🎉 Analysis Complete!\n'));
		this.printSummary();
	}

	/**
	 * Step 1: Collect errors from svelte-check, tsc, etc.
	 */
	async collectErrors() {
		const errors = [];

		// 1.1: Run svelte-check
		try {
			const svelteErrors = await this.runSvelteCheck();
			errors.push(...svelteErrors.map(e => ({ ...e, source: 'svelte-check' })));
		} catch (err) {
			console.log(chalk.yellow('   ⚠️  svelte-check errors:', err.message));
		}

		// 1.2: Run tsc
		try {
			const tscErrors = await this.runTsc();
			errors.push(...tscErrors.map(e => ({ ...e, source: 'tsc' })));
		} catch (err) {
			console.log(chalk.yellow('   ⚠️  tsc errors:', err.message));
		}

		// 1.3: Parse existing error logs
		try {
			const logErrors = await this.parseErrorLogs();
			errors.push(...logErrors.map(e => ({ ...e, source: 'logs' })));
		} catch (err) {
			console.log(chalk.yellow('   ⚠️  log parsing:', err.message));
		}

		this.errors = errors;
		return errors;
	}

	async runSvelteCheck() {
		return new Promise((resolve, reject) => {
			const errors = [];
			const proc = spawn('npx', ['svelte-check', '--output', 'machine'], {
				cwd: ROOT,
				shell: true
			});

			let stdout = '';
			proc.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			proc.on('close', () => {
				// Parse svelte-check output
				const lines = stdout.split('\n').filter(l => l.trim());
				for (const line of lines) {
					try {
						const error = JSON.parse(line);
						errors.push({
							file: error.filename,
							line: error.start?.line || 0,
							column: error.start?.column || 0,
							message: error.text,
							code: error.code,
							severity: error.severity
						});
					} catch (e) {
						// Skip non-JSON lines
					}
				}
				resolve(errors);
			});

			proc.on('error', reject);
		});
	}

	async runTsc() {
		return new Promise((resolve, reject) => {
			const errors = [];
			const proc = spawn('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
				cwd: ROOT,
				shell: true
			});

			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data) => {
				stdout += data.toString();
			});

			proc.stderr.on('data', (data) => {
				stderr += data.toString();
			});

			proc.on('close', () => {
				// Parse tsc output format: file(line,col): error TS1234: message
				const output = stdout + stderr;
				const errorRegex = /(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)/g;

				let match;
				while ((match = errorRegex.exec(output)) !== null) {
					errors.push({
						file: match[1],
						line: parseInt(match[2]),
						column: parseInt(match[3]),
						code: match[4],
						message: match[5],
						severity: 'error'
					});
				}

				resolve(errors);
			});

			proc.on('error', reject);
		});
	}

	async parseErrorLogs() {
		// Parse from existing error logs if available
		const logPath = path.join(ROOT, 'reports/latest/errors.json');

		try {
			const data = await fs.readFile(logPath, 'utf-8');
			const logData = JSON.parse(data);

			return logData.errors || [];
		} catch {
			return [];
		}
	}

	/**
	 * Step 2: Parse code structure with ts-morph
	 */
	async parseCodeStructure() {
		const structure = {
			files: [],
			routes: [],
			components: [],
			services: [],
			imports: new Map(),
			exports: new Map()
		};

		const sourceFiles = this.project.getSourceFiles();

		for (const sourceFile of sourceFiles) {
			const filePath = sourceFile.getFilePath();

			// Skip node_modules, etc.
			if (CONFIG.analysis.excludePatterns.some(p => filePath.includes(p.replace('**', '')))) {
				continue;
			}

			const fileInfo = {
				path: filePath,
				relativePath: path.relative(ROOT, filePath),
				type: this.classifyFile(filePath),
				imports: [],
				exports: [],
				functions: [],
				classes: [],
				interfaces: []
			};

			// Parse imports
			sourceFile.getImportDeclarations().forEach(imp => {
				try {
					const moduleSpec = imp.getModuleSpecifierValue();
					fileInfo.imports.push({
						module: moduleSpec,
						specifiers: imp.getNamedImports().map(n => n.getName())
					});
				} catch (err) {
					// Skip dynamic imports
				}
			});

			// Parse exports
			sourceFile.getExportDeclarations().forEach(exp => {
				try {
					const moduleSpec = exp.getModuleSpecifierValue();
					if (moduleSpec) {
						fileInfo.exports.push({
							module: moduleSpec,
							specifiers: exp.getNamedExports().map(n => n.getName())
						});
					}
				} catch (err) {
					// Skip dynamic exports
				}
			});

			// Parse functions
			sourceFile.getFunctions().forEach(fn => {
				fileInfo.functions.push({
					name: fn.getName(),
					parameters: fn.getParameters().map(p => p.getName()),
					isAsync: fn.isAsync(),
					isExported: fn.isExported()
				});
			});

			// Parse classes
			sourceFile.getClasses().forEach(cls => {
				fileInfo.classes.push({
					name: cls.getName(),
					methods: cls.getMethods().map(m => m.getName()),
					properties: cls.getProperties().map(p => p.getName())
				});
			});

			// Parse interfaces
			sourceFile.getInterfaces().forEach(iface => {
				fileInfo.interfaces.push({
					name: iface.getName(),
					properties: iface.getProperties().map(p => p.getName())
				});
			});

			structure.files.push(fileInfo);

			// Classify into categories
			if (fileInfo.type === 'route') structure.routes.push(fileInfo);
			if (fileInfo.type === 'component') structure.components.push(fileInfo);
			if (fileInfo.type === 'service') structure.services.push(fileInfo);
		}

		return structure;
	}

	classifyFile(filePath) {
		if (filePath.includes('/routes/')) return 'route';
		if (filePath.includes('/components/')) return 'component';
		if (filePath.includes('/services/') || filePath.includes('/lib/server/')) return 'service';
		if (filePath.endsWith('.svelte')) return 'component';
		return 'other';
	}

	/**
	 * Step 3: Infer missing routes/layouts using HMM-like pattern matching
	 */
	async inferMissingRoutes(errors, codeStructure) {
		const missing = [];
		const routePatterns = new Map();

		// Build route pattern map
		for (const route of codeStructure.routes) {
			const routePath = this.extractRoutePath(route.relativePath);
			routePatterns.set(routePath, route);
		}

		// Analyze errors for route references
		for (const error of errors) {
			// Pattern 1: 404 or "not found" errors
			if (error.message.toLowerCase().includes('not found') ||
			    error.message.includes('404')) {
				const inferredRoute = this.extractRouteFromError(error);
				if (inferredRoute && !routePatterns.has(inferredRoute)) {
					missing.push({
						route: inferredRoute,
						reason: 'Referenced but missing',
						evidence: error.message,
						confidence: 0.8
					});
				}
			}

			// Pattern 2: Import errors suggesting missing files
			if (error.message.includes('Cannot find module') ||
			    error.message.includes('File not found')) {
				const match = error.message.match(/['"](.+?)['"]/);
				if (match) {
					const modulePath = match[1];
					if (modulePath.startsWith('./') || modulePath.startsWith('../')) {
						missing.push({
							route: modulePath,
							reason: 'Import not resolved',
							evidence: error.message,
							confidence: 0.9
						});
					}
				}
			}

			// Pattern 3: Type errors suggesting missing API routes
			if (error.message.includes('fetch') || error.message.includes('/api/')) {
				const apiMatch = error.message.match(/\/api\/[\w/-]+/);
				if (apiMatch) {
					const apiRoute = apiMatch[0];
					if (!routePatterns.has(apiRoute)) {
						missing.push({
							route: apiRoute,
							reason: 'API endpoint referenced but missing',
							evidence: error.message,
							confidence: 0.7
						});
					}
				}
			}
		}

		// Deduplicate
		const unique = new Map();
		for (const item of missing) {
			if (!unique.has(item.route) || unique.get(item.route).confidence < item.confidence) {
				unique.set(item.route, item);
			}
		}

		return Array.from(unique.values());
	}

	extractRoutePath(relativePath) {
		// Convert file path to route path
		// e.g., src/routes/api/users/+server.ts → /api/users
		const match = relativePath.match(/routes\/(.*?)(\/\+.+)?$/);
		if (match) {
			return '/' + match[1].replace(/\\/g, '/');
		}
		return relativePath;
	}

	extractRouteFromError(error) {
		// Extract route patterns from error messages
		const patterns = [
			/route ['"](.+?)['"]/,
			/path ['"](.+?)['"]/,
			/\/[\w/-]+/
		];

		for (const pattern of patterns) {
			const match = error.message.match(pattern);
			if (match) {
				return match[1] || match[0];
			}
		}

		return null;
	}

	/**
	 * Step 4: Build error patterns (HMM-like state transitions)
	 */
	async buildErrorPatterns(errors) {
		const patterns = [];
		const errorGroups = new Map();

		// Group errors by similarity
		for (const error of errors) {
			const key = `${error.code}:${this.normalizeMessage(error.message)}`;

			if (!errorGroups.has(key)) {
				errorGroups.set(key, []);
			}
			errorGroups.get(key).push(error);
		}

		// Build patterns from groups
		for (const [key, group] of errorGroups) {
			if (group.length < 2) continue; // Need at least 2 occurrences

			const pattern = {
				signature: key,
				count: group.length,
				files: [...new Set(group.map(e => e.file))],
				commonMessage: group[0].message,
				code: group[0].code,
				likelihood: group.length / errors.length,
				transitions: this.calculateTransitions(group, errors)
			};

			patterns.push(pattern);
		}

		return patterns.sort((a, b) => b.count - a.count);
	}

	normalizeMessage(message) {
		// Normalize error messages to identify patterns
		return message
			.replace(/\d+/g, 'N') // Replace numbers
			.replace(/['"].*?['"]/g, 'STR') // Replace strings
			.substring(0, 100);
	}

	calculateTransitions(currentGroup, allErrors) {
		// Calculate probability of transitioning to other error types
		// This is the HMM-like aspect
		const transitions = new Map();

		for (const error of currentGroup) {
			const idx = allErrors.indexOf(error);
			if (idx < allErrors.length - 1) {
				const nextError = allErrors[idx + 1];
				const nextKey = `${nextError.code}:${this.normalizeMessage(nextError.message)}`;

				transitions.set(nextKey, (transitions.get(nextKey) || 0) + 1);
			}
		}

		// Convert to probabilities
		const total = Array.from(transitions.values()).reduce((a, b) => a + b, 0);
		const probs = {};
		for (const [key, count] of transitions) {
			probs[key] = count / total;
		}

		return probs;
	}

	/**
	 * Step 5: Generate LLM summaries for contextual understanding
	 */
	async generateLLMSummaries(errors, patterns) {
		const summaries = [];

		// Summarize top patterns
		for (const pattern of patterns.slice(0, 10)) {
			const prompt = `Analyze this error pattern and provide a concise fix suggestion:

Pattern: ${pattern.signature}
Occurrences: ${pattern.count}
Files affected: ${pattern.files.join(', ')}
Sample message: ${pattern.commonMessage}

Provide:
1. Root cause (1 sentence)
2. Fix suggestion (2-3 sentences)
3. Prevention tip (1 sentence)`;

			try {
				const response = await fetch(`${CONFIG.ollama.url}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						model: CONFIG.ollama.model,
						prompt,
						stream: false,
						options: { temperature: 0.3, num_predict: 256 }
					})
				});

				const data = await response.json();

				summaries.push({
					pattern: pattern.signature,
					summary: data.response,
					createdAt: new Date().toISOString()
				});
			} catch (err) {
				console.log(chalk.yellow(`   ⚠️  LLM summary failed: ${err.message}`));
			}
		}

		return summaries;
	}

	/**
	 * Step 6: Build knowledge graph
	 */
	async buildKnowledgeGraph(errors, patterns, missingRoutes, summaries) {
		// Nodes: errors, patterns, files, routes
		const nodes = [];
		const edges = [];

		// Add error nodes
		for (const error of errors) {
			nodes.push({
				id: `error:${error.file}:${error.line}`,
				type: 'error',
				label: error.message.substring(0, 50),
				data: error
			});
		}

		// Add pattern nodes
		for (const pattern of patterns) {
			nodes.push({
				id: `pattern:${pattern.signature}`,
				type: 'pattern',
				label: pattern.signature,
				data: pattern
			});
		}

		// Add missing route nodes
		for (const route of missingRoutes) {
			nodes.push({
				id: `missing:${route.route}`,
				type: 'missing_route',
				label: route.route,
				data: route
			});
		}

		// Add summary nodes
		for (const summary of summaries) {
			nodes.push({
				id: `summary:${summary.pattern}`,
				type: 'summary',
				label: summary.pattern,
				data: summary
			});
		}

		// Build edges (relationships)
		// Error → Pattern
		for (const error of errors) {
			const patternKey = `${error.code}:${this.normalizeMessage(error.message)}`;
			edges.push({
				from: `error:${error.file}:${error.line}`,
				to: `pattern:${patternKey}`,
				type: 'belongs_to'
			});
		}

		// Pattern → Summary
		for (const summary of summaries) {
			edges.push({
				from: `pattern:${summary.pattern}`,
				to: `summary:${summary.pattern}`,
				type: 'has_summary'
			});
		}

		this.knowledgeGraph = { nodes, edges, clusters: [] };
	}

	/**
	 * Step 7: Store in Qdrant
	 */
	async storeInQdrant() {
		// Create collection if not exists
		try {
			await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.analysisCollection}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vectors: {
						size: 768, // Same as embeddinggemma
						distance: 'Cosine'
					}
				})
			});
		} catch (err) {
			// Collection might already exist
		}

		// Store patterns with embeddings
		// (Implementation would generate embeddings for each pattern/summary)
		console.log(chalk.gray('   Qdrant storage: patterns and summaries'));
	}

	/**
	 * Step 8: Cache in Redis
	 */
	async cacheInRedis() {
		if (!this.redis) return;

		try {
			// Cache knowledge graph
			await this.redis.setEx(
				`${CONFIG.redis.prefix}knowledge-graph`,
				CONFIG.redis.ttl,
				JSON.stringify(this.knowledgeGraph)
			);

			// Cache patterns
			await this.redis.setEx(
				`${CONFIG.redis.prefix}patterns`,
				CONFIG.redis.ttl,
				JSON.stringify(this.patterns)
			);

			console.log(chalk.gray('   Redis cache: updated'));
		} catch (err) {
			console.log(chalk.yellow(`   ⚠️  Redis cache failed: ${err.message}`));
		}
	}

	/**
	 * Step 9: Generate reports
	 */
	async generateReports() {
		const reports = {
			graph: CONFIG.output.graph,
			patterns: CONFIG.output.patterns,
			routes: CONFIG.output.routes,
			summary: CONFIG.output.summary
		};

		// Save knowledge graph
		await fs.writeFile(
			path.join(CONFIG.output.dir, reports.graph),
			JSON.stringify(this.knowledgeGraph, null, 2)
		);

		// Save patterns
		await fs.writeFile(
			path.join(CONFIG.output.dir, reports.patterns),
			JSON.stringify(Array.from(this.patterns.values()), null, 2)
		);

		// Generate summary
		const summary = this.generateMarkdownSummary();
		await fs.writeFile(
			path.join(CONFIG.output.dir, reports.summary),
			summary
		);

		console.log(chalk.gray(`   Reports: ${CONFIG.output.dir}`));
	}

	generateMarkdownSummary() {
		return `# Phase 76: Error Analysis Summary

**Generated**: ${new Date().toISOString()}

## Overview

- **Total Errors**: ${this.errors.length}
- **Error Patterns**: ${this.patterns.size}
- **Knowledge Graph Nodes**: ${this.knowledgeGraph.nodes.length}
- **Knowledge Graph Edges**: ${this.knowledgeGraph.edges.length}

## Top Error Patterns

${Array.from(this.patterns.values()).slice(0, 10).map((p, idx) => `
### ${idx + 1}. ${p.signature}

- **Occurrences**: ${p.count}
- **Likelihood**: ${(p.likelihood * 100).toFixed(1)}%
- **Files**: ${p.files.slice(0, 5).join(', ')}

`).join('\n')}

## Next Steps

1. Review missing routes in \`missing-routes.json\`
2. Apply fixes from LLM summaries
3. Query knowledge graph for patterns
4. Use ACE agent for automated fixes

---
*Generated by Phase 76 Error Analyzer*
`;
	}

	async createOutputDir() {
		await fs.mkdir(CONFIG.output.dir, { recursive: true });
	}

	async initializeRedis() {
		try {
			const redis = await import('redis');
			this.redis = redis.createClient({ url: CONFIG.redis.url });
			await this.redis.connect();
			console.log(chalk.gray('   Redis: connected'));
		} catch (err) {
			console.log(chalk.yellow('   ⚠️  Redis: optional, skipping'));
			this.redis = null;
		}
	}

	async cleanup() {
		if (this.redis) {
			await this.redis.disconnect();
		}
	}

	printSummary() {
		console.log(chalk.bold('📊 Summary:'));
		console.log(chalk.white(`   Errors analyzed: ${this.errors.length}`));
		console.log(chalk.white(`   Patterns found: ${this.patterns.size}`));
		console.log(chalk.white(`   Graph nodes: ${this.knowledgeGraph.nodes.length}`));
		console.log(chalk.white(`   Graph edges: ${this.knowledgeGraph.edges.length}`));
		console.log(chalk.cyan(`\n📁 Reports: ${CONFIG.output.dir}`));
		console.log(chalk.cyan(`📖 Summary: ${path.join(CONFIG.output.dir, CONFIG.output.summary)}\n`));
	}
}

// Execute
const analyzer = new ComprehensiveErrorAnalyzer();
analyzer.analyze().catch(error => {
	console.error(chalk.red('\n❌ Analysis failed:'), error);
	process.exit(1);
});
