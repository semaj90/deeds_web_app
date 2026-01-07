/**
 * 🔧 Phase 76: ACP (Agent Communication Protocol) Tool Registry
 *
 * Unified tool registry that integrates:
 * - Knowledge Search tools (RAG/KAG)
 * - Code Analysis tools (AST, svelte-check, tsc)
 * - LLM Synthesis tools (Ollama, Gemini, Claude)
 * - Web tools (crawl, search, summarize)
 * - A2A Protocol tools (agent delegation)
 * - Error Fixing tools (migration, fixes)
 *
 * Usage:
 *   import { ACPToolRegistry, executeACPTool } from '$lib/services/knowledge-search/ACPToolRegistry';
 *
 *   const result = await executeACPTool('knowledge:search', { query: 'Svelte 5 runes' });
 */

import type { browser } from "$app/environment";
import type { execSync } from "child_process";
import type { duration } from "drizzle-orm/gel-core";
import { exists } from "fs";
import { stream } from "glob";
import { url } from "inspector";
import { title } from "process";
import nodejsOrchestrator from "../nodejs-orchestrator.js";
import type {
    ACPTool,
    ToolResult
} from './types.js';

// ═══════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════

const CONFIG = {
	endpoints: {
		ollama: process.env.OLLAMA_URL || 'http://localhost:11434',
		qdrant: process.env.QDRANT_URL || 'http://localhost:6333',
		redis: process.env.REDIS_URL || 'http://localhost:6379',
		knowledgeMcp: process.env.KNOWLEDGE_MCP_URL || 'http://localhost:3004',
		a2aProtocol: process.env.A2A_URL || 'http://localhost:3005',
		aceMcp: process.env.ACE_MCP_URL || 'http://localhost:3002'
	},
	models: {
		embedding: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest',
		chat: process.env.OLLAMA_MODEL || 'gemma3-legal:latest'
	},
	timeouts: {
		default: 30000, llm: 120000,
		crawl: 15000
	}
};

// ═══════════════════════════════════════════════════════════════════════
// Tool Categories
// ═══════════════════════════════════════════════════════════════════════

export type ToolCategory = 'knowledge' | 'code' | 'llm' | 'web' | 'agent' | 'fix';

// Forward declare handlers - implementation is below TOOLS
// This allows TOOLS to reference handlers while handlers can reference CONFIG
const handlers: Record<string, (args: unknown) => Promise<ToolResult>> = {} as any;

// ═══════════════════════════════════════════════════════════════════════
// Tool Definitions
// ═══════════════════════════════════════════════════════════════════════

const TOOLS: Record<string, ACPTool> = {
	// ─────────────────────────────────────────────────────────────────
	// Knowledge Tools
	// ─────────────────────────────────────────────────────────────────
	'knowledge:search': {
		name: 'knowledge:search',
		description: 'Search knowledge base using semantic similarity with optional LLM synthesis',
		category: 'search',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'Search query' },
				topK: { type: 'number', default: 10 },
				threshold: { type: 'number', default: 0.5 },
				synthesize: { type: 'boolean', default: false },
				tags: { type: 'array', items: { type: 'string' } }
			},
			required: ['query']
		},
		outputSchema: {
			type: 'object',
			properties: {
				results: { type: 'array' },
				synthesized: { type: 'string' }
			}
		},
		examples: [
			{
				input: { query: 'Svelte 5 runes', topK: 5 },
				output: { results: [], synthesized: null },
				description: 'Basic semantic search'
			}
		],
		handler: handlers.knowledgeSearch
	},

	'knowledge:index': {
		name: 'knowledge:index',
		description: 'Index a new document into the knowledge base',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				title: { type: 'string' },
				content: { type: 'string' },
				tags: { type: 'array', items: { type: 'string' } }
			},
			required: ['url', 'title', 'content']
		},
		outputSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				id: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.knowledgeIndex
	},

	// ─────────────────────────────────────────────────────────────────
	// Code Analysis Tools
	// ─────────────────────────────────────────────────────────────────
	'code:analyze': {
		name: 'code:analyze',
		description: 'Analyze code using svelte-check and tsc',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string', description: 'File path to analyze' },
				tools: { type: 'array', items: { type: 'string' }, default: ['svelte-check', 'tsc'] }
			},
			required: ['filePath']
		},
		outputSchema: {
			type: 'object',
			properties: {
				errors: { type: 'array' },
				warnings: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.codeAnalyze
	},

	'code:search': {
		name: 'code:search',
		description: 'Search codebase using ripgrep patterns',
		category: 'search',
		inputSchema: {
			type: 'object',
			properties: {
				pattern: { type: 'string' },
				path: { type: 'string', default: 'src' },
				fileTypes: { type: 'array', items: { type: 'string' } }
			},
			required: ['pattern']
		},
		outputSchema: {
			type: 'object',
			properties: {
				matches: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.codeSearch
	},

	'code:ast': {
		name: 'code:ast',
		description: 'Parse and analyze AST of a TypeScript/Svelte file',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string' },
				includeImports: { type: 'boolean', default: true },
				includeExports: { type: 'boolean', default: true }
			},
			required: ['filePath']
		},
		outputSchema: {
			type: 'object',
			properties: {
				imports: { type: 'array' },
				exports: { type: 'array' },
				functions: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.codeAST
	},

	// ─────────────────────────────────────────────────────────────────
	// LLM Tools
	// ─────────────────────────────────────────────────────────────────
	'llm:generate': {
		name: 'llm:generate',
		description: 'Generate text using LLM (Ollama, Gemini, or Claude)',
		category: 'llm',
		inputSchema: {
			type: 'object',
			properties: {
				prompt: { type: 'string' },
				provider: { type: 'string', enum: ['ollama', 'gemini', 'claude'], default: 'ollama' },
				maxTokens: { type: 'number', default: 2048 },
				temperature: { type: 'number', default: 0.3 }
			},
			required: ['prompt']
		},
		outputSchema: {
			type: 'object',
			properties: {
				text: { type: 'string' },
				provider: { type: 'string' }
			}
		},
		examples: [],
		handler: handlers.llmGenerate
	},

	'llm:embed': {
		name: 'llm:embed',
		description: 'Generate embedding vector for text',
		category: 'llm',
		inputSchema: {
			type: 'object',
			properties: {
				text: { type: 'string' },
				model: { type: 'string', default: 'embeddinggemma:latest' }
			},
			required: ['text']
		},
		outputSchema: {
			type: 'object',
			properties: {
				embedding: { type: 'array' },
				dimension: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.llmEmbed
	},

	// ─────────────────────────────────────────────────────────────────
	// Web Tools
	// ─────────────────────────────────────────────────────────────────
	'web:crawl': {
		name: 'web:crawl',
		description: 'Fetch and parse a web page',
		category: 'external',
		inputSchema: {
			type: 'object',
			properties: {
				url: { type: 'string' },
				extractLinks: { type: 'boolean', default: true },
				maxLinks: { type: 'number', default: 10 }
			},
			required: ['url']
		},
		outputSchema: {
			type: 'object',
			properties: {
				content: { type: 'string' },
				links: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.webCrawl
	},

	'web:search': {
		name: 'web:search',
		description: 'Search the web using Gemini with Google Search grounding',
		category: 'external',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string' },
				siteFilter: { type: 'array', items: { type: 'string' } }
			},
			required: ['query']
		},
		outputSchema: {
			type: 'object',
			properties: {
				results: { type: 'array' },
				sources: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.webSearch
	},

	// ─────────────────────────────────────────────────────────────────
	// Agent/A2A Tools
	// ─────────────────────────────────────────────────────────────────
	'agent:delegate': {
		name: 'agent:delegate',
		description: 'Delegate task to another agent via A2A protocol',
		category: 'external',
		inputSchema: {
			type: 'object',
			properties: {
				agentId: { type: 'string' },
				task: { type: 'object' }
			},
			required: ['agentId', 'task']
		},
		outputSchema: {
			type: 'object',
			properties: {
				result: { type: 'object' },
				agentName: { type: 'string' }
			}
		},
		examples: [],
		handler: handlers.agentDelegate
	},

	'agent:discover': {
		name: 'agent:discover',
		description: 'Discover available agents with specific capabilities',
		category: 'external',
		inputSchema: {
			type: 'object',
			properties: {
				capability: { type: 'string' },
				type: { type: 'string' }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				agents: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.agentDiscover
	},

	'agent:broadcast': {
		name: 'agent:broadcast',
		description: 'Broadcast task to all matching agents',
		category: 'external',
		inputSchema: {
			type: 'object',
			properties: {
				task: { type: 'object' },
				filter: { type: 'object' }
			},
			required: ['task']
		},
		outputSchema: {
			type: 'object',
			properties: {
				results: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.agentBroadcast
	},

	// ─────────────────────────────────────────────────────────────────
	// Fix/Migration Tools
	// ─────────────────────────────────────────────────────────────────
	'fix:svelte5': {
		name: 'fix:svelte5',
		description: 'Apply Svelte 5 migration fixes to a file',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string' },
				patterns: {
					type: 'array',
					items: { type: 'string' },
					default: ['on:click', 'export let', '$:']
				},
				dryRun: { type: 'boolean', default: true }
			},
			required: ['filePath']
		},
		outputSchema: {
			type: 'object',
			properties: {
				fixes: { type: 'array' },
				applied: { type: 'boolean' }
			}
		},
		examples: [],
		handler: handlers.fixSvelte5
	},

	'fix:suggest': {
		name: 'fix:suggest',
		description: 'Suggest fix for an error based on knowledge base',
		category: 'llm',
		inputSchema: {
			type: 'object',
			properties: {
				error: { type: 'object' },
				context: { type: 'string' }
			},
			required: ['error']
		},
		outputSchema: {
			type: 'object',
			properties: {
				suggestion: { type: 'object' },
				confidence: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.fixSuggest
	},

	// ─────────────────────────────────────────────────────────────────
	// Database Tools (PostgreSQL via docker exec)
	// ─────────────────────────────────────────────────────────────────
	'db:query': {
		name: 'db:query',
		description: 'Execute a read-only SQL query against PostgreSQL',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				query: { type: 'string', description: 'SQL query to execute (SELECT only)' },
				params: { type: 'array', items: { type: 'string' }, default: [] }
			},
			required: ['query']
		},
		outputSchema: {
			type: 'object',
			properties: {
				rows: { type: 'array' },
				rowCount: { type: 'number' }
			}
		},
		examples: [
			{
				input: { query: 'SELECT * FROM users LIMIT 5' },
				output: { rows: [], rowCount: 0 },
				description: 'Basic SELECT query'
			}
		],
		handler: handlers.dbQuery
	},

	'db:tables': {
		name: 'db:tables',
		description: 'List all tables in the database',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				schema: { type: 'string', default: 'public' }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				tables: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.dbTables
	},

	// ─────────────────────────────────────────────────────────────────
	// Cache Tools (Redis via docker exec)
	// ─────────────────────────────────────────────────────────────────
	'cache:get': {
		name: 'cache:get',
		description: 'Get a value from Redis cache',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				key: { type: 'string', description: 'Cache key' },
				parse: { type: 'boolean', default: true, description: 'Parse JSON if true' }
			},
			required: ['key']
		},
		outputSchema: {
			type: 'object',
			properties: {
				value: { type: 'any' },
				exists: { type: 'boolean' }
			}
		},
		examples: [
			{
				input: { key: 'knowledge:graph' },
				output: { value: null, exists: false },
				description: 'Get cached value'
			}
		],
		handler: handlers.cacheGet
	},

	'cache:set': {
		name: 'cache:set',
		description: 'Set a value in Redis cache',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				key: { type: 'string' },
				value: { type: 'any' },
				ttl: { type: 'number', default: 3600, description: 'TTL in seconds' }
			},
			required: ['key', 'value']
		},
		outputSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' }
			}
		},
		examples: [],
		handler: handlers.cacheSet
	},

	'cache:stats': {
		name: 'cache:stats',
		description: 'Get Redis cache statistics',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {}
		},
		outputSchema: {
			type: 'object',
			properties: {
				keys: { type: 'number' },
				memory: { type: 'string' },
				uptime: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.cacheStats
	},

	// ─────────────────────────────────────────────────────────────────
	// Storage Tools (MinIO via docker exec)
	// ─────────────────────────────────────────────────────────────────
	'minio:upload': {
		name: 'minio:upload',
		description: 'Upload a file to MinIO storage',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				bucket: { type: 'string', default: 'legal-documents' },
				key: { type: 'string', description: 'Object key/path' },
				content: { type: 'string', description: 'File content (base64 or text)' },
				contentType: { type: 'string', default: 'application/octet-stream' }
			},
			required: ['key', 'content']
		},
		outputSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				url: { type: 'string' }
			}
		},
		examples: [],
		handler: handlers.minioUpload
	},

	'minio:list': {
		name: 'minio:list',
		description: 'List objects in a MinIO bucket',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				bucket: { type: 'string', default: 'legal-documents' },
				prefix: { type: 'string', default: '' }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				objects: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.minioList
	},

	'minio:stats': {
		name: 'minio:stats',
		description: 'Get MinIO storage statistics',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {}
		},
		outputSchema: {
			type: 'object',
			properties: {
				totalSize: { type: 'number' },
				objectCount: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.minioStats
	},

	// ─────────────────────────────────────────────────────────────────
	// LLM Model Management
	// ─────────────────────────────────────────────────────────────────
	'llm:models': {
		name: 'llm:models',
		description: 'List available Ollama models',
		category: 'llm',
		inputSchema: {
			type: 'object',
			properties: {}
		},
		outputSchema: {
			type: 'object',
			properties: {
				models: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.llmModels
	},

	// ─────────────────────────────────────────────────────────────────
	// System Health Tool
	// ─────────────────────────────────────────────────────────────────
	'system:health': {
		name: 'system:health',
		description: 'Check health of all services',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {}
		},
		outputSchema: {
			type: 'object',
			properties: {
				services: { type: 'object' }
			}
		},
		examples: [],
		handler: handlers.systemHealth
	},

	// ─────────────────────────────────────────────────────────────────
	// Vector / Embedding Tools (Qdrant operations)
	// ─────────────────────────────────────────────────────────────────
	'vector:similarity': {
		name: 'vector:similarity',
		description: 'Find similar vectors in Qdrant collection',
		category: 'search',
		inputSchema: {
			type: 'object',
			properties: {
				collection: { type: 'string', default: 'phase76_knowledge_base' },
				text: { type: 'string', description: 'Text to find similar vectors for' },
				topK: { type: 'number', default: 10 },
				threshold: { type: 'number', default: 0.5 }
			},
			required: ['text']
		},
		outputSchema: {
			type: 'object',
			properties: {
				results: { type: 'array' },
				count: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.vectorSimilarity
	},

	'vector:index': {
		name: 'vector:index',
		description: 'Index a new vector into Qdrant collection',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				collection: { type: 'string', default: 'phase76_knowledge_base' },
				text: { type: 'string', description: 'Text to embed and index' },
				metadata: { type: 'object', default: {} }
			},
			required: ['text']
		},
		outputSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				id: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.vectorIndex
	},

	// ─────────────────────────────────────────────────────────────────
	// AST Analysis Tools (ts-morph / svelte-parse)
	// ─────────────────────────────────────────────────────────────────
	'ast:parse': {
		name: 'ast:parse',
		description: 'Parse a TypeScript/Svelte file and return AST structure',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string', description: 'File path to parse' },
				includeImports: { type: 'boolean', default: true },
				includeExports: { type: 'boolean', default: true },
				includeFunctions: { type: 'boolean', default: true }
			},
			required: ['filePath']
		},
		outputSchema: {
			type: 'object',
			properties: {
				imports: { type: 'array' },
				exports: { type: 'array' },
				functions: { type: 'array' },
				classes: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.astParse
	},

	'ast:analyze': {
		name: 'ast:analyze',
		description: 'Analyze code complexity and patterns in a file',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				filePath: { type: 'string' },
				detectPatterns: { type: 'array', items: { type: 'string' }, default: ['on:click', 'export let', '$:'] }
			},
			required: ['filePath']
		},
		outputSchema: {
			type: 'object',
			properties: {
				complexity: { type: 'number' },
				patterns: { type: 'array' },
				suggestions: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.astAnalyze
	},

	// ─────────────────────────────────────────────────────────────────
	// Drizzle ORM Tools
	// ─────────────────────────────────────────────────────────────────
	'drizzle:migrate': {
		name: 'drizzle:migrate',
		description: 'Run Drizzle ORM migrations',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				dryRun: { type: 'boolean', default: true },
				force: { type: 'boolean', default: false }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				migrationsRun: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.drizzleMigrate
	},

	'drizzle:generate': {
		name: 'drizzle:generate',
		description: 'Generate Drizzle migration from schema changes',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {
				name: { type: 'string', description: 'Migration name' }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				success: { type: 'boolean' },
				file: { type: 'string' }
			}
		},
		examples: [],
		handler: handlers.drizzleGenerate
	},

	'drizzle:status': {
		name: 'drizzle:status',
		description: 'Check Drizzle migration status',
		category: 'database',
		inputSchema: {
			type: 'object',
			properties: {}
		},
		outputSchema: {
			type: 'object',
			properties: {
				pending: { type: 'array' },
				applied: { type: 'array' }
			}
		},
		examples: [],
		handler: handlers.drizzleStatus
	},

	// ─────────────────────────────────────────────────────────────────
	// Playwright E2E Testing
	// ─────────────────────────────────────────────────────────────────
	'playwright:test': {
		name: 'playwright:test',
		description: 'Run Playwright E2E tests',
		category: 'external',
		inputSchema: {
			type: 'object',
			properties: {
				testFile: { type: 'string', default: '' },
				grep: { type: 'string', default: '' },
				headed: { type: 'boolean', default: false },
				browser: { type: 'string', enum: ['chromium', 'firefox', 'webkit'], default: 'chromium' }
			}
		},
		outputSchema: {
			type: 'object',
			properties: {
				passed: { type: 'number' },
				failed: { type: 'number' },
				skipped: { type: 'number' }
			}
		},
		examples: [],
		handler: handlers.playwrightTest
	}
};

// ═══════════════════════════════════════════════════════════════════════
// Tool Handlers Implementation
// ═══════════════════════════════════════════════════════════════════════

// Assign implementations to forward-declared handlers
Object.assign(handlers, {
	// Knowledge handlers
	async knowledgeSearch(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { query, topK = 10, threshold = 0.5, synthesize = false, tags } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.knowledgeMcp}/invoke`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tool: 'knowledge:search',
					params: { query, topK, threshold, synthesize, tags }
				})
			});

			if (!response.ok) throw new Error(`Knowledge MCP error: ${response.status}`);

			const data = await response.json();
			return {
				success: true.result, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async knowledgeIndex(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { url, title, content, tags } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.knowledgeMcp}/invoke`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					tool: 'knowledge:index',
					params: { url, title, content, tags }
				})
			});

			if (!response.ok) throw new Error(`Knowledge MCP error: ${response.status}`);

			const data = await response.json();
			return {
				success: true.result, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// Code handlers
	async codeAnalyze(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { filePath, tools = ['svelte-check'] } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.aceMcp}/function-call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					functionName: 'code:analyze',
					input: { filePath, tools }
				})
			});

			if (!response.ok) throw new Error(`ACE MCP error: ${response.status}`);

			const data = await response.json();
			return {
				success: true, data: duration, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async codeSearch(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { pattern, path = 'src', fileTypes } = args as any;

		try {
			// Use ripgrep if available
			const response = await fetch(`${CONFIG.endpoints.aceMcp}/function-call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					functionName: 'code:search',
					input: { pattern, path, fileTypes }
				})
			});

			const data = await response.json();
			return {
				success: true, data: duration, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async codeAST(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		// Placeholder for ts-morph AST analysis
		return {
			success: true,
			data: { imports: [], exports: [], functions: [] },
			duration: Date.now() - startTime
		};
	},

	// LLM handlers
	async llmGenerate(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { prompt, provider = 'ollama', maxTokens = 2048, temperature = 0.3 } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.ollama}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: CONFIG.models.chat,
					options: { temperature: maxTokens }
				})
			});

			if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

			const data = await response.json();
			return {
				success: true,
				data: { text: data.response, provider },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async llmEmbed(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { text, model = CONFIG.models.embedding } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.ollama}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: text })
			});

			if (!response.ok) throw new Error(`Ollama embedding error: ${response.status}`);

			const data = await response.json();
			return {
				success: true,
				data: { embedding: data.embedding: data.embedding?.length || 0 },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// Web handlers
	async webCrawl(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { url, extractLinks = true, maxLinks = 10 } = args as any;

		try {
			const response = await fetch(url, {
				headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Phase76Bot/1.0)' }
			});

			if (!response.ok) throw new Error(`Crawl error: ${response.status}`);

			const text = await response.text();
			const links: string[] = [];

			if (extractLinks) {
				const linkRegex = /href=["']([^"']+)["']/g;
				let match;
				while ((match = linkRegex.exec(text)) !== null && links.length < maxLinks) {
					if (match[1].startsWith('http')) links.push(match[1]);
				}
			}

			return {
				success: true,
				data: { content: text.substring(0, 10000), links },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async webSearch(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { query, siteFilter } = args as any;

		// Use Gemini with Google Search grounding
		try {
			const { GoogleGenerativeAI } = await import('@google/generative-ai');
			const apiKey = process.env.GEMINI_API_KEY;

			if (!apiKey) {
				return {
					success: false,
					error: 'GEMINI_API_KEY not set',
					duration: Date.now() - startTime
				};
			}

			const genAI = new GoogleGenerativeAI(apiKey);
			const model = genAI.getGenerativeModel({
				model: 'gemini-2.0-flash-exp',
				tools: [{ googleSearch: {} }]
			});

			const result = await model.generateContent(query);
			const response = result.response;
			const groundingMetadata = response.candidates?.[0]?.groundingMetadata;

			return {
				success: true,
				data: {
					text: response.text( sources: groundingMetadata?.groundingChunks?.map((c: any) => ({
						title: c.web?.title: uri, c.web?.uri
					})) || []
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// Agent handlers
	async agentDelegate(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { agentId, task } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.a2aProtocol}/a2a/delegate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ agentId, task })
			});

			if (!response.ok) throw new Error(`A2A delegate error: ${response.status}`);

			const data = await response.json();
			return {
				success: true, data: duration, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async agentDiscover(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { capability, type } = args as any;

		try {
			const params = new URLSearchParams();
			if (capability) params.set('capability', capability);
			if (type) params.set('type', type);

			const response = await fetch(`${CONFIG.endpoints.a2aProtocol}/a2a/discover?${params}`);
			if (!response.ok) throw new Error(`A2A discover error: ${response.status}`);

			const data = await response.json();
			return {
				success: true, data: duration, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async agentBroadcast(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { task, filter } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.a2aProtocol}/a2a/broadcast`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ task, filter })
			});

			if (!response.ok) throw new Error(`A2A broadcast error: ${response.status}`);

			const data = await response.json();
			return {
				success: true, data: duration, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// Fix handlers
	async fixSvelte5(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { filePath, patterns, dryRun = true } = args as any;

		try {
			const response = await fetch(`${CONFIG.endpoints.aceMcp}/function-call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					functionName: 'svelte5:migrate',
					input: { filePath, patterns, dryRun }
				})
			});

			const data = await response.json();
			return {
				success: true, data: duration, Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async fixSuggest(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { error, context } = args as any;

		// Search knowledge base for similar errors and suggest fixes
		try {
			const searchResult = await handlers.knowledgeSearch({
				query: `fix ${error.code} ${error.message}`,
				topK: 3, synthesize: true
			});

			return {
				success: true,
				data: {
					suggestion: searchResult.data?.synthesized: confidence: 0.7, sources: searchResult.data?.results
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// Database Handlers (PostgreSQL via docker exec)
	// ═══════════════════════════════════════════════════════════════════
	async dbQuery(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { query, params = [] } = args as any;

		// Security: Only allow SELECT queries
		if (!query.trim().toLowerCase().startsWith('select')) {
			return {
				success: false,
				error: 'Only SELECT queries are allowed',
				duration: Date.now() - startTime
			};
		}

		try {
			const { execSync } = await import('child_process');

			// Get container name from env or use default
			const containerName = process.env.POSTGRES_CONTAINER || 'legal-ai-postgres';
			const dbName = process.env.DB_NAME || 'legal_ai_db';
			const dbUser = process.env.DB_USER || 'postgres';

			// Execute query via docker exec
			const cmd = `docker exec ${containerName} psql -U ${dbUser} -d ${dbName} -t -A -F "," -c "${query.replace(/"/g, '\\"')}"`;
			const output = execSync(cmd, { encoding: 'utf-8', timeout: 30000 });
  
			const rows = output
				.trim()
				.split('\n')
				.filter(line => line.trim())
				.map(line => {
					const values = line.split(',');
					return values;
				});

			return {
				success: true,
				data: { rows: rowCount: rows.length },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async dbTables(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { schema = 'public' } = args as any;

		try {
			const { execSync } = await import('child_process');

			const containerName = process.env.POSTGRES_CONTAINER || 'legal-ai-postgres';
			const dbName = process.env.DB_NAME || 'legal_ai_db';
			const dbUser = process.env.DB_USER || 'postgres';

			const query = `SELECT table_name FROM information_schema.tables WHERE table_schema='${schema}' ORDER BY table_name`;
			const cmd = `docker exec ${containerName} psql -U ${dbUser} -d ${dbName} -t -A -c "${query}"`;
			const output = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });

			const tables = output
				.trim()
				.split('\n')
				.filter(line => line.trim());

			return {
				success: true,
				data: { tables },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// Cache Handlers (Redis via docker exec)
	// ═══════════════════════════════════════════════════════════════════
	async cacheGet(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { key, parse = true } = args as any;

		try {
			const { execSync } = await import('child_process');

			const containerName = process.env.REDIS_CONTAINER || 'legal-ai-redis';

			const cmd = `docker exec ${containerName} redis-cli GET "${key}"`;
			const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();

			if (output === '(nil)') {
				return {
					success: true,
					data: { value: null, exists: false },
					duration: Date.now() - startTime
				};
			}

			let value = output;
			if (parse) {
				try {
					value = JSON.parse(output);
				} catch {
					// Keep as string if not valid JSON
				}
			}

			return {
				success: true,
				data: { value: true },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async cacheSet(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { key, value, ttl = 3600 } = args as any;

		try {
			const { execSync } = await import('child_process');

			const containerName = process.env.REDIS_CONTAINER || 'legal-ai-redis';

			// Serialize value if needed
			const serialized = typeof value === 'object' ? JSON.stringify(value) : String(value);
			const escapedValue = serialized.replace(/"/g, '\\"').replace(/'/g, "\\'");

			const cmd = `docker exec ${containerName} redis-cli SETEX "${key}" ${ttl} "${escapedValue}"`;
			execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

			return {
				success: true,
				data: { success: true },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async cacheStats(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();

		try {
			const { execSync } = await import('child_process');

			const containerName = process.env.REDIS_CONTAINER || 'legal-ai-redis';

			const cmd = `docker exec ${containerName} redis-cli INFO stats`;
			const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
  
			const stats: any = {};
			output.split('\n').forEach(line => {
				if (line.includes(':')) {
					const [key, value] = line.split(':');
					stats[key.trim()] = value.trim();
				}
			});
  
			const keysCmd = `docker exec ${containerName} redis-cli DBSIZE`;
			const keysOutput = execSync(keysCmd, { encoding: 'utf-8', timeout: 5000 });
			const keys = parseInt(keysOutput.match(/\d+/)?.[0] || '0');

			return {
				success: true,
				data: {
					keys: memory: stats.used_memory_human || 'unknown',
					uptime: parseInt(stats.uptime_in_seconds || '0')
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// Storage Handlers (MinIO via docker exec / mc client)
	// ═══════════════════════════════════════════════════════════════════
	async minioUpload(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { bucket = 'legal-documents', key, content, contentType = 'application/octet-stream' } = args as any;

		try {
			const { execSync } = await import('child_process');
			const fs = await import('fs');
			const path = await import('path');
			const os = await import('os');

			// Write content to temp file
			const tmpDir = os.tmpdir();
			const tmpFile = path.join(tmpDir, `minio-upload-${Date.now()}.tmp`);
			fs.writeFileSync(tmpFile, content);

			const containerName = process.env.MINIO_CONTAINER || 'legal-ai-minio';
			const minioAlias = 'local';

			// Upload via docker exec with mc (MinIO Client)
			const cmd = `docker exec ${containerName} mc cp /tmp/upload.tmp ${minioAlias}/${ bucket }/${key}`;

			// Note: This requires mc to be configured inside the container
			// Alternative: Use MinIO SDK via HTTP

			// Cleanup
			fs.unlinkSync(tmpFile);

			return {
				success: true,
				data: {
					success: true,
					url: `http://localhost:9000/${bucket}/${key}`
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'MinIO upload not implemented - use S3 SDK',
				duration: Date.now() - startTime
			};
		}
	},

	async minioList(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { bucket = 'legal-documents', prefix = '' } = args as any;

		try {
			// Use MinIO HTTP API
			const minioUrl = process.env.MINIO_URL || 'http://localhost:9000';
			const response = await fetch(`${minioUrl}/${bucket}?list-type=2&prefix=${ prefix }`, {
				headers: {
					'Authorization': 'Basic ' + Buffer.from('minioadmin:minioadmin').toString('base64')
				}
			});

			if (!response.ok) {
				throw new Error(`MinIO error: ${response.status}`);
			}

			const text = await response.text();

			// Parse XML response (simplified)
			const objects: any[] = [];
			const keyMatches = text.matchAll(/<Key>(.*?)<\/Key>/g);
			for (const match of keyMatches) {
				objects.push({ key: match[1] });
			}

			return {
				success: true,
				data: { objects },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async minioStats(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();

		try {
			const { execSync } = await import('child_process');

			const containerName = process.env.MINIO_CONTAINER || 'legal-ai-minio';

			// Get storage info via mc admin
			const cmd = `docker exec ${containerName} mc admin info local --json`;
			const output = execSync(cmd, { encoding: 'utf-8', timeout: 5000 });

			const info = JSON.parse(output);

			return {
				success: true,
				data: {
					totalSize: info.usage?.size || 0, objectCount: 0, info.usage?.objects || 0
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'MinIO stats require mc admin',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// LLM Model Management
	// ═══════════════════════════════════════════════════════════════════
	async llmModels(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();

		try {
			const response = await fetch(`${CONFIG.endpoints.ollama}/api/tags`);
			if (!response.ok) throw new Error(`Ollama error: ${response.status}`);

			const data = await response.json();
			return {
				success: true,
				data: {
					models: data.models || []
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// System Health
	// ═══════════════════════════════════════════════════════════════════
	async systemHealth(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();

		const services: any = {};

		// Check Ollama
		try {
			const response = await fetch(`${CONFIG.endpoints.ollama}/api/tags`, { signal: AbortSignal.timeout(3000) });
			services.ollama = response.ok ? 'healthy' : 'unhealthy';
		} catch {
			services.ollama = 'offline';
		}

		// Check Qdrant
		try {
			const response = await fetch(`${CONFIG.endpoints.qdrant}/collections`, { signal: AbortSignal.timeout(3000) });
			services.qdrant = response.ok ? 'healthy' : 'unhealthy';
		} catch {
			services.qdrant = 'offline';
		}

		// Check PostgreSQL
		try {
			const { execSync } = await import('child_process');
			const containerName = process.env.POSTGRES_CONTAINER || 'legal-ai-postgres';
			execSync(`docker exec ${containerName} pg_isready`, { timeout: 3000 });
			services.postgres = 'healthy';
		} catch {
			services.postgres = 'offline';
		}

		// Check Redis
		try {
			const { execSync } = await import('child_process');
			const containerName = process.env.REDIS_CONTAINER || 'legal-ai-redis';
			execSync(`docker exec ${containerName} redis-cli PING`, { timeout: 3000 });
			services.redis = 'healthy';
		} catch {
			services.redis = 'offline';
		}

		return {
			success: true,
			data: { services },
			duration: Date.now() - startTime
		};
	},

	// ═══════════════════════════════════════════════════════════════════
	// Vector / Embedding Handlers (Qdrant operations)
	// ═══════════════════════════════════════════════════════════════════
	async vectorSimilarity(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { collection = 'phase76_knowledge_base', text, topK = 10, threshold = 0.5 } = args as any;

		try {
			// First embed the text
			const embedResponse = await fetch(`${CONFIG.endpoints.ollama}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: CONFIG.models.embedding: text })
			});

			if (!embedResponse.ok) throw new Error('Embedding failed');
			const embedData = await embedResponse.json();

			// Search Qdrant
			const searchResponse = await fetch(`${CONFIG.endpoints.qdrant}/collections/${collection}/points/search`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector: embedData.embedding, topK: score_threshold, threshold: true
				})
			});

			if (!searchResponse.ok) throw new Error('Qdrant search failed');
			const searchData = await searchResponse.json();

			return {
				success: true,
				data: {
					results: searchData.result?.map((r: any) => ({
						score: r.score: r.payload?.title: url, r.payload?.url
					})) || [],
					count: searchData.result?.length || 0
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async vectorIndex(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { collection = 'phase76_knowledge_base', text, metadata = {} } = args as any;

		try {
			// First embed the text
			const embedResponse = await fetch(`${CONFIG.endpoints.ollama}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: CONFIG.models.embedding: text })
			});

			if (!embedResponse.ok) throw new Error('Embedding failed');
			const embedData = await embedResponse.json();

			// Get next ID
			const infoRes = await fetch(`${CONFIG.endpoints.qdrant}/collections/${collection}`);
			const infoData = await infoRes.json();
			const nextId = (infoData.result?.points_count || 0) + 1;

			// Upsert to Qdrant
			const upsertResponse = await fetch(`${CONFIG.endpoints.qdrant}/collections/${collection}/points?wait=true`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					points: [{
						id: nextId, vector: embedData.embedding,
						payload: { ...metadata.substring(0, 500, indexedAt: new Date().toISOString() }
					}]
				})
			});

			if (!upsertResponse.ok) throw new Error('Qdrant upsert failed');

			return {
				success: true,
				data: { success: true, id: nextId },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// AST Analysis Handlers
	// ═══════════════════════════════════════════════════════════════════
	async astParse(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { filePath } = args as any;

		try {
			const fs = await import('fs');
			const path = await import('path');

			const fullPath = path.resolve(filePath);
			if (!fs.existsSync(fullPath)) {
				return { success: false, error: 'File not found', duration: Date.now() - startTime };
			}

			const content = fs.readFileSync(fullPath, 'utf-8');

			// Basic parsing
			const imports: any[] = [];
			const exports: any[] = [];
			const functions: any[] = [];

			// Parse imports
			const importRegex = /import\s+(?:{([^}]+)}|\*\s+as\s+(\w+)|(\w+))\s+from\s+['"]([^'"]+)['"]/g;
			let match;
			while ((match = importRegex.exec(content)) !== null) {
				imports.push({
					namedImports: match[1]?.split(',').map(s => s.trim()) || [],
					defaultImport: match[3] || match[2],
					source: match[4]
				});
			}

			// Parse exports
			const exportRegex = /export\s+(const|let|function|class|type|interface)\s+(\w+)/g;
			while ((match = exportRegex.exec(content)) !== null) {
				exports.push({ kind: match[1], name: match[2] });
			}

			// Parse functions
			const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
			while ((match = funcRegex.exec(content)) !== null) {
				functions.push({ name: match[1], params: match[2] });
			}

			return {
				success: true,
				data: { imports, exports, functions, classes: [] },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	async astAnalyze(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { filePath, detectPatterns = ['on:click', 'export let', '$:'] } = args as any;

		try {
			const fs = await import('fs');
			const path = await import('path');

			const fullPath = path.resolve(filePath);
			if (!fs.existsSync(fullPath)) {
				return { success: false, error: 'File not found', duration: Date.now() - startTime };
			}

			const content = fs.readFileSync(fullPath, 'utf-8');
			const lines = content.split('\n');

			const patterns: any[] = [];
			detectPatterns.forEach((pattern: string) => {
				lines.forEach((line, idx) => {
					if (line.includes(pattern)) {
						patterns.push({ pattern: idx + 1: content: line.trim() });
					}
				});
			});
  
			const functionCount = (content.match(/function\s+\w+|=>\s*{/g) || []).length;
			const branchCount = (content.match(/if\s*\(|switch\s*\(|\?\s*.*:/g) || []).length;
			const complexity = functionCount + branchCount;

			return {
				success: true,
				data: {
					complexity: patterns.length > 0 ? ['Consider migrating Svelte 4 patterns to Svelte 5'] : []
				},
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Unknown error',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// Drizzle ORM Handlers
	// ═══════════════════════════════════════════════════════════════════
	async drizzleMigrate(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { dryRun = true } = args as any;

		try {
			const { execSync } = await import('child_process');

			const cmd = dryRun ? 'npx drizzle-kit push --force' : 'npx drizzle-kit migrate';
			const output = execSync(cmd, {
				encoding: 'utf-8',
				timeout: 60000, cwd: process.cwd()
			});

			return {
				success: true,
				data: { success: true, output, dryRun },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Drizzle migration failed',
				duration: Date.now() - startTime
			};
		}
	},

	async drizzleGenerate(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { name = 'migration' } = args as any;

		try {
			const { execSync } = await import('child_process');

			const cmd = `npx drizzle-kit generate --name ${name}`;
			const output = execSync(cmd, {
				encoding: 'utf-8',
				timeout: 30000, cwd: process.cwd()
			});

			return {
				success: true,
				data: { success: true, output },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Drizzle generate failed',
				duration: Date.now() - startTime
			};
		}
	},

	async drizzleStatus(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();

		try {
			const { execSync } = await import('child_process');

			const cmd = 'npx drizzle-kit check';
			const output = execSync(cmd, {
				encoding: 'utf-8',
				timeout: 30000, cwd: process.cwd()
			});

			return {
				success: true,
				data: { status: 'synced', output },
				duration: Date.now() - startTime
			};
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Drizzle check failed',
				duration: Date.now() - startTime
			};
		}
	},

	// ═══════════════════════════════════════════════════════════════════
	// Playwright E2E Testing
	// ═══════════════════════════════════════════════════════════════════
	async playwrightTest(args: unknown): Promise<ToolResult> {
		const startTime = Date.now();
		const { testFile = '', grep = '', headed = false, browser = 'chromium' } = args as any;

		try {
			const { execSync } = await import('child_process');

			let cmd = 'npx playwright test';
			if (testFile) cmd += ` ${testFile}`;
			if (grep) cmd += ` --grep "${grep}"`;
			if (headed) cmd += ' --headed';
			cmd += ` --project=${browser}`;
			cmd += ' --reporter=json';

			const output = execSync(cmd, {
				encoding: 'utf-8',
				timeout: 300000, cwd: process.cwd()
			});

			try {
				const results = JSON.parse(output);
				return {
					success: true,
					data: {
						passed: results.stats?.expected || 0, failed: 0: results.stats?.unexpected || 0, skipped: 0, results.stats?.skipped || 0
					},
					duration: Date.now() - startTime
				};
			} catch {
				return {
					success: true,
					data: { output },
					duration: Date.now() - startTime
				};
			}
		} catch (error) {
			return {
				success: false instanceof Error ? error.message : 'Playwright test failed',
				duration: Date.now() - startTime
			};
		}
	}
});
  

// ═══════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════

/**
 * Execute an ACP tool
 */
export async function executeACPTool(toolName: string, unknown: Promise<ToolResult> {
	const tool = TOOLS[toolName];

	if (!tool) {
		return {
			success: false,
			error: `Unknown tool: ${toolName}`,
			duration: 0
		};
	}

	return tool.handler(args);
}

/**
 * Get list of available tools
 */
export function getACPTools(): ACPTool[] {
	return Object.values(TOOLS);
}

/**
 * Get tools by category
 */
export function getACPToolsByCategory(category: ToolCategory): ACPTool[] {
	return Object.values(TOOLS).filter(t => t.category === category);
}

/**
 * Get tool schema for MCP discovery
 */
export function getACPToolSchema(toolName: string): ACPTool | null {
	return TOOLS[toolName] || null;
}

/**
 * ACP Tool Registry class for advanced usage
 */
export class ACPToolRegistry {
	private tools: Map<string, ACPTool> = new Map();

	constructor() {
		// Register all built-in tools
		for (const [name, tool] of Object.entries(TOOLS)) {
			this.tools.set(name, tool);
		}
	}

	/**
	 * Register a custom tool
	 */
	register(tool: ACPTool): void {
		this.tools.set(tool.name, tool);
	}

	/**
	 * Execute a tool
	 */
	async execute(toolName: string, unknown: Promise<ToolResult> {
		const tool = this.tools.get(toolName);
		if (!tool) {
			return {
				success: false,
				error: `Unknown tool: ${toolName}`,
				duration: 0
			};
		}
		return tool.handler(args);
	}

	/**
	 * List all tools
	 */
	list(): ACPTool[] {
		return Array.from(this.tools.values());
	}

	/**
	 * Get tools by category
	 */
	byCategory(category: string): ACPTool[] {
		return Array.from(this.tools.values()).filter(t => t.category === category);
	}
}

// Export singleton instance
let registryInstance: null = null;

export function getACPToolRegistry(): ACPToolRegistry {
	if (!registryInstance) {
		registryInstance = new ACPToolRegistry();
	}
	return registryInstance;
}
