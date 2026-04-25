#!/usr/bin/env node
/**
 * 🛠️ Phase 76: ACP Tool CLI
 *
 * Interactive command-line interface for the Agent Communication Protocol tools.
 *
 * Usage:
 *   node scripts/phase76-acp-cli.mjs tools              # List all tools
 *   node scripts/phase76-acp-cli.mjs execute <tool>     # Execute a tool
 *   node scripts/phase76-acp-cli.mjs schema <tool>      # Show tool schema
 *   node scripts/phase76-acp-cli.mjs stats              # Show tool statistics
 *   node scripts/phase76-acp-cli.mjs interactive        # Interactive mode
 *
 * Examples:
 *   npm run phase76:acp:tools
 *   npm run phase76:acp:execute -- knowledge:search --query "Svelte 5"
 *   npm run phase76:acp:schema -- llm:generate
 */

import chalk from 'chalk';
import fetch from 'node-fetch';
import readline from 'readline';

// Configuration
const CONFIG = {
	endpoints: {
		acp: process.env.ACP_URL || 'http://localhost:5175/api/acp',
		knowledgeMcp: process.env.KNOWLEDGE_MCP_URL || 'http://localhost:3004',
		a2a: process.env.A2A_URL || 'http://localhost:3005',
		ollama: process.env.OLLAMA_URL || 'http://localhost:11434',
		qdrant: process.env.QDRANT_URL || 'http://localhost:6333',
		redis: process.env.REDIS_URL || 'http://localhost:6379',
		minio: process.env.MINIO_URL || 'http://localhost:9000',
		postgres: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/legal'
	}
};

// Tool definitions for direct execution (when MCP servers are not running)
const TOOLS = {
	// ─────────────────────────────────────────────────────────────────
	// Knowledge Tools
	// ─────────────────────────────────────────────────────────────────
	'knowledge:search': {
		description: 'Search knowledge base using semantic similarity',
		category: 'knowledge',
		execute: async (args) => {
			const { query, topK = 5, synthesize = false } = args;
			try {
				const res = await fetch(`${CONFIG.endpoints.knowledgeMcp}/invoke`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ tool: 'knowledge:search', params: { query, topK, synthesize } })
				});
				return res.ok ? await res.json() : { error: 'MCP unavailable' };
			} catch {
				return { error: 'Knowledge MCP not running', suggestion: 'npm run phase76:knowledge:mcp' };
			}
		}
	},

	'knowledge:stats': {
		description: 'Get knowledge base statistics',
		category: 'knowledge',
		execute: async () => {
			try {
				const res = await fetch(`${CONFIG.endpoints.qdrant}/collections/knowledge_base`);
				const data = await res.json();
				return {
					collection: 'knowledge_base',
					points: data.result?.points_count || 0,
					vectors: data.result?.vectors_count || 0,
					status: data.result?.status || 'unknown'
				};
			} catch {
				return { error: 'Qdrant not available' };
			}
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Database Tools
	// ─────────────────────────────────────────────────────────────────
	'db:query': {
		description: 'Execute a read-only SQL query against PostgreSQL',
		category: 'database',
		execute: async (args) => {
			const { query } = args;
			if (!query?.trim().toLowerCase().startsWith('select')) {
				return { error: 'Only SELECT queries allowed for safety' };
			}
			return { info: 'db:query requires pg client - use from TypeScript', query };
		}
	},

	'db:tables': {
		description: 'List all tables in the database',
		category: 'database',
		execute: async () => {
			return {
				info: 'Use psql or pg client to query tables',
				command: "docker exec phase66-postgres psql -U user -d legal -c '\\dt'"
			};
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Cache Tools (Redis)
	// ─────────────────────────────────────────────────────────────────
	'cache:get': {
		description: 'Get a value from Redis cache',
		category: 'cache',
		execute: async (args) => {
			const { key } = args;
			return {
				info: 'Redis cache get',
				command: `docker exec phase66-redis redis-cli GET "${key}"`,
				key
			};
		}
	},

	'cache:set': {
		description: 'Set a value in Redis cache',
		category: 'cache',
		execute: async (args) => {
			const { key, value, ttl = 3600 } = args;
			return {
				info: 'Redis cache set',
				command: `docker exec phase66-redis redis-cli SETEX "${key}" ${ttl} "${value}"`,
				key,
				ttl
			};
		}
	},

	'cache:stats': {
		description: 'Get Redis cache statistics',
		category: 'cache',
		execute: async () => {
			return {
				info: 'Redis stats',
				command: 'docker exec phase66-redis redis-cli INFO memory'
			};
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Storage Tools (MinIO)
	// ─────────────────────────────────────────────────────────────────
	'minio:upload': {
		description: 'Upload a file to MinIO storage',
		category: 'storage',
		execute: async (args) => {
			const { bucket, key, filePath } = args;
			return {
				info: 'MinIO upload',
				bucket,
				key,
				filePath,
				command: `mc cp ${filePath} minio/${bucket}/${key}`
			};
		}
	},

	'minio:list': {
		description: 'List objects in a MinIO bucket',
		category: 'storage',
		execute: async (args) => {
			const { bucket = 'phase76-knowledge' } = args;
			return {
				info: 'MinIO list',
				bucket,
				command: `mc ls minio/${bucket}`
			};
		}
	},

	'minio:stats': {
		description: 'Get MinIO storage statistics',
		category: 'storage',
		execute: async () => {
			try {
				const res = await fetch(`${CONFIG.endpoints.minio}/minio/health/live`);
				return { status: res.ok ? 'healthy' : 'unhealthy', statusCode: res.status };
			} catch {
				return { status: 'unavailable', error: 'MinIO not running' };
			}
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// LLM Tools
	// ─────────────────────────────────────────────────────────────────
	'llm:generate': {
		description: 'Generate text using Ollama LLM',
		category: 'llm',
		execute: async (args) => {
			const { prompt, model = 'gemma3-legal:latest', temperature = 0.3 } = args;
			try {
				const res = await fetch(`${CONFIG.endpoints.ollama}/api/generate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model, prompt, stream: false, options: { temperature } })
				});
				const data = await res.json();
				return { text: data.response, model, evalCount: data.eval_count };
			} catch {
				return { error: 'Ollama not available' };
			}
		}
	},

	'llm:embed': {
		description: 'Generate embedding vector for text',
		category: 'llm',
		execute: async (args) => {
			const { text, model = 'embeddinggemma:latest' } = args;
			try {
				const res = await fetch(`${CONFIG.endpoints.ollama}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model, prompt: text })
				});
				const data = await res.json();
				return { dimension: data.embedding?.length || 0, preview: data.embedding?.slice(0, 5) };
			} catch {
				return { error: 'Ollama not available' };
			}
		}
	},

	'llm:models': {
		description: 'List available Ollama models',
		category: 'llm',
		execute: async () => {
			try {
				const res = await fetch(`${CONFIG.endpoints.ollama}/api/tags`);
				const data = await res.json();
				return {
					models: data.models?.map(m => ({
						name: m.name,
						size: `${(m.size / 1e9).toFixed(1)} GB`,
						modified: m.modified_at
					})) || []
				};
			} catch {
				return { error: 'Ollama not available' };
			}
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Code Tools
	// ─────────────────────────────────────────────────────────────────
	'code:analyze': {
		description: 'Run svelte-check on a file or directory',
		category: 'code',
		execute: async (args) => {
			const { path = 'src' } = args;
			return {
				info: 'Code analysis',
				command: `npx svelte-check --threshold warning --filter "${path}"`,
				path
			};
		}
	},

	'code:search': {
		description: 'Search code using ripgrep pattern',
		category: 'code',
		execute: async (args) => {
			const { pattern, path = 'src', fileType } = args;
			const ext = fileType ? `-g "*.${fileType}"` : '';
			return {
				info: 'Code search',
				command: `rg "${pattern}" ${path} ${ext}`,
				pattern,
				path
			};
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Agent Tools
	// ─────────────────────────────────────────────────────────────────
	'agent:discover': {
		description: 'Discover available agents via A2A protocol',
		category: 'agent',
		execute: async () => {
			try {
				const res = await fetch(`${CONFIG.endpoints.a2a}/a2a/discover`);
				return await res.json();
			} catch {
				return { error: 'A2A Protocol not running', suggestion: 'npm run phase76:a2a' };
			}
		}
	},

	'agent:delegate': {
		description: 'Delegate task to another agent',
		category: 'agent',
		execute: async (args) => {
			const { agentId, task } = args;
			try {
				const res = await fetch(`${CONFIG.endpoints.a2a}/a2a/delegate`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ agentId, task })
				});
				return await res.json();
			} catch {
				return { error: 'A2A Protocol not running' };
			}
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Fix/Migration Tools
	// ─────────────────────────────────────────────────────────────────
	'fix:svelte5': {
		description: 'Detect Svelte 4 patterns needing migration',
		category: 'fix',
		execute: async (args) => {
			const { file } = args;
			return {
				info: 'Svelte 5 migration check',
				command: `node scripts/phase76-svelte5-migration-agent.mjs --file "${file}"`,
				file
			};
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// System Tools
	// ─────────────────────────────────────────────────────────────────
	'system:health': {
		description: 'Check health of all services',
		category: 'system',
		execute: async () => {
			const services = [
				{ name: 'Ollama', url: `${CONFIG.endpoints.ollama}/api/tags` },
				{ name: 'Qdrant', url: `${CONFIG.endpoints.qdrant}/health` },
				{ name: 'MinIO', url: `${CONFIG.endpoints.minio}/minio/health/live` },
				{ name: 'Knowledge MCP', url: `${CONFIG.endpoints.knowledgeMcp}/health` },
				{ name: 'A2A Protocol', url: `${CONFIG.endpoints.a2a}/health` }
			];

			const results = await Promise.allSettled(
				services.map(async s => {
					try {
						const res = await fetch(s.url, { timeout: 5000 });
						return { name: s.name, status: res.ok ? 'healthy' : 'unhealthy' };
					} catch {
						return { name: s.name, status: 'offline' };
					}
				})
			);

			return {
				services: results.map((r, i) => ({
					...services[i],
					...((r.status === 'fulfilled' ? r.value : { status: 'error' }))
				}))
			};
		}
	},

	// ─────────────────────────────────────────────────────────────────
	// Vector / Embedding Tools
	// ─────────────────────────────────────────────────────────────────
	'vector:similarity': {
		description: 'Find similar vectors in Qdrant collection',
		category: 'vector',
		execute: async (args) => {
			const { text, topK = 5 } = args;
			try {
				const embedRes = await fetch(`${CONFIG.endpoints.ollama}/api/embeddings`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text })
				});
				if (!embedRes.ok) return { error: 'Embedding failed' };
				const embedData = await embedRes.json();

				const searchRes = await fetch(`${CONFIG.endpoints.qdrant}/collections/knowledge_base/points/search`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ vector: embedData.embedding, limit: topK, with_payload: true })
				});
				if (!searchRes.ok) return { error: 'Qdrant search failed' };
				const searchData = await searchRes.json();
				return { results: searchData.result?.slice(0, topK) || [], count: searchData.result?.length || 0 };
			} catch { return { error: 'Vector search failed' }; }
		}
	},

	'ast:parse': {
		description: 'Parse a TypeScript/Svelte file',
		category: 'ast',
		execute: async (args) => {
			const { filePath } = args;
			const fs = await import('fs');
			const content = fs.readFileSync(filePath, 'utf-8');
			const imports = [...content.matchAll(/import\s+.+from\s+['"](.+)['"]/g)].map(m => m[1]);
			const exports = [...content.matchAll(/export\s+(const|let|function|class)\s+(\w+)/g)].map(m => m[2]);
			return { imports, exports, lines: content.split('\n').length };
		}
	},

	'ast:analyze': {
		description: 'Analyze code for Svelte 4 patterns',
		category: 'ast',
		execute: async (args) => {
			const { filePath } = args;
			const fs = await import('fs');
			const content = fs.readFileSync(filePath, 'utf-8');
			const patterns = ['on:click', 'export let', '$:'];
			const matches = patterns.flatMap(p => [...content.matchAll(new RegExp(p, 'g'))].map(() => p));
			return { patterns: matches, needsMigration: matches.length > 0 };
		}
	},

	'drizzle:migrate': {
		description: 'Run Drizzle ORM migrations',
		category: 'drizzle',
		execute: async () => ({ command: 'npx drizzle-kit push' })
	},

	'drizzle:status': {
		description: 'Check Drizzle migration status',
		category: 'drizzle',
		execute: async () => ({ command: 'npx drizzle-kit check' })
	},

	'playwright:test': {
		description: 'Run Playwright E2E tests',
		category: 'testing',
		execute: async (args) => {
			const { grep, headed } = args;
			let cmd = 'npx playwright test';
			if (grep) cmd += ` --grep "${grep}"`;
			if (headed) cmd += ' --headed';
			return { command: cmd };
		}
	}
};

// ═══════════════════════════════════════════════════════════════════════
// CLI Commands
// ═══════════════════════════════════════════════════════════════════════

async function listTools(category) {
	console.log(chalk.cyan.bold('\n📋 ACP Tool Registry\n'));

	const tools = Object.entries(TOOLS);
	const categories = [...new Set(tools.map(([, t]) => t.category))];

	if (category) {
		const filtered = tools.filter(([, t]) => t.category === category);
		console.log(chalk.yellow(`Category: ${category}`));
		filtered.forEach(([name, tool]) => {
			console.log(`  ${chalk.green(name.padEnd(20))} ${chalk.gray(tool.description)}`);
		});
	} else {
		for (const cat of categories) {
			console.log(chalk.yellow.bold(`\n  ${cat.toUpperCase()}`));
			tools
				.filter(([, t]) => t.category === cat)
				.forEach(([name, tool]) => {
					console.log(`    ${chalk.green(name.padEnd(22))} ${chalk.gray(tool.description)}`);
				});
		}
	}

	console.log(chalk.gray(`\n  Total: ${tools.length} tools across ${categories.length} categories\n`));
}

async function executeTool(toolName, args) {
	const tool = TOOLS[toolName];

	if (!tool) {
		console.log(chalk.red(`\n❌ Unknown tool: ${toolName}`));
		console.log(chalk.gray(`   Run 'npm run phase76:acp:tools' to see available tools\n`));
		return;
	}

	console.log(chalk.cyan(`\n🔧 Executing: ${toolName}`));
	console.log(chalk.gray(`   Category: ${tool.category}`));
	console.log(chalk.gray(`   Args: ${JSON.stringify(args)}\n`));

	const startTime = Date.now();

	try {
		const result = await tool.execute(args);
		const duration = Date.now() - startTime;

		console.log(chalk.green('✅ Result:'));
		console.log(JSON.stringify(result, null, 2));
		console.log(chalk.gray(`\n   Duration: ${duration}ms\n`));
	} catch (error) {
		console.log(chalk.red(`\n❌ Error: ${error.message}\n`));
	}
}

async function showSchema(toolName) {
	const tool = TOOLS[toolName];

	if (!tool) {
		console.log(chalk.red(`\n❌ Unknown tool: ${toolName}\n`));
		return;
	}

	console.log(chalk.cyan.bold(`\n📜 Schema: ${toolName}\n`));
	console.log(chalk.gray(`   Description: ${tool.description}`));
	console.log(chalk.gray(`   Category:    ${tool.category}`));
	console.log('');
}

async function showStats() {
	console.log(chalk.cyan.bold('\n📊 ACP System Statistics\n'));

	// Service health
	const health = await TOOLS['system:health'].execute();
	console.log(chalk.yellow('  Services:'));
	health.services.forEach(s => {
		const icon = s.status === 'healthy' ? chalk.green('●') :
					 s.status === 'offline' ? chalk.red('○') : chalk.yellow('◐');
		console.log(`    ${icon} ${s.name.padEnd(18)} ${chalk.gray(s.status)}`);
	});

	// Knowledge stats
	console.log(chalk.yellow('\n  Knowledge Base:'));
	const kbStats = await TOOLS['knowledge:stats'].execute();
	if (kbStats.error) {
		console.log(chalk.red(`    ✗ ${kbStats.error}`));
	} else {
		console.log(`    Points: ${kbStats.points}`);
		console.log(`    Status: ${kbStats.status}`);
	}

	// LLM models
	console.log(chalk.yellow('\n  LLM Models:'));
	const models = await TOOLS['llm:models'].execute();
	if (models.error) {
		console.log(chalk.red(`    ✗ ${models.error}`));
	} else {
		models.models?.slice(0, 3).forEach(m => {
			console.log(`    • ${m.name} (${m.size})`);
		});
	}

	console.log('');
}

async function interactiveMode() {
	console.log(chalk.cyan.bold('\n🤖 ACP Interactive Mode\n'));
	console.log(chalk.gray('   Commands: tools, execute <tool>, schema <tool>, stats, health, quit\n'));

	const rl = readline.createInterface({
		input: process.stdin,
		output: process.stdout
	});

	const prompt = () => {
		rl.question(chalk.green('acp> '), async (line) => {
			const [cmd, ...rest] = line.trim().split(/\s+/);

			switch (cmd) {
				case 'tools':
					await listTools(rest[0]);
					break;
				case 'execute':
				case 'exec':
					if (rest[0]) {
						const args = parseArgs(rest.slice(1));
						await executeTool(rest[0], args);
					}
					break;
				case 'schema':
					if (rest[0]) await showSchema(rest[0]);
					break;
				case 'stats':
					await showStats();
					break;
				case 'health':
					const h = await TOOLS['system:health'].execute();
					console.log(JSON.stringify(h, null, 2));
					break;
				case 'quit':
				case 'exit':
					console.log(chalk.gray('\nGoodbye!\n'));
					rl.close();
					return;
				default:
					if (cmd) console.log(chalk.yellow(`Unknown command: ${cmd}`));
			}

			prompt();
		});
	};

	prompt();
}

function parseArgs(args) {
	const result = {};
	for (let i = 0; i < args.length; i++) {
		if (args[i].startsWith('--')) {
			const key = args[i].slice(2);
			const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
			result[key] = value;
		}
	}
	return result;
}

// ═══════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════

async function main() {
	const [, , command, ...rest] = process.argv;

	switch (command) {
		case 'tools':
			await listTools(rest[0]);
			break;
		case 'execute':
		case 'exec':
			const args = parseArgs(rest.slice(1));
			await executeTool(rest[0], args);
			break;
		case 'schema':
			await showSchema(rest[0]);
			break;
		case 'stats':
			await showStats();
			break;
		case 'interactive':
		case 'i':
			await interactiveMode();
			break;
		default:
			console.log(chalk.cyan.bold('\n🛠️  ACP Tool CLI - Phase 76\n'));
			console.log('Usage:');
			console.log(chalk.gray('  npm run phase76:acp:tools              # List all tools'));
			console.log(chalk.gray('  npm run phase76:acp:execute            # Execute a tool'));
			console.log(chalk.gray('  npm run phase76:acp:schema             # Show tool schema'));
			console.log(chalk.gray('  npm run phase76:acp:stats              # System statistics'));
			console.log('');
			console.log('Examples:');
			console.log(chalk.gray('  node scripts/phase76-acp-cli.mjs tools'));
			console.log(chalk.gray('  node scripts/phase76-acp-cli.mjs execute llm:generate --prompt "Hello"'));
			console.log(chalk.gray('  node scripts/phase76-acp-cli.mjs execute knowledge:search --query "Svelte 5"'));
			console.log(chalk.gray('  node scripts/phase76-acp-cli.mjs interactive'));
			console.log('');
	}
}

main().catch(console.error);
