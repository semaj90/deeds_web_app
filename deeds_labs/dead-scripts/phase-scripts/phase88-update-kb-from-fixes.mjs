#!/usr/bin/env node
/**
 * Phase 88: Update Knowledge Base from Error Fixes
 *
 * Reads kb-error-fixes.jsonl and ingests successful patterns + negative reinforcements
 * into Qdrant for future retrieval.
 */

import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KB_LOG_PATH = join(__dirname, '../reports/kb-error-fixes.jsonl');
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = process.env.QDRANT_COLLECTION || 'phase76_knowledge_base';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'embeddinggemma:latest';

/**
 * Generate embedding for text
 */
async function generateEmbedding(text) {
	const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: EMBED_MODEL,
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
 * Upsert point to Qdrant
 */
async function upsertToQdrant(point) {
	const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			points: [point]
		})
	});

	if (!response.ok) {
		throw new Error(`Qdrant upsert failed: ${response.statusText}`);
	}

	return await response.json();
}

/**
 * Main update logic
 */
async function updateKnowledgeBase() {
	console.log('\n📚 Phase 88: Updating Knowledge Base from Error Fixes');
	console.log('================================================\n');

	// Check log file exists
	if (!existsSync(KB_LOG_PATH)) {
		console.log('⚠️  No error fix log found:', KB_LOG_PATH);
		console.log('   Run tests first: node scripts/phase88-test-error-fixes.mjs\n');
		process.exit(1);
	}

	// Read log entries
	const logContent = readFileSync(KB_LOG_PATH, 'utf-8');
	const logLines = logContent.trim().split('\n').filter(Boolean);
	console.log(`📄 Found ${logLines.length} error fix entries\n`);

	// Check Qdrant availability
	try {
		const healthCheck = await fetch(`${QDRANT_URL}/health`);
		if (!healthCheck.ok) throw new Error('Unhealthy');
		console.log('✅ Qdrant: healthy\n');
	} catch (error) {
		console.error('❌ Qdrant unreachable:', error.message);
		console.error('   Start with: docker start qdrant\n');
		process.exit(1);
	}

	// Check Ollama availability
	try {
		const ollamaCheck = await fetch(`${OLLAMA_URL}/api/tags`);
		if (!ollamaCheck.ok) throw new Error('Unhealthy');
		console.log('✅ Ollama: healthy\n');
	} catch (error) {
		console.error('❌ Ollama unreachable:', error.message);
		console.error('   Ensure Ollama is running\n');
		process.exit(1);
	}

	const stats = {
		processed: 0,
		successful: 0,
		failed: 0,
		positive_examples: 0,
		negative_reinforcements: 0
	};

	for (const line of logLines) {
		try {
			const entry = JSON.parse(line);
			stats.processed++;

			// Determine if this is a positive or negative example
			const isPositive = entry.validation_passed;
			const type = isPositive ? 'positive' : 'negative';

			console.log(`📝 Processing: ${entry.test_id} (${type} example)`);

			// Build context text for embedding
			let contextText = '';
			if (isPositive) {
				// Positive example: store successful fix pattern
				contextText = `
Error: ${entry.error_code} - ${entry.error_message}
Query: ${entry.query}
Solution: ${entry.generated_fix}
Tags: ${entry.tags.join(', ')}
KB Sources: ${entry.kb_sources.join(', ')}
Status: Validated successful fix
`.trim();
				stats.positive_examples++;
			} else {
				// Negative reinforcement: store what NOT to do
				contextText = `
Error: ${entry.error_code} - ${entry.error_message}
Query: ${entry.query}
INCORRECT CODE (DO NOT USE): ${entry.negative_patterns.bad_code}
WHY IT'S WRONG: ${entry.negative_patterns.why_bad}
ATTEMPTED FIX (ALSO WRONG): ${entry.negative_patterns.generated_but_wrong}
CORRECT FIX: ${entry.expected_fix}
Tags: ${entry.tags.join(', ')}, negative-reinforcement
Status: Negative example - avoid this pattern
`.trim();
				stats.negative_reinforcements++;
			}

			// Generate embedding
			console.log(`   🔢 Generating embedding...`);
			const embedding = await generateEmbedding(contextText);

			// Create Qdrant point
			const pointId = `error-fix-${entry.test_id}-${Date.now()}`;
			const point = {
				id: pointId,
				vector: embedding,
				payload: {
					type: 'error_fix',
					validation_status: isPositive ? 'positive' : 'negative',
					test_id: entry.test_id,
					error_code: entry.error_code,
					error_message: entry.error_message,
					query: entry.query,
					solution: isPositive ? entry.generated_fix : entry.expected_fix,
					tags: isPositive ? entry.tags : [...entry.tags, 'negative-reinforcement'],
					timestamp: entry.timestamp,
					kb_sources: entry.kb_sources,
					// For negative examples, store what NOT to do
					...(isPositive ? {} : {
						bad_code: entry.negative_patterns.bad_code,
						why_bad: entry.negative_patterns.why_bad,
						wrong_attempt: entry.negative_patterns.generated_but_wrong
					})
				}
			};

			// Upsert to Qdrant
			console.log(`   💾 Storing in Qdrant (${COLLECTION})...`);
			await upsertToQdrant(point);

			console.log(`   ✅ Stored: ${pointId}\n`);
			stats.successful++;

		} catch (error) {
			console.log(`   ❌ Failed: ${error.message}\n`);
			stats.failed++;
		}
	}

	// Summary
	console.log('================================================');
	console.log('📊 Update Summary');
	console.log('================================================\n');
	console.log(`Processed: ${stats.processed}`);
	console.log(`✅ Successfully stored: ${stats.successful}`);
	console.log(`❌ Failed: ${stats.failed}`);
	console.log(`\nReinforcement Learning:`);
	console.log(`   Positive examples: ${stats.positive_examples}`);
	console.log(`   Negative reinforcements: ${stats.negative_reinforcements}\n`);

	console.log('💡 Next Steps:');
	console.log('   1. Verify KB retrieval:');
	console.log('      node scripts/phase88-verify-kb.ps1 -Quick');
	console.log('   2. Test autonomous agent:');
	console.log('      node scripts/phase86-autonomous-loop.mjs\n');

	process.exit(stats.failed > 0 ? 1 : 0);
}

// Run update
updateKnowledgeBase().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
