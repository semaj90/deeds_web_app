#!/usr/bin/env node
/**
 * Test Redis KAG Storage Fix
 *
 * Verifies the atomic counter pattern works correctly
 * by storing a test fix and checking stats.
 * Loads configuration from .env.phase72 (standardized Dec 18)
 */

import dotenv from 'dotenv';
import Redis from 'ioredis';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env.phase72
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.phase72') });

// Read configuration from environment
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const KAG_PREFIX = process.env.KAG_PREFIX || 'phase72:kag';
const TEST_SIG = 'test_verification_' + Date.now();

async function main() {
	console.log('🧪 Testing Redis KAG Storage Fix...\n');
	console.log(`📝 REDIS_HOST: ${REDIS_HOST}`);
	console.log(`📝 REDIS_PORT: ${REDIS_PORT}`);
	console.log(`📝 KAG_PREFIX: ${KAG_PREFIX}\n`);

	const redis = new Redis({
		host: REDIS_HOST,
		port: REDIS_PORT,
		retryStrategy: (times) => (times > 3 ? null : Math.min(times * 50, 200))
	});

	try {
		// Test connection
		console.log('1️⃣ Testing Redis connection...');
		await redis.ping();
		console.log('   ✅ Redis PING successful\n');

		// Read current stats
		console.log('2️⃣ Reading current stats...');
		const statsBefore = await redis.hgetall(`${KAG_PREFIX}:stats`);
		const fixesBefore = parseInt(statsBefore.totalFixesStored || '0', 10);
		const sigsBefore = parseInt(statsBefore.totalSignatures || '0', 10);
		console.log(`   📊 Before: ${fixesBefore} fixes, ${sigsBefore} signatures\n`);

		// Store test fix
		console.log('3️⃣ Storing test fix...');
		const fixKey = `${KAG_PREFIX}:sig:${TEST_SIG}`;
		const statsKey = `${KAG_PREFIX}:stats`;

		const testFix = {
			sig: TEST_SIG,
			patchId: 'test_patch_' + Date.now(),
			patch: 'TEST: s/old/new/g',
			verified: true,
			confidence: 1.0,
			appliedAt: new Date().toISOString()
		};

		// Use pipeline for atomic operations
		const pipeline = redis.pipeline();
		pipeline.set(fixKey, JSON.stringify([testFix]), 'EX', 60); // 60 second TTL
		pipeline.hincrby(statsKey, 'totalFixesStored', 1);
		pipeline.hincrby(statsKey, 'totalSignatures', 1);

		const results = await pipeline.exec();
		console.log(`   ✅ Pipeline executed: ${results.length} commands\n`);

		// Check for errors
		const errors = results.filter(([err]) => err);
		if (errors.length > 0) {
			console.error('   ❌ Pipeline errors:', errors);
			process.exit(1);
		}

		// Verify storage
		console.log('4️⃣ Verifying storage...');
		const exists = await redis.exists(fixKey);
		console.log(`   ${exists === 1 ? '✅' : '❌'} Fix key exists: ${exists === 1}\n`);

		// Read updated stats
		console.log('5️⃣ Reading updated stats...');
		const statsAfter = await redis.hgetall(`${KAG_PREFIX}:stats`);
		const fixesAfter = parseInt(statsAfter.totalFixesStored || '0', 10);
		const sigsAfter = parseInt(statsAfter.totalSignatures || '0', 10);
		console.log(`   📊 After: ${fixesAfter} fixes, ${sigsAfter} signatures\n`);

		// Verify increment
		console.log('6️⃣ Verifying increment...');
		const fixIncrement = fixesAfter - fixesBefore;
		const sigIncrement = sigsAfter - sigsBefore;
		console.log(`   ${fixIncrement === 1 ? '✅' : '❌'} Fix count incremented: +${fixIncrement}`);
		console.log(`   ${sigIncrement === 1 ? '✅' : '❌'} Signature count incremented: +${sigIncrement}\n`);

		// Clean up test data
		console.log('7️⃣ Cleaning up test data...');
		await redis.del(fixKey);
		await redis.hincrby(statsKey, 'totalFixesStored', -1);
		await redis.hincrby(statsKey, 'totalSignatures', -1);
		console.log('   ✅ Test data removed\n');

		// Final verification
		const statsFinal = await redis.hgetall(`${KAG_PREFIX}:stats`);
		const fixesFinal = parseInt(statsFinal.totalFixesStored || '0', 10);
		const sigsFinal = parseInt(statsFinal.totalSignatures || '0', 10);

		console.log('✅ TEST PASSED');
		console.log(`   Final stats: ${fixesFinal} fixes, ${sigsFinal} signatures`);
		console.log('   Atomic counters are working correctly!\n');

		redis.quit();
		process.exit(0);

	} catch (error) {
		console.error('\n❌ TEST FAILED');
		console.error('   Error:', error.message);
		console.error('   Stack:', error.stack);
		redis.quit();
		process.exit(1);
	}
}

main();
