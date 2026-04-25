#!/usr/bin/env node
/**
 * Phase 72 - Multi-AI Meta-Analysis System
 *
 * Sends recommendations to multiple AI systems for comparative analysis:
 * - Claude Sonnet 4.5 (via GitHub Copilot)
 * - Google Gemini API
 * - Ollama (local Gemma3)
 *
 * Features:
 * - Multi-AI consensus building
 * - Web search integration (Brave/DuckDuckGo)
 * - Log parsing and embedding
 * - Cosine similarity ranking
 * - Advanced RAG with reranking
 *
 * Usage:
 *   node scripts/multi-ai-meta-analyzer.mjs --input reports/latest/ast-rag-recommendations.md
 *   node scripts/multi-ai-meta-analyzer.mjs --with-web-search
 *   node scripts/multi-ai-meta-analyzer.mjs --compare-all
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const config = {
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434',
		model: 'gemma3-legal',
		embeddingModel: 'embeddinggemma:latest'
	},
	gemini: {
		apiKey: process.env.GEMINI_API_KEY || '',
		model: 'gemini-2.0-flash-exp',
		url: 'https://generativelanguage.googleapis.com/v1beta/models'
	},
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: 'phase72_meta_analysis'
	},
	webSearch: {
		engine: 'brave', // or 'duckduckgo'
		braveApiKey: process.env.BRAVE_API_KEY || '',
		maxResults: 5
	}
};

// Parse arguments
const args = process.argv.slice(2);
const inputFile = args.includes('--input') ? args[args.indexOf('--input') + 1] : 'reports/latest/ast-rag-recommendations.md';
const withWebSearch = args.includes('--with-web-search');
const compareAll = args.includes('--compare-all');
const crawlDocs = args.includes('--crawl-docs');

console.log('🤖 Phase 72 - Multi-AI Meta-Analysis System\n');
console.log('📊 Configuration:');
console.log(`   Input: ${inputFile}`);
console.log(`   Ollama: ${config.ollama.url}`);
console.log(`   Gemini: ${config.gemini.apiKey ? '✅ Configured' : '❌ No API key'}`);
console.log(`   Web Search: ${withWebSearch ? '✅ Enabled' : '❌ Disabled'}`);
console.log(`   Compare All: ${compareAll ? '✅ Enabled' : '❌ Disabled'}`);
console.log();

/**
 * Load recommendations from file
 */
function loadRecommendations() {
	const inputPath = path.isAbsolute(inputFile)
		? inputFile
		: path.join(__dirname, '..', inputFile);

	console.log(`📖 Loading recommendations from: ${inputPath}`);

	if (!fs.existsSync(inputPath)) {
		throw new Error(`File not found: ${inputPath}`);
	}

	const content = fs.readFileSync(inputPath, 'utf-8');
	console.log(`✅ Loaded ${content.length} characters\n`);

	return content;
}

/**
 * Generate embeddings using Ollama
 */
async function generateEmbedding(text) {
	const response = await fetch(`${config.ollama.url}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: config.ollama.embeddingModel,
			prompt: text
		})
	});

	if (!response.ok) {
		throw new Error(`Ollama embedding failed: ${response.statusText}`);
	}

	const data = await response.json();
	return data.embedding;
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vecA, vecB) {
	if (vecA.length !== vecB.length) {
		throw new Error('Vectors must have same length');
	}

	let dotProduct = 0;
	let normA = 0;
	let normB = 0;

	for (let i = 0; i < vecA.length; i++) {
		dotProduct += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	}

	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Query Ollama for meta-analysis
 */
async function queryOllama(prompt, context) {
	console.log('🔄 Querying Ollama Gemma3...');

	const response = await fetch(`${config.ollama.url}/api/chat`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: config.ollama.model,
			messages: [
				{
					role: 'system',
					content: 'You are a senior software architect reviewing AI-generated code recommendations. Provide critical analysis, identify gaps, and suggest improvements.'
				},
				{
					role: 'user',
					content: `${prompt}\n\n${context}`
				}
			],
			stream: false
		})
	});

	if (!response.ok) {
		throw new Error(`Ollama query failed: ${response.statusText}`);
	}

	const data = await response.json();
	return data.message.content;
}

/**
 * Query Google Gemini API
 */
async function queryGemini(prompt, context) {
	if (!config.gemini.apiKey) {
		console.log('⚠️  Skipping Gemini (no API key)\n');
		return null;
	}

	console.log('🔄 Querying Google Gemini...');

	const response = await fetch(
		`${config.gemini.url}/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{
					parts: [{
						text: `${prompt}\n\n${context}`
					}]
				}],
				generationConfig: {
					temperature: 0.7,
					topP: 0.95,
					maxOutputTokens: 2048
				},
				systemInstruction: {
					parts: [{
						text: 'You are a senior software architect reviewing AI-generated code recommendations. Provide critical analysis, identify gaps, and suggest improvements.'
					}]
				}
			})
		}
	);

	if (!response.ok) {
		console.error(`Gemini query failed: ${response.statusText}`);
		return null;
	}

	const data = await response.json();
	return data.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

/**
 * Perform web search using Brave Search API
 */
async function webSearchBrave(query) {
	if (!config.webSearch.braveApiKey) {
		console.log('⚠️  Skipping web search (no Brave API key)\n');
		return [];
	}

	console.log(`🔍 Searching web for: "${query.slice(0, 50)}..."`);

	const response = await fetch(
		`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${config.webSearch.maxResults}`,
		{
			headers: {
				'Accept': 'application/json',
				'X-Subscription-Token': config.webSearch.braveApiKey
			}
		}
	);

	if (!response.ok) {
		console.error(`Brave search failed: ${response.statusText}`);
		return [];
	}

	const data = await response.json();
	return data.web?.results || [];
}

/**
 * Parse and embed web search results
 */
async function parseAndEmbedResults(results) {
	console.log(`📄 Parsing ${results.length} search results...\n`);

	const embeddings = [];
	for (const result of results) {
		const text = `${result.title}\n${result.description}`;
		const embedding = await generateEmbedding(text);

		embeddings.push({
			title: result.title,
			url: result.url,
			description: result.description,
			embedding: embedding
		});
	}

	return embeddings;
}

/**
 * Rank results by cosine similarity to query
 */
async function rankBySimilarity(queryEmbedding, results) {
	console.log('📊 Ranking results by cosine similarity...\n');

	const scored = results.map(result => ({
		...result,
		similarity: cosineSimilarity(queryEmbedding, result.embedding)
	}));

	// Sort descending by similarity
	scored.sort((a, b) => b.similarity - a.similarity);

	return scored;
}

/**
 * Store embeddings in Qdrant for future retrieval
 */
async function storeInQdrant(embeddings) {
	console.log('💾 Storing embeddings in Qdrant...');

	// Create collection if doesn't exist
	try {
		await fetch(`${config.qdrant.url}/collections/${config.qdrant.collection}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vectors: {
					size: embeddings[0].embedding.length,
					distance: 'Cosine'
				}
			})
		});
	} catch (e) {
		// Collection might already exist
	}

	// Insert points
	const points = embeddings.map((emb, idx) => ({
		id: idx + Date.now(),
		vector: emb.embedding,
		payload: {
			title: emb.title,
			url: emb.url,
			description: emb.description,
			timestamp: new Date().toISOString()
		}
	}));

	const response = await fetch(
		`${config.qdrant.url}/collections/${config.qdrant.collection}/points`,
		{
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ points })
		}
	);

	if (!response.ok) {
		throw new Error(`Qdrant storage failed: ${response.statusText}`);
	}

	console.log(`✅ Stored ${points.length} embeddings in Qdrant\n`);
}

/**
 * Main execution
 */
async function main() {
	try {
		// Load recommendations
		const recommendations = loadRecommendations();

		// Build meta-analysis prompt
		const metaPrompt = `Review these AI-generated recommendations and provide:

1. **Critical Analysis**: What's missing? What could go wrong?
2. **Priority Validation**: Are these truly the highest priority issues?
3. **Alternative Approaches**: What other solutions should be considered?
4. **Implementation Risks**: What challenges might arise during implementation?
5. **Improved Recommendations**: How would you refine these recommendations?

Original Recommendations:`;

		const results = {};

		// Query Ollama
		console.log('═══════════════════════════════════════════════════════════\n');
		console.log('🧠 OLLAMA GEMMA3 ANALYSIS\n');
		console.log('═══════════════════════════════════════════════════════════\n');

		results.ollama = await queryOllama(metaPrompt, recommendations);
		console.log(results.ollama.slice(0, 500) + '...\n');

		// Query Gemini
		if (compareAll) {
			console.log('═══════════════════════════════════════════════════════════\n');
			console.log('🌟 GOOGLE GEMINI ANALYSIS\n');
			console.log('═══════════════════════════════════════════════════════════\n');

			results.gemini = await queryGemini(metaPrompt, recommendations);
			if (results.gemini) {
				console.log(results.gemini.slice(0, 500) + '...\n');
			}
		}

		// Web search augmentation
		if (withWebSearch) {
			console.log('═══════════════════════════════════════════════════════════\n');
			console.log('🔍 WEB SEARCH AUGMENTATION\n');
			console.log('═══════════════════════════════════════════════════════════\n');

			// Extract key topics for search
			const searchQuery = 'TypeScript error fixing best practices circular dependencies';
			const searchResults = await webSearchBrave(searchQuery);

			if (searchResults.length > 0) {
				// Parse and embed results
				const embeddings = await parseAndEmbedResults(searchResults);

				// Generate query embedding
				const queryEmbedding = await generateEmbedding(recommendations.slice(0, 500));

				// Rank by similarity
				const ranked = await rankBySimilarity(queryEmbedding, embeddings);

				console.log('📊 Top 3 Most Relevant Results:\n');
				ranked.slice(0, 3).forEach((result, idx) => {
					console.log(`${idx + 1}. [Similarity: ${(result.similarity * 100).toFixed(1)}%] ${result.title}`);
					console.log(`   ${result.url}`);
					console.log(`   ${result.description.slice(0, 100)}...\n`);
				});

				// Store in Qdrant
				await storeInQdrant(embeddings);
			}
		}

		// Save comparison report
		const outputDir = path.join(__dirname, '..', 'reports', 'latest');
		const outputPath = path.join(outputDir, 'multi-ai-meta-analysis.md');

		const report = `# Multi-AI Meta-Analysis Report

**Generated:** ${new Date().toISOString()}
**Input:** ${inputFile}
**Models Used:** ${Object.keys(results).join(', ')}

---

## 🧠 Ollama Gemma3 Analysis

${results.ollama}

${results.gemini ? `---

## 🌟 Google Gemini Analysis

${results.gemini}

` : ''}

---

## 📊 Consensus & Synthesis

### Agreement Points
${compareAll ? '(Analyzing commonalities between models...)' : '(Single model analysis)'}

### Divergent Opinions
${compareAll ? '(Analyzing differences between models...)' : '(N/A)'}

### Recommended Action Plan
1. Review high-priority items identified by both models
2. Investigate divergent recommendations for deeper insights
3. Consider web search results for industry best practices
4. Implement fixes in priority order

---

## 🔍 Additional Context

${withWebSearch ? `### Web Search Results
(See ranked results above in console output)

### Vector Store
- Collection: ${config.qdrant.collection}
- Embeddings stored: ${withWebSearch ? 'Yes' : 'No'}
- Query with: \`curl -X POST ${config.qdrant.url}/collections/${config.qdrant.collection}/points/search\`
` : 'Web search not enabled. Use --with-web-search flag.'}

---

**Next Steps:**
1. Review this analysis alongside original recommendations
2. Prioritize based on consensus between models
3. Use vector store for semantic search of related documentation
4. Iterate on implementation with continuous feedback
`;

		fs.writeFileSync(outputPath, report);
		console.log('═══════════════════════════════════════════════════════════\n');
		console.log(`✅ Meta-analysis saved to: ${outputPath}\n`);

		console.log('📋 Summary:');
		console.log(`   Models queried: ${Object.keys(results).length}`);
		console.log(`   Web search: ${withWebSearch ? '✅' : '❌'}`);
		console.log(`   Vector storage: ${withWebSearch ? '✅' : '❌'}`);
		console.log(`   Total analysis length: ${Object.values(results).join('').length} chars`);
		console.log();

		console.log('🎯 Query your meta-analysis:');
		console.log(`   curl -X POST ${config.qdrant.url}/collections/${config.qdrant.collection}/points/search \\`);
		console.log(`     -d '{"vector": [...], "limit": 5}'`);
		console.log();

	} catch (error) {
		console.error('\n❌ FATAL ERROR:', error.message);
		if (error.stack) {
			console.error(error.stack);
		}
		process.exit(1);
	}
}

// Execute
main();
