#!/usr/bin/env node
/**
 * Phase 72 - Contextual Prompt Engineering with Self-Prompting
 *
 * LangChain-style agent with tool calling and self-reflection
 *
 * Features:
 * - Knowledge base query tool
 * - Error search tool (Qdrant)
 * - Cluster analysis tool
 * - Self-reflection on recommendations
 * - Memory of previous suggestions
 * - Iterative refinement
 *
 * Usage:
 *   node scripts/contextual-prompt-engineer.mjs --task "Fix circular dependencies"
 *   node scripts/contextual-prompt-engineer.mjs --task "Reduce high error files" --iterations 3
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_CHAT_MODEL = process.env.OLLAMA_CHAT_MODEL || 'gemma3-legal:latest';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_AST_COLLECTION = 'phase76_knowledge_base'; // Phase 88: 810 points (Svelte 5 + SvelteKit 2 docs)
const QDRANT_ERROR_COLLECTION = 'phase72_error_patterns';

const args = process.argv.slice(2);
const task = args.includes('--task') ? args[args.indexOf('--task') + 1] : 'Analyze codebase and suggest refactoring';
const maxIterations = args.includes('--iterations') ? parseInt(args[args.indexOf('--iterations') + 1]) : 1;

console.log('🤖 Phase 72 - Contextual Prompt Engineering\n');
console.log('📋 Task:', task);
console.log('🔄 Max Iterations:', maxIterations);
console.log('');

/**
 * Memory for agent context
 */
const agentMemory = {
	toolCalls: [],
	reflections: [],
	recommendations: [],
	iteration: 0
};

/**
 * Tool: Query knowledge base
 */
async function toolQueryKnowledgeBase(query, limit = 5) {
	console.log(`🔧 [Tool] Query KB: "${query.slice(0, 60)}..."`);

	try {
		// Generate embedding for query
		const embedResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: query
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!embedResponse.ok) throw new Error(`Embedding failed: ${embedResponse.status}`);
		const { embedding } = await embedResponse.json();

		// Search Qdrant
		const searchResponse = await fetch(`${QDRANT_URL}/collections/${QDRANT_AST_COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: embedding,
				limit,
				with_payload: true
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);
		const searchResults = await searchResponse.json();

		const results = searchResults.result.map(r => ({
			path: r.payload.path || r.payload.name,
			score: r.score,
			type: r.payload.type,
			context: r.payload.context
		}));

		agentMemory.toolCalls.push({
			tool: 'queryKnowledgeBase',
			query,
			resultCount: results.length
		});

		console.log(`   ✅ Found ${results.length} results`);
		return results;

	} catch (error) {
		console.log(`   ⚠️  Tool failed: ${error.message}`);
		return [];
	}
}

/**
 * Tool: Search errors
 */
async function toolSearchErrors(query, limit = 5) {
	console.log(`🔧 [Tool] Search Errors: "${query.slice(0, 60)}..."`);

	try {
		const embedResponse = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				prompt: query
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!embedResponse.ok) throw new Error(`Embedding failed: ${embedResponse.status}`);
		const { embedding } = await embedResponse.json();

		const searchResponse = await fetch(`${QDRANT_URL}/collections/${QDRANT_ERROR_COLLECTION}/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector: embedding,
				limit,
				with_payload: true
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!searchResponse.ok) throw new Error(`Search failed: ${searchResponse.status}`);
		const searchResults = await searchResponse.json();

		const results = searchResults.result.map(r => ({
			file: r.payload.file,
			line: r.payload.line,
			code: r.payload.code,
			message: r.payload.message,
			score: r.score
		}));

		agentMemory.toolCalls.push({
			tool: 'searchErrors',
			query,
			resultCount: results.length
		});

		console.log(`   ✅ Found ${results.length} similar errors`);
		return results;

	} catch (error) {
		console.log(`   ⚠️  Tool failed: ${error.message}`);
		return [];
	}
}

/**
 * Tool: Analyze clusters
 */
async function toolAnalyzeClusters() {
	console.log('🔧 [Tool] Analyze Clusters');

	try {
		const searchResponse = await fetch(`${QDRANT_URL}/collections/${QDRANT_AST_COLLECTION}/points/scroll`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				filter: {
					must: [{ key: 'type', match: { value: 'cluster' } }]
				},
				limit: 100,
				with_payload: true
			}),
			signal: AbortSignal.timeout(30000)
		});

		if (!searchResponse.ok) throw new Error(`Scroll failed: ${searchResponse.status}`);
		const scrollResults = await searchResponse.json();

		const clusters = scrollResults.result.points.map(p => ({
			name: p.payload.name,
			fileCount: p.payload.fileCount,
			files: p.payload.files
		}));

		agentMemory.toolCalls.push({
			tool: 'analyzeClusters',
			clusterCount: clusters.length
		});

		console.log(`   ✅ Found ${clusters.length} clusters`);
		return clusters;

	} catch (error) {
		console.log(`   ⚠️  Tool failed: ${error.message}`);
		return [];
	}
}

/**
 * Self-prompting agent with tool calling
 */
async function runSelfPromptingAgent() {
	console.log(`\n${'═'.repeat(60)}`);
	console.log(`🔄 Iteration ${++agentMemory.iteration}/${maxIterations}`);
	console.log('═'.repeat(60) + '\n');

	// Phase 1: Gather context with tools
	console.log('📊 Phase 1: Gathering Context\n');

	const kbResults = await toolQueryKnowledgeBase(task, 10);
	const errorResults = await toolSearchErrors(task, 10);
	const clusters = await toolAnalyzeClusters();

	// Phase 2: Generate recommendations with LLM
	console.log('\n🧠 Phase 2: Generating Recommendations\n');

	const systemPrompt = `You are an expert TypeScript software architect with deep knowledge of refactoring patterns, design principles, and error resolution strategies.

Your task is to analyze the provided codebase context and generate actionable recommendations.

Available context:
1. Knowledge Base results (AST analysis of files)
2. Similar errors found in codebase
3. Semantic clusters of related files

Previous reflections:
${agentMemory.reflections.map((r, i) => `${i + 1}. ${r}`).join('\n') || 'None yet'}

Provide recommendations in this format:
## Recommendation [N]: [Title]
**Priority:** [Critical/High/Medium/Low]
**Files:** [List of affected files]
**Root Cause:** [Brief analysis]
**Suggested Fix:** [Specific steps]
**Impact:** [Expected improvement]
**Confidence:** [High/Medium/Low]

Generate 3-5 recommendations based on the context.`;

	const userPrompt = `Task: ${task}

### Knowledge Base Context (Top ${kbResults.length} files)
${kbResults.map(r => `- ${r.path} (score: ${r.score.toFixed(2)})
  ${r.context?.slice(0, 200) || 'No context'}`).join('\n\n')}

### Similar Errors (Top ${errorResults.length})
${errorResults.map(e => `- ${e.file}:${e.line} - ${e.message}
  Code: ${e.code}`).join('\n\n')}

### Semantic Clusters (${clusters.length} total)
${clusters.slice(0, 5).map(c => `- ${c.name}: ${c.fileCount} files`).join('\n')}

Generate recommendations now:`;

	try {
		const response = await fetch(`${OLLAMA_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: OLLAMA_CHAT_MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false
			}),
			signal: AbortSignal.timeout(180000)
		});

		if (!response.ok) throw new Error(`Chat failed: ${response.status}`);
		const data = await response.json();
		const recommendations = data.message.content;

		agentMemory.recommendations.push(recommendations);

		console.log('✅ Recommendations generated\n');
		console.log(recommendations);

		// Phase 3: Self-reflection
		if (agentMemory.iteration < maxIterations) {
			console.log('\n🤔 Phase 3: Self-Reflection\n');

			const reflectionPrompt = `Review your previous recommendation and identify:
1. Any assumptions that need validation
2. Missing context that would improve accuracy
3. Potential risks or side effects
4. Alternative approaches to consider

Previous recommendation:
${recommendations}

Provide a brief reflection (2-3 sentences):`;

			const reflectResponse = await fetch(`${OLLAMA_URL}/api/chat`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: OLLAMA_CHAT_MODEL,
					messages: [
						{ role: 'system', content: 'You are a critical reviewer providing constructive feedback.' },
						{ role: 'user', content: reflectionPrompt }
					],
					stream: false
				}),
				signal: AbortSignal.timeout(60000)
			});

			if (reflectResponse.ok) {
				const reflectData = await reflectResponse.json();
				const reflection = reflectData.message.content;
				agentMemory.reflections.push(reflection);
				console.log('💭 Reflection:', reflection);
			}
		}

	} catch (error) {
		console.error(`❌ Agent iteration failed: ${error.message}`);
	}
}

/**
 * Save results
 */
function saveResults() {
	const outputPath = path.join(__dirname, '..', 'reports', 'latest', 'contextual-prompt-engineering-results.md');

	const content = `# Contextual Prompt Engineering Results

**Task:** ${task}
**Iterations:** ${agentMemory.iteration}
**Generated:** ${new Date().toISOString()}

---

${agentMemory.recommendations.map((rec, i) => `
## Iteration ${i + 1}

${rec}

${agentMemory.reflections[i] ? `### Self-Reflection\n${agentMemory.reflections[i]}` : ''}

---
`).join('\n')}

## Agent Memory Summary

### Tool Calls
${agentMemory.toolCalls.map((tc, i) => `${i + 1}. ${tc.tool} - ${tc.query || 'N/A'} (${tc.resultCount || tc.clusterCount || 0} results)`).join('\n')}

### Reflections
${agentMemory.reflections.map((r, i) => `${i + 1}. ${r}`).join('\n\n')}
`;

	fs.writeFileSync(outputPath, content);
	console.log(`\n📄 Results saved to: ${outputPath}\n`);
}

/**
 * Main execution
 */
async function main() {
	try {
		for (let i = 0; i < maxIterations; i++) {
			await runSelfPromptingAgent();
		}

		saveResults();

		console.log('═'.repeat(60));
		console.log('\n✅ Contextual Prompt Engineering Complete!\n');
		console.log('📊 Summary:');
		console.log(`   Iterations: ${agentMemory.iteration}`);
		console.log(`   Tool calls: ${agentMemory.toolCalls.length}`);
		console.log(`   Recommendations: ${agentMemory.recommendations.length}`);
		console.log(`   Reflections: ${agentMemory.reflections.length}\n`);
		console.log('═'.repeat(60) + '\n');

		process.exit(0);

	} catch (error) {
		console.error(`\n❌ FATAL ERROR: ${error.message}`);
		process.exit(1);
	}
}

main();
