#!/usr/bin/env node
/**
 * Phase 89: Enhanced Error Analyzer with RAG+KAG
 * - Gemini API for advanced analysis
 * - copilot.md + claude.md + llms.txt context injection
 * - Qdrant knowledge graph integration
 * - Autogen/CrewAI tool calling recommendations
 * - FastMCP tool integration for agentic workflows
 * - langextract context extraction
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { QdrantClient } from '@qdrant/js-client-rest';
import { exec } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import { promisify } from 'util';

dotenv.config();

const execAsync = promisify(exec);
const qdrant = new QdrantClient({ url: 'http://localhost:6333' });
const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const FASTMCP_URL = process.env.FASTMCP_URL || 'http://localhost:3003';

// =============================================================================
// FastMCP Tool Integration for Agentic Workflows
// =============================================================================

async function callFastMCPTool(toolName, args = {}) {
	console.log(`🔌 FastMCP: Calling tool "${toolName}"...`);

	try {
		const response = await fetch(`${FASTMCP_URL}/tools/${toolName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(args)
		});

		if (!response.ok) {
			console.warn(`  ⚠️  FastMCP tool failed: ${response.status}`);
			return null;
		}

		const result = await response.json();
		console.log(`  ✅ FastMCP result: ${result.success ? 'Success' : 'Failed'}`);
		return result;
	} catch (err) {
		console.error(`  ❌ FastMCP error: ${err.message}`);
		return null;
	}
}

async function langextract(text, schema = {}) {
	/**
	 * Extract structured data from unstructured LLM output
	 * Uses gemma3-legal:latest for extraction with JSON schema
	 */
	console.log('🧠 langextract: Extracting structured data from LLM output...');

	try {
		const response = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{
						role: 'system',
						content: `You are a data extraction assistant. Extract structured data from the text according to the schema provided. Return ONLY valid JSON.`
					},
					{
						role: 'user',
						content: `Extract the following data from this text:\n\nSchema: ${JSON.stringify(schema)}\n\nText:\n${text}`
					}
				],
				stream: false,
				format: 'json',
				options: { temperature: 0.1 }
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama returned ${response.status}`);
		}

		const data = await response.json();
		const extracted = JSON.parse(data.message.content);

		console.log(`  ✅ Extracted ${Object.keys(extracted).length} fields`);
		return extracted;
	} catch (err) {
		console.error(`  ❌ langextract failed: ${err.message}`);
		return null;
	}
}

// =============================================================================
// RAG+KAG Contextual Engineering with Cosine Similarity Ranking
// =============================================================================

async function rankErrorsByContext(query, collectionName = 'phase89_error_clusters', topK = 10) {
	console.log(`🔍 RAG+KAG: Ranking errors by cosine similarity for: "${query}"`);

	try {
		// Get embedding for the query using embeddinggemma:latest
		const embedResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: query
			})
		});

		if (!embedResponse.ok) {
			console.warn(`  ⚠️  Embedding API failed, using fallback search`);
			return [];
		}

		const embedData = await embedResponse.json();
		const queryVector = embedData.embedding;

		// Search Qdrant with cosine similarity
		const searchResults = await qdrant.search(collectionName, {
			vector: queryVector,
			limit: topK,
			with_payload: true,
			with_vector: false
		});

		console.log(`  ✅ Found ${searchResults.length} contextually ranked results`);

		return searchResults.map((result) => ({
			score: result.score,
			payload: result.payload,
			id: result.id
		}));
	} catch (err) {
		console.error(`  ❌ RAG+KAG ranking failed: ${err.message}`);
		return [];
	}
}

// =============================================================================
// File Metadata Tracking (Timeline for Visual Edit Log)
// =============================================================================

const fileEditLog = new Map();

function trackFileEdit(filePath, operation = 'indexed', metadata = {}) {
	const timestamp = new Date().toISOString();
	const entry = {
		filePath,
		operation, // 'indexed', 'tagged', 'edited', 'analyzed'
		timestamp,
		metadata: {
			...metadata,
			tags: metadata.tags || [],
			errorCount: metadata.errorCount || 0,
			clusterId: metadata.clusterId || null
		}
	};

	if (!fileEditLog.has(filePath)) {
		fileEditLog.set(filePath, []);
	}
	fileEditLog.get(filePath).push(entry);

	return entry;
}

function getFileTimeline(filePath) {
	return fileEditLog.get(filePath) || [];
}

async function saveFileEditLog(outputPath = 'reports/phase89-file-edit-log.json') {
	const logData = {
		generatedAt: new Date().toISOString(),
		totalFiles: fileEditLog.size,
		totalEdits: Array.from(fileEditLog.values()).reduce((sum, edits) => sum + edits.length, 0),
		files: Object.fromEntries(fileEditLog)
	};

	await fs.writeFile(outputPath, JSON.stringify(logData, null, 2));
	console.log(`💾 File edit log saved: ${outputPath}`);
	return logData;
}

// =============================================================================
// Knowledge Aggregation
// =============================================================================

async function aggregateQdrantKnowledge() {
	console.log('📊 Aggregating Qdrant Knowledge Graph...\n');

	const collections = await qdrant.getCollections();
	const knowledge = {
		collections: [],
		totalPoints: 0,
		tags: new Set(),
		fileTypes: new Set(),
		errorPatterns: new Set(),
		recommendations: []
	};

	for (const collection of collections.collections) {
		const name = collection.name;
		const info = await qdrant.getCollection(name);

		console.log(`  📦 ${name}: ${info.points_count} points`);

		// Sample points to extract tags/metadata
		const sample = await qdrant.scroll(name, {
			limit: 100,
			with_payload: true,
			with_vector: false
		});

		const collectionData = {
			name,
			pointsCount: info.points_count,
			vectorSize: info.config.params.vectors.size,
			tags: new Set(),
			fileTypes: new Set(),
			errorTypes: new Set()
		};

		for (const point of sample.points) {
			const payload = point.payload || {};

			// Extract tags
			if (payload.tags && Array.isArray(payload.tags)) {
				payload.tags.forEach((tag) => {
					knowledge.tags.add(tag);
					collectionData.tags.add(tag);
				});
			}

			// Extract file types
			if (payload.file_path) {
				const ext = payload.file_path.split('.').pop();
				if (ext) {
					knowledge.fileTypes.add(ext);
					collectionData.fileTypes.add(ext);
				}
			}

			// Extract error patterns
			if (payload.message) {
				const patterns = extractErrorPatterns(payload.message);
				patterns.forEach((p) => {
					knowledge.errorPatterns.add(p);
					collectionData.errorTypes.add(p);
				});
			}
		}

		knowledge.collections.push({
			name: collectionData.name,
			points: collectionData.pointsCount,
			vectorSize: collectionData.vectorSize,
			tags: Array.from(collectionData.tags),
			fileTypes: Array.from(collectionData.fileTypes),
			errorTypes: Array.from(collectionData.errorTypes)
		});

		knowledge.totalPoints += info.points_count;
	}

	return {
		...knowledge,
		tags: Array.from(knowledge.tags),
		fileTypes: Array.from(knowledge.fileTypes),
		errorPatterns: Array.from(knowledge.errorPatterns)
	};
}

function extractErrorPatterns(message) {
	const patterns = [];

	// TypeScript errors
	if (message.includes('TS')) patterns.push('typescript');
	if (message.includes('Type')) patterns.push('type-error');
	if (message.includes('Property')) patterns.push('property-access');
	if (message.includes('Cannot find')) patterns.push('missing-import');

	// Svelte errors
	if (message.includes('svelte')) patterns.push('svelte');
	if (message.includes('$state')) patterns.push('svelte5-runes');
	if (message.includes('export let')) patterns.push('svelte4-props');

	// Build errors
	if (message.includes('Module not found')) patterns.push('missing-module');
	if (message.includes('SyntaxError')) patterns.push('syntax-error');

	return patterns;
}

// =============================================================================
// Gemini Analysis with Context
// =============================================================================

async function analyzeWithGemini(knowledge, copilotContext, claudeContext) {
	console.log('\n🧠 Analyzing with Gemini API...\n');

	try {
		const model = genai.getGenerativeModel({
			model: 'gemini-2.0-flash-exp',
			generationConfig: {
				temperature: 0.7,
				topP: 0.95,
				topK: 40,
				maxOutputTokens: 8192
			}
		});

		const prompt = `You are an expert TypeScript/Svelte code analyzer. Analyze this error knowledge graph and provide actionable recommendations.

# Knowledge Graph Summary
- Total Collections: ${knowledge.collections.length}
- Total Error Points: ${knowledge.totalPoints}
- Unique Tags: ${knowledge.tags.length}
- File Types: ${knowledge.fileTypes.join(', ')}
- Error Patterns: ${knowledge.errorPatterns.join(', ')}

# Collections Breakdown
${knowledge.collections
	.map(
		(c) => `
## ${c.name}
- Points: ${c.points}
- Vector Size: ${c.vectorSize}
- Top Tags: ${c.tags.slice(0, 10).join(', ')}
- File Types: ${c.fileTypes.join(', ')}
- Error Types: ${c.errorTypes.join(', ')}
`
	)
	.join('\n')}

# Context from copilot.md
${copilotContext.substring(0, 4000)}

# Context from claude.md (if available)
${claudeContext ? claudeContext.substring(0, 2000) : 'N/A'}

# Analysis Tasks

1. **Error Clustering Analysis**
   - Identify the most critical error clusters
   - Detect duplicate/similar errors across collections
   - Recommend deduplication strategies

2. **Svelte 5 Migration Status**
   - Count Svelte 4 vs Svelte 5 patterns
   - Identify files needing migration (export let → $state, $: → $derived)
   - Priority migration list

3. **TypeScript Health**
   - Most common type errors
   - Missing type definitions
   - Recommend: npm packages to install, types to generate

4. **Next Steps for Autogen/CrewAI**
   - Tool calling recommendations (e.g., "crawl_docs", "web_search")
   - Keywords for web search (latest Svelte docs, TypeScript 5.6 features)
   - Files to prioritize for automated fixing

5. **Knowledge Base Enhancements**
   - Missing documentation to fetch
   - RAG retrieval improvements
   - KAG graph connections to add

Return your analysis as a structured JSON with these sections:
- criticalClusters (array of {name, severity, count, recommendation})
- svelte5Migration (object with {completionPercent, filesToMigrate[], priorities})
- typeScriptHealth (object with {errorCount, missingTypes[], npmPackages[]})
- toolCallingRecommendations (array of {tool, args, reason})
- knowledgeEnhancements (array of {type, action, priority})
- nextSteps (array of strings)
`;

		const result = await model.generateContent(prompt);
		const response = result.response.text();

		// Try to parse as JSON
		try {
			const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/) || response.match(/{[\s\S]*}/);
			if (jsonMatch) {
				const jsonStr = jsonMatch[1] || jsonMatch[0];
				return JSON.parse(jsonStr);
			}
		} catch (e) {
			console.warn('⚠️  Could not parse JSON, returning raw text');
		}

		return { rawAnalysis: response };
	} catch (error) {
		console.warn(`\n⚠️  Gemini API failed: ${error.message}`);
		console.log('  🔄 Switching to Ollama fallback (gemma3-legal:latest)...');
		return await analyzeWithOllama(knowledge, copilotContext, claudeContext);
	}
}

// =============================================================================
// Ollama Analysis with Web Search (Fallback)
// =============================================================================

async function webSearch(query) {
	/**
	 * Performs web search using ripgrep on cached docs or DuckDuckGo
	 * Returns relevant snippets for context enhancement
	 */
	const results = [];

	// 1. Search local documentation cache (including llms.txt)
	try {
		const { stdout } = await execAsync(
			`rg -i "${query}" data/svelte-docs copilot.md claude.md llms.txt --max-count=5 --no-heading -C 3`,
			{ timeout: 5000 }
		);
		if (stdout) {
			results.push({
				source: 'local-docs',
				content: stdout.substring(0, 800)
			});
		}
	} catch {
		// No local results
	}

	// 2. Use DuckDuckGo instant answers (no API key needed)
	try {
		const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
		if (response.ok) {
			const data = await response.json();
			if (data.Abstract) {
				results.push({
					source: 'duckduckgo',
					content: data.Abstract
				});
			}
		}
	} catch {
		// Search failed
	}

	return results;
}

async function analyzeWithOllama(knowledge, copilotContext, claudeContext, llmsContext = '') {
	console.log('\n🦙 Analyzing with Ollama (gemma3-legal:latest)...\n');

	// Perform web searches for context (now includes llms.txt)
	const searchQueries = [
		'Svelte 5 runes migration guide',
		'TypeScript 5.6 new features',
		'SvelteKit 2.0 SSR best practices'
	];

	const searchResults = [];
	for (const query of searchQueries) {
		const results = await webSearch(query);
		if (results.length > 0) {
			searchResults.push({ query, results });
			console.log(`  🔍 Found ${results.length} results for: ${query}`);
		}
	}

	// Inject llms.txt context as primary knowledge base
	const llmsContextSnippet = llmsContext.substring(0, 3000);

	const prompt = `You are an expert TypeScript/Svelte code analyzer. Analyze this error knowledge graph and provide actionable recommendations.

# Primary Knowledge Base (llms.txt - Svelte 5 + SvelteKit 2)
${llmsContextSnippet}

# Knowledge Graph Summary
- Total Collections: ${knowledge.collections.length}
- Total Error Points: ${knowledge.totalPoints}
- Unique Tags: ${knowledge.tags.length}
- File Types: ${knowledge.fileTypes.join(', ')}
- Error Patterns: ${knowledge.errorPatterns.join(', ')}

# Collections Breakdown (Top 5)
${knowledge.collections
	.slice(0, 5)
	.map(
		(c) => `
## ${c.name}
- Points: ${c.points}
- Tags: ${c.tags.slice(0, 5).join(', ')}
- Error Types: ${c.errorTypes.join(', ')}
`
	)
	.join('\n')}

# Web Search Results
${searchResults
	.map(
		(sr) => `
Query: ${sr.query}
${sr.results.map((r) => `Source: ${r.source}\n${r.content}`).join('\n')}
`
	)
	.join('\n')}

# Context from copilot.md
${copilotContext.substring(0, 2000)}

Provide your analysis in this format:

1. **Critical Issues** (top 3 error clusters to fix)
2. **Svelte 5 Migration** (% complete, files to migrate)
3. **TypeScript Health** (common errors, missing types)
4. **Tool Calling** (recommended tools: web_search, crawl_docs, fix_errors)
5. **Next Steps** (prioritized action items)

Be specific and actionable.`;

	try {
		// Use /api/chat endpoint (newer Ollama API standard)
		const response = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{
						role: 'system',
						content: 'You are an expert TypeScript/Svelte code analyzer with deep knowledge of error patterns and best practices.'
					},
					{
						role: 'user',
						content: prompt
					}
				],
				stream: false,
				options: {
					temperature: 0.7,
					num_predict: 2048
				}
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama returned ${response.status}`);
		}

		const data = await response.json();
		const analysisText = data.message.content;

		// Use langextract to structure the output
		const extractedData = await langextract(analysisText, {
			criticalIssues: 'array of strings',
			svelte5Migration: { completionPercent: 'number', filesToMigrate: 'array of strings' },
			typeScriptHealth: { commonErrors: 'array of strings', missingTypes: 'array of strings' },
			toolCalls: 'array of {tool: string, args: string}',
			nextSteps: 'array of strings'
		});

		// Parse structured sections
		const analysis = {
			rawAnalysis: analysisText,
			criticalClusters: extractedData?.criticalIssues || extractSection(analysisText, 'Critical Issues'),
			svelte5Migration: extractedData?.svelte5Migration || extractSection(analysisText, 'Svelte 5 Migration'),
			typeScriptHealth: extractedData?.typeScriptHealth || extractSection(analysisText, 'TypeScript Health'),
			toolCallingRecommendations: extractedData?.toolCalls || extractToolCalls(analysisText),
			nextSteps: extractedData?.nextSteps || extractNextSteps(analysisText),
			webSearchResults: searchResults,
			provider: 'ollama-gemma3-legal',
			usedLangextract: !!extractedData
		};

		console.log('  ✅ Ollama analysis complete\n');
		return analysis;
	} catch (err) {
		console.error(`  ❌ Ollama failed: ${err.message}`);
		return {
			note: 'Ollama analysis failed',
			error: err.message,
			provider: 'ollama-failed'
		};
	}
}

function extractSection(text, sectionName) {
	const regex = new RegExp(`(?:\\*\\*)?${sectionName}(?:\\*\\*)?[:\\s]*(.*?)(?=\\n\\n|\\*\\*|$)`, 'is');
	const match = text.match(regex);
	return match ? match[1].trim() : '';
}

// =============================================================================
// LLM Output Adapter for Knowledge Base Updates
// =============================================================================

class LLMOutputAdapter {
	constructor() {
		this.updates = [];
		this.timestamp = new Date().toISOString();
	}

	adaptGeminiOutput(response, metadata = {}) {
		const update = {
			provider: 'gemini',
			model: metadata.model || 'gemini-2.0-flash-exp',
			timestamp: this.timestamp,
			rawOutput: response,
			structured: {
				criticalIssues: this.extractCriticalIssues(response),
				recommendations: this.extractRecommendations(response),
				toolCalls: this.extractToolCallsFromText(response),
				files: this.extractFileReferences(response)
			},
			metadata
		};
		this.updates.push(update);
		return update;
	}

	adaptOllamaOutput(response, metadata = {}) {
		const update = {
			provider: 'ollama',
			model: metadata.model || 'gemma3-legal:latest',
			timestamp: this.timestamp,
			rawOutput: response,
			structured: {
				criticalIssues: this.extractCriticalIssues(response),
				recommendations: this.extractRecommendations(response),
				toolCalls: this.extractToolCallsFromText(response),
				files: this.extractFileReferences(response)
			},
			metadata
		};
		this.updates.push(update);
		return update;
	}

	extractCriticalIssues(text) {
		const issues = [];
		const criticalSection = extractSection(text, 'Critical');
		if (criticalSection) {
			const matches = criticalSection.match(/(?:^|\n)\s*(?:\d+\.|[-*])\s*(.+?)(?=\n|$)/g);
			if (matches) {
				issues.push(...matches.map((m) => m.replace(/^\s*(?:\d+\.|[-*])\s*/, '').trim()));
			}
		}
		return issues;
	}

	extractRecommendations(text) {
		const recommendations = [];
		const sections = ['Next Steps', 'Recommendations', 'Action Items'];
		for (const section of sections) {
			const content = extractSection(text, section);
			if (content) {
				const matches = content.match(/(?:^|\n)\s*(?:\d+\.|[-*])\s*(.+?)(?=\n|$)/g);
				if (matches) {
					recommendations.push(...matches.map((m) => m.replace(/^\s*(?:\d+\.|[-*])\s*/, '').trim()));
				}
			}
		}
		return recommendations;
	}

	extractToolCallsFromText(text) {
		const toolCalls = [];
		const toolRegex = /(web_search|crawl_docs|fix_errors|analyze_cluster)\s*\(["']?([^"')]+)["']?\)/gi;
		let match;
		while ((match = toolRegex.exec(text)) !== null) {
			toolCalls.push({
				tool: match[1],
				args: match[2]
			});
		}
		return toolCalls;
	}

	extractFileReferences(text) {
		const files = [];
		const fileRegex = /(?:src\/|lib\/|components\/)?[\w\/.-]+\.(?:svelte|ts|js|tsx|jsx|mjs)/gi;
		const matches = text.match(fileRegex);
		if (matches) {
			files.push(...new Set(matches));
		}
		return files;
	}

	async updateKnowledgeBase(copilotPath = 'copilot.md') {
		console.log('\n📝 Updating knowledge base with LLM outputs...');

		const summary = {
			updatedAt: this.timestamp,
			totalUpdates: this.updates.length,
			providers: [...new Set(this.updates.map((u) => u.provider))],
			fileReferences: new Set(),
			toolCalls: []
		};

		for (const update of this.updates) {
			update.structured.files.forEach((f) => summary.fileReferences.add(f));
			summary.toolCalls.push(...update.structured.toolCalls);

			// Track file edits for each referenced file
			for (const file of update.structured.files) {
				trackFileEdit(file, 'analyzed', {
					provider: update.provider,
					model: update.model,
					tags: ['llm-analyzed', update.provider]
				});
			}
		}

		// Append to copilot.md
		const copilotUpdate =
			`\n\n## Phase 89 Analysis Update - ${this.timestamp}\n\n` +
			`**Providers Used:** ${summary.providers.join(', ')}\n` +
			`**Files Analyzed:** ${summary.fileReferences.size}\n` +
			`**Tool Calls:** ${summary.toolCalls.length}\n\n` +
			this.updates
				.map(
					(u) =>
						`### ${u.provider} (${u.model})\n` +
						`**Critical Issues:** ${u.structured.criticalIssues.length}\n` +
						`**Recommendations:** ${u.structured.recommendations.length}\n`
				)
				.join('\n');

		await fs.appendFile(copilotPath, copilotUpdate);
		console.log(`  ✅ Updated ${copilotPath}`);

		return summary;
	}
}

function extractToolCalls(text) {
	const tools = [];
	const patterns = [
		/web_search\s*["']([^"']+)["']/gi,
		/crawl_docs\s*["']([^"']+)["']/gi,
		/fix_errors\s*["']([^"']+)["']/gi
	];

	patterns.forEach((pattern) => {
		let match;
		while ((match = pattern.exec(text)) !== null) {
			tools.push({
				tool: pattern.source.split('\\')[0],
				args: match[1],
				reason: 'Extracted from Ollama analysis'
			});
		}
	});

	return tools;
}

function extractNextSteps(text) {
	const steps = [];
	const lines = text.split('\n');
	let inStepsSection = false;

	for (const line of lines) {
		if (/next steps?/i.test(line)) {
			inStepsSection = true;
			continue;
		}
		if (inStepsSection && /^\d+\.|^-|^•/.test(line.trim())) {
			steps.push(line.replace(/^\d+\.|^-|^•/, '').trim());
		}
		if (inStepsSection && line.trim() === '') {
			break;
		}
	}

	return steps;
}

// =============================================================================
// Load Context Files (Including llms.txt Knowledge Base)
// =============================================================================

async function loadContextFiles() {
	const contexts = {};

	// Load llms.txt FIRST - primary knowledge base with Svelte 5 + SvelteKit 2
	try {
		contexts.llms = await fs.readFile('llms.txt', 'utf-8');
		console.log(`  ✅ Loaded llms.txt (${contexts.llms.length} chars) - Primary KB`);
	} catch {
		console.log('  ⚠️  llms.txt not found');
		contexts.llms = '';
	}

	try {
		contexts.copilot = await fs.readFile('copilot.md', 'utf-8');
		console.log(`  ✅ Loaded copilot.md (${contexts.copilot.length} chars)`);
	} catch {
		console.log('  ⚠️  copilot.md not found');
		contexts.copilot = '';
	}

	try {
		contexts.claude = await fs.readFile('claude.md', 'utf-8');
		console.log(`  ✅ Loaded claude.md (${contexts.claude.length} chars)`);
	} catch {
		console.log('  ⚠️  claude.md not found');
		contexts.claude = '';
	}

	try {
		contexts.gemini = await fs.readFile('.env', 'utf-8');
		const apiKeyMatch = contexts.gemini.match(/GEMINI_API_KEY=(.+)/);
		if (apiKeyMatch) {
			console.log('  ✅ Gemini API key found in .env');
		} else {
			console.log('  ⚠️  GEMINI_API_KEY not found in .env');
		}
	} catch {
		console.log('  ⚠️  .env not found');
	}

	return contexts;
}

// =============================================================================
// Generate Recommendations
// =============================================================================

function generateRecommendations(analysis, knowledge) {
	const recommendations = [];

	// Based on Gemini analysis
	if (analysis.toolCallingRecommendations) {
		recommendations.push({
			category: 'Autogen/CrewAI Tools',
			items: analysis.toolCallingRecommendations.map((r) => ({
				tool: r.tool,
				args: r.args,
				reason: r.reason,
				priority: 'high'
			}))
		});
	}

	// Based on knowledge graph
	if (knowledge.errorPatterns.includes('svelte5-runes')) {
		recommendations.push({
			category: 'Svelte 5 Migration',
			items: [
				{
					action: 'Run svelte-migrate to auto-convert props',
					command: 'npx svelte-migrate routes',
					priority: 'high'
				},
				{
					action: 'Update component documentation',
					command: 'web_search "Svelte 5 runes migration guide"',
					priority: 'medium'
				}
			]
		});
	}

	if (knowledge.errorPatterns.includes('typescript')) {
		recommendations.push({
			category: 'TypeScript Fixes',
			items: [
				{
					action: 'Run type checker with --watch',
					command: 'npm run check:watch',
					priority: 'high'
				},
				{
					action: 'Generate missing type definitions',
					command: 'npx tsc --declaration --emitDeclarationOnly',
					priority: 'medium'
				}
			]
		});
	}

	// Web search keywords
	const keywords = [
		...knowledge.errorPatterns.map((p) => p.replace('-', ' ')),
		'SvelteKit 2.0 SSR',
		'TypeScript 5.6 features',
		'Vite 6 optimization'
	];

	recommendations.push({
		category: 'Documentation to Fetch',
		items: keywords.map((k) => ({
			action: `web_search "${k}"`,
			priority: 'low'
		}))
	});

	return recommendations;
}

// =============================================================================
// Save Results
// =============================================================================

async function saveResults(knowledge, analysis, recommendations, provider = 'unknown') {
	const timestamp = new Date().toISOString();

	const output = {
		timestamp,
		knowledge,
		analysis,
		recommendations,
		metadata: {
			totalCollections: knowledge.collections.length,
			totalPoints: knowledge.totalPoints,
			uniqueTags: knowledge.tags.length,
			analysisProvider: provider,
			analysisModel: provider === 'gemini' ? 'gemini-2.0-flash-exp' : provider === 'ollama' ? 'gemma3-legal:latest' : 'rule-based'
		}
	};

	// Save JSON
	await fs.writeFile('reports/phase89-rag-kag-analysis.json', JSON.stringify(output, null, 2));
	console.log('\n💾 Saved: reports/phase89-rag-kag-analysis.json');

	// Save Markdown summary
	const markdown = `# Phase 89: RAG+KAG Error Analysis

**Generated:** ${timestamp}

## Knowledge Graph Summary

- **Collections:** ${knowledge.collections.length}
- **Total Points:** ${knowledge.totalPoints.toLocaleString()}
- **Unique Tags:** ${knowledge.tags.length}
- **File Types:** ${knowledge.fileTypes.join(', ')}
- **Error Patterns:** ${knowledge.errorPatterns.join(', ')}

## Collections

${knowledge.collections
	.map(
		(c) => `
### ${c.name}
- **Points:** ${c.points.toLocaleString()}
- **Vector Size:** ${c.vectorSize}
- **Tags:** ${c.tags.slice(0, 15).join(', ')}
- **File Types:** ${c.fileTypes.join(', ')}
- **Error Types:** ${c.errorTypes.join(', ')}
`
	)
	.join('\n')}

## Gemini Analysis

${analysis.rawAnalysis || JSON.stringify(analysis, null, 2)}

## Recommendations

${recommendations
	.map(
		(r) => `
### ${r.category}

${r.items.map((item) => `- **${item.action || item.tool}** (${item.priority})${item.reason ? `: ${item.reason}` : ''}${item.command ? `\n  \`\`\`bash\n  ${item.command}\n  \`\`\`` : ''}`).join('\n')}
`
	)
	.join('\n')}

## Next Steps for Autogen/CrewAI

${analysis.nextSteps ? analysis.nextSteps.map((s) => `1. ${s}`).join('\n') : 'See tool calling recommendations above.'}
`;

	await fs.writeFile('reports/phase89-rag-kag-analysis.md', markdown);
	console.log('💾 Saved: reports/phase89-rag-kag-analysis.md');

	return output;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
	console.log('╔══════════════════════════════════════════════════════════════╗');
	console.log('║   Phase 89: Enhanced RAG+KAG Error Analyzer with ACE       ║');
	console.log('║   - Cosine Similarity Ranking                               ║');
	console.log('║   - File Edit Timeline Tracking                             ║');
	console.log('║   - LLM Output Adapter for KB Updates                       ║');
	console.log('╚══════════════════════════════════════════════════════════════╝\n');

	// 1. Load context files
	console.log('📚 Loading Context Files...\n');
	const contexts = await loadContextFiles();

	// 2. Aggregate Qdrant knowledge
	const knowledge = await aggregateQdrantKnowledge();

	// 3. RAG+KAG: Rank critical errors by context
	console.log('\n🎯 Phase 89: RAG+KAG Contextual Ranking...\n');
	const criticalErrorsRanked = await rankErrorsByContext(
		'TypeScript module caching errors and Svelte 5 migration issues',
		'phase89_error_clusters',
		10
	);

	// Track ranked errors in file edit log
	criticalErrorsRanked.forEach((result, index) => {
		const filePath = result.payload?.sample_source || `cluster_${result.id}`;
		trackFileEdit(filePath, 'ranked', {
			rank: index + 1,
			score: result.score,
			tags: result.payload?.tags || [],
			clusterId: result.id
		});
	});

	// 4. Initialize LLM Output Adapter
	const llmAdapter = new LLMOutputAdapter();

	// 5. Try Gemini first, fallback to Ollama
	let analysis;
	let analysisProvider = 'none';

	if (process.env.GEMINI_API_KEY) {
		try {
			console.log('🧠 Trying Gemini API...\n');
			analysis = await analyzeWithGemini(knowledge, contexts.copilot, contexts.claude);
			analysisProvider = analysis.provider || 'gemini';

			// Adapt Gemini output for knowledge base
			llmAdapter.adaptGeminiOutput(analysis.rawAnalysis || JSON.stringify(analysis), {
				model: 'gemini-2.0-flash-exp',
				rankedErrors: criticalErrorsRanked.length
			});

			console.log(`  ✅ Analysis successful (Provider: ${analysisProvider})\n`);
		} catch (err) {
			console.log(`\n⚠️  Gemini API error: ${err.message}`);
			console.log('   Falling back to Ollama (gemma3-legal)...\n');

			// Fallback to Ollama
			try {
				analysis = await analyzeWithOllama(knowledge, contexts.copilot, contexts.claude, contexts.llms);
				analysisProvider = 'ollama';

				// Adapt Ollama output for knowledge base
				llmAdapter.adaptOllamaOutput(analysis.rawAnalysis || JSON.stringify(analysis), {
					model: 'gemma3-legal:latest',
					rankedErrors: criticalErrorsRanked.length,
					usedLangextract: analysis.usedLangextract
				});
			} catch (ollamaErr) {
				console.log(`\n⚠️  Ollama also failed: ${ollamaErr.message}`);
				console.log('   Using rule-based analysis...\n');
				analysis = {
					note: `Both Gemini and Ollama failed. Gemini: ${err.message}, Ollama: ${ollamaErr.message}`
				};
			}
		}
	} else {
		// No Gemini key, go straight to Ollama
		console.log('⚠️  GEMINI_API_KEY not set. Using Ollama (gemma3-legal)...\n');
		try {
			analysis = await analyzeWithOllama(knowledge, contexts.copilot, contexts.claude, contexts.llms);
			analysisProvider = 'ollama';

			// Adapt Ollama output for knowledge base
			llmAdapter.adaptOllamaOutput(analysis.rawAnalysis || JSON.stringify(analysis), {
				model: 'gemma3-legal:latest',
				rankedErrors: criticalErrorsRanked.length,
				usedLangextract: analysis.usedLangextract
			});
		} catch (err) {
			console.log(`\n⚠️  Ollama failed: ${err.message}`);
			console.log('   Using rule-based analysis...\n');
			analysis = { note: `Ollama analysis failed: ${err.message}` };
		}
	}	// 6. Update knowledge base with LLM outputs
	await llmAdapter.updateKnowledgeBase('copilot.md');

	// 7. Save file edit timeline
	await saveFileEditLog('reports/phase89-file-edit-log.json');

	// 8. Generate recommendations
	const recommendations = generateRecommendations(analysis, knowledge);

	// 9. Save results
	const output = await saveResults(knowledge, analysis, recommendations, analysisProvider);

	// Add ranked errors to output
	output.ragKagRanking = {
		query: 'TypeScript module caching errors and Svelte 5 migration issues',
		topResults: criticalErrorsRanked.slice(0, 5).map((r) => ({
			id: r.id,
			score: r.score,
			tags: r.payload?.tags || [],
			message: r.payload?.sample_message?.substring(0, 100) || 'No message'
		}))
	};

	// Save enhanced results
	await fs.writeFile('reports/phase89-rag-kag-analysis.json', JSON.stringify(output, null, 2));

	console.log('\n✅ Analysis Complete!\n');
	console.log(`📊 Total Points Analyzed: ${output.metadata.totalPoints.toLocaleString()}`);
	console.log(`🏷️  Unique Tags: ${output.metadata.uniqueTags}`);
	console.log(`📦 Collections: ${output.metadata.totalCollections}`);
	console.log(`🤖 Analysis Provider: ${analysisProvider}`);
	console.log(`🎯 RAG+KAG Ranked Errors: ${criticalErrorsRanked.length}`);
	console.log(`📝 File Edit Timeline: ${fileEditLog.size} files tracked`);
	console.log(`\n📖 Review: reports/phase89-rag-kag-analysis.md`);
	console.log(`📁 File Timeline: reports/phase89-file-edit-log.json\n`);
}

main().catch(console.error);
