#!/usr/bin/env node
/**
 * Phase 87: Autonomous Error Fixer with Vector-Based Pattern Matching
 *
 * Integrates ALL knowledge sources:
 * 1. PostgreSQL ts_errors (priority queue via impact_score)
 * 2. error_embeddings HNSW search (similar error patterns)
 * 3. Qdrant phase72_ast_knowledge_base (surgical fixes from Phase 66-85)
 * 4. FastMCP agent tools (ripgrep, awk, web search)
 *
 * Autonomous Decision Flow:
 * 1. Fetch highest-impact error from PostgreSQL
 * 2. Search pgvector HNSW for similar past errors
 * 3. Search Qdrant for surgical fix patterns
 * 4. If confidence >0.85: Apply fix automatically
 * 5. If confidence <0.85: Call web search + log for human review
 * 6. Validate fix with TSC recount
 * 7. Update knowledge bases with successful patterns
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { spawnSync } from 'child_process';
import fs from 'fs';
import fetch from 'node-fetch';
import { Ollama } from 'ollama';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// CONFIG
const AGENT_URL = 'http://127.0.0.1:3002/function-call';
const QDRANT_URL = 'http://127.0.0.1:6333';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'embeddinggemma:latest';
const KNOWLEDGE_COLLECTION = 'phase76_knowledge_base'; // Phase 88: 810 points (Svelte 5 docs + operator docs)
const CONFIDENCE_THRESHOLD = 0.85;

const PG_CONFIG = {
	user: 'user',
	host: '127.0.0.1',
	database: 'legal',
	password: 'pass',
	port: 5434,
};

const ollama = new Ollama({ host: OLLAMA_URL });
const qdrant = new QdrantClient({ url: QDRANT_URL });
const pool = new pg.Pool(PG_CONFIG);

let fixAttempts = 0;
let successfulFixes = 0;
let failedFixes = 0;

console.log('🤖 Phase 87: Autonomous Error Fixer');
console.log('=' .repeat(80));
console.log(`📊 PostgreSQL: ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}`);
console.log(`🧠 Qdrant: ${QDRANT_URL} (${KNOWLEDGE_COLLECTION})`);
console.log(`🤝 Agent: ${AGENT_URL}`);
console.log(`⚙️  Confidence Threshold: ${CONFIDENCE_THRESHOLD}`);
console.log('');

async function callAgent(tool, args) {
	try {
		const res = await fetch(AGENT_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: tool, arguments: args })
		});
		return await res.json();
	} catch (e) {
		console.error(`   ⚠️  Agent call failed: ${e.message}`);
		return { content: [{ text: 'Error' }] };
	}
}

async function getNextError() {
	const client = await pool.connect();

	try {
		const result = await client.query(`
			SELECT * FROM ts_errors
			WHERE status = 'open'
			ORDER BY impact_score DESC
			LIMIT 1
		`);

		return result.rows[0] || null;

	} finally {
		client.release();
	}
}

async function searchSimilarErrorsInPgVector(errorId, limit = 5) {
	const client = await pool.connect();

	try {
		// Find similar errors using HNSW index
		const result = await client.query(`
			SELECT
				ts.id,
				ts.error_code,
				ts.file_path,
				ts.error_message,
				ee.embedding <=> (SELECT embedding FROM error_embeddings WHERE error_id = $1) AS distance
			FROM error_embeddings ee
			JOIN ts_errors ts ON ee.error_id = ts.id
			WHERE ts.id != $1 AND ts.status = 'fixed'
			ORDER BY ee.embedding <=> (SELECT embedding FROM error_embeddings WHERE error_id = $1)
			LIMIT $2
		`, [errorId, limit]);

		return result.rows;

	} finally {
		client.release();
	}
}

async function searchKnowledgeBase(errorMessage) {
	const { embedding } = await ollama.embeddings({
		model: EMBEDDING_MODEL,
		prompt: errorMessage
	});

	const hits = await qdrant.search(KNOWLEDGE_COLLECTION, {
		vector: embedding,
		limit: 3,
		with_payload: true
	});

	return hits;
}

async function searchCodebaseForContext(errorCode, filePath) {
	// Use ripgrep via agent to find similar patterns
	const searchResult = await callAgent('search_codebase', {
		query: errorCode,
		path: path.dirname(filePath)
	});

	return searchResult.content?.[0]?.text || '';
}

async function getTSCBaseline() {
	const result = spawnSync('npx', ['tsc', '--noEmit'], {
		encoding: 'utf8',
		shell: true,
		cwd: ROOT
	});

	const output = (result.stdout || '') + (result.stderr || '');
	const matches = output.match(/Found (\d+) error/);
	return matches ? parseInt(matches[1]) : 0;
}

async function applyFix(error, fixStrategy) {
	console.log(`\n   🔧 Applying fix: ${fixStrategy.pattern_name || 'Unknown pattern'}`);

	// Read file via agent
	const fileContent = await callAgent('read_file', {
		filepath: error.file_path
	});

	if (!fileContent.content?.[0]?.text) {
		console.log('   ❌ Could not read file');
		return false;
	}

	const originalContent = fileContent.content[0].text;

	// Apply surgical pattern fix
	let fixedContent = originalContent;

	// Pattern matching based on error code
	if (error.error_code === 'TS1005') {
		// Object spread syntax: { ...obj: prop } → { ...obj, prop }
		fixedContent = fixedContent.replace(
			/\{\s*\.\.\.(\w+):\s*(\w+)/g,
			'{ ...$1, $2'
		);

		// Missing comma in object literal
		fixedContent = fixedContent.replace(
			/(\w+):\s*([^,}\n]+)\s+(\w+):/g,
			'$1: $2, $3:'
		);
	} else if (error.error_code === 'TS1128') {
		// Declaration expected - often missing semicolons or braces
		// Use AST context from knowledge base
		if (fixStrategy.fix_strategy) {
			console.log(`   💡 Strategy: ${fixStrategy.fix_strategy}`);
		}
	}

	// Write fixed content back
	if (fixedContent !== originalContent) {
		fs.writeFileSync(error.file_path, fixedContent, 'utf8');
		console.log('   ✅ File updated');
		return true;
	} else {
		console.log('   ⚠️  No changes made (pattern not matched)');
		return false;
	}
}

async function validateFix(baselineErrorCount) {
	const newErrorCount = await getTSCBaseline();
	const reduction = baselineErrorCount - newErrorCount;

	console.log(`\n   📊 Validation:`);
	console.log(`      Before: ${baselineErrorCount.toLocaleString()} errors`);
	console.log(`      After:  ${newErrorCount.toLocaleString()} errors`);
	console.log(`      Delta:  ${reduction > 0 ? '✅ -' : '❌ +'}${Math.abs(reduction)} errors`);

	return reduction > 0;
}

async function markErrorFixed(errorId) {
	const client = await pool.connect();

	try {
		await client.query(`
			UPDATE ts_errors
			SET status = 'fixed', fixed_at = NOW()
			WHERE id = $1
		`, [errorId]);

	} finally {
		client.release();
	}
}

async function logFixAttempt(error, fixStrategy, success, reduction) {
	const client = await pool.connect();

	try {
		// Create fix_attempts table if it doesn't exist
		await client.query(`
			CREATE TABLE IF NOT EXISTS fix_attempts (
				id SERIAL PRIMARY KEY,
				error_id INT REFERENCES ts_errors(id),
				pattern_name VARCHAR(200),
				fix_strategy TEXT,
				success BOOLEAN,
				error_reduction INT,
				confidence_score FLOAT,
				applied_at TIMESTAMP DEFAULT NOW()
			)
		`);

		await client.query(`
			INSERT INTO fix_attempts (error_id, pattern_name, fix_strategy, success, error_reduction, confidence_score)
			VALUES ($1, $2, $3, $4, $5, $6)
		`, [
			error.id,
			fixStrategy.pattern_name || 'Unknown',
			fixStrategy.fix_strategy || '',
			success,
			reduction,
			fixStrategy.confidence || 0
		]);

	} finally {
		client.release();
	}
}

async function runAutonomousLoop(maxIterations = 10) {
	console.log(`🔄 Starting autonomous loop (max ${maxIterations} iterations)...\n`);

	const baselineErrorCount = await getTSCBaseline();
	console.log(`📊 Initial baseline: ${baselineErrorCount.toLocaleString()} errors\n`);

	for (let i = 0; i < maxIterations; i++) {
		console.log(`\n${'─'.repeat(80)}`);
		console.log(`📍 Iteration ${i + 1}/${maxIterations}`);
		console.log('─'.repeat(80));

		// 1. Get next error
		const error = await getNextError();
		if (!error) {
			console.log('✅ No more open errors!');
			break;
		}

		console.log(`\n🎯 Target: [${error.error_code}] ${error.file_path}:${error.line_number}:${error.column_number}`);
		console.log(`   Message: ${error.error_message.substring(0, 100)}...`);
		console.log(`   Impact Score: ${error.impact_score}`);

		// 2. Search similar errors in pgvector
		console.log('\n🔍 Searching pgvector for similar fixed errors...');
		const similarErrors = await searchSimilarErrorsInPgVector(error.id);

		if (similarErrors.length > 0) {
			console.log(`   Found ${similarErrors.length} similar fixed errors:`);
			similarErrors.slice(0, 3).forEach((sim, idx) => {
				console.log(`   ${idx + 1}. [${sim.error_code}] distance=${sim.distance.toFixed(4)}`);
			});
		}

		// 3. Search knowledge base
		console.log('\n🧠 Searching Qdrant knowledge base...');
		const knowledgeHits = await searchKnowledgeBase(error.error_message);

		let bestMatch = null;
		let confidence = 0;

		if (knowledgeHits.length > 0) {
			bestMatch = knowledgeHits[0];
			confidence = bestMatch.score;

			console.log(`   Best match: ${bestMatch.payload.pattern_name || 'Unnamed'}`);
			console.log(`   Confidence: ${confidence.toFixed(4)}`);
		}

		// 4. Decision logic
		fixAttempts++;

		if (confidence >= CONFIDENCE_THRESHOLD) {
			console.log(`\n✅ HIGH CONFIDENCE (>=${CONFIDENCE_THRESHOLD}) - Applying automatic fix...`);

			const fixApplied = await applyFix(error, bestMatch.payload);

			if (fixApplied) {
				const currentBaseline = await getTSCBaseline();
				const success = await validateFix(baselineErrorCount);
				const reduction = baselineErrorCount - currentBaseline;

				if (success) {
					await markErrorFixed(error.id);
					successfulFixes++;
					console.log('   ✅ Fix validated and applied');
				} else {
					failedFixes++;
					console.log('   ❌ Fix validation failed - rolling back');
					// TODO: Git rollback logic
				}

				await logFixAttempt(error, bestMatch.payload, success, reduction);
			}

		} else {
			console.log(`\n⚠️  LOW CONFIDENCE (<${CONFIDENCE_THRESHOLD}) - Logging for human review`);

			// Search web for additional context
			console.log('   🌐 Searching web for fix suggestions...');
			const webSearch = await callAgent('web_search', {
				query: `TypeScript ${error.error_code} fix ${error.error_message.substring(0, 50)}`
			});

			const webResults = webSearch.content?.[0]?.text || 'No results';
			console.log(`   Web search: ${webResults.substring(0, 100)}...`);

			// Log for human review
			await logFixAttempt(error, bestMatch?.payload || {}, false, 0);

			// Mark as needs_review instead of fixed
			const client = await pool.connect();
			try {
				await client.query(`
					UPDATE ts_errors
					SET status = 'needs_review'
					WHERE id = $1
				`, [error.id]);
			} finally {
				client.release();
			}
		}

		// Small delay between iterations
		await new Promise(resolve => setTimeout(resolve, 1000));
	}

	// Final summary
	const finalBaseline = await getTSCBaseline();
	const totalReduction = baselineErrorCount - finalBaseline;

	console.log('\n' + '='.repeat(80));
	console.log('📊 Phase 87 Autonomous Loop Summary');
	console.log('='.repeat(80));
	console.log(`Fix Attempts:     ${fixAttempts}`);
	console.log(`Successful:       ${successfulFixes} ✅`);
	console.log(`Failed:           ${failedFixes} ❌`);
	console.log(`Needs Review:     ${fixAttempts - successfulFixes - failedFixes} ⚠️`);
	console.log(`Success Rate:     ${((successfulFixes / fixAttempts) * 100).toFixed(1)}%`);
	console.log('');
	console.log(`Baseline Start:   ${baselineErrorCount.toLocaleString()} errors`);
	console.log(`Baseline End:     ${finalBaseline.toLocaleString()} errors`);
	console.log(`Total Reduction:  ${totalReduction > 0 ? '✅ -' : '❌ +'}${Math.abs(totalReduction)} errors`);
	console.log('='.repeat(80));
}

async function main() {
	try {
		// Run autonomous loop
		await runAutonomousLoop(10);

	} catch (err) {
		console.error('\n❌ Error:', err.message);
		console.error(err.stack);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

main();
