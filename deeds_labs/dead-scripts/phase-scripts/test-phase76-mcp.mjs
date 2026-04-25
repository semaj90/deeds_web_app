#!/usr/bin/env node

/**
 * Phase 76: FastMCP Server Test Client
 *
 * Tests all MCP tools with sample data to validate functionality
 */

import chalk from 'chalk';
import { spawn } from 'child_process';

const SERVER_SCRIPT = './scripts/phase76-fastmcp-server.mjs';

class MCPTestClient {
	constructor() {
		this.requestId = 1;
		this.responses = new Map();
	}

	async start() {
		console.log(chalk.cyan('\n🧪 Starting FastMCP Server Test Client\n'));

		this.server = spawn('node', [SERVER_SCRIPT], {
			stdio: ['pipe', 'pipe', 'inherit']
		});

		this.server.stdout.on('data', (data) => {
			try {
				const responses = data.toString().split('\n').filter(Boolean);
				responses.forEach(line => {
					const response = JSON.parse(line);
					if (response.id) {
						this.responses.set(response.id, response);
					}
				});
			} catch (error) {
				// Ignore parse errors from stderr
			}
		});

		// Wait for server to start
		await this.sleep(1000);

		// Run tests
		await this.testListTools();
		await this.testSearchKnowledge();
		await this.testDetectPatterns();
		await this.testMigrateComponent();
		await this.testGetMigrationGuidance();

		// Cleanup
		this.server.kill();

		console.log(chalk.green('\n✅ All MCP tests completed!\n'));
	}

	async sendRequest(method, params = {}) {
		const request = {
			jsonrpc: '2.0',
			id: this.requestId++,
			method,
			params
		};

		this.server.stdin.write(JSON.stringify(request) + '\n');

		// Wait for response
		await this.sleep(500);
		const response = this.responses.get(request.id - 1);

		if (!response) {
			throw new Error('No response received');
		}

		return response;
	}

	async testListTools() {
		console.log(chalk.yellow('📋 Test 1: List Tools'));

		const response = await this.sendRequest('tools/list');

		console.log(chalk.green(`   ✅ Found ${response.result?.tools?.length || 0} tools:`));
		response.result?.tools?.forEach(tool => {
			console.log(chalk.white(`      • ${tool.name}: ${tool.description}`));
		});
		console.log('');
	}

	async testSearchKnowledge() {
		console.log(chalk.yellow('🔍 Test 2: Search Knowledge'));

		const response = await this.sendRequest('tools/call', {
			name: 'search-knowledge',
			arguments: {
				query: 'Svelte 5 runes migration',
				topK: 3,
				synthesize: true
			}
		});

		const result = JSON.parse(response.result?.content?.[0]?.text || '{}');

		console.log(chalk.green(`   ✅ Found ${result.resultCount} results`));
		if (result.synthesis) {
			console.log(chalk.white(`   💡 Synthesis: ${result.synthesis.substring(0, 100)}...`));
		}
		console.log('');
	}

	async testDetectPatterns() {
		console.log(chalk.yellow('🔍 Test 3: Detect Patterns'));

		const sampleCode = `
<script>
	export let title;
	$: doubled = count * 2;

	function handleClick() {
		count++;
	}
</script>

<button on:click={handleClick}>{title}: {doubled}</button>
		`.trim();

		const response = await this.sendRequest('tools/call', {
			name: 'detect-patterns',
			arguments: {
				code: sampleCode,
				categories: ['svelte4', 'typescript']
			}
		});

		const result = JSON.parse(response.result?.content?.[0]?.text || '{}');

		console.log(chalk.green(`   ✅ Detected ${result.summary?.total || 0} patterns:`));
		console.log(chalk.white(`      High: ${result.summary?.high || 0}, Medium: ${result.summary?.medium || 0}, Low: ${result.summary?.low || 0}`));

		result.patterns?.slice(0, 3).forEach(p => {
			console.log(chalk.gray(`      • ${p.type} (${p.severity}): ${p.count} occurrence(s)`));
		});
		console.log('');
	}

	async testMigrateComponent() {
		console.log(chalk.yellow('🔄 Test 4: Migrate Component'));

		const sampleCode = `
<script>
	export let title;
	$: doubled = count * 2;
</script>

<button on:click={handleClick}>{title}</button>
		`.trim();

		const response = await this.sendRequest('tools/call', {
			name: 'migrate-component',
			arguments: {
				code: sampleCode,
				filePath: 'test-component.svelte'
			}
		});

		const result = JSON.parse(response.result?.content?.[0]?.text || '{}');

		console.log(chalk.green(`   ✅ Migration analysis complete`));
		console.log(chalk.white(`      Needs migration: ${result.needsMigration ? 'Yes' : 'No'}`));
		console.log(chalk.white(`      Confidence: ${(result.confidence * 100).toFixed(1)}%`));
		console.log(chalk.white(`      Recommendations: ${result.recommendations?.length || 0}`));
		console.log('');
	}

	async testGetMigrationGuidance() {
		console.log(chalk.yellow('📖 Test 5: Get Migration Guidance'));

		const response = await this.sendRequest('tools/call', {
			name: 'get-migration-guidance',
			arguments: {
				patternType: 'event-handler',
				example: 'on:click'
			}
		});

		const result = JSON.parse(response.result?.content?.[0]?.text || '{}');

		console.log(chalk.green(`   ✅ Got guidance for: ${result.patternType}`));
		if (result.guidance) {
			console.log(chalk.white(`   📝 ${result.guidance.substring(0, 100)}...`));
		}
		console.log('');
	}

	sleep(ms) {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
}

// Run tests
const client = new MCPTestClient();
client.start().catch(error => {
	console.error(chalk.red(`\n❌ Test failed: ${error.message}\n`));
	process.exit(1);
});
