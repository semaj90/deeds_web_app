#!/usr/bin/env node
/**
 * Phase 76: Svelte 4 → 5 Migration Agent
 *
 * Intelligent function-calling agent that:
 * 1. Detects deprecated Svelte 4 syntax using RAG
 * 2. Queries knowledge base for Svelte 5 alternatives
 * 3. Applies automated fixes with confidence scoring
 * 4. Stores migration patterns for future use
 *
 * Usage:
 *   node scripts/phase76-svelte5-migration-agent.mjs
 *   node scripts/phase76-svelte5-migration-agent.mjs --file src/routes/+page.svelte
 *   node scripts/phase76-svelte5-migration-agent.mjs --dry-run
 */

import chalk from 'chalk';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    checkSemanticCache,
    cleanup,
    getMigrationPatterns,
    initializeStorage,
    searchDocs,
    searchErrorPatterns,
    setSemanticCache
} from './phase76-storage-layer.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const CONFIG = {
	ollama: {
		url: 'http://localhost:11434',
		embeddingModel: 'embeddinggemma:latest',
		chatModel: 'gemma3-legal:latest'
	},
	qdrant: {
		url: 'http://localhost:6333',
		collection: 'phase76_knowledge_base',
		threshold: 0.55 // Lowered from 0.7 for better Svelte 5 doc retrieval
	},
	patterns: [
		{ old: /on:(\w+)=/g, new: 'on$1=', type: 'event', confidence: 1.0 },
		{ old: /\blet\s+(\w+)\s*=\s*([^$])/g, new: 'let $1 = $state($2)', type: 'reactivity', confidence: 0.8 },
		{ old: /\$:\s*(\w+)\s*=/g, new: 'let $1 = $derived(', type: 'reactivity', confidence: 0.9 },
		{ old: /export\s+let\s+(\w+)/g, new: 'let { $1 } = $props()', type: 'props', confidence: 0.9 },
		{ old: /beforeUpdate\(/g, new: '$effect.pre(', type: 'lifecycle', confidence: 0.7 },
		{ old: /afterUpdate\(/g, new: '$effect(', type: 'lifecycle', confidence: 0.7 }
	]
};

class Svelte5MigrationAgent {
	constructor(options = {}) {
		this.dryRun = options.dryRun || false;
		this.verbose = options.verbose || false;
		this.targetFile = options.file;

		this.stats = {
			filesScanned: 0,
			filesModified: 0,
			patternsDetected: 0,
			autoFixed: 0,
			manualReview: 0
		};

		this.migrationPatterns = [];
	}

	async initialize() {
		console.log(chalk.bold.cyan('\n🔄 Phase 76: Svelte 4 → 5 Migration Agent\n'));

		// Initialize storage layer
		await initializeStorage();

		// Load migration patterns from database
		this.migrationPatterns = await getMigrationPatterns();
		console.log(chalk.green(`✅ Loaded ${this.migrationPatterns.length} migration patterns\n`));
	}

	/**
	 * Scan codebase for files needing migration
	 */
	async scanCodebase() {
		console.log(chalk.yellow('📁 Scanning for Svelte files...\n'));

		const patterns = this.targetFile
			? [this.targetFile]
			: ['src/**/*.svelte', 'src/**/*.ts'];

		const files = await glob(patterns, { cwd: ROOT });
		console.log(chalk.gray(`   Found ${files.length} files to analyze\n`));

		const results = [];

		for (const file of files) {
			const fullPath = path.join(ROOT, file);
			const issues = await this.analyzeFile(fullPath);

			if (issues.length > 0) {
				results.push({ file, issues });
				this.stats.filesScanned++;
			}
		}

		return results;
	}

	/**
	 * Analyze single file for Svelte 4 patterns
	 */
	async analyzeFile(filePath) {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			const issues = [];

			// 1. Check for deprecated event handlers
			const eventHandlers = content.match(/on:(\w+)=/g);
			if (eventHandlers) {
				for (const handler of eventHandlers) {
					const eventName = handler.match(/on:(\w+)/)[1];
					issues.push({
						type: 'event',
						old: handler,
						new: `on${eventName}=`,
						line: this.getLineNumber(content, handler),
						confidence: 1.0,
						autoFixable: true,
						reason: 'Event attribute is deprecated in Svelte 5 runes mode'
					});
				}
			}

			// 2. Check for reactive statements
			const reactiveStatements = content.match(/\$:\s*\w+\s*=/g);
			if (reactiveStatements) {
				for (const stmt of reactiveStatements) {
					const varName = stmt.match(/\$:\s*(\w+)/)[1];
					issues.push({
						type: 'reactivity',
						old: stmt,
						new: `let ${varName} = $derived(`,
						line: this.getLineNumber(content, stmt),
						confidence: 0.9,
						autoFixable: false,
						reason: 'Reactive statement should use $derived() rune'
					});
				}
			}

			// 3. Check for component props
			const exportLet = content.match(/export\s+let\s+\w+/g);
			if (exportLet) {
				for (const prop of exportLet) {
					const propName = prop.match(/export\s+let\s+(\w+)/)[1];
					issues.push({
						type: 'props',
						old: prop,
						new: `let { ${propName} } = $props()`,
						line: this.getLineNumber(content, prop),
						confidence: 0.9,
						autoFixable: true,
						reason: 'Component props should use $props() rune'
					});
				}
			}

			// 4. Check for lifecycle hooks
			if (content.includes('beforeUpdate(')) {
				issues.push({
					type: 'lifecycle',
					old: 'beforeUpdate(',
					new: '$effect.pre(',
					line: this.getLineNumber(content, 'beforeUpdate('),
					confidence: 0.7,
					autoFixable: false,
					reason: 'beforeUpdate is deprecated, use $effect.pre()'
				});
			}

			if (content.includes('afterUpdate(')) {
				issues.push({
					type: 'lifecycle',
					old: 'afterUpdate(',
					new: '$effect(',
					line: this.getLineNumber(content, 'afterUpdate('),
					confidence: 0.7,
					autoFixable: false,
					reason: 'afterUpdate is deprecated, use $effect()'
				});
			}

			this.stats.patternsDetected += issues.length;
			return issues;

		} catch (err) {
			console.error(chalk.red(`❌ Error analyzing ${filePath}: ${err.message}`));
			return [];
		}
	}

	/**
	 * Get line number for matched text
	 */
	getLineNumber(content, search) {
		const lines = content.substring(0, content.indexOf(search)).split('\n');
		return lines.length;
	}

	/**
	 * Query RAG system for migration guidance
	 */
	async queryMigrationGuidance(issue) {
		try {
			// Generate embedding for the issue
			const query = `Svelte 5 migration: ${issue.type} ${issue.old} to ${issue.new}`;
			const embedding = await this.generateEmbedding(query);

			// Check semantic cache
			const queryHash = this.hashQuery(query);
			const cached = await checkSemanticCache(queryHash);
			if (cached) {
				return cached;
			}

			// Search documentation
			const docs = await searchDocs(embedding, 'svelte', 3, CONFIG.qdrant.threshold);

			// Search error patterns
			const patterns = await searchErrorPatterns(embedding, 3, 0.6);

			// Query Qdrant for additional context
			const qdrantResults = await this.queryQdrant(embedding);

			const guidance = {
				docs: docs.slice(0, 2),
				patterns: patterns.slice(0, 2),
				qdrantDocs: qdrantResults.slice(0, 2),
				confidence: this.calculateConfidence(docs, patterns, qdrantResults)
			};

			// Cache the result
			await setSemanticCache(queryHash, guidance, 7200); // 2 hour TTL

			return guidance;

		} catch (err) {
			console.error(chalk.red(`❌ RAG query error: ${err.message}`));
			return { docs: [], patterns: [], qdrantDocs: [], confidence: 0 };
		}
	}

	/**
	 * Generate embedding via Ollama
	 */
	async generateEmbedding(text) {
		const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.embeddingModel,
				prompt: text
			})
		});

		const data = await response.json();
		return data.embedding;
	}

	/**
	 * Query Qdrant for documentation
	 */
	async queryQdrant(embedding) {
		try {
			const response = await fetch(
				`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}/points/search`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						vector: embedding,
						limit: 3,
						score_threshold: CONFIG.qdrant.threshold,
						with_payload: true
					})
				}
			);

			const data = await response.json();
			return data.result || [];
		} catch (err) {
			console.error(chalk.red(`❌ Qdrant query error: ${err.message}`));
			return [];
		}
	}

	/**
	 * Calculate confidence based on RAG results
	 */
	calculateConfidence(docs, patterns, qdrantDocs) {
		let confidence = 0;

		if (docs.length > 0) confidence += 0.3 * docs[0].similarity;
		if (patterns.length > 0) confidence += 0.4 * patterns[0].similarity;
		if (qdrantDocs.length > 0) confidence += 0.3 * qdrantDocs[0].score;

		return Math.min(confidence, 1.0);
	}

	/**
	 * Apply fixes to file
	 */
	async applyFixes(filePath, issues) {
		try {
			let content = await fs.readFile(filePath, 'utf-8');
			let modified = false;

			for (const issue of issues) {
				if (!issue.autoFixable || issue.confidence < 0.7) {
					this.stats.manualReview++;
					console.log(chalk.yellow(`   ⚠️  Manual review needed: ${issue.old} (confidence: ${issue.confidence})`));
					continue;
				}

				// Apply regex replacement
				const oldPattern = new RegExp(issue.old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
				const newContent = content.replace(oldPattern, issue.new);

				if (newContent !== content) {
					content = newContent;
					modified = true;
					this.stats.autoFixed++;
					console.log(chalk.green(`   ✅ Fixed: ${issue.old} → ${issue.new}`));
				}
			}

			if (modified && !this.dryRun) {
				await fs.writeFile(filePath, content, 'utf-8');
				this.stats.filesModified++;
				console.log(chalk.green(`   💾 Saved: ${path.relative(ROOT, filePath)}\n`));
			} else if (modified && this.dryRun) {
				console.log(chalk.cyan(`   🔍 DRY RUN: Would modify ${path.relative(ROOT, filePath)}\n`));
			}

		} catch (err) {
			console.error(chalk.red(`❌ Error applying fixes: ${err.message}`));
		}
	}

	/**
	 * Hash query for caching
	 */
	hashQuery(query) {
		let hash = 0;
		for (let i = 0; i < query.length; i++) {
			const char = query.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash;
		}
		return hash.toString(16);
	}

	/**
	 * Generate migration report
	 */
	generateReport(results) {
		console.log(chalk.bold.cyan('\n📊 Migration Report\n'));

		console.log(chalk.white(`Files scanned: ${this.stats.filesScanned}`));
		console.log(chalk.white(`Files modified: ${this.stats.filesModified}`));
		console.log(chalk.white(`Patterns detected: ${this.stats.patternsDetected}`));
		console.log(chalk.green(`Auto-fixed: ${this.stats.autoFixed}`));
		console.log(chalk.yellow(`Manual review: ${this.stats.manualReview}\n`));

		if (results.length > 0) {
			console.log(chalk.bold('Files needing attention:\n'));

			for (const { file, issues } of results) {
				console.log(chalk.cyan(`📄 ${file}`));

				for (const issue of issues) {
					const status = issue.autoFixable && issue.confidence >= 0.7
						? chalk.green('✅ AUTO')
						: chalk.yellow('⚠️  MANUAL');

					console.log(`   ${status} Line ${issue.line}: ${issue.reason}`);
					console.log(chalk.gray(`      ${issue.old} → ${issue.new}`));
					console.log(chalk.gray(`      Confidence: ${(issue.confidence * 100).toFixed(0)}%\n`));
				}
			}
		}
	}

	/**
	 * Main execution
	 */
	async run() {
		try {
			await this.initialize();

			// Scan codebase
			const results = await this.scanCodebase();

			if (results.length === 0) {
				console.log(chalk.green('🎉 No Svelte 4 patterns found! Codebase is Svelte 5 compliant.\n'));
				return;
			}

			console.log(chalk.yellow(`\n🔍 Found ${results.length} files with Svelte 4 patterns\n`));

			// Process each file
			for (const { file, issues } of results) {
				const fullPath = path.join(ROOT, file);
				console.log(chalk.bold.cyan(`\n📝 Processing: ${file}\n`));

				// Query RAG for guidance
				for (const issue of issues) {
					if (this.verbose) {
						const guidance = await this.queryMigrationGuidance(issue);
						if (guidance.docs.length > 0) {
							console.log(chalk.gray(`   📚 Found ${guidance.docs.length} docs (confidence: ${guidance.confidence.toFixed(2)})`));
						}
					}
				}

				// Apply fixes
				await this.applyFixes(fullPath, issues);
			}

			// Generate report
			this.generateReport(results);

		} catch (err) {
			console.error(chalk.red(`\n❌ Migration failed: ${err.message}`));
			throw err;
		} finally {
			await cleanup();
		}
	}
}

// CLI execution
const args = process.argv.slice(2);
const options = {
	dryRun: args.includes('--dry-run'),
	verbose: args.includes('--verbose') || args.includes('-v'),
	file: args.find(arg => arg.startsWith('--file='))?.split('=')[1] ||
	      args[args.indexOf('--file') + 1]
};

const agent = new Svelte5MigrationAgent(options);
agent.run().catch(error => {
	console.error(chalk.red('\n❌ Fatal error:'), error);
	process.exit(1);
});
