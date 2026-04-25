#!/usr/bin/env node
/**
 * Quick Test: Verify Phase 72 Infrastructure Before Full Run
 *
 * Checks all prerequisites for full-scale embedding generation:
 * - Redis connectivity and KAG storage
 * - Ollama models availability
 * - Qdrant collection status
 * - Error data source availability
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = process.env.REDIS_PORT || '6379';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'phase72_error_patterns';

console.log('\n🔍 Phase 72 - Pre-Flight Check\n');

let allGood = true;

// Check 1: Redis
console.log('1️⃣ Checking Redis...');
try {
	const { default: Redis } = await import('ioredis');
	const redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, connectTimeout: 3000 });
	await redis.ping();
	console.log('   ✅ Redis: Connected and responding\n');
	await redis.quit();
} catch (error) {
	console.log(`   ❌ Redis: ${error.message}\n`);
	allGood = false;
}

// Check 2: Ollama
console.log('2️⃣ Checking Ollama...');
try {
	const response = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
	if (response.ok) {
		const data = await response.json();
		const models = data.models || [];
		const hasEmbedding = models.some(m => m.name.includes('embeddinggemma'));
		const hasLegal = models.some(m => m.name.includes('gemma3-legal'));

		if (hasEmbedding && hasLegal) {
			console.log(`   ✅ Ollama: ${models.length} models available`);
			console.log(`      - embeddinggemma: ✅`);
			console.log(`      - gemma3-legal: ✅\n`);
		} else {
			console.log(`   ⚠️  Ollama: Missing required models`);
			console.log(`      - embeddinggemma: ${hasEmbedding ? '✅' : '❌'}`);
			console.log(`      - gemma3-legal: ${hasLegal ? '✅' : '❌'}\n`);
			allGood = false;
		}
	}
} catch (error) {
	console.log(`   ❌ Ollama: ${error.message}\n`);
	allGood = false;
}

// Check 3: Qdrant
console.log('3️⃣ Checking Qdrant...');
try {
	const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`, {
		signal: AbortSignal.timeout(5000)
	});

	if (response.ok) {
		const data = await response.json();
		const points = data.result.points_count || 0;
		const vectorSize = data.result.config?.params?.vectors?.size || 0;

		console.log(`   ✅ Qdrant: Collection ready`);
		console.log(`      - Collection: ${QDRANT_COLLECTION}`);
		console.log(`      - Vectors stored: ${points}`);
		console.log(`      - Vector size: ${vectorSize}-dim\n`);
	} else {
		console.log(`   ❌ Qdrant: Collection not found\n`);
		allGood = false;
	}
} catch (error) {
	console.log(`   ❌ Qdrant: ${error.message}\n`);
	allGood = false;
}

// Check 4: TypeScript error source
console.log('4️⃣ Checking TypeScript error data...');
try {
	// Try to run tsc and capture errors
	const { execSync } = await import('child_process');

	console.log('   ℹ️  Running TypeScript check...');

	try {
		execSync('npx tsc --noEmit --pretty false 2>&1', {
			cwd: path.join(__dirname, '..'),
			encoding: 'utf-8',
			timeout: 30000,
			stdio: 'pipe'
		});
		console.log('   ⚠️  No TypeScript errors found (compilation successful)\n');
	} catch (error) {
		// Errors are expected - that's what we want!
		const output = error.stdout || error.stderr || '';
		const errorLines = output.split('\n').filter(line =>
			line.includes('error TS') || line.includes('): error')
		);

		console.log(`   ✅ TypeScript errors: ${errorLines.length} found`);
		console.log(`      Sample: ${errorLines[0]?.substring(0, 80)}...\n`);
	}
} catch (error) {
	console.log(`   ⚠️  TypeScript check: ${error.message}\n`);
}

// Final summary
console.log('═'.repeat(60));
if (allGood) {
	console.log('\n✅ ALL SYSTEMS GO!\n');
	console.log('🚀 Ready to run full-scale embedding generation:\n');
	console.log('   Option 1 (Test):');
	console.log('   node scripts/embed-errors-phase72.mjs --limit 100\n');
	console.log('   Option 2 (Production):');
	console.log('   node scripts/embed-errors-phase72.mjs --limit 20000\n');
	console.log('   Monitor progress with:');
	console.log('   curl http://localhost:6333/collections/phase72_error_patterns\n');
} else {
	console.log('\n⚠️  SOME CHECKS FAILED\n');
	console.log('Please fix the issues above before running full-scale embedding.\n');
	process.exit(1);
}

console.log('═'.repeat(60) + '\n');
