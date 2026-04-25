/**
 * 🤖 LLM Router - Multi-Provider Support
 *
 * Supports: Ollama (local), Gemini 3 (Google Search), Claude (Anthropic), GPT-4 (OpenAI)
 *
 * Usage:
 *   import { callLLM, setProvider } from './llm-router.mjs';
 *
 *   // Use default provider (Ollama)
 *   const response = await callLLM('Explain TypeScript generics');
 *
 *   // Switch provider with web search (Gemini 3)
 *   setProvider('gemini');
 *   const response = await callLLM('What are the latest TypeScript features?');
 *
 * CLI Usage:
 *   node scripts/llm-router.mjs --provider gemini --prompt "Your question"
 *   node scripts/llm-router.mjs --health-check
 *   node scripts/llm-router.mjs --compare --prompt "Test prompt"
 *
 * Environment Variables:
 *   GEMINI_API_KEY=AIzaSy...
 *   GEMINI_MODEL=gemini-2.0-flash-exp-1206 (or gemini-3-pro-preview)
 *   GEMINI_ENABLE_SEARCH=true (enable Google Search grounding)
 *   CLAUDE_API_KEY=sk-ant-...
 *   OPENAI_API_KEY=sk-...
 *   OLLAMA_MODEL=gemma3-legal:latest
 *   OLLAMA_URL=http://localhost:11434
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import chalk from 'chalk';
import dotenv from 'dotenv';

dotenv.config();

// Configuration
const CONFIG = {
	defaultProvider: process.env.LLM_PROVIDER || 'ollama',

	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		model: process.env.OLLAMA_MODEL || 'gemma3-legal:latest',
		temperature: 0.3,
		maxTokens: 2048
	},

	gemini: {
		apiKey: process.env.GEMINI_API_KEY,
		// Supports: gemini-2.0-flash-exp, gemini-3-pro-preview (Thinking mode)
		model: process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp',
		enableSearch: process.env.GEMINI_ENABLE_SEARCH === 'true',
		// Thinking level for Gemini 3: 'HIGH', 'LOW', or undefined
		thinkingLevel: process.env.GEMINI_THINKING_LEVEL || undefined,
		url: 'https://generativelanguage.googleapis.com/v1beta/models',
		temperature: 0.3,
		maxTokens: 4096
	},

	claude: {
		apiKey: process.env.CLAUDE_API_KEY,
		model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
		url: 'https://api.anthropic.com/v1/messages',
		version: '2023-06-01',
		maxTokens: 2048
	},

	openai: {
		apiKey: process.env.OPENAI_API_KEY,
		model: process.env.OPENAI_MODEL || 'gpt-4',
		url: 'https://api.openai.com/v1/chat/completions',
		temperature: 0.3,
		maxTokens: 2048
	}
};

let currentProvider = CONFIG.defaultProvider;

/**
 * Set active LLM provider
 */
export function setProvider(provider) {
	const valid = ['ollama', 'gemini', 'claude', 'openai'];
	if (!valid.includes(provider)) {
		throw new Error(`Invalid provider: ${provider}. Must be one of: ${valid.join(', ')}`);
	}
	currentProvider = provider;
	console.log(chalk.cyan(`🔄 LLM provider set to: ${provider}`));
}

/**
 * Get current provider
 */
export function getProvider() {
	return currentProvider;
}

/**
 * Retry wrapper for async functions
 */
async function withRetry(fn, retries = 3, delay = 1000) {
	let lastError;
	for (let i = 0; i < retries; i++) {
		try {
			return await fn();
		} catch (error) {
			lastError = error;
			const isRetryable = error.message.includes('429') ||
								error.message.includes('500') ||
								error.message.includes('503') ||
								error.message.includes('fetch failed') ||
								error.message.includes('network timeout');

			if (!isRetryable) {
				throw error; // Don't retry on 400, 401, 404 etc
			}

			if (i < retries - 1) {
				const waitTime = delay * Math.pow(2, i);
				console.log(chalk.yellow(`   ⚠️  Error: ${error.message}. Retrying in ${waitTime}ms... (${i + 1}/${retries})`));
				await new Promise(resolve => setTimeout(resolve, waitTime));
			}
		}
	}
	throw lastError;
}

// Global state to track provider health
const providerHealth = {
	gemini: 'healthy', // healthy | disabled
	ollama: 'healthy'
};

/**
 * Main LLM call router
 */
export async function callLLM(prompt, options = {}) {
	const provider = options.provider || currentProvider;
	const verbose = options.verbose || false;
	const retries = options.retries || 3;

	if (verbose) {
		console.log(chalk.gray(`   Provider: ${provider}`));
		console.log(chalk.gray(`   Prompt length: ${prompt.length} chars`));
	}

	// Check if provider is disabled
	let activeProvider = provider === 'auto' ? 'ollama' : provider;
	if (activeProvider === 'gemini' && providerHealth.gemini === 'disabled') {
		if (verbose) console.log(chalk.yellow('   ⚠️  Gemini disabled due to quota; using Ollama'));
		activeProvider = 'ollama';
	}

	try {
		return await withRetry(async () => {
			try {
				switch (activeProvider) {
					case 'ollama':
						return await callOllama(prompt, options);
					case 'gemini':
						return await callGemini(prompt, options);
					case 'claude':
						return await callClaude(prompt, options);
					case 'openai':
						return await callOpenAI(prompt, options);
					default:
						throw new Error(`Unknown provider: ${provider}`);
				}
			} catch (err) {
				// Auto-fallback for Gemini Quota Exceeded
				const msg = String(err?.message ?? err);
				const isQuota = msg.includes('Quota exceeded') || msg.includes('limit: 0') || msg.includes('429');

				if (activeProvider === 'gemini' && isQuota) {
					console.warn(chalk.yellow('   ⚠️  Gemini quota blocked; disabling for this session and falling back to ollama...'));
					providerHealth.gemini = 'disabled';
					return await callOllama(prompt, options);
				}
				throw err;
			}
		}, retries);
	} catch (error) {
		console.error(chalk.red(`   ❌ LLM error (${provider}): ${error.message}`));
		if (verbose) {
			console.error(chalk.red(`      Stack: ${error.stack}`));
		}
		// Don't throw, just exit with error code so pipeline stops cleanly
		process.exitCode = 1;
		return { text: '', provider: 'error', error: error.message, ok: false, fallback: 'none' };
	}
}

/**
 * Ollama (local) LLM call
 */
async function callOllama(prompt, options = {}) {
	const config = { ...CONFIG.ollama, ...options };
	// Ensure model is set (don't allow undefined override)
	if (!config.model) {
		config.model = CONFIG.ollama.model;
	}

	const requestBody = {
		model: config.model,
		prompt: prompt,
		stream: false,
		options: {
			temperature: config.temperature,
			num_predict: config.maxTokens
		}
	};

	const response = await fetch(`${config.url}/api/generate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Ollama error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();
	return {
		provider: 'ollama',
		model: config.model,
		text: data.response || '',
		raw: data
	};
}

/**
 * Google Gemini LLM call with Web Search support
 * Supports:
 * - gemini-2.0-flash-exp: Fast responses with search grounding
 * - gemini-3-pro-preview: Thinking mode with deeper reasoning + search
 */
async function callGemini(prompt, options = {}) {
	const config = { ...CONFIG.gemini, ...options };

	if (!config.apiKey) {
		throw new Error('GEMINI_API_KEY not set in environment');
	}

	const genAI = new GoogleGenerativeAI(config.apiKey);
	const isGemini3 = config.model.includes('gemini-3');

	// Configure model with optional Google Search grounding
	const modelConfig = {
		model: config.model
	};

	// Enable Google Search for Gemini 3 models or when explicitly requested
	if (options.useSearch || isGemini3 || config.model.includes('gemini-exp') || config.enableSearch) {
		modelConfig.tools = [{ googleSearch: {} }];
	}

	const model = genAI.getGenerativeModel(modelConfig);

	// Build generation config
	const generationConfig = {
		temperature: config.temperature || 0.3,
		maxOutputTokens: config.maxTokens || 4096
	};

	// Add Thinking level for Gemini 3.0 models
	if (isGemini3 && config.thinkingLevel) {
		generationConfig.thinkingLevel = config.thinkingLevel.toUpperCase();
		console.log(chalk.magenta(`🧠 Gemini 3 Thinking Mode: ${generationConfig.thinkingLevel}`));
	}

	const result = await model.generateContent({
		contents: [{ role: 'user', parts: [{ text: prompt }] }],
		generationConfig
	});

	const response = result.response;
	const text = response.text();

	// Extract search grounding metadata if available
	const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
	const searchQueries = groundingMetadata?.searchEntryPoint?.renderedContent;
	const groundingChunks = groundingMetadata?.groundingChunks;

	// Extract thinking process if available (Gemini 3)
	const thinkingProcess = response.candidates?.[0]?.thinkingProcess;

	return {
		provider: 'gemini',
		model: config.model,
		text: text,
		searchUsed: !!groundingMetadata,
		searchQueries: searchQueries,
		thinkingUsed: !!thinkingProcess,
		sources: groundingChunks?.map(chunk => ({
			title: chunk.web?.title,
			uri: chunk.web?.uri
		})) || [],
		raw: result
	};
}

/**
 * Anthropic Claude LLM call
 */
async function callClaude(prompt, options = {}) {
	const config = { ...CONFIG.claude, ...options };

	if (!config.apiKey) {
		throw new Error('CLAUDE_API_KEY not set in environment');
	}

	const requestBody = {
		model: config.model,
		messages: [
			{ role: 'user', content: prompt }
		],
		max_tokens: config.maxTokens,
		temperature: 0.3
	};

	const response = await fetch(config.url, {
		method: 'POST',
		headers: {
			'x-api-key': config.apiKey,
			'anthropic-version': config.version,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Claude error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();
	const text = data.content?.[0]?.text || '';

	return {
		provider: 'claude',
		model: config.model,
		text: text,
		raw: data
	};
}

/**
 * OpenAI GPT-4 LLM call
 */
async function callOpenAI(prompt, options = {}) {
	const config = { ...CONFIG.openai, ...options };

	if (!config.apiKey) {
		throw new Error('OPENAI_API_KEY not set in environment');
	}

	const requestBody = {
		model: config.model,
		messages: [
			{ role: 'user', content: prompt }
		],
		temperature: config.temperature,
		max_tokens: config.maxTokens
	};

	const response = await fetch(config.url, {
		method: 'POST',
		headers: {
			'Authorization': `Bearer ${config.apiKey}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(requestBody)
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenAI error: ${response.status} - ${errorText}`);
	}

	const data = await response.json();
	const text = data.choices?.[0]?.message?.content || '';

	return {
		provider: 'openai',
		model: config.model,
		text: text,
		raw: data
	};
}

/**
 * Test all configured providers
 */
export async function testProviders() {
	console.log(chalk.cyan('\n🧪 Testing LLM Providers\n'));

	const testPrompt = 'Say "Hello from {provider}" where {provider} is your name.';
	const providers = ['ollama', 'gemini', 'claude', 'openai'];
	const results = [];

	for (const provider of providers) {
		try {
			console.log(chalk.yellow(`Testing ${provider}...`));
			const response = await callLLM(testPrompt, { provider, verbose: false });
			console.log(chalk.green(`✅ ${provider}: ${response.text.substring(0, 80)}...`));
			results.push({ provider, status: 'ok', response: response.text });
		} catch (error) {
			console.log(chalk.red(`❌ ${provider}: ${error.message}`));
			results.push({ provider, status: 'error', error: error.message });
		}
	}

	console.log(chalk.cyan('\n📊 Test Results:\n'));
	console.table(results);

	return results;
}

/**
 * CLI Entry Point
 */
if (import.meta.url.startsWith('file:')) {
	const { fileURLToPath } = await import('url');
	const modulePath = fileURLToPath(import.meta.url);
	const scriptPath = process.argv[1];

	if (scriptPath?.endsWith('llm-router.mjs')) {
		const args = process.argv.slice(2);

		if (args.includes('--test') || args.includes('--health-check')) {
			// Test all providers
			await testProviders();
		} else if (args.includes('--compare')) {
			// Compare providers with same prompt
			const promptIdx = args.indexOf('--prompt');
			const prompt = promptIdx >= 0 ? args[promptIdx + 1] : 'Explain TypeScript generics in 2 sentences';

			console.log(chalk.cyan(`\n🔬 Comparing Providers\n`));
			console.log(chalk.gray(`Prompt: ${prompt}\n`));

			const providers = ['ollama', 'gemini', 'claude', 'openai'];
			const results = [];

			for (const provider of providers) {
				try {
					console.log(chalk.yellow(`\n${provider.toUpperCase()}:`));
					const response = await callLLM(prompt, { provider, verbose: false });
					console.log(chalk.green(response.text));

					if (response.searchUsed) {
						console.log(chalk.blue(`🔍 Used Google Search: ${response.searchQueries || 'Yes'}`));
					}

					results.push({
						provider,
						status: 'ok',
						length: response.text.length,
						searchUsed: response.searchUsed || false
					});
				} catch (error) {
					console.log(chalk.red(`❌ Error: ${error.message}`));
					results.push({ provider, status: 'error', error: error.message });
				}
			}

			console.log(chalk.cyan('\n📊 Comparison Summary:\n'));
			console.table(results);
		} else if (args.includes('--help') || args.length === 0) {
			console.log(chalk.cyan('\n🤖 LLM Router - Multi-Provider Support\n'));
			console.log('Usage:');
			console.log('  node llm-router.mjs --health-check                    Check all providers');
			console.log('  node llm-router.mjs --compare --prompt "..."          Compare all providers');
			console.log('  node llm-router.mjs --prompt "..."                    Send prompt to default provider');
			console.log('  node llm-router.mjs --provider gemini --prompt "..."  Use specific provider');
			console.log('\nProviders: ollama, gemini, claude, openai');
			console.log('\nEnvironment:');
			console.log(`  LLM_PROVIDER=${process.env.LLM_PROVIDER || 'ollama'}`);
			console.log(`  GEMINI_API_KEY=${CONFIG.gemini.apiKey ? '✅ set' : '❌ not set'}`);
			console.log(`  GEMINI_MODEL=${CONFIG.gemini.model} ${CONFIG.gemini.enableSearch ? '(🔍 search enabled)' : ''}`);
			console.log(`  CLAUDE_API_KEY=${CONFIG.claude.apiKey ? '✅ set' : '❌ not set'}`);
			console.log(`  OPENAI_API_KEY=${CONFIG.openai.apiKey ? '✅ set' : '❌ not set'}`);
			console.log(`  OLLAMA_URL=${CONFIG.ollama.url}`);
			console.log(`  OLLAMA_MODEL=${CONFIG.ollama.model}\n`);
		} else {
			// Send prompt
			const providerIdx = args.indexOf('--provider');
			const provider = providerIdx >= 0 ? args[providerIdx + 1] : CONFIG.defaultProvider;

			const promptIdx = args.indexOf('--prompt');
			const prompt = promptIdx >= 0 ? args[promptIdx + 1] : 'Hello, how are you?';

			console.log(chalk.cyan(`\n🤖 Calling ${provider}...\n`));
			const response = await callLLM(prompt, { provider, verbose: true });
			console.log(chalk.green(`\n✅ Response (${response.text.length} chars):\n`));
			console.log(response.text);

			if (response.searchUsed) {
				console.log(chalk.blue(`\n🔍 Google Search Used: ${response.searchQueries || 'Yes'}`));
				if (response.sources?.length > 0) {
					console.log(chalk.blue(`\n📚 Sources:`));
					response.sources.forEach((source, i) => {
						console.log(chalk.gray(`   ${i + 1}. ${source.title || source.uri}`));
					});
				}
			}

			console.log('');
		}

		process.exit(0);
	}
}
