#!/usr/bin/env node
/**
 * Knowledge Base Health Check
 * Verifies Qdrant collection, Redis cache, and Ollama status
 */

import chalk from 'chalk';
import Redis from 'ioredis';

const CONFIG = {
	qdrant: {
		url: process.env.QDRANT_URL || 'http://localhost:6333',
		collection: process.env.QDRANT_COLLECTION || 'knowledge_base'
	},
	redis: {
		url: process.env.REDIS_URL || 'redis://localhost:6379'
	},
	ollama: {
		url: process.env.OLLAMA_URL || 'http://localhost:11434'
	}
};

console.log(chalk.bold.cyan('\n🏥 Knowledge Base Health Check\n'));

// Check Qdrant
console.log(chalk.yellow('1. Qdrant Vector Database'));
try {
	const response = await fetch(`${CONFIG.qdrant.url}/collections/${CONFIG.qdrant.collection}`);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const data = await response.json();
	const result = data.result;

	console.log(chalk.green('   ✅ Connected'));
	console.log(chalk.gray(`   Collection: ${CONFIG.qdrant.collection}`));
	console.log(chalk.gray(`   Points: ${result.points_count}`));
	console.log(chalk.gray(`   Dimension: ${result.config.params.vectors.size}`));
	console.log(chalk.gray(`   Distance: ${result.config.params.vectors.distance}`));
	console.log();
} catch (error) {
	console.log(chalk.red('   ❌ Failed:'), error.message);
	console.log();
}

// Check Redis
console.log(chalk.yellow('2. Redis Cache'));
try {
	const redis = new Redis(CONFIG.redis.url, {
		retryStrategy: () => null,
		maxRetriesPerRequest: 1,
		connectTimeout: 2000
	});

	await redis.ping();

	// Get memory info
	const info = await redis.info('memory');
	const usedMemoryMatch = info.match(/used_memory_human:(\S+)/);
	const maxMemoryMatch = info.match(/maxmemory_human:(\S+)/);

	// Get cache stats
	const embStats = await redis.hgetall('metrics:cache:embeddings');
	const searchStats = await redis.hgetall('metrics:cache:search');

	const embHits = parseInt(embStats.hits || '0');
	const embMisses = parseInt(embStats.misses || '0');
	const embTotal = embHits + embMisses;

	const searchHits = parseInt(searchStats.hits || '0');
	const searchMisses = parseInt(searchStats.misses || '0');
	const searchTotal = searchHits + searchMisses;

	console.log(chalk.green('   ✅ Connected'));
	console.log(chalk.gray(`   Used Memory: ${usedMemoryMatch ? usedMemoryMatch[1] : 'unknown'}`));
	console.log(chalk.gray(`   Max Memory: ${maxMemoryMatch ? maxMemoryMatch[1] : 'unlimited'}`));
	console.log();
	console.log(chalk.gray('   Embedding Cache:'));
	console.log(chalk.gray(`     Hits: ${embHits}, Misses: ${embMisses}, Total: ${embTotal}`));
	console.log(chalk.gray(`     Hit Rate: ${embTotal > 0 ? ((embHits / embTotal) * 100).toFixed(2) : '0.00'}%`));
	console.log();
	console.log(chalk.gray('   Search Cache:'));
	console.log(chalk.gray(`     Hits: ${searchHits}, Misses: ${searchMisses}, Total: ${searchTotal}`));
	console.log(chalk.gray(`     Hit Rate: ${searchTotal > 0 ? ((searchHits / searchTotal) * 100).toFixed(2) : '0.00'}%`));
	console.log();

	await redis.quit();
} catch (error) {
	console.log(chalk.red('   ❌ Failed:'), error.message);
	console.log();
}

// Check Ollama
console.log(chalk.yellow('3. Ollama (Embedding Model)'));
try {
	const response = await fetch(`${CONFIG.ollama.url}/api/tags`);
	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	const data = await response.json();
	const models = data.models || [];

	// Find embedding model
	const embeddingModel = models.find(m =>
		m.name.includes('embedding') || m.name.includes('embed')
	);

	console.log(chalk.green('   ✅ Connected'));
	console.log(chalk.gray(`   Models: ${models.length}`));

	if (embeddingModel) {
		console.log(chalk.gray(`   Embedding Model: ${embeddingModel.name}`));
		console.log(chalk.gray(`   Size: ${(embeddingModel.size / 1024 / 1024 / 1024).toFixed(2)} GB`));
	} else {
		console.log(chalk.yellow('   ⚠️  No embedding model found'));
	}

	console.log();
} catch (error) {
	console.log(chalk.red('   ❌ Failed:'), error.message);
	console.log();
}

console.log(chalk.green('✅ Health check complete!\n'));
