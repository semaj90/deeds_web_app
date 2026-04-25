/**
 * 🤝 Phase 76: A2A (Agent-to-Agent) Protocol Handler
 *
 * Implements the Agent-to-Agent Protocol for multi-agent communication.
 * Allows Claude, Gemini, GPT-4, and local LLMs to collaborate on tasks.
 *
 * Features:
 * - Agent registration and discovery
 * - Task delegation and routing
 * - Result aggregation
 * - Conversation history sharing
 * - Tool capability broadcasting
 *
 * Protocol:
 * - /a2a/register - Register an agent
 * - /a2a/discover - Discover available agents
 * - /a2a/delegate - Delegate task to specific agent
 * - /a2a/broadcast - Broadcast to all agents
 * - /a2a/aggregate - Aggregate responses from multiple agents
 *
 * Usage:
 *   node scripts/phase76-a2a-protocol.mjs
 *   npm run phase76:a2a
 */

import express from 'express';
import cors from 'cors';
import chalk from 'chalk';
import dotenv from 'dotenv';
import fetch from 'node-fetch';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = parseInt(process.env.A2A_PORT || '3005');

// ═══════════════════════════════════════════════════════════════════════
// Agent Registry
// ═══════════════════════════════════════════════════════════════════════
const agents = new Map();

// Redis for distributed agent registry (optional)
let redis = null;
try {
	redis = new Redis({
		host: process.env.REDIS_HOST || 'localhost',
		port: parseInt(process.env.REDIS_PORT || '6379'),
		password: process.env.REDIS_PASSWORD || undefined,
		lazyConnect: true
	});
	redis.connect().catch(() => {
		console.log(chalk.yellow('⚠️ Redis unavailable, using in-memory registry'));
		redis = null;
	});
} catch {
	console.log(chalk.yellow('⚠️ Redis unavailable, using in-memory registry'));
}

// ═══════════════════════════════════════════════════════════════════════
// Agent Types
// ═══════════════════════════════════════════════════════════════════════
const AGENT_TYPES = {
	CLAUDE: 'claude',
	GEMINI: 'gemini',
	GPT4: 'gpt4',
	OLLAMA: 'ollama',
	KNOWLEDGE: 'knowledge',
	CODE_ANALYZER: 'code-analyzer',
	MIGRATION: 'migration'
};

const TASK_TYPES = {
	SEARCH: 'search',
	ANALYZE: 'analyze',
	GENERATE: 'generate',
	FIX: 'fix',
	MIGRATE: 'migrate',
	SUMMARIZE: 'summarize',
	DELEGATE: 'delegate'
};

// ═══════════════════════════════════════════════════════════════════════
// Protocol Implementation
// ═══════════════════════════════════════════════════════════════════════

/**
 * Register a new agent
 */
async function registerAgent(agent) {
	const agentId = agent.id || uuidv4();
	const agentRecord = {
		id: agentId,
		name: agent.name,
		type: agent.type,
		endpoint: agent.endpoint,
		capabilities: agent.capabilities || [],
		tools: agent.tools || [],
		status: 'active',
		registeredAt: new Date().toISOString(),
		lastSeen: new Date().toISOString()
	};

	agents.set(agentId, agentRecord);

	// Persist to Redis if available
	if (redis) {
		await redis.hset('a2a:agents', agentId, JSON.stringify(agentRecord));
		await redis.expire('a2a:agents', 86400); // 24h TTL
	}

	return agentRecord;
}

/**
 * Discover available agents
 */
async function discoverAgents(filter = {}) {
	let allAgents = Array.from(agents.values());

	// Load from Redis if available
	if (redis) {
		try {
			const redisAgents = await redis.hgetall('a2a:agents');
			for (const [id, json] of Object.entries(redisAgents)) {
				if (!agents.has(id)) {
					agents.set(id, JSON.parse(json));
				}
			}
			allAgents = Array.from(agents.values());
		} catch {
			// Use in-memory only
		}
	}

	// Apply filters
	if (filter.type) {
		allAgents = allAgents.filter(a => a.type === filter.type);
	}
	if (filter.capability) {
		allAgents = allAgents.filter(a => a.capabilities.includes(filter.capability));
	}
	if (filter.tool) {
		allAgents = allAgents.filter(a => a.tools.includes(filter.tool));
	}

	return allAgents.filter(a => a.status === 'active');
}

/**
 * Delegate task to specific agent
 */
async function delegateTask(agentId, task) {
	const agent = agents.get(agentId);
	if (!agent) {
		throw new Error(`Agent not found: ${agentId}`);
	}

	if (!agent.endpoint) {
		throw new Error(`Agent ${agentId} has no endpoint configured`);
	}

	const taskId = uuidv4();
	const startTime = Date.now();

	try {
		const response = await fetch(agent.endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				taskId,
				...task,
				delegatedBy: 'a2a-protocol',
				timestamp: new Date().toISOString()
			}),
			timeout: 120000 // 2 minute timeout
		});

		if (!response.ok) {
			throw new Error(`Agent responded with ${response.status}`);
		}

		const result = await response.json();

		// Update last seen
		agent.lastSeen = new Date().toISOString();

		return {
			taskId,
			agentId,
			agentName: agent.name,
			result,
			latencyMs: Date.now() - startTime,
			timestamp: new Date().toISOString()
		};

	} catch (error) {
		// Mark agent as potentially unavailable
		agent.status = 'error';
		agent.lastError = error.message;

		return {
			taskId,
			agentId,
			agentName: agent.name,
			error: error.message,
			latencyMs: Date.now() - startTime,
			timestamp: new Date().toISOString()
		};
	}
}

/**
 * Broadcast task to all matching agents
 */
async function broadcastTask(task, filter = {}) {
	const targetAgents = await discoverAgents(filter);

	if (targetAgents.length === 0) {
		return { error: 'No matching agents found', filter };
	}

	const results = await Promise.allSettled(
		targetAgents.map(agent => delegateTask(agent.id, task))
	);

	return {
		taskType: task.type,
		targetCount: targetAgents.length,
		results: results.map((r, i) => ({
			agent: targetAgents[i].name,
			status: r.status,
			value: r.status === 'fulfilled' ? r.value : { error: r.reason?.message }
		})),
		timestamp: new Date().toISOString()
	};
}

/**
 * Aggregate responses from multiple agents
 */
async function aggregateResponses(task, agentIds) {
	const results = await Promise.allSettled(
		agentIds.map(id => delegateTask(id, task))
	);

	const successful = results
		.filter(r => r.status === 'fulfilled' && !r.value.error)
		.map(r => r.value);

	// Simple aggregation: combine unique insights
	const aggregated = {
		task,
		agentCount: agentIds.length,
		successCount: successful.length,
		responses: successful,
		synthesized: null
	};

	// If we have multiple responses, try to synthesize them
	if (successful.length > 1) {
		const combinedText = successful
			.map((r, i) => `[Agent ${i + 1}: ${r.agentName}]\n${JSON.stringify(r.result)}`)
			.join('\n\n');

		aggregated.synthesized = `Aggregated ${successful.length} agent responses. See individual responses for details.`;
	}

	return aggregated;
}

// ═══════════════════════════════════════════════════════════════════════
// Built-in Agent Endpoints
// ═══════════════════════════════════════════════════════════════════════

// Register built-in agents on startup
async function registerBuiltInAgents() {
	// Knowledge Search Agent
	await registerAgent({
		id: 'knowledge-search',
		name: 'Knowledge Search Agent',
		type: AGENT_TYPES.KNOWLEDGE,
		endpoint: 'http://localhost:3004/invoke',
		capabilities: ['search', 'index', 'summarize'],
		tools: ['knowledge:search', 'knowledge:document', 'knowledge:stats']
	});

	// Ollama LLM Agent
	await registerAgent({
		id: 'ollama-llm',
		name: 'Ollama LLM Agent',
		type: AGENT_TYPES.OLLAMA,
		endpoint: 'http://localhost:11434/api/generate',
		capabilities: ['generate', 'summarize', 'analyze'],
		tools: ['generate', 'chat']
	});

	// Phase 76 ACE Agent
	await registerAgent({
		id: 'ace-agent',
		name: 'ACE Prompt Engineer',
		type: AGENT_TYPES.MIGRATION,
		endpoint: 'http://localhost:3002/function-call',
		capabilities: ['fix', 'migrate', 'analyze'],
		tools: ['svelte5-migrate', 'error-fix', 'code-analyze']
	});

	console.log(chalk.cyan('📋 Registered built-in agents:'));
	for (const [id, agent] of agents) {
		console.log(chalk.gray(`   • ${agent.name} (${id})`));
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Express Routes
// ═══════════════════════════════════════════════════════════════════════

// Health check
app.get('/health', (req, res) => {
	res.json({
		status: 'ok',
		service: 'a2a-protocol',
		version: '1.0.0',
		agentCount: agents.size
	});
});

// Register agent
app.post('/a2a/register', async (req, res) => {
	try {
		const agent = await registerAgent(req.body);
		res.json({ success: true, agent });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Discover agents
app.get('/a2a/discover', async (req, res) => {
	try {
		const filter = {
			type: req.query.type,
			capability: req.query.capability,
			tool: req.query.tool
		};
		const discovered = await discoverAgents(filter);
		res.json({ agents: discovered, count: discovered.length });
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Delegate task
app.post('/a2a/delegate', async (req, res) => {
	try {
		const { agentId, task } = req.body;
		if (!agentId || !task) {
			return res.status(400).json({ error: 'agentId and task are required' });
		}
		const result = await delegateTask(agentId, task);
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Broadcast task
app.post('/a2a/broadcast', async (req, res) => {
	try {
		const { task, filter } = req.body;
		if (!task) {
			return res.status(400).json({ error: 'task is required' });
		}
		const result = await broadcastTask(task, filter || {});
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Aggregate responses
app.post('/a2a/aggregate', async (req, res) => {
	try {
		const { task, agentIds } = req.body;
		if (!task || !agentIds || agentIds.length === 0) {
			return res.status(400).json({ error: 'task and agentIds are required' });
		}
		const result = await aggregateResponses(task, agentIds);
		res.json(result);
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// Unregister agent
app.delete('/a2a/agent/:id', async (req, res) => {
	try {
		const { id } = req.params;
		if (agents.has(id)) {
			agents.delete(id);
			if (redis) {
				await redis.hdel('a2a:agents', id);
			}
			res.json({ success: true, message: `Agent ${id} unregistered` });
		} else {
			res.status(404).json({ error: 'Agent not found' });
		}
	} catch (error) {
		res.status(500).json({ error: error.message });
	}
});

// ═══════════════════════════════════════════════════════════════════════
// Server Startup
// ═══════════════════════════════════════════════════════════════════════
app.listen(PORT, async () => {
	console.log(chalk.cyan.bold('\n🤝 Phase 76: A2A (Agent-to-Agent) Protocol Server\n'));
	console.log(chalk.gray(`   Port: ${PORT}`));
	console.log(chalk.gray(`   Redis: ${redis ? 'Connected' : 'In-memory only'}`));
	console.log('');

	await registerBuiltInAgents();

	console.log('');
	console.log(chalk.cyan('📡 Protocol Endpoints:'));
	console.log(chalk.gray('   POST /a2a/register   - Register an agent'));
	console.log(chalk.gray('   GET  /a2a/discover   - Discover agents'));
	console.log(chalk.gray('   POST /a2a/delegate   - Delegate to agent'));
	console.log(chalk.gray('   POST /a2a/broadcast  - Broadcast to all'));
	console.log(chalk.gray('   POST /a2a/aggregate  - Aggregate responses'));
	console.log('');
	console.log(chalk.green('✅ Ready for multi-agent collaboration\n'));
});

// Graceful shutdown
process.on('SIGINT', async () => {
	console.log(chalk.yellow('\n👋 Shutting down A2A server...'));
	if (redis) {
		await redis.quit();
	}
	process.exit(0);
});
