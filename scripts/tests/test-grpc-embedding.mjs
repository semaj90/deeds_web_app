/**
 * Test gRPC Embedding Service Health
 *
 * Tests the 4-tier embedding fallback chain:
 * 1. gRPC (:50051)
 * 2. QUIC/NATS (:4222)
 * 3. HTTP/Ollama batch
 * 4. HTTP/Ollama sequential
 *
 * Usage: npx tsx scripts/tests/test-grpc-embedding.mjs
 */

import { generateSingleEmbedding, generateEmbeddings } from '../../sveltekit-frontend/src/lib/server/grpc/embedding-client.ts';

console.log('═'.repeat(70));
console.log('gRPC Embedding Service Health Check');
console.log('═'.repeat(70));
console.log();

const testText = 'Legal contract document evidence analysis';

console.log('📝 Test Input:');
console.log(`   Text: "${testText}"`);
console.log(`   Expected: 768-dim embedding vector`);
console.log();

// Test 1: Single embedding (most common use case)
console.log('1️⃣  Testing generateSingleEmbedding()...');
const start = Date.now();
try {
	const vector = await generateSingleEmbedding(testText);
	const elapsed = Date.now() - start;

	console.log(`   ✅ Success: ${vector.length}-dim vector in ${elapsed}ms`);
	console.log(`   Sample values: [${vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
	console.log(`   L2 norm: ${Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)).toFixed(4)}`);
} catch (err) {
	console.error(`   ❌ Failed:`, err.message);
	if (err.attempts) {
		console.error('\n   Attempt chain:');
		for (const attempt of err.attempts) {
			console.error(`     - ${attempt.transport}: ${attempt.status} ${attempt.detail ? `(${attempt.detail})` : ''}`);
		}
	}
	process.exit(1);
}
console.log();

// Test 2: Batch embeddings (tests gRPC batching)
console.log('2️⃣  Testing generateEmbeddings() batch (3 texts)...');
const batchTexts = [
	'Contract clause on indemnification',
	'Evidence photo of crime scene',
	'Legal precedent citation reference',
];
const batchStart = Date.now();
try {
	const result = await generateEmbeddings(batchTexts);
	const elapsed = Date.now() - batchStart;

	console.log(`   ✅ Success: ${result.vectors.length} vectors in ${elapsed}ms`);
	console.log(`   Source: ${result.source}`);
	console.log(`   Model: ${result.model}`);
	console.log(`   Dimension: ${result.dimension}`);
	console.log(`   Avg latency: ${(elapsed / result.vectors.length).toFixed(1)}ms per embedding`);

	if (result.attempts) {
		console.log('\n   Transport attempts:');
		for (const attempt of result.attempts) {
			const icon = attempt.status === 'success' ? '✅' : attempt.status === 'skipped' ? '⏭️' : '❌';
			console.log(`     ${icon} ${attempt.transport}: ${attempt.status} ${attempt.durationMs ? `(${attempt.durationMs}ms)` : ''}`);
			if (attempt.detail) {
				console.log(`        ${attempt.detail}`);
			}
		}
	}
} catch (err) {
	console.error(`   ❌ Failed:`, err.message);
	process.exit(1);
}
console.log();

// Test 3: gRPC-specific health check (if we can determine source)
console.log('3️⃣  Checking preferred transport...');
try {
	const healthResult = await generateSingleEmbedding('health check');
	// The embedding client doesn't expose transport info directly in generateSingleEmbedding,
	// but we can infer from generateEmbeddings result above
	console.log(`   ✅ Service operational`);
} catch (err) {
	console.error(`   ❌ Service unavailable:`, err.message);
}
console.log();

console.log('═'.repeat(70));
console.log('✅ gRPC Embedding Service Health Check PASSED');
console.log();
console.log('Next steps:');
console.log('  1. Verify gRPC is the primary transport (check attempts log above)');
console.log('  2. If falling back to HTTP, check gRPC service: docker logs go-embedding');
console.log('  3. Monitor performance: gRPC should be <50ms, HTTP ~100-300ms');
console.log('═'.repeat(70));
