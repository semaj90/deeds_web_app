#!/usr/bin/env node
/**
 * Phase 76: Complete Agentic Workflow Demonstration
 *
 * This script demonstrates the full contextual engineering pipeline:
 * 1. RAG Retrieval (Qdrant knowledge base)
 * 2. MCP Tool Calling (FastMCP server)
 * 3. LLM Synthesis (Multi-provider)
 * 4. Result Display
 */

import chalk from 'chalk';

const TESTS = [
	{
		name: 'Knowledge Base Search',
		endpoint: 'http://localhost:5175/api/knowledge/search',
		query: 'TypeScript 5.6 breaking changes',
		synthesize: true
	},
	{
		name: 'Qdrant Direct Query',
		endpoint: 'http://localhost:6333/collections/phase76_knowledge_base',
		method: 'GET'
	},
	{
		name: 'MCP Tool Call (qdrant_search)',
		endpoint: 'http://localhost:3002/function-call',
		method: 'POST',
		body: {
			function: 'qdrant_search',
			arguments: {
				query: 'SvelteKit form actions',
				limit: 3,
				threshold: 0.5
			}
		}
	}
];

console.log(chalk.bold.cyan('\n🚀 Phase 76: Complete System Validation\n'));

async function testKnowledgeAPI() {
	console.log(chalk.yellow('Test 1: Knowledge Base Search API'));
	console.log(chalk.gray('   Testing: /api/knowledge/search'));

	try {
		const response = await fetch('http://localhost:5175/api/knowledge/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: 'TypeScript 5.6 breaking changes',
				limit: 3,
				threshold: 0.5,
				synthesize: true,
				provider: 'ollama'
			})
		});

		if (!response.ok) {
			throw new Error(`API error: ${response.statusText}`);
		}

		const data = await response.json();

		console.log(chalk.green(`   ✅ API Response Received`));
		console.log(chalk.white(`   📊 Results: ${data.results.length}`));
		console.log(chalk.white(`   ⏱️  Processing Time: ${data.metadata.processingTime}ms`));

		if (data.synthesized) {
			console.log(chalk.cyan(`   🤖 AI Synthesis: ${data.synthesized.substring(0, 100)}...`));
		}

		if (data.results.length > 0) {
			console.log(chalk.white(`   🎯 Top Result: ${data.results[0].title} (${(data.results[0].score * 100).toFixed(1)}%)`));
		}

		return true;
	} catch (error) {
		console.log(chalk.red(`   ❌ Failed: ${error.message}`));
		return false;
	}
}

async function testQdrantDirect() {
	console.log(chalk.yellow('\nTest 2: Qdrant Vector Database'));
	console.log(chalk.gray('   Testing: Direct Qdrant connection'));

	try {
		const response = await fetch('http://localhost:6333/collections/phase76_knowledge_base');

		if (!response.ok) {
			throw new Error('Qdrant not responding');
		}

		const data = await response.json();
		const { points_count, status } = data.result;

		console.log(chalk.green(`   ✅ Qdrant Connected`));
		console.log(chalk.white(`   📚 Documents: ${points_count}`));
		console.log(chalk.white(`   📊 Status: ${status}`));

		return true;
	} catch (error) {
		console.log(chalk.red(`   ❌ Failed: ${error.message}`));
		console.log(chalk.yellow(`   💡 Hint: Run "docker run -p 6333:6333 qdrant/qdrant"`));
		return false;
	}
}

async function testMCPServer() {
	console.log(chalk.yellow('\nTest 3: FastMCP Agentic Server'));
	console.log(chalk.gray('   Testing: Tool calling capabilities'));

	try {
		const response = await fetch('http://localhost:3002/function-call', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				function: 'qdrant_search',
				arguments: {
					query: 'SvelteKit form actions',
					limit: 3,
					threshold: 0.5
				}
			})
		});

		if (!response.ok) {
			throw new Error('MCP server not responding');
		}

		const data = await response.json();

		console.log(chalk.green(`   ✅ MCP Server Active`));
		console.log(chalk.white(`   🔧 Tool: qdrant_search`));
		console.log(chalk.white(`   📊 Results: ${data.result.results.length}`));

		if (data.result.results.length > 0) {
			console.log(chalk.cyan(`   🎯 Top Match: ${data.result.results[0].title}`));
		}

		return true;
	} catch (error) {
		console.log(chalk.yellow(`   ⚠️  Optional: ${error.message}`));
		console.log(chalk.gray(`   💡 Hint: Run "npm run phase76:mcp" to start MCP server`));
		return false;
	}
}

async function testOllama() {
	console.log(chalk.yellow('\nTest 4: Ollama LLM Service'));
	console.log(chalk.gray('   Testing: Embedding generation'));

	try {
		const response = await fetch('http://localhost:11434/api/embeddings', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: 'test query'
			})
		});

		if (!response.ok) {
			throw new Error('Ollama not responding');
		}

		const data = await response.json();

		console.log(chalk.green(`   ✅ Ollama Connected`));
		console.log(chalk.white(`   📐 Embedding Dimensions: ${data.embedding.length}`));
		console.log(chalk.white(`   🤖 Model: embeddinggemma:latest`));

		return true;
	} catch (error) {
		console.log(chalk.red(`   ❌ Failed: ${error.message}`));
		console.log(chalk.yellow(`   💡 Hint: Run "ollama serve" and "ollama pull embeddinggemma:latest"`));
		return false;
	}
}

async function displaySystemStatus(results) {
	console.log(chalk.bold.cyan('\n📊 System Status Summary\n'));

	const status = {
		'Knowledge API': results.api,
		'Qdrant DB': results.qdrant,
		'MCP Server': results.mcp,
		'Ollama LLM': results.ollama
	};

	for (const [service, working] of Object.entries(status)) {
		const icon = working ? '✅' : '❌';
		const color = working ? chalk.green : chalk.red;
		console.log(color(`${icon} ${service}`));
	}

	const allWorking = Object.values(status).filter(Boolean).length;
	const total = Object.values(status).length;

	console.log(chalk.bold(`\n🎯 ${allWorking}/${total} services operational`));

	if (allWorking === total) {
		console.log(chalk.green.bold('\n🎉 Full Phase 76 System Active!\n'));
		console.log(chalk.white('Next steps:'));
		console.log(chalk.cyan('  1. Open http://localhost:5175/knowledge for UI'));
		console.log(chalk.cyan('  2. Run ACE agent: npm run phase76:ace'));
		console.log(chalk.cyan('  3. Query API: curl http://localhost:5175/api/knowledge/search?q=test'));
	} else {
		console.log(chalk.yellow('\n⚠️  Some services need attention. See hints above.\n'));
	}
}

async function main() {
	console.log(chalk.gray('Starting comprehensive system tests...\n'));

	const results = {
		api: await testKnowledgeAPI(),
		qdrant: await testQdrantDirect(),
		mcp: await testMCPServer(),
		ollama: await testOllama()
	};

	await displaySystemStatus(results);
}

main().catch(error => {
	console.error(chalk.red('\n❌ Test suite failed:'), error);
	process.exit(1);
});
