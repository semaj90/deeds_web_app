#!/usr/bin/env node
/**
 * 🤖 Phase 76: ACE Contextual Prompt Engineer
 *
 * Advanced LLM prompting system that uses RAG+KAG for contextual code generation.
 *
 * Features:
 * - RAG: Semantic search through 53,227 error embeddings (Qdrant)
 * - KAG: Graph traversal for entity relationships (Neo4j optional)
 * - Multi-turn agentic dialogue with tool calling
 * - Confidence-based decision making (GRPO-style)
 * - Self-prompting with iterative refinement
 * - Multi-language support (TS, Svelte, Go, Python, C++)
 *
 * Architecture:
 * 1. User provides task/question
 * 2. RAG retrieves relevant errors/routes/components
 * 3. KAG finds related entities via graph traversal
 * 4. Generate contextual prompt with retrieved knowledge
 * 5. Call Ollama LLM with tools available
 * 6. Iteratively refine based on confidence scores
 * 7. Output final solution with validation
 *
 * Usage:
 *   node phase76-ace-prompt-engineer.mjs --task "Fix missing imports in evidence/analyze"
 *   node phase76-ace-prompt-engineer.mjs --task "Optimize route structure" --iterations 3
 *   node phase76-ace-prompt-engineer.mjs --file src/routes/(app)/cases/[id]/+page.svelte
 */

import chalk from 'chalk';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { callLLM as callMultiLLM } from './llm-router.mjs';
import { fetchDeepDoc } from './phase76-storage-layer.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ============================================
// Configuration
// ============================================
const CONFIG = {
	llm: {
		provider: process.env.LLM_PROVIDER || 'auto',  // auto, ollama, gemini, claude, openai
		model: process.env.LLM_MODEL || undefined,  // Provider-specific model override
		temperature: 0.3,
		topP: 0.9,
		maxTokens: 8192,
		useSearch: process.env.GEMINI_ENABLE_SEARCH === 'true'  // Enable Gemini 3 web search
	},
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		model: process.env.OLLAMA_MODEL || 'gemma3-legal:latest',
		embeddingModel: 'embeddinggemma:latest',
		temperature: 0.3,
		topP: 0.9,
		maxTokens: 8192
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		errorCollection: 'phase72_error_patterns',
		knowledgeCollection: 'phase76_knowledge_base', // Phase 88: 810 points (Svelte 5 + SvelteKit 2 docs)
		topK: 10,
		scoreThreshold: 0.4,     // Lowered further to ensure retrieval
		knowledgeThreshold: 0.3  // Lowered further to ensure Svelte 5 docs are retrieved
	},
	mcp: {
		url: process.env.MCP_CONTEXT7_URL || 'http://localhost:3002',
		enabled: true
	},
	neo4j: {
		enabled: false, // Set to true if Neo4j is running
		url: process.env.NEO4J_URL || 'bolt://localhost:7687',
		user: process.env.NEO4J_USER || 'neo4j',
		password: process.env.NEO4J_PASSWORD || 'password'
	},
	knowledge: {
		basePath: 'reports/phase76/consolidated-knowledge-base.json',
		promptsPath: 'reports/phase76/llm-prompts.json'
	},
	tools: {
		available: [
			'tsc',
			'svelte-check',
			'grep-search',
			'file-read',
			'file-write',
			'ast-analyzer',
			'web-search',
			'test-runner',
			'postgres-query',
			'minio-fetch',
			'mcp:server:func:args',
			'migrate-svelte-component'
		]
	},
	confidence: {
		autoApply: 0.85,
		manualReview: 0.70,
		toolInvocation: 0.50,
		escalate: 0.50
	},
	output: {
		dir: 'reports/phase76/ace-sessions',
		sessionFile: 'session-{timestamp}.json',
		solutionFile: 'solution-{timestamp}.md'
	}
};

// ============================================
// ACE Prompt Engineer
// ============================================
class ACEPromptEngineer {
	constructor(options = {}) {
		this.task = options.task || '';
		this.file = options.file || null;
		this.iterations = options.iterations || 1;
		this.verbose = options.verbose || false;

		this.session = {
			id: Date.now().toString(),
			timestamp: new Date().toISOString(),
			task: this.task,
			file: this.file,
			iterations: [],
			finalSolution: null,
			confidence: 0,
			toolsCalled: []
		};

		this.knowledgeBase = null;
		this.prompts = null;
	}

	/**
	 * Initialize: Load knowledge base and prompts
	 */
	async initialize() {
		console.log(chalk.cyan.bold('🤖 ACE Contextual Prompt Engineer\n'));
		console.log(chalk.gray(`Task: ${this.task}`));
		if (this.file) console.log(chalk.gray(`File: ${this.file}`));
		console.log(chalk.gray(`Iterations: ${this.iterations}\n`));

		// Load Svelte 5 policy pack (Phase 88)
		console.log(chalk.cyan('   📚 Loading Svelte 5 Policy Pack...'));
		const policyPackPath = path.join(rootDir, 'data/knowledge/svelte5-policy-pack.md');
		try {
			this.svelte5PolicyPack = await fs.readFile(policyPackPath, 'utf-8');
			console.log(chalk.green(`   ✅ Policy pack loaded (${this.svelte5PolicyPack.length} chars)\n`));
		} catch (error) {
			console.log(chalk.yellow(`   ⚠️  Policy pack not found: ${policyPackPath}`));
			this.svelte5PolicyPack = null;
		}

		// Load knowledge base
		const kbPath = path.join(rootDir, CONFIG.knowledge.basePath);
		if (existsSync(kbPath)) {
			this.knowledgeBase = JSON.parse(await fs.readFile(kbPath, 'utf-8'));
			console.log(chalk.green('✅ Knowledge base loaded'));
		} else {
			console.log(chalk.yellow('⚠️  Knowledge base not found, run phase76-ace-knowledge-consolidator.mjs first'));
			this.knowledgeBase = { entities: { errors: [], routes: [], components: [] }, relationships: [] };
		}

		// Load prompts
		const promptsPath = path.join(rootDir, CONFIG.knowledge.promptsPath);
		if (existsSync(promptsPath)) {
			this.prompts = JSON.parse(await fs.readFile(promptsPath, 'utf-8'));
			console.log(chalk.green('✅ ACE prompts loaded\n'));
		}
	}

	/**
	 * Execute full ACE pipeline
	 */
	async execute() {
		const startTime = performance.now();

		for (let i = 0; i < this.iterations; i++) {
			console.log(chalk.yellow.bold(`\n🔄 Iteration ${i + 1}/${this.iterations}\n`));

			const iteration = {
				number: i + 1,
				timestamp: new Date().toISOString(),
				steps: []
			};

			// Step 1: RAG retrieval
			const ragContext = await this.performRAGRetrieval();
			const ragCount = (ragContext.errors?.length || 0) + (ragContext.knowledge?.length || 0);
			iteration.steps.push({ name: 'RAG Retrieval', results: ragCount, time: performance.now() - startTime });

			// Step 2: KAG traversal (optional)
			const kagContext = await this.performKAGTraversal();
			iteration.steps.push({ name: 'KAG Traversal', results: kagContext.length, time: performance.now() - startTime });

			// Step 3: Build contextual prompt
			const prompt = this.buildContextualPrompt(ragContext, kagContext);
			iteration.steps.push({ name: 'Prompt Generation', size: prompt.length, time: performance.now() - startTime });

			// Step 4: Call LLM
			const llmResponse = await this.callLLM(prompt);
			iteration.steps.push({ name: 'LLM Response', confidence: llmResponse.confidence, time: performance.now() - startTime });

			// Step 5: Tool invocation (if needed)
			if (llmResponse.confidence < CONFIG.confidence.autoApply && llmResponse.suggestedTools) {
				const toolResults = await this.invokeTools(llmResponse.suggestedTools);
				iteration.steps.push({ name: 'Tool Invocation', tools: toolResults.length, time: performance.now() - startTime });

				// Re-prompt with tool results
				const refinedPrompt = this.buildRefinedPrompt(prompt, toolResults);
				const refinedResponse = await this.callLLM(refinedPrompt);
				llmResponse.solution = refinedResponse.solution;
				llmResponse.confidence = refinedResponse.confidence;
			}

			// Store iteration
			iteration.solution = llmResponse.solution;
			iteration.confidence = llmResponse.confidence;
			this.session.iterations.push(iteration);

			// Check if confidence is high enough
			if (llmResponse.confidence >= CONFIG.confidence.autoApply) {
				console.log(chalk.green(`\n✅ High confidence solution found (${(llmResponse.confidence * 100).toFixed(1)}%)`));
				this.session.finalSolution = llmResponse.solution;
				this.session.confidence = llmResponse.confidence;
				break;
			}
		}

		const duration = ((performance.now() - startTime) / 1000).toFixed(2);

		// Save session
		await this.saveSession();

		// Print summary
		this.printSummary(duration);
	}

	/**
	 * Step 1: RAG - Retrieve relevant context from Qdrant embeddings
	 */
	async performRAGRetrieval() {
		console.log(chalk.cyan('   📚 Step 1: RAG Retrieval (Semantic Search)'));

		try {
			// Generate embedding for the task query
			const embedding = await this.generateEmbedding(this.task);

			// Query BOTH collections in parallel
			const [errorResults, knowledgeResults] = await Promise.all([
				this.queryQdrantCollection(
					CONFIG.qdrant.errorCollection,
					embedding,
					CONFIG.qdrant.topK,
					CONFIG.qdrant.scoreThreshold
				),
				this.queryQdrantCollection(
					CONFIG.qdrant.knowledgeCollection,
					embedding,
					CONFIG.qdrant.topK,
					CONFIG.qdrant.knowledgeThreshold
				)
			]);

			console.log(chalk.green(`   ✅ Found ${errorResults.length} error patterns, ${knowledgeResults.length} docs\n`));

			return {
				errors: errorResults.map(r => ({
					score: r.score,
					file: r.payload.file || 'unknown',
					message: r.payload.message || '',
					category: r.payload.category || 'general'
				})),
				knowledge: knowledgeResults.map(r => ({
					score: r.score,
					title: r.payload.title || 'Documentation',
					url: r.payload.url || '',
					summary: r.payload.summary || ''
				}))
			};

		} catch (error) {
			console.log(chalk.yellow(`   ⚠️  RAG error: ${error.message}, using fallback`));
			return { errors: this.fallbackRAGRetrieval(), knowledge: [] };
		}
	}

	/**
	 * Query a Qdrant collection (reusable helper)
	 */
	async queryQdrantCollection(collection, embedding, limit, scoreThreshold) {
		const searchUrl = `${CONFIG.qdrant.url}/collections/${collection}/points/search`;

		try {
			const response = await fetch(searchUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					vector: embedding,
					limit: limit,
					score_threshold: scoreThreshold,
					with_payload: true
				})
			});

			if (!response.ok) {
				console.log(chalk.yellow(`   ⚠️  ${collection} not available`));
				return [];
			}

			const data = await response.json();
			const results = data.result || [];

			// Hydrate from MinIO if needed
			for (const hit of results) {
				if (hit.payload && hit.payload.minio_key) {
					try {
						console.log(chalk.cyan(`   📦 [Agent] Hydrating deep context from MinIO: ${hit.payload.minio_key}`));

						// Use fetchDeepDoc helper for cleaner code
						const deepData = await fetchDeepDoc(hit.payload.minio_key);

						if (deepData) {
							// Replace short summary with FULL documentation text
							hit.payload.summary = deepData.full_text || deepData.content || deepData.summary || hit.payload.summary;
							hit.payload.fullText = deepData.full_text;
							hit.payload.url = deepData.url;

							console.log(chalk.green(`      ✅ Loaded ${(hit.payload.summary?.length || 0).toLocaleString()} chars of deep context`));
						} else {
							console.log(chalk.yellow(`      ⚠️  No deep context available, using summary`));
						}
					} catch (err) {
						console.warn(chalk.yellow(`   ⚠️  MinIO hydration failed: ${err.message}`));
					}
				}
			}

			return results;

		} catch (error) {
			console.warn(chalk.yellow(`   ⚠️  ${collection} query error: ${error.message}`));
			return [];
		}
	}

	/**
	 * Fallback RAG: Use local knowledge base
	 */
	fallbackRAGRetrieval() {
		if (!this.knowledgeBase) return [];

		// Simple keyword matching
		const keywords = this.task.toLowerCase().split(' ');
		const relevantErrors = this.knowledgeBase.entities.errors.filter(e =>
			keywords.some(kw => e.message.toLowerCase().includes(kw) || e.file.toLowerCase().includes(kw))
		).slice(0, CONFIG.qdrant.topK);

		return relevantErrors.map(e => ({
			score: 0.8,
			file: e.file,
			message: e.message,
			category: e.category
		}));
	}

	/**
	 * Step 2: KAG - Knowledge graph traversal for relationships
	 */
	async performKAGTraversal() {
		console.log(chalk.cyan('   🔗 Step 2: KAG Traversal (Graph Relationships)'));

		if (!this.knowledgeBase) {
			console.log(chalk.yellow('   ⚠️  Knowledge base not loaded\n'));
			return [];
		}

		// If file is specified, find related entities
		if (this.file) {
			const relatedEntities = this.knowledgeBase.relationships
				.filter(r => r.from.includes(this.file) || r.to.includes(this.file))
				.slice(0, 10);

			console.log(chalk.green(`   ✅ Found ${relatedEntities.length} related entities\n`));
			return relatedEntities;
		}

		// Otherwise, find entities related to error categories
		const errorCategories = this.knowledgeBase.entities.errors
			.map(e => e.category)
			.filter((v, i, a) => a.indexOf(v) === i) // unique
			.slice(0, 5);

		console.log(chalk.green(`   ✅ Found ${errorCategories.length} error categories\n`));
		return errorCategories.map(cat => ({ category: cat }));
	}

	/**
	 * Step 3: Build contextual prompt with RAG+KAG context
	 */
	buildContextualPrompt(ragContext, kagContext) {
		console.log(chalk.cyan('   ✍️  Step 3: Building Contextual Prompt'));

		// ========================================
		// PHASE 88: PREPEND SVELTE 5 POLICY PACK
		// ========================================
		let prompt = '';

		if (this.svelte5PolicyPack) {
			console.log(chalk.green('   📋 Prepending Svelte 5 Policy Pack (enforces runes, bans export let)'));
			prompt += `# SYSTEM POLICY: SVELTE 5 ENFORCEMENT\n\n`;
			prompt += this.svelte5PolicyPack;
			prompt += `\n\n---\n\n`;
		}

		// ========================================
		// AGENTIC DETECTION: Check for Svelte 4 patterns
		// ========================================
		const svelte4Patterns = [
			/on:[a-z]+/gi,            // on:change, on:click, etc. (with or without =)
			/export\s+let\s+\w+/gi,   // export let prop
			/\$:\s*\w+\s*=/g,         // $: reactive statements
			/beforeUpdate\(/gi,       // lifecycle hooks
			/afterUpdate\(/gi,
			/\$:\s*{/g                // $: reactive blocks
		];

		const taskText = this.task + ' ' + (this.file || '');
		const isLegacySvelte = svelte4Patterns.some(pattern => pattern.test(taskText));

		let migrationContext = '';
		if (isLegacySvelte) {
			console.log(chalk.yellow('   🤔 [Agent] Detected Legacy Svelte 4 Syntax!'));
			console.log(chalk.cyan('   🔄 [Agent] Activating Svelte 5 Migration Protocols...'));

			migrationContext = `\n\n## 🔴 CRITICAL MIGRATION ALERT 🔴\n\nThe task contains DEPRECATED Svelte 4 syntax. You MUST refactor to Svelte 5:\n\n### Svelte 4 → Svelte 5 Migration Rules:\n\n1. **Event Handlers**: NO more \`on:\` prefix\n   - OLD: \`<input on:change={handler} />\`\n   - NEW: \`<input onchange={handler} />\`\n\n2. **Reactive State**: Use \`$state()\` rune\n   - OLD: \`let count = 0;\`\n   - NEW: \`let count = $state(0);\`\n\n3. **Derived Values**: Use \`$derived()\` rune\n   - OLD: \`$: doubled = count * 2;\`\n   - NEW: \`let doubled = $derived(count * 2);\`\n\n4. **Component Props**: Use \`$props()\` rune\n   - OLD: \`export let title;\`\n   - NEW: \`let { title } = $props();\`\n\n5. **Lifecycle Hooks**: Use \`$effect\` runes\n   - OLD: \`beforeUpdate(() => {})\`\n   - NEW: \`$effect.pre(() => {})\`\n   - OLD: \`afterUpdate(() => {})\`\n   - NEW: \`$effect(() => {})\`\n\n**YOU MUST APPLY THESE RULES TO ALL CODE YOU GENERATE.**\n`;
		}

		const templatePrompt = this.selectPromptTemplate();

		prompt += `${templatePrompt.prompt}\n\n`;

		// Add error patterns from RAG
		if (ragContext.errors && ragContext.errors.length > 0) {
			prompt += `## Similar Error Patterns (from codebase):\n`;
			prompt += ragContext.errors.map((ctx, i) =>
				`${i + 1}. [Score: ${(ctx.score * 100).toFixed(0)}%] ${ctx.file}: ${ctx.message}`
			).join('\n');
			prompt += '\n\n';
		}

		// Add documentation knowledge (NEW!)
		if (ragContext.knowledge && ragContext.knowledge.length > 0) {
			prompt += `## Official Documentation (from knowledge base):\n`;
			prompt += ragContext.knowledge.map((doc, i) => {
				// Use full text if hydrated from MinIO, otherwise use summary
				const content = doc.fullText || doc.summary;
				const preview = content.substring(0, 300);
				return `${i + 1}. [Relevance: ${(doc.score * 100).toFixed(0)}%] ${doc.title}\n   📄 ${doc.url}\n   ${preview}${content.length > 300 ? '...' : ''}`;
			}).join('\n\n');
			prompt += '\n\n';

			// Log if we successfully hydrated deep context
			const hydratedCount = ragContext.knowledge.filter(doc => doc.fullText).length;
			if (hydratedCount > 0) {
				console.log(chalk.green(`   ✅ Hydrated ${hydratedCount}/${ragContext.knowledge.length} docs from MinIO (deep context)`));
			}
		}
		// Add Postgres/Minio Context Hints
		prompt += `## Available Data Sources:\n`;
		prompt += `- **PostgreSQL 17**: Use tool 'postgres-query' or 'mcp:postgres:query' to fetch structured data.\n`;
		prompt += `- **Minio Object Storage**: Use tool 'minio-fetch' or 'mcp:minio:fetch' to retrieve text summaries.\n`;
		prompt += `- **Qdrant Vector DB**: Already queried for RAG context above.\n\n`;

		if (this.task.toLowerCase().includes('postgres') || this.task.toLowerCase().includes('database')) {
			prompt += `IMPORTANT: You MUST query the database to verify the schema before proposing a solution. Use 'mcp:postgres:query' first. Do not hallucinate table names. Set confidence to 0.5 until you have data.\n\n`;
		}

		prompt += `## Special Instructions for Svelte Migration:\n`;
		prompt += `IF the task is to migrate a component to Svelte 5, you MUST call the 'migrate-svelte-component' tool. Do not output the code yourself. Set confidence to 0.5 and add 'migrate-svelte-component' to suggestedTools.\n\n`;

		// Add KAG context
		// Add KAG context
		prompt += `## Graph Relationships (KAG):\n`;
		prompt += kagContext.map((kg, i) => {
			if (kg.from && kg.to) return `${i + 1}. ${kg.from} → ${kg.type} → ${kg.to}`;
			if (kg.category) return `${i + 1}. Error Category: ${kg.category}`;
			return '';
		}).join('\n');

		prompt += `\n\n## Your Task:\n${this.task}\n\n`;

		if (this.file) {
			prompt += `## Target File:\n${this.file}\n\n`;
		}

		// Inject migration context if detected
		if (migrationContext) {
			prompt += migrationContext;
		}

		prompt += `## Instructions:
1. Analyze the retrieved context carefully
2. Use graph relationships to understand dependencies
3. Generate a high-confidence solution (aim for ≥85%)
4. If you need external data (Postgres/Minio) or verification, you MUST suggest tools and set confidence < 85%
5. Provide step-by-step implementation plan
6. Include validation steps

## Output Format:
{
  "solution": "detailed solution here",
  "confidence": 0.XX,
  "reasoning": "why this solution works",
  "steps": ["step 1", "step 2", ...],
  "validation": "how to validate the fix",
  "suggestedTools": ["tool1", "tool2"] // if confidence < 85%
}`;

		console.log(chalk.green(`   ✅ Prompt ready (${prompt.length} chars)\n`));
		return prompt;
	}

	/**
	 * Step 4: Call Multi-LLM Router (with Gemini 3 search grounding)
	 */
	async callLLM(prompt) {
		const provider = CONFIG.llm.provider;
		console.log(chalk.cyan('   🧠 Step 4: Calling Multi-LLM Router'));
		console.log(chalk.gray(`      Provider: ${provider}`));
		if (provider === 'gemini' && CONFIG.llm.useSearch) {
			console.log(chalk.green(`      🔍 Google Search grounding enabled`));
		}
		console.log(chalk.gray(`      Prompt length: ${prompt.length} chars`));

		try {
			// Use multi-provider LLM router with automatic fallback
			const llmOptions = {
				provider: provider,
				model: CONFIG.llm.model,
				temperature: CONFIG.llm.temperature,
				maxTokens: CONFIG.llm.maxTokens,
				useSearch: CONFIG.llm.useSearch,  // Enable Gemini 3 search if configured
				verbose: true
			};

			console.log(chalk.gray(`      Options: ${JSON.stringify(llmOptions)}`));

			// Call multi-provider router
			const response = await callMultiLLM(prompt, llmOptions);

			console.log(chalk.gray(`      Provider used: ${response.provider}`));
			if (response.searchUsed) {
				console.log(chalk.green(`      🔍 Google Search was used!`));
				if (response.searchQueries) {
					console.log(chalk.gray(`      Search queries: ${response.searchQueries}`));
				}
				if (response.sources?.length > 0) {
					console.log(chalk.gray(`      Sources cited: ${response.sources.length}`));
				}
			}

			const responseText = response.text || '';
			console.log(chalk.gray(`      Response text length: ${responseText.length} chars`));

			// Try to parse JSON response
			let parsedResponse;
			try {
				const jsonMatch = responseText.match(/\{[\s\S]*\}/);
				parsedResponse = jsonMatch ? JSON.parse(jsonMatch[0]) : { solution: responseText, confidence: 0.5 };
			} catch (e) {
				console.log(chalk.yellow(`      Could not parse JSON from response, using raw text`));
				parsedResponse = { solution: responseText, confidence: 0.5 };
			}

			console.log(chalk.green(`   ✅ LLM responded (confidence: ${(parsedResponse.confidence * 100).toFixed(1)}%)\n`));
			return parsedResponse;

		} catch (error) {
			console.log(chalk.red(`   ❌ LLM error: ${error.message}`));
			console.log(chalk.red(`      Stack: ${error.stack}`));
			return { solution: 'Error calling LLM', confidence: 0, error: error.message };
		}
	}

	/**
	 * Step 5: Invoke tools if needed (Enhanced with MCP)
	 */
	async invokeTools(tools) {
		console.log(chalk.cyan(`   🛠️  Step 5: Invoking Tools: ${tools.join(', ')}`));

		const results = [];

		for (const tool of tools) {
			try {
				let output = '';

				// Check if it's an MCP tool call (format: mcp:server:tool:args)
				if (tool.startsWith('mcp:')) {
					output = await this.callMcpTool(tool);
				} else {
					switch (tool) {
						case 'tsc':
							output = execSync('npx tsc --noEmit', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
							break;
						case 'svelte-check':
							output = execSync('npx svelte-check --threshold warning', { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
							break;
						case 'file-read':
							if (this.file && existsSync(path.join(rootDir, this.file))) {
								output = await fs.readFile(path.join(rootDir, this.file), 'utf-8');
							}
							break;
						case 'grep-search':
							// Search for related imports
							output = execSync(`grep -r "import.*Button\\|Card\\|Input" src/lib/components`, { cwd: rootDir, encoding: 'utf-8', stdio: 'pipe' });
							break;
						case 'minio-fetch':
							// Placeholder for Minio integration
							output = "Minio integration ready. Use mcp:minio:fetch for actual execution.";
							break;
						case 'migrate-svelte-component':
							// Specialized Svelte 5 Migration Tool
							if (this.file && existsSync(path.join(rootDir, this.file))) {
								const filePath = path.join(rootDir, this.file);
								console.log(chalk.magenta(`   🛠️  Agent is migrating: ${this.file}`));

								// 1. Read the legacy file
								const legacyCode = await fs.readFile(filePath, 'utf-8');

								// 2. Retrieve SPECIFIC Svelte 5 docs (Runes, Events)
								const migrationDocs = await this.queryQdrantCollection(
									CONFIG.qdrant.knowledgeCollection,
									await this.generateEmbedding("svelte 5 migration guide runes events"),
									3,
									0.4
								);

								// 3. Create a "Strict Mode" Prompt
								const migrationPrompt = `
									You are a Svelte 5 Migration Engine.
									Convert the following Svelte 4 code to Svelte 5 Runes mode.

									RULES:
									1. Replace 'export let' with '$props()'.
									2. Replace 'let x' (reactive) with '$state(x)'.
									3. Replace '$:' with '$derived()' or '$effect()'.
									4. Replace 'on:click' with 'onclick'.
									5. Do NOT output markdown code blocks, just the raw code.

									REFERENCE DOCS:
									${migrationDocs.map(d => d.payload.summary).join('\n')}

									CODE TO MIGRATE:
									${legacyCode}
								`;

								// 4. Call LLM specifically for this sub-task
								const result = await callMultiLLM(migrationPrompt, {
									provider: CONFIG.llm.provider,
									model: CONFIG.llm.model,
									temperature: 0.1 // Very strict
								});

								output = result.text || result.solution || "Migration failed";
							} else {
								output = "File not found for migration";
							}
							break;
						default:
							output = `Tool ${tool} not implemented yet`;
					}
				}

				results.push({ tool, output: output.substring(0, 1000) }); // Truncate long outputs
				this.session.toolsCalled.push(tool);

			} catch (error) {
				results.push({ tool, error: error.message });
			}
		}

		console.log(chalk.green(`   ✅ Tools executed: ${results.length}\n`));
		return results;
	}

	/**
	 * Call an MCP tool via HTTP (Agentic Tool Calling)
	 * Format: mcp:serverName:functionName:jsonArgs
	 */
	async callMcpTool(toolString) {
		// Parse tool string
		const parts = toolString.split(':');
		if (parts.length < 3) return "Invalid MCP tool format. Use mcp:server:function:args";

		const serverName = parts[1]; // e.g., 'context7' or 'postgres'
		const functionName = parts[2]; // e.g., 'summarize' or 'query'
		const argsJson = parts.slice(3).join(':') || '{}';

		let args = {};
		try {
			args = JSON.parse(argsJson);
		} catch (e) {
			return `Invalid JSON arguments for MCP tool: ${e.message}`;
		}

		// Determine MCP server URL based on name (can be extended)
		let mcpUrl = CONFIG.mcp?.url || 'http://localhost:3002';

		// Example: Route to different servers if needed
		// if (serverName === 'postgres') mcpUrl = process.env.MCP_POSTGRES_URL || 'http://localhost:3003';
		// if (serverName === 'minio') mcpUrl = process.env.MCP_MINIO_URL || 'http://localhost:3004';

		console.log(chalk.gray(`      Calling MCP ${serverName}/${functionName}...`));

		try {
			const response = await fetch(`${mcpUrl}/function-call`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					functionName,
					input: args,
					model: CONFIG.ollama.qaModel
				})
			});

			if (!response.ok) {
				return `MCP Call Failed: ${response.statusText}`;
			}

			const data = await response.json();
			return typeof data.result === 'string' ? data.result : JSON.stringify(data.result);

		} catch (error) {
			return `MCP Connection Error: ${error.message}`;
		}
	}

	/**
	 * Build refined prompt with tool results
	 */
	buildRefinedPrompt(originalPrompt, toolResults) {
		const toolContext = toolResults.map(tr =>
			`Tool: ${tr.tool}\nOutput: ${tr.output || tr.error}`
		).join('\n\n');

		return `${originalPrompt}

## Additional Tool Context:
${toolContext}

Now generate a refined solution with higher confidence based on the tool outputs.`;
	}

	/**
	 * Select prompt template based on task
	 */
	selectPromptTemplate() {
		if (!this.prompts) {
			return {
				role: 'general-agent',
				prompt: 'You are an expert software engineer. Analyze the provided context and generate a solution.'
			};
		}

		// Match task to prompt template
		if (this.task.toLowerCase().includes('import')) return this.prompts.importResolution;
		if (this.task.toLowerCase().includes('route')) return this.prompts.routeConsolidation;
		if (this.task.toLowerCase().includes('error') || this.task.toLowerCase().includes('fix')) return this.prompts.errorFixing;

		return this.prompts.errorFixing; // Default
	}

	/**
	 * Generate embedding using Ollama
	 */
	async generateEmbedding(text) {
		const response = await fetch(`${CONFIG.ollama.url}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: CONFIG.ollama.embeddingModel,
				prompt: text
			})
		});

		if (!response.ok) {
			throw new Error('Embedding generation failed');
		}

		const data = await response.json();
		return data.embedding;
	}

	/**
	 * Save session to file
	 */
	async saveSession() {
		const sessionFile = CONFIG.output.sessionFile.replace('{timestamp}', this.session.id);
		const sessionPath = path.join(rootDir, CONFIG.output.dir, sessionFile);

		await fs.mkdir(path.dirname(sessionPath), { recursive: true });
		await fs.writeFile(sessionPath, JSON.stringify(this.session, null, 2));

		// Also save solution as markdown
		if (this.session.finalSolution) {
			const solutionFile = CONFIG.output.solutionFile.replace('{timestamp}', this.session.id);
			const solutionPath = path.join(rootDir, CONFIG.output.dir, solutionFile);

			const markdown = `# ACE Solution - ${this.task}

**Confidence:** ${(this.session.confidence * 100).toFixed(1)}%
**Timestamp:** ${this.session.timestamp}
**Iterations:** ${this.session.iterations.length}

## Solution

${this.session.finalSolution}

## Tools Used

${this.session.toolsCalled.join(', ') || 'None'}

## Validation

Run the following to validate:
- \`npm run check\` (TypeScript validation)
- \`npm test\` (test suite)
`;

			await fs.writeFile(solutionPath, markdown);
		}
	}

	/**
	 * Print summary
	 */
	printSummary(duration) {
		console.log(chalk.green.bold('\n✅ ACE Process Complete\n'));
		console.log(chalk.white(`   Task: ${this.task}`));
		console.log(chalk.white(`   Iterations: ${this.session.iterations.length}`));
		console.log(chalk.white(`   Final Confidence: ${(this.session.confidence * 100).toFixed(1)}%`));
		console.log(chalk.white(`   Tools Called: ${this.session.toolsCalled.join(', ') || 'None'}`));
		console.log(chalk.white(`   Duration: ${duration}s\n`));

		if (this.session.confidence >= CONFIG.confidence.autoApply) {
			console.log(chalk.green('🎯 Solution can be auto-applied'));
		} else if (this.session.confidence >= CONFIG.confidence.manualReview) {
			console.log(chalk.yellow('⚠️  Solution requires manual review'));
		} else {
			console.log(chalk.red('❌ Low confidence - human escalation needed'));
		}

		console.log(chalk.cyan(`\n📄 Session saved: ${CONFIG.output.dir}/session-${this.session.id}.json`));
		if (this.session.finalSolution) {
			console.log(chalk.cyan(`📝 Solution saved: ${CONFIG.output.dir}/solution-${this.session.id}.md\n`));
		}
	}
}

// ============================================
// CLI Interface
// ============================================
async function main() {
	const args = process.argv.slice(2);

	let task = '';
	let file = null;
	let iterations = 1;
	let verbose = false;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '--task' && args[i + 1]) {
			task = args[i + 1];
			i++;
		} else if (args[i] === '--file' && args[i + 1]) {
			file = args[i + 1];
			i++;
		} else if (args[i] === '--iterations' && args[i + 1]) {
			iterations = parseInt(args[i + 1], 10);
			i++;
		} else if (args[i] === '--verbose') {
			verbose = true;
		}
	}

	if (!task) {
		console.log(chalk.red('❌ Error: --task is required\n'));
		console.log(chalk.cyan('Usage:'));
		console.log(chalk.white('  node phase76-ace-prompt-engineer.mjs --task "Fix missing imports" [--file path] [--iterations 3] [--verbose]\n'));
		console.log(chalk.cyan('Examples:'));
		console.log(chalk.white('  node phase76-ace-prompt-engineer.mjs --task "Resolve all import errors"'));
		console.log(chalk.white('  node phase76-ace-prompt-engineer.mjs --task "Optimize route structure" --iterations 2'));
		console.log(chalk.white('  node phase76-ace-prompt-engineer.mjs --task "Fix type errors" --file src/routes/(app)/cases/[id]/+page.svelte\n'));
		process.exit(1);
	}

	const engineer = new ACEPromptEngineer({ task, file, iterations, verbose });
	await engineer.initialize();
	await engineer.execute();
}

// Run if called directly
if (import.meta.url.startsWith('file:')) {
	const modulePath = fileURLToPath(import.meta.url);
	const scriptPath = process.argv[1];
	if (scriptPath && (modulePath === scriptPath || scriptPath.endsWith('phase76-ace-prompt-engineer.mjs'))) {
		main().catch(e => {
			console.error(e);
			process.exit(1);
		});
	}
}

export { ACEPromptEngineer, CONFIG };
