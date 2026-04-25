#!/usr/bin/env node
/**
 * 🎮 Phase 76: ACE Interactive CLI
 *
 * A beautiful, interactive command-line interface for the ACE Agent system.
 * Supports multiple LLM providers, task types, and streaming output.
 *
 * Features:
 * - Provider selection (Ollama, Gemini, Claude, GPT-4)
 * - Task type selection (search, fix, analyze, generate)
 * - Interactive prompts with streaming
 * - Web search integration (Gemini)
 * - Session history
 *
 * Usage:
 *   node scripts/phase76-ace-cli.mjs
 *   node scripts/phase76-ace-cli.mjs --provider gemini --task analyze
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the LLM router and ACE engine
let callLLM, ACEPromptEngineer;
try {
	const llmRouter = await import('./llm-router.mjs');
	callLLM = llmRouter.callLLM;

	const aceModule = await import('./phase76-ace-prompt-engineer.mjs');
	ACEPromptEngineer = aceModule.ACEPromptEngineer;
} catch (error) {
	console.error(chalk.red('❌ Failed to import required modules:'), error.message);
	process.exit(1);
}

// ============================================
// Configuration
// ============================================
const CONFIG = {
	providers: [
		{ name: '🦙 Ollama (Local - gemma3-legal)', value: 'ollama', icon: '🦙' },
		{ name: '🔮 Gemini 3 (Google Search)', value: 'gemini', icon: '🔮' },
		{ name: '🧠 Claude (Anthropic)', value: 'claude', icon: '🧠' },
		{ name: '🤖 GPT-4 (OpenAI)', value: 'openai', icon: '🤖' }
	],
	taskTypes: [
		{ name: '🔍 Search - Find relevant code/docs', value: 'search', icon: '🔍' },
		{ name: '🔧 Fix - Repair errors and issues', value: 'fix', icon: '🔧' },
		{ name: '📊 Analyze - Understand patterns', value: 'analyze', icon: '📊' },
		{ name: '✨ Generate - Create new code', value: 'generate', icon: '✨' },
		{ name: '🌐 Web Search - Gemini grounded search', value: 'web-search', icon: '🌐' }
	],
	presetPrompts: {
		search: [
			'Find all TypeScript errors related to missing imports',
			'Search for Svelte 5 runes usage patterns',
			'Find deprecated event handler syntax'
		],
		fix: [
			'Fix TypeScript import errors in component files',
			'Repair broken Drizzle ORM queries',
			'Update deprecated Svelte event handlers'
		],
		analyze: [
			'Analyze the most common TypeScript error patterns',
			'Identify performance bottlenecks in the codebase',
			'Review authentication flow for security issues'
		],
		generate: [
			'Generate a Svelte 5 component with runes',
			'Create a SvelteKit API endpoint with validation',
			'Build a reusable form component with superforms'
		],
		'web-search': [
			'What are the latest TypeScript 5.7 features?',
			'How to implement OAuth2 in SvelteKit 2.0?',
			'Best practices for pg_vector embeddings'
		]
	},
	historyFile: path.join(__dirname, '../logs/phase76/cli-history.jsonl'),
	maxHistory: 100
};

// ============================================
// UI Components
// ============================================
function printHeader() {
	console.clear();
	console.log(chalk.cyan.bold(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🎮  Phase 76: ACE Interactive CLI                              ║
║                                                                  ║
║   RAG + KAG + Multi-LLM Agentic Code Engine                      ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`));
}

function printProviderStatus() {
	console.log(chalk.gray('Provider Status:'));
	const geminiKey = process.env.GEMINI_API_KEY ? '✅' : '❌';
	const claudeKey = process.env.CLAUDE_API_KEY ? '✅' : '❌';
	const openaiKey = process.env.OPENAI_API_KEY ? '✅' : '❌';

	console.log(chalk.gray(`  🦙 Ollama: `) + chalk.green('✅ localhost:11434'));
	console.log(chalk.gray(`  🔮 Gemini: `) + (geminiKey === '✅' ? chalk.green(geminiKey) : chalk.red(geminiKey)));
	console.log(chalk.gray(`  🧠 Claude: `) + (claudeKey === '✅' ? chalk.green(claudeKey) : chalk.red(claudeKey)));
	console.log(chalk.gray(`  🤖 GPT-4:  `) + (openaiKey === '✅' ? chalk.green(openaiKey) : chalk.red(openaiKey)));
	console.log('');
}

function printDivider() {
	console.log(chalk.gray('─'.repeat(68)));
}

// ============================================
// History Management
// ============================================
async function loadHistory() {
	try {
		const dir = path.dirname(CONFIG.historyFile);
		if (!existsSync(dir)) {
			await fs.mkdir(dir, { recursive: true });
		}
		if (!existsSync(CONFIG.historyFile)) {
			return [];
		}
		const content = await fs.readFile(CONFIG.historyFile, 'utf-8');
		return content.split('\n').filter(Boolean).map(line => JSON.parse(line)).slice(-CONFIG.maxHistory);
	} catch {
		return [];
	}
}

async function saveToHistory(entry) {
	try {
		const dir = path.dirname(CONFIG.historyFile);
		if (!existsSync(dir)) {
			await fs.mkdir(dir, { recursive: true });
		}
		await fs.appendFile(CONFIG.historyFile, JSON.stringify(entry) + '\n');
	} catch (error) {
		console.error(chalk.yellow('⚠️  Failed to save history:', error.message));
	}
}

// ============================================
// Main Prompts
// ============================================
async function selectProvider() {
	const { provider } = await inquirer.prompt([
		{
			type: 'list',
			name: 'provider',
			message: 'Select LLM Provider:',
			choices: CONFIG.providers.map(p => ({
				name: p.name,
				value: p.value
			})),
			default: 'ollama'
		}
	]);
	return provider;
}

async function selectTaskType() {
	const { taskType } = await inquirer.prompt([
		{
			type: 'list',
			name: 'taskType',
			message: 'Select Task Type:',
			choices: CONFIG.taskTypes.map(t => ({
				name: t.name,
				value: t.value
			}))
		}
	]);
	return taskType;
}

async function getPrompt(taskType) {
	const presets = CONFIG.presetPrompts[taskType] || [];

	const choices = [
		...presets.map((p, i) => ({ name: `${i + 1}. ${p}`, value: p })),
		new inquirer.Separator(),
		{ name: '📝 Enter custom prompt...', value: '__custom__' }
	];

	const { prompt } = await inquirer.prompt([
		{
			type: 'list',
			name: 'prompt',
			message: 'Select or enter a prompt:',
			choices
		}
	]);

	if (prompt === '__custom__') {
		const { customPrompt } = await inquirer.prompt([
			{
				type: 'input',
				name: 'customPrompt',
				message: 'Enter your prompt:',
				validate: input => input.trim().length > 0 || 'Prompt cannot be empty'
			}
		]);
		return customPrompt;
	}

	return prompt;
}

async function confirmExecution(provider, taskType, prompt) {
	console.log('');
	printDivider();
	console.log(chalk.cyan('📋 Execution Summary:'));
	console.log(chalk.white(`   Provider:  `) + chalk.yellow(provider));
	console.log(chalk.white(`   Task Type: `) + chalk.yellow(taskType));
	console.log(chalk.white(`   Prompt:    `) + chalk.gray(prompt.substring(0, 60) + (prompt.length > 60 ? '...' : '')));
	printDivider();
	console.log('');

	const { confirm } = await inquirer.prompt([
		{
			type: 'confirm',
			name: 'confirm',
			message: 'Execute this task?',
			default: true
		}
	]);

	return confirm;
}

// ============================================
// Execution
// ============================================
async function executeTask(provider, taskType, prompt) {
	console.log('');
	console.log(chalk.cyan('🚀 Executing...'));
	console.log('');

	const startTime = Date.now();

	try {
		// Web search mode uses Gemini with search grounding
		if (taskType === 'web-search') {
			console.log(chalk.blue('🌐 Using Gemini with Google Search grounding...'));
			console.log('');

			const result = await callLLM(prompt, {
				provider: 'gemini',
				useSearch: true,
				verbose: false
			});

			const duration = Date.now() - startTime;

			console.log(chalk.green.bold('✅ Response:'));
			console.log('');
			console.log(result.text);
			console.log('');

			if (result.searchUsed) {
				console.log(chalk.blue('🔍 Search Grounding Used'));
				if (result.sources && result.sources.length > 0) {
					console.log(chalk.blue('📚 Sources:'));
					result.sources.forEach((source, i) => {
						console.log(chalk.gray(`   ${i + 1}. ${source.title || source.uri}`));
						if (source.uri) {
							console.log(chalk.gray(`      ${source.uri}`));
						}
					});
				}
			}

			console.log('');
			console.log(chalk.gray(`⏱️  Completed in ${duration}ms`));

			await saveToHistory({
				timestamp: new Date().toISOString(),
				provider: 'gemini',
				taskType,
				prompt,
				responseLength: result.text.length,
				searchUsed: result.searchUsed,
				duration
			});

			return result;
		}

		// Use ACE Agent for other task types
		console.log(chalk.blue(`🤖 Using ACE Agent with ${provider}...`));
		console.log('');

		// Set environment for the provider
		process.env.LLM_PROVIDER = provider;

		const ace = new ACEPromptEngineer({
			task: prompt,
			iterations: 1,
			verbose: true
		});

		await ace.initialize();
		const result = await ace.execute();

		const duration = Date.now() - startTime;

		console.log('');
		console.log(chalk.green.bold('✅ ACE Agent Response:'));
		console.log('');

		if (result.solution) {
			console.log(result.solution);
		} else if (result.llmResponse?.text) {
			console.log(result.llmResponse.text);
		} else {
			console.log(chalk.yellow('No response generated'));
		}

		console.log('');
		console.log(chalk.gray(`⏱️  Completed in ${duration}ms`));

		if (result.ragContext?.length > 0) {
			console.log(chalk.gray(`📚 RAG context: ${result.ragContext.length} items`));
		}

		if (result.kagContext?.length > 0) {
			console.log(chalk.gray(`🔗 KAG relationships: ${result.kagContext.length} items`));
		}

		await saveToHistory({
			timestamp: new Date().toISOString(),
			provider,
			taskType,
			prompt,
			responseLength: (result.solution || result.llmResponse?.text || '').length,
			ragItems: result.ragContext?.length || 0,
			kagItems: result.kagContext?.length || 0,
			duration
		});

		return result;

	} catch (error) {
		console.error(chalk.red('❌ Error:'), error.message);

		await saveToHistory({
			timestamp: new Date().toISOString(),
			provider,
			taskType,
			prompt,
			error: error.message,
			duration: Date.now() - startTime
		});

		throw error;
	}
}

// ============================================
// Interactive Loop
// ============================================
async function interactiveLoop() {
	while (true) {
		printHeader();
		printProviderStatus();

		const { action } = await inquirer.prompt([
			{
				type: 'list',
				name: 'action',
				message: 'What would you like to do?',
				choices: [
					{ name: '🚀 Start New Task', value: 'new' },
					{ name: '📜 View History', value: 'history' },
					{ name: '🔬 LLM Health Check', value: 'health' },
					{ name: '🌐 Quick Web Search (Gemini)', value: 'quick-search' },
					{ name: '💬 Quick Chat (Ollama)', value: 'quick-chat' },
					new inquirer.Separator(),
					{ name: '❌ Exit', value: 'exit' }
				]
			}
		]);

		switch (action) {
			case 'new': {
				const provider = await selectProvider();
				const taskType = await selectTaskType();
				const prompt = await getPrompt(taskType);

				if (await confirmExecution(provider, taskType, prompt)) {
					try {
						await executeTask(provider, taskType, prompt);
					} catch (error) {
						// Error already logged
					}
				}

				await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
				break;
			}

			case 'history': {
				const history = await loadHistory();

				console.log('');
				console.log(chalk.cyan.bold('📜 Recent History:'));
				console.log('');

				if (history.length === 0) {
					console.log(chalk.gray('  No history yet.'));
				} else {
					history.slice(-10).reverse().forEach((entry, i) => {
						const status = entry.error ? chalk.red('❌') : chalk.green('✅');
						const time = new Date(entry.timestamp).toLocaleString();
						console.log(`  ${status} ${chalk.gray(time)} ${chalk.yellow(entry.provider)} - ${entry.prompt.substring(0, 50)}...`);
					});
				}

				console.log('');
				await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
				break;
			}

			case 'health': {
				console.log('');
				console.log(chalk.cyan('🔬 Testing LLM Providers...'));
				console.log('');

				const { testProviders } = await import('./llm-router.mjs');
				await testProviders();

				console.log('');
				await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
				break;
			}

			case 'quick-search': {
				const { query } = await inquirer.prompt([
					{
						type: 'input',
						name: 'query',
						message: '🌐 Enter search query:',
						validate: input => input.trim().length > 0 || 'Query cannot be empty'
					}
				]);

				await executeTask('gemini', 'web-search', query);

				await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
				break;
			}

			case 'quick-chat': {
				const { message } = await inquirer.prompt([
					{
						type: 'input',
						name: 'message',
						message: '💬 Enter message:',
						validate: input => input.trim().length > 0 || 'Message cannot be empty'
					}
				]);

				console.log('');
				console.log(chalk.cyan('🦙 Calling Ollama...'));
				console.log('');

				try {
					const result = await callLLM(message, { provider: 'ollama', verbose: false });
					console.log(chalk.green.bold('Response:'));
					console.log('');
					console.log(result.text);
				} catch (error) {
					console.error(chalk.red('❌ Error:'), error.message);
				}

				console.log('');
				await inquirer.prompt([{ type: 'input', name: 'continue', message: 'Press Enter to continue...' }]);
				break;
			}

			case 'exit': {
				console.log('');
				console.log(chalk.cyan('👋 Goodbye!'));
				console.log('');
				process.exit(0);
			}
		}
	}
}

// ============================================
// CLI Arguments
// ============================================
async function handleCliArgs() {
	const args = process.argv.slice(2);

	if (args.includes('--help') || args.includes('-h')) {
		console.log(chalk.cyan(`
🎮 Phase 76: ACE Interactive CLI

Usage:
  node phase76-ace-cli.mjs                    Start interactive mode
  node phase76-ace-cli.mjs --provider gemini  Set provider
  node phase76-ace-cli.mjs --task analyze     Set task type
  node phase76-ace-cli.mjs --prompt "..."     Set prompt (non-interactive)
  node phase76-ace-cli.mjs --web-search "..." Quick web search via Gemini

Options:
  --provider <name>  LLM provider (ollama, gemini, claude, openai)
  --task <type>      Task type (search, fix, analyze, generate, web-search)
  --prompt <text>    Prompt text (runs non-interactively)
  --web-search <q>   Quick web search via Gemini
  --help, -h         Show this help

Examples:
  node phase76-ace-cli.mjs --provider gemini --task analyze --prompt "Find TypeScript errors"
  node phase76-ace-cli.mjs --web-search "Latest SvelteKit 2.0 features"
`));
		process.exit(0);
	}

	// Quick web search mode
	const webSearchIdx = args.indexOf('--web-search');
	if (webSearchIdx >= 0 && args[webSearchIdx + 1]) {
		const query = args[webSearchIdx + 1];
		printHeader();
		await executeTask('gemini', 'web-search', query);
		process.exit(0);
	}

	// Non-interactive mode with --prompt
	const promptIdx = args.indexOf('--prompt');
	if (promptIdx >= 0 && args[promptIdx + 1]) {
		const providerIdx = args.indexOf('--provider');
		const taskIdx = args.indexOf('--task');

		const provider = providerIdx >= 0 ? args[providerIdx + 1] : 'ollama';
		const taskType = taskIdx >= 0 ? args[taskIdx + 1] : 'analyze';
		const prompt = args[promptIdx + 1];

		printHeader();
		await executeTask(provider, taskType, prompt);
		process.exit(0);
	}

	// Default: interactive mode
	return false;
}

// ============================================
// Main
// ============================================
async function main() {
	// Load environment
	const dotenv = await import('dotenv');
	dotenv.config();

	// Check for CLI args
	const handled = await handleCliArgs();
	if (!handled) {
		// Start interactive mode
		await interactiveLoop();
	}
}

main().catch(error => {
	console.error(chalk.red('Fatal error:'), error);
	process.exit(1);
});
