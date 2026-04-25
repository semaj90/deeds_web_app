#!/usr/bin/env node
import redis from 'redis';

const client = redis.createClient({ url: 'redis://localhost:6379' });

try {
	await client.connect();
	console.log('✅ Redis connected\n');

	const keys = await client.keys('phase76:codebase:*');
	console.log(`📦 Found ${keys.length} cached items:\n`);

	for (const key of keys) {
		const ttl = await client.ttl(key);
		const size = (await client.get(key))?.length || 0;
		console.log(`   ${key.replace('phase76:codebase:', '')}`);
		console.log(`      TTL: ${ttl}s (${(ttl/3600).toFixed(1)}h)`);
		console.log(`      Size: ${(size/1024).toFixed(1)} KB\n`);
	}

	await client.disconnect();
} catch (err) {
	console.error('❌ Redis error:', err.message);
	process.exit(1);
}
