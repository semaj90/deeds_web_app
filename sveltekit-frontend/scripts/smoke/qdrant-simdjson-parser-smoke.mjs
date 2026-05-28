import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function run() {
	console.log('=== Qdrant simdjson Parser Smoke Test ===\n');

	let parseQdrantJsonResponse;
	try {
		const module = await import('../../src/lib/server/utils/qdrant-parser.ts');
		parseQdrantJsonResponse = module.parseQdrantJsonResponse;
	} catch (e) {
		console.error('❌ Failed: Could not import Qdrant parser module:', e.message);
		process.exit(1);
	}

	// 1. Mock a small response (< 5000 bytes)
	const smallData = { result: "ok", count: 42 };
	const smallText = JSON.stringify(smallData);
	const smallResponse = new Response(smallText);

	let smallTrace = null;
	const smallParsed = await parseQdrantJsonResponse(smallResponse, {
		qdrantOperation: 'search',
		onTrace: (t) => { smallTrace = t; }
	});

	console.log('Small response parsed:', smallParsed);
	console.log('Small response trace:', smallTrace);

	if (smallTrace.parser !== 'json.parse') {
		console.error('❌ Failed: Small payload did not use JSON.parse');
		process.exit(1);
	}

	// 2. Mock a large response (>= 5000 bytes)
	const largeData = {
		result: "ok",
		items: Array.from({ length: 200 }, (_, i) => ({
			id: i,
			score: 0.99 - (i * 0.001),
			payload: {
				feature: `feature_${i}`,
				sourceRef: `source_ref_for_item_${i}_with_extra_padding_to_ensure_large_payload_size_beyond_five_thousand_bytes`,
				description: "This is a dummy description with some long text to fill space and ensure that the payload exceeds the 5000 bytes threshold."
			}
		}))
	};
	const largeText = JSON.stringify(largeData);
	const largeResponse = new Response(largeText);

	let largeTrace = null;
	const largeParsed = await parseQdrantJsonResponse(largeResponse, {
		qdrantOperation: 'scroll',
		onTrace: (t) => { largeTrace = t; }
	});

	console.log('Large response parsed success, item count:', largeParsed.items?.length);
	console.log('Large response trace:', largeTrace);

	if (largeTrace.responseBytes < 5000) {
		console.error('❌ Failed: Large payload is not actually >= 5000 bytes, length:', largeTrace.responseBytes);
		process.exit(1);
	}

	// Let's verify stats and fallback
	console.log('Parser used for large response:', largeTrace.parser);
	// We expect either simdjson (if built/available) or json.parse (fallback). Either is correct/safe.
	
	// 3. Fallback compatibility test (corrupt JSON)
	const corruptResponse = new Response("{ corrupt json: [ }");
	try {
		await parseQdrantJsonResponse(corruptResponse, { qdrantOperation: 'upsert' });
		console.error('❌ Failed: Corrupt JSON did not throw error');
		process.exit(1);
	} catch (err) {
		console.log('✅ Corrupt JSON threw expected parsing error:', err.message);
	}

	console.log('\n✅ Qdrant simdjson Parser Smoke test passed.');
	process.exit(0);
}

run().catch(e => {
	console.error('Fatal in smoke test:', e);
	process.exit(1);
});
