#!/usr/bin/env node
/**
 * 🔄 Phase 76: ACP Batch Tool Executor
 *
 * Execute multiple ACP tools in sequence or parallel.
 *
 * Usage:
 *   node scripts/phase76-acp-batch.mjs --file tasks.json
 *   node scripts/phase76-acp-batch.mjs --parallel --file tasks.json
 *
 * Task file format (JSON):
 * [
 *   { "tool": "knowledge:search", "args": { "query": "Svelte 5" } },
 *   { "tool": "llm:generate", "args": { "prompt": "Hello" } }
 * ]
 */

import chalk from 'chalk';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════════════════
// Batch Executor
// ═══════════════════════════════════════════════════════════════════════

class BatchExecutor {
	constructor(options = {}) {
		this.parallel = options.parallel || false;
		this.verbose = options.verbose || false;
		this.stopOnError = options.stopOnError !== false;
	}

	async execute(tasks) {
		console.log(chalk.cyan.bold(`\n🔄 ACP Batch Executor\n`));
		console.log(chalk.gray(`   Mode: ${this.parallel ? 'Parallel' : 'Sequential'}`));
		console.log(chalk.gray(`   Tasks: ${tasks.length}`));
		console.log(chalk.gray(`   Stop on error: ${this.stopOnError}\n`));

		const startTime = Date.now();
		const results = [];

		if (this.parallel) {
			// Execute all tasks in parallel
			const promises = tasks.map((task, index) =>
				this.executeTask(task, index).catch(error => ({
					error: error.message,
					task: task.tool
				}))
			);
			const batchResults = await Promise.all(promises);
			results.push(...batchResults);
		} else {
			// Execute tasks sequentially
			for (let i = 0; i < tasks.length; i++) {
				try {
					const result = await this.executeTask(tasks[i], i);
					results.push(result);

					if (result.error && this.stopOnError) {
						console.log(chalk.red(`\n❌ Stopped at task ${i + 1} due to error\n`));
						break;
					}
				} catch (error) {
					results.push({ error: error.message, task: tasks[i].tool });
					if (this.stopOnError) break;
				}
			}
		}

		const duration = Date.now() - startTime;
		this.printSummary(results, duration);

		return results;
	}

	async executeTask(task, index) {
		const { tool, args = {} } = task;

		if (this.verbose) {
			console.log(chalk.cyan(`[${index + 1}] Executing: ${tool}`));
			console.log(chalk.gray(`    Args: ${JSON.stringify(args)}`));
		}

		const startTime = Date.now();

		try {
			// Import the tool registry
			const { executeACPTool } = await import('../src/lib/services/knowledge-search/ACPToolRegistry.ts');
			const result = await executeACPTool(tool, args);
			const duration = Date.now() - startTime;

			if (this.verbose) {
				if (result.success) {
					console.log(chalk.green(`    ✓ Success (${duration}ms)`));
				} else {
					console.log(chalk.red(`    ✗ Error: ${result.error}`));
				}
			}

			return {
				index,
				tool,
				success: result.success,
				data: result.data,
				error: result.error,
				duration
			};
		} catch (error) {
			const duration = Date.now() - startTime;

			if (this.verbose) {
				console.log(chalk.red(`    ✗ Exception: ${error.message}`));
			}

			return {
				index,
				tool,
				success: false,
				error: error.message,
				duration
			};
		}
	}

	printSummary(results, totalDuration) {
		console.log(chalk.cyan.bold(`\n📊 Batch Execution Summary\n`));

		const successful = results.filter(r => r.success).length;
		const failed = results.filter(r => !r.success).length;

		console.log(chalk.gray(`   Total tasks: ${results.length}`));
		console.log(chalk.green(`   ✓ Successful: ${successful}`));
		if (failed > 0) {
			console.log(chalk.red(`   ✗ Failed: ${failed}`));
		}
		console.log(chalk.gray(`   Total duration: ${totalDuration}ms\n`));

		// Show failed tasks
		if (failed > 0) {
			console.log(chalk.yellow('  Failed tasks:'));
			results
				.filter(r => !r.success)
				.forEach(r => {
					console.log(chalk.red(`    • ${r.tool}: ${r.error}`));
				});
			console.log('');
		}

		// Show successful tasks with timing
		if (this.verbose && successful > 0) {
			console.log(chalk.yellow('  Successful tasks:'));
			results
				.filter(r => r.success)
				.forEach(r => {
					console.log(chalk.green(`    ✓ ${r.tool} (${r.duration}ms)`));
				});
			console.log('');
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════
// Built-in Task Templates
// ═══════════════════════════════════════════════════════════════════════

const TASK_TEMPLATES = {
	'health-check': [
		{ tool: 'system:health', args: {} },
		{ tool: 'knowledge:stats', args: {} },
		{ tool: 'llm:models', args: {} }
	],
	'database-overview': [
		{ tool: 'db:tables', args: { schema: 'public' } },
		{ tool: 'cache:stats', args: {} },
		{ tool: 'minio:stats', args: {} }
	],
	'knowledge-demo': [
		{ tool: 'knowledge:search', args: { query: 'Svelte 5 runes', topK: 3 } },
		{ tool: 'knowledge:search', args: { query: 'TypeScript generics', topK: 3 } },
		{ tool: 'knowledge:stats', args: {} }
	],
	'llm-test': [
		{ tool: 'llm:models', args: {} },
		{ tool: 'llm:generate', args: { prompt: 'Hello, world!', maxTokens: 50 } },
		{ tool: 'llm:embed', args: { text: 'Test embedding' } }
	]
};

// ═══════════════════════════════════════════════════════════════════════
// Main Entry Point
// ═══════════════════════════════════════════════════════════════════════

async function main() {
	const args = process.argv.slice(2);

	// Parse command-line arguments
	const options = {
		parallel: args.includes('--parallel') || args.includes('-p'),
		verbose: args.includes('--verbose') || args.includes('-v'),
		stopOnError: !args.includes('--continue-on-error'),
		file: null,
		template: null
	};

	// Get file path
	const fileIndex = args.indexOf('--file');
	if (fileIndex >= 0 && args[fileIndex + 1]) {
		options.file = args[fileIndex + 1];
	}

	// Get template name
	const templateIndex = args.indexOf('--template');
	if (templateIndex >= 0 && args[templateIndex + 1]) {
		options.template = args[templateIndex + 1];
	}

	// Load tasks
	let tasks = [];

	if (options.template) {
		tasks = TASK_TEMPLATES[options.template];
		if (!tasks) {
			console.log(chalk.red(`\n❌ Unknown template: ${options.template}\n`));
			console.log(chalk.yellow('Available templates:'));
			Object.keys(TASK_TEMPLATES).forEach(name => {
				console.log(chalk.gray(`  • ${name}`));
			});
			console.log('');
			process.exit(1);
		}
		console.log(chalk.cyan(`\n📋 Using template: ${options.template}\n`));
	} else if (options.file) {
		try {
			const content = fs.readFileSync(options.file, 'utf-8');
			tasks = JSON.parse(content);
		} catch (error) {
			console.log(chalk.red(`\n❌ Error loading file: ${error.message}\n`));
			process.exit(1);
		}
	} else {
		// Show help
		console.log(chalk.cyan.bold('\n🔄 ACP Batch Tool Executor\n'));
		console.log('Usage:');
		console.log(chalk.gray('  node scripts/phase76-acp-batch.mjs --file <path>'));
		console.log(chalk.gray('  node scripts/phase76-acp-batch.mjs --template <name>'));
		console.log(chalk.gray('  node scripts/phase76-acp-batch.mjs --template health-check --parallel'));
		console.log('');
		console.log('Options:');
		console.log(chalk.gray('  --parallel, -p           Execute tasks in parallel'));
		console.log(chalk.gray('  --verbose, -v            Show detailed output'));
		console.log(chalk.gray('  --continue-on-error      Continue after errors'));
		console.log(chalk.gray('  --file <path>            Load tasks from JSON file'));
		console.log(chalk.gray('  --template <name>        Use built-in template'));
		console.log('');
		console.log('Templates:');
		Object.keys(TASK_TEMPLATES).forEach(name => {
			console.log(chalk.gray(`  • ${name}`));
		});
		console.log('');
		console.log('Task file format (JSON):');
		console.log(chalk.gray('  ['));
		console.log(chalk.gray('    { "tool": "knowledge:search", "args": { "query": "Svelte 5" } },'));
		console.log(chalk.gray('    { "tool": "llm:generate", "args": { "prompt": "Hello" } }'));
		console.log(chalk.gray('  ]'));
		console.log('');
		return;
	}

	if (tasks.length === 0) {
		console.log(chalk.red('\n❌ No tasks to execute\n'));
		return;
	}

	// Execute batch
	const executor = new BatchExecutor(options);
	const results = await executor.execute(tasks);

	// Exit with error code if any tasks failed
	const failed = results.filter(r => !r.success).length;
	process.exit(failed > 0 ? 1 : 0);
}

main().catch(error => {
	console.error(chalk.red(`\n❌ Fatal error: ${error.message}\n`));
	process.exit(1);
});
