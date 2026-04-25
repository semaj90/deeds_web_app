#!/usr/bin/env node

/**
 * Phase 76: Knowledge Search Engine + ACE Agent Integration
 *
 * Combines the Knowledge Search API with ACE agentic detection for
 * intelligent code migration with semantic search capabilities.
 *
 * Features:
 * - Query knowledge base via REST API
 * - Synthesize answers with LLM
 * - Auto-tag migration patterns
 * - Hybrid semantic + TF-IDF ranking
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

const KNOWLEDGE_API = 'http://localhost:5175/api/knowledge';
const qdrant = new QdrantClient({ url: process.env.QDRANT_URL || 'http://localhost:6333' });

/**
 * Knowledge Search API Integration
 */
class KnowledgeSearchIntegration {
	constructor() {
		this.baseUrl = KNOWLEDGE_API;
	}

	/**
	 * Search knowledge base with synthesis
	 */
	async search(query, options = {}) {
		const {
			topK = 10,
			synthesize = true,
			includeMetadata = true
		} = options;

		try {
			const response = await fetch(`${this.baseUrl}/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					topK,
					synthesize
				})
			});

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			console.error(chalk.red(`❌ Knowledge search failed: ${error.message}`));
			return null;
		}
	}

	/**
	 * Get document by ID
	 */
	async getDocument(id) {
		try {
			const response = await fetch(`${this.baseUrl}/document/${id}`);

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			console.error(chalk.red(`❌ Document fetch failed: ${error.message}`));
			return null;
		}
	}

	/**
	 * Get collection statistics
	 */
	async getStats() {
		try {
			const response = await fetch(`${this.baseUrl}/stats`);

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			console.error(chalk.red(`❌ Stats fetch failed: ${error.message}`));
			return null;
		}
	}
}

/**
 * Enhanced ACE Agent with Knowledge Search
 */
class ACEAgentWithKnowledgeAPI {
	constructor() {
		this.knowledgeAPI = new KnowledgeSearchIntegration();
		this.detectionPatterns = {
			svelte4: [
				{ pattern: /on:[a-z]+/gi, type: 'event-handler', migration: 'Remove on: prefix' },
				{ pattern: /export\s+let\s+\w+/gi, type: 'props', migration: 'Use $props()' },
				{ pattern: /\$:\s*\w+\s*=/g, type: 'reactive', migration: 'Use $derived()' },
				{ pattern: /beforeUpdate\(/gi, type: 'lifecycle', migration: 'Use $effect.pre()' },
				{ pattern: /afterUpdate\(/gi, type: 'lifecycle', migration: 'Use $effect()' }
			],
			typescript: [
				{ pattern: /any\s*[\],;)]/gi, type: 'type-safety', migration: 'Replace any with proper types' },
				{ pattern: /@ts-ignore/gi, type: 'type-safety', migration: 'Fix type error instead of ignoring' }
			]
		};
	}

	/**
	 * Detect patterns in code
	 */
	detectPatterns(code, category = 'svelte4') {
		const patterns = this.detectionPatterns[category] || [];
		const detected = [];

		for (const { pattern, type, migration } of patterns) {
			const matches = code.match(pattern);
			if (matches) {
				detected.push({
					type,
					count: matches.length,
					examples: matches.slice(0, 3),
					migration
				});
			}
		}

		return detected;
	}

	/**
	 * Analyze code with Knowledge API
	 */
	async analyzeWithKnowledge(code, task) {
		console.log(chalk.cyan('\n🔍 ACE Agent: Analyzing code with Knowledge Search API...\n'));

		// 1. Detect patterns
		const svelte4Patterns = this.detectPatterns(code, 'svelte4');
		const tsPatterns = this.detectPatterns(code, 'typescript');

		if (svelte4Patterns.length > 0) {
			console.log(chalk.yellow('🤔 [Agent] Detected Legacy Svelte 4 Syntax!'));
			svelte4Patterns.forEach(p => {
				console.log(chalk.yellow(`   • ${p.type}: ${p.count} occurrence(s)`));
				console.log(chalk.gray(`     Examples: ${p.examples.join(', ')}`));
			});
		}

		if (tsPatterns.length > 0) {
			console.log(chalk.yellow('⚠️  [Agent] Detected TypeScript Issues!'));
			tsPatterns.forEach(p => {
				console.log(chalk.yellow(`   • ${p.type}: ${p.count} occurrence(s)`));
			});
		}

		// 2. Build search query based on detected patterns
		const queries = [];

		if (svelte4Patterns.length > 0) {
			queries.push('Svelte 5 migration runes events props');
		}

		if (tsPatterns.length > 0) {
			queries.push('TypeScript strict type checking');
		}

		if (queries.length === 0) {
			queries.push(task); // Fallback to original task
		}

		// 3. Search knowledge base
		console.log(chalk.cyan('\n📚 Searching Knowledge Base...'));
		const searchResults = await this.knowledgeAPI.search(queries.join(' '), {
			topK: 5,
			synthesize: true
		});

		if (!searchResults) {
			console.log(chalk.red('❌ Knowledge search failed'));
			return null;
		}

		console.log(chalk.green(`✅ Found ${searchResults.results?.length || 0} relevant documents`));

		if (searchResults.synthesis) {
			console.log(chalk.cyan('\n💡 LLM Synthesis:'));
			console.log(chalk.white(searchResults.synthesis.substring(0, 500) + '...'));
		}

		// 4. Build migration guidance
		const guidance = {
			detectedPatterns: [...svelte4Patterns, ...tsPatterns],
			knowledgeResults: searchResults.results || [],
			synthesis: searchResults.synthesis || '',
			recommendations: this.buildRecommendations(svelte4Patterns, tsPatterns)
		};

		return guidance;
	}

	/**
	 * Build migration recommendations
	 */
	buildRecommendations(svelte4Patterns, tsPatterns) {
		const recommendations = [];

		svelte4Patterns.forEach(p => {
			recommendations.push({
				priority: 'high',
				category: 'Svelte 5 Migration',
				issue: `Found ${p.count} ${p.type} pattern(s)`,
				action: p.migration,
				autoFixable: ['event-handler', 'props'].includes(p.type)
			});
		});

		tsPatterns.forEach(p => {
			recommendations.push({
				priority: 'medium',
				category: 'TypeScript Quality',
				issue: `Found ${p.count} ${p.type} issue(s)`,
				action: p.migration,
				autoFixable: false
			});
		});

		return recommendations;
	}

	/**
	 * Get knowledge base statistics
	 */
	async getKnowledgeStats() {
		console.log(chalk.cyan('\n📊 Knowledge Base Statistics:\n'));

		const stats = await this.knowledgeAPI.getStats();

		if (stats) {
			console.log(chalk.white(`   Documents: ${stats.documentCount || 0}`));
			console.log(chalk.white(`   Collections: ${stats.collections?.length || 0}`));
			console.log(chalk.white(`   Status: ${stats.status || 'unknown'}`));
		}

		return stats;
	}
}

/**
 * Demo: Analyze code with Knowledge API
 */
async function demo() {
	console.log(chalk.cyan('═══════════════════════════════════════════════════════════'));
	console.log(chalk.white('  Phase 76: ACE Agent + Knowledge Search API Integration  '));
	console.log(chalk.cyan('═══════════════════════════════════════════════════════════\n'));

	const agent = new ACEAgentWithKnowledgeAPI();

	// Get stats
	await agent.getKnowledgeStats();

	// Sample Svelte 4 code
	const sampleCode = `
<script>
	export let title;
	export let count = 0;

	$: doubled = count * 2;

	function handleClick() {
		count++;
	}
</script>

<button on:click={handleClick}>
	{title}: {doubled}
</button>
	`.trim();

	console.log(chalk.cyan('\n📝 Sample Code to Analyze:'));
	console.log(chalk.gray(sampleCode.split('\n').map(l => '   ' + l).join('\n')));

	// Analyze
	const guidance = await agent.analyzeWithKnowledge(
		sampleCode,
		'Migrate this component to Svelte 5'
	);

	if (guidance) {
		console.log(chalk.cyan('\n📋 Migration Recommendations:\n'));
		guidance.recommendations.forEach((rec, i) => {
			console.log(chalk.white(`${i + 1}. [${rec.priority.toUpperCase()}] ${rec.category}`));
			console.log(chalk.gray(`   Issue: ${rec.issue}`));
			console.log(chalk.green(`   Action: ${rec.action}`));
			console.log(chalk.gray(`   Auto-fixable: ${rec.autoFixable ? 'Yes ✓' : 'No ✗'}`));
			console.log('');
		});
	}

	console.log(chalk.green('\n✅ Integration Test Complete!\n'));
}

// Run demo if called directly
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
	demo().catch(console.error);
}

export { ACEAgentWithKnowledgeAPI, KnowledgeSearchIntegration };

