#!/usr/bin/env node

/**
 * Test cache invalidation with RabbitMQ down (inline fallback)
 */

console.log('\n🧪 Testing Cache Invalidation (RabbitMQ DOWN)...\n');

try {
	const response = await fetch(`${process.env.PUBLIC_APP_URL ?? 'http://localhost:5173'}/api/cache/invalidate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ pattern: 'template:test:*' })
	});

	console.log(`HTTP Status: ${response.status}`);

	if (response.ok) {
		const data = await response.json();
		console.log('Response:', JSON.stringify(data, null, 2));
		console.log('\n✅ Cache invalidation request successful');
	} else {
		const error = await response.text();
		console.error('❌ Error:', error);
	}

	// Wait a moment for async processing
	await new Promise(resolve => setTimeout(resolve, 1000));

	console.log('\n📋 Checking for [dispatch] logs...\n');

} catch (err) {
	console.error('❌ Request failed:', err.message);
}
