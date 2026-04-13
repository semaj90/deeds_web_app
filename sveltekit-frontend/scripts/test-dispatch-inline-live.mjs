#!/usr/bin/env node

/**
 * Live test of dispatch-inline with RabbitMQ down
 * Triggers analytics.track event via API
 */

console.log('\n🧪 Testing Dispatch-Inline (RabbitMQ DOWN)...\n');

const response = await fetch('http://localhost:5173/api/analytics/events', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		eventType: 'cache_hit',
		payload: { source: 'dispatch_inline_test', timestamp: Date.now() }
	})
});

console.log(`HTTP Status: ${response.status}`);

if (response.ok) {
	const data = await response.json();
	console.log('Response:', JSON.stringify(data, null, 2));
	console.log('\n✅ Request successful');
	console.log('\n📋 Check server logs for [dispatch] inline fallback messages:');
	console.log('   tail -50 sveltekit-frontend/dev-server.log | grep "\\[dispatch\\]"');
} else {
	const error = await response.text();
	console.error('❌ Error:', error);
}