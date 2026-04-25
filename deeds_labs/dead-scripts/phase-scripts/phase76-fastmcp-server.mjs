#!/usr/bin/env node

/**
 * Phase 76: FastMCP Server with Agentic Tool Calling
 *
 * Exposes Knowledge Search Engine + ACE Agent as MCP tools for VS Code.
 * Features intelligent tool routing, pattern detection, and auto-migration.
 *
 * Tools:
 * - search-knowledge: Search docs with LLM synthesis
 * - detect-patterns: Analyze code for legacy patterns
 * - migrate-component: Auto-migrate Svelte 4 to 5
 * - get-migration-guidance: Get specific migration help
 * - analyze-file: Complete file analysis with recommendations
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: 'knowledge_base'
	},
	knowledgeAPI: 'http://localhost:5175/api/knowledge',
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		model: process.env.OLLAMA_MODEL || 'gemma3-legal:latest'
	}
};

const qdrant = new QdrantClient({ url: CONFIG.qdrant.url });

/**
 * Pattern Detection Engine
 */
class PatternDetector {
	constructor() {
		this.patterns = {
			svelte4: [
				{ pattern: /on:[a-z]+/gi, type: 'event-handler', severity: 'high', migration: 'Remove on: prefix (e.g., on:click → onclick)' },
				{ pattern: /export\s+let\s+(\w+)/gi, type: 'props', severity: 'high', migration: 'Use $props() rune (e.g., export let x → let { x } = $props())' },
				{ pattern: /\$:\s*(\w+)\s*=/g, type: 'reactive-assignment', severity: 'medium', migration: 'Use $derived() rune (e.g., $: x = y → let x = $derived(y))' },
				{ pattern: /\$:\s*{/g, type: 'reactive-block', severity: 'medium', migration: 'Use $effect() rune' },
				{ pattern: /beforeUpdate\(/gi, type: 'lifecycle-before', severity: 'low', migration: 'Use $effect.pre(() => {})' },
				{ pattern: /afterUpdate\(/gi, type: 'lifecycle-after', severity: 'low', migration: 'Use $effect(() => {})' }
			],
			typescript: [
				{ pattern: /:\s*any\b/gi, type: 'any-type', severity: 'medium', migration: 'Replace any with specific type' },
				{ pattern: /@ts-ignore/gi, type: 'ts-ignore', severity: 'high', migration: 'Fix underlying type error instead' },
				{ pattern: /@ts-expect-error/gi, type: 'ts-expect-error', severity: 'low', migration: 'Verify error is expected' }
			]
		};
	}

	detect(code, categories = ['svelte4', 'typescript']) {
		const results = {
			detected: [],
			summary: {
				total: 0,
				high: 0,
				medium: 0,
				low: 0
			}
		};

		for (const category of categories) {
			const patterns = this.patterns[category] || [];

			for (const { pattern, type, severity, migration } of patterns) {
				const matches = code.match(pattern);

				if (matches) {
					results.detected.push({
						category,
						type,
						severity,
						count: matches.length,
						examples: matches.slice(0, 3),
						migration,
						positions: this.findPositions(code, pattern)
					});

					results.summary.total += matches.length;
					results.summary[severity] += matches.length;
				}
			}
		}

		return results;
	}

	findPositions(code, pattern) {
		const positions = [];
		const lines = code.split('\n');

		lines.forEach((line, index) => {
			if (pattern.test(line)) {
				positions.push({
					line: index + 1,
					column: line.search(pattern),
					text: line.trim()
				});
			}
		});

		return positions.slice(0, 5); // Limit to first 5
	}
}

/**
 * Knowledge Search Integration
 */
class KnowledgeSearcher {
	async search(query, options = {}) {
		try {
			const response = await fetch(`${CONFIG.knowledgeAPI}/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query,
					topK: options.topK || 5,
					synthesize: options.synthesize !== false
				})
			});

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			return await response.json();
		} catch (error) {
			// Fallback to direct Qdrant if API unavailable
			return await this.fallbackSearch(query, options);
		}
	}

	async fallbackSearch(query, options) {
		try {
			const embedding = await this.generateEmbedding(query);
			const results = await qdrant.search(CONFIG.qdrant.collection, {
				vector: embedding,
				limit: options.topK || 5
			});

			return {
				results: results.map(r => ({
					id: r.id,
					score: r.score,
					document: r.payload
				})),
				synthesis: null,
				source: 'fallback'
			};
		} catch (error) {
			return { results: [], synthesis: null, error: error.message };
		}
	}

	async generateEmbedding(text) {
		const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: text
			})
		});

		const data = await response.json();
		return data.embedding;
	}
}

/**
 * Migration Engine
 */
class MigrationEngine {
	constructor(detector, searcher) {
		this.detector = detector;
		this.searcher = searcher;
	}

	async analyzeAndMigrate(code, filePath = null) {
		// 1. Detect patterns
		const detection = this.detector.detect(code);

		if (detection.summary.total === 0) {
			return {
				needsMigration: false,
				message: 'No legacy patterns detected. Code is already modern!',
				confidence: 1.0
			};
		}

		// 2. Search for migration guidance
		const queries = detection.detected.map(d =>
			`Svelte 5 migration ${d.type}`
		).slice(0, 3);

		const knowledgeResults = await Promise.all(
			queries.map(q => this.searcher.search(q, { topK: 3 }))
		);

		// 3. Build recommendations
		const recommendations = detection.detected.map((pattern, idx) => ({
			issue: `Found ${pattern.count} ${pattern.type} pattern(s)`,
			severity: pattern.severity,
			migration: pattern.migration,
			examples: pattern.examples,
			positions: pattern.positions,
			guidance: knowledgeResults[idx]?.synthesis || knowledgeResults[idx]?.results[0]?.document?.content?.substring(0, 200),
			autoFixable: ['event-handler', 'props'].includes(pattern.type)
		}));

		// 4. Calculate confidence
		const confidence = this.calculateConfidence(detection, knowledgeResults);

		return {
			needsMigration: true,
			detection,
			recommendations,
			confidence,
			filePath,
			summary: `Detected ${detection.summary.total} issue(s): ${detection.summary.high} high, ${detection.summary.medium} medium, ${detection.summary.low} low priority`
		};
	}

	calculateConfidence(detection, knowledgeResults) {
		const hasGuidance = knowledgeResults.some(r => r?.synthesis || r?.results?.length > 0);
		const autoFixableCount = detection.detected.filter(d =>
			['event-handler', 'props'].includes(d.type)
		).length;

		let confidence = 0.5; // Base confidence

		if (hasGuidance) confidence += 0.2;
		if (autoFixableCount > 0) confidence += 0.1 * Math.min(autoFixableCount, 3);
		if (detection.summary.high === 0) confidence += 0.1;

		return Math.min(confidence, 1.0);
	}
}

/**
 * FastMCP Server
 */
class Phase76MCPServer {
	constructor() {
		this.server = new Server(
			{
				name: 'phase76-knowledge-ace-server',
				version: '1.0.0',
			},
			{
				capabilities: {
					tools: {},
				},
			}
		);

		this.detector = new PatternDetector();
		this.searcher = new KnowledgeSearcher();
		this.migrator = new MigrationEngine(this.detector, this.searcher);

		this.setupHandlers();
	}

	setupHandlers() {
		// List available tools
		this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
			tools: [
				{
					name: 'search-knowledge',
					description: 'Search the knowledge base with semantic search and LLM synthesis',
					inputSchema: {
						type: 'object',
						properties: {
							query: {
								type: 'string',
								description: 'Search query (e.g., "Svelte 5 runes", "TypeScript generics")'
							},
							topK: {
								type: 'number',
								description: 'Number of results to return',
								default: 5
							},
							synthesize: {
								type: 'boolean',
								description: 'Generate LLM synthesis of results',
								default: true
							}
						},
						required: ['query']
					}
				},
				{
					name: 'detect-patterns',
					description: 'Detect legacy Svelte 4 and TypeScript anti-patterns in code',
					inputSchema: {
						type: 'object',
						properties: {
							code: {
								type: 'string',
								description: 'Code to analyze'
							},
							categories: {
								type: 'array',
								items: { type: 'string', enum: ['svelte4', 'typescript'] },
								description: 'Pattern categories to check',
								default: ['svelte4', 'typescript']
							}
						},
						required: ['code']
					}
				},
				{
					name: 'migrate-component',
					description: 'Analyze and generate migration recommendations for Svelte component',
					inputSchema: {
						type: 'object',
						properties: {
							code: {
								type: 'string',
								description: 'Component code to migrate'
							},
							filePath: {
								type: 'string',
								description: 'Optional file path for context'
							}
						},
						required: ['code']
					}
				},
				{
					name: 'get-migration-guidance',
					description: 'Get specific migration guidance for a pattern',
					inputSchema: {
						type: 'object',
						properties: {
							patternType: {
								type: 'string',
								description: 'Pattern type (e.g., "event-handler", "props", "reactive")',
								enum: ['event-handler', 'props', 'reactive-assignment', 'reactive-block', 'lifecycle-before', 'lifecycle-after']
							},
							example: {
								type: 'string',
								description: 'Optional code example'
							}
						},
						required: ['patternType']
					}
				},
				{
					name: 'analyze-file',
					description: 'Complete file analysis with pattern detection and recommendations',
					inputSchema: {
						type: 'object',
						properties: {
							filePath: {
								type: 'string',
								description: 'Absolute path to file to analyze'
							}
						},
						required: ['filePath']
					}
				}
			]
		}));

		// Handle tool calls
		this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params;

			try {
				switch (name) {
					case 'search-knowledge':
						return await this.handleSearchKnowledge(args);

					case 'detect-patterns':
						return await this.handleDetectPatterns(args);

					case 'migrate-component':
						return await this.handleMigrateComponent(args);

					case 'get-migration-guidance':
						return await this.handleGetMigrationGuidance(args);

					case 'analyze-file':
						return await this.handleAnalyzeFile(args);

					default:
						throw new Error(`Unknown tool: ${name}`);
				}
			} catch (error) {
				return {
					content: [
						{
							type: 'text',
							text: `Error: ${error.message}\n\nStack: ${error.stack}`
						}
					],
					isError: true
				};
			}
		});
	}

	async handleSearchKnowledge(args) {
		const { query, topK = 5, synthesize = true } = args;

		const results = await this.searcher.search(query, { topK, synthesize });

		const output = {
			query,
			resultCount: results.results?.length || 0,
			results: results.results?.map(r => ({
				title: r.document?.title || 'Untitled',
				url: r.document?.url,
				score: r.score?.toFixed(3),
				preview: r.document?.content?.substring(0, 200) + '...'
			})),
			synthesis: results.synthesis
		};

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(output, null, 2)
				}
			]
		};
	}

	async handleDetectPatterns(args) {
		const { code, categories = ['svelte4', 'typescript'] } = args;

		const detection = this.detector.detect(code, categories);

		const output = {
			summary: detection.summary,
			patterns: detection.detected.map(d => ({
				type: d.type,
				severity: d.severity,
				count: d.count,
				migration: d.migration,
				examples: d.examples,
				positions: d.positions
			}))
		};

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(output, null, 2)
				}
			]
		};
	}

	async handleMigrateComponent(args) {
		const { code, filePath = null } = args;

		const analysis = await this.migrator.analyzeAndMigrate(code, filePath);

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(analysis, null, 2)
				}
			]
		};
	}

	async handleGetMigrationGuidance(args) {
		const { patternType, example = null } = args;

		const query = `Svelte 5 migration ${patternType} ${example ? 'example: ' + example : ''}`;
		const results = await this.searcher.search(query, { topK: 3, synthesize: true });

		const output = {
			patternType,
			guidance: results.synthesis || 'No specific guidance found',
			references: results.results?.map(r => ({
				title: r.document?.title,
				url: r.document?.url
			}))
		};

		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(output, null, 2)
				}
			]
		};
	}

	async handleAnalyzeFile(args) {
		const { filePath } = args;

		try {
			const code = await fs.readFile(filePath, 'utf-8');
			const analysis = await this.migrator.analyzeAndMigrate(code, filePath);

			return {
				content: [
					{
						type: 'text',
						text: JSON.stringify(analysis, null, 2)
					}
				]
			};
		} catch (error) {
			throw new Error(`Failed to read file: ${error.message}`);
		}
	}

	async start() {
		const transport = new StdioServerTransport();
		await this.server.connect(transport);

		console.error('Phase 76 FastMCP Server running on stdio');
		console.error('Available tools: search-knowledge, detect-patterns, migrate-component, get-migration-guidance, analyze-file');
	}
}

// Start server
const server = new Phase76MCPServer();
server.start().catch(console.error);
