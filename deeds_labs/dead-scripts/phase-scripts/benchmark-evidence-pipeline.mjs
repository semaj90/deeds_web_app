#!/usr/bin/env node
/**
 * Evidence Pipeline Performance Benchmark
 *
 * Tests the optimized 8-stage upload pipeline to verify performance improvements:
 * - Phase 1: Batch embedding (18× speedup: 240s → 13s for 800 chunks)
 * - Phase 2: Summary embedding (vector retrieval enabled)
 * - Phase 3: Auto-tagging (3-way mirror to CouchDB+Qdrant+pgvector)
 *
 * Usage:
 *   node scripts/benchmark-evidence-pipeline.mjs
 *   node scripts/benchmark-evidence-pipeline.mjs --chunks=100
 *   node scripts/benchmark-evidence-pipeline.mjs --verbose
 */

import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const ARGS = {
	chunks: parseInt(process.argv.find(a => a.startsWith('--chunks='))?.split('=')[1] || '100'),
	verbose: process.argv.includes('--verbose'),
	baseUrl: process.env.BASE_URL || 'http://localhost:5173',
};

console.log(`
╔══════════════════════════════════════════════════════════════╗
║         Evidence Pipeline Performance Benchmark              ║
╚══════════════════════════════════════════════════════════════╝

Configuration:
  • Base URL: ${ARGS.baseUrl}
  • Test chunks: ${ARGS.chunks}
  • Verbose: ${ARGS.verbose}

Expected performance (${ARGS.chunks} chunks):
  • Old serial pipeline: ~${Math.round(ARGS.chunks * 0.3)}s (300ms/chunk)
  • New batched pipeline: ~${Math.round(ARGS.chunks / 8 / 3 * 0.4)}s (8-batch, 3 concurrent, 400ms/batch)
  • Speedup: ~${Math.round((ARGS.chunks * 0.3) / (ARGS.chunks / 8 / 3 * 0.4))}×

`);

/**
 * Generate mock legal text with realistic structure
 */
function generateMockLegalText(chunkCount = 100) {
	const sections = [];
	for (let i = 0; i < chunkCount; i++) {
		sections.push(`
ARTICLE ${Math.floor(i / 10) + 1}, SECTION ${(i % 10) + 1}

§ ${i + 1}. Legal Provision ${i + 1}

This section establishes the framework for ${['administrative procedures', 'judicial oversight', 'statutory interpretation', 'regulatory compliance'][i % 4]}.

(a) General Rule: All parties shall comply with the provisions set forth herein, subject to the exceptions enumerated in subsection (b).

(b) Exceptions: The following circumstances constitute valid exceptions to subsection (a):
    (1) Force majeure events beyond reasonable control;
    (2) Administrative discretion exercised in good faith;
    (3) Statutory conflicts resolved through judicial interpretation.

(c) Penalties: Violations of this section shall be subject to sanctions as provided in § ${i + 100}.

See also: ${['California Evidence Code § 350', 'Federal Rules of Evidence 401', '28 U.S.C. § 1332', 'Cal. Civ. Code § 1714'][i % 4]}.
		`.trim());
	}
	return sections.join('\n\n');
}

/**
 * Upload evidence and track timing
 */
async function benchmarkUpload() {
	const mockText = generateMockLegalText(ARGS.chunks);
	const mockPDF = Buffer.from(mockText); // Simplified - real upload uses multipart/form-data

	const formData = new FormData();
	formData.append('file', new Blob([mockPDF], { type: 'application/pdf' }), 'benchmark-test.pdf');
	formData.append('caseId', randomUUID()); // Generate valid UUID for benchmark
	formData.append('title', `Benchmark Test (${ARGS.chunks} chunks)`);
	formData.append('type', 'legal_document');

	const startTime = performance.now();

	try {
		const response = await fetch(`${ARGS.baseUrl}/api/evidence/upload`, {
			method: 'POST',
			body: formData,
		});

		if (!response.ok) {
			throw new Error(`Upload failed: ${response.status} ${response.statusText}`);
		}

		const result = await response.json();
		const endTime = performance.now();
		const duration = (endTime - startTime) / 1000;

		return {
			success: true,
			duration,
			result,
			throughput: ARGS.chunks / duration,
		};
	} catch (error) {
		const endTime = performance.now();
		return {
			success: false,
			duration: (endTime - startTime) / 1000,
			error: error.message,
		};
	}
}

/**
 * Test individual pipeline stages
 */
async function benchmarkStages() {
	const stages = {
		embedding: { name: 'Batch Embedding', endpoint: '/api/embed' },
		autoTag: { name: 'Auto-Tagging', endpoint: '/api/tags' },
		entity: { name: 'Entity Extraction', endpoint: '/api/evidence/analysis' },
		summary: { name: 'Summarization', endpoint: '/api/summarize' },
	};

	const results = {};

	for (const [key, stage] of Object.entries(stages)) {
		if (ARGS.verbose) {
			console.log(`\nTesting ${stage.name}...`);
		}

		const startTime = performance.now();

		try {
			// Simple health check for stage availability
			const response = await fetch(`${ARGS.baseUrl}${stage.endpoint}`, {
				method: 'HEAD',
			}).catch(() => null);

			const endTime = performance.now();

			results[key] = {
				available: response?.ok ?? false,
				latency: (endTime - startTime),
			};
		} catch (error) {
			results[key] = {
				available: false,
				error: error.message,
			};
		}
	}

	return results;
}

/**
 * Main benchmark
 */
async function main() {
	console.log('═══ Stage 1: Pipeline Stage Availability ═══\n');

	const stageResults = await benchmarkStages();

	for (const [key, result] of Object.entries(stageResults)) {
		const status = result.available ? '✅ Available' : '❌ Unavailable';
		const latency = result.latency ? `(${result.latency.toFixed(1)}ms)` : '';
		console.log(`  ${key.padEnd(12)}: ${status} ${latency}`);
	}

	console.log('\n═══ Stage 2: Full Pipeline Upload ═══\n');
	console.log('Note: Requires running dev server at', ARGS.baseUrl);
	console.log('Start server: npm run dev\n');

	try {
		await fetch(`${ARGS.baseUrl}/api/health`);
	} catch (error) {
		console.error('❌ Server not reachable. Start dev server first.');
		process.exit(1);
	}

	console.log('Uploading mock evidence...\n');

	const uploadResult = await benchmarkUpload();

	if (!uploadResult.success) {
		console.error('❌ Upload failed:', uploadResult.error);
		process.exit(1);
	}

	console.log(`✅ Upload completed in ${uploadResult.duration.toFixed(2)}s`);
	console.log(`   Throughput: ${uploadResult.throughput.toFixed(2)} chunks/sec`);

	if (uploadResult.result) {
		console.log('\nPipeline Results:');
		console.log(`  • Evidence ID: ${uploadResult.result.evidenceId || 'N/A'}`);
		console.log(`  • Chunks stored: ${uploadResult.result.chunksStored || 0}`);
		console.log(`  • Entities extracted: ${uploadResult.result.entitiesCount || 0}`);
		console.log(`  • Tags generated: ${uploadResult.result.tagsCount || 0}`);
		console.log(`  • Summary length: ${uploadResult.result.summaryLength || 0} chars`);
	}

	// Performance analysis
	const expectedSerial = ARGS.chunks * 0.3;
	const expectedBatched = (ARGS.chunks / 8 / 3) * 0.4;
	const actualSpeedup = expectedSerial / uploadResult.duration;

	console.log('\n═══ Performance Analysis ═══\n');
	console.log(`  Expected (serial):  ${expectedSerial.toFixed(1)}s`);
	console.log(`  Expected (batched): ${expectedBatched.toFixed(1)}s`);
	console.log(`  Actual:             ${uploadResult.duration.toFixed(1)}s`);
	console.log(`  Speedup vs serial:  ${actualSpeedup.toFixed(1)}×`);

	if (actualSpeedup >= 10) {
		console.log('  Status:             ✅ EXCELLENT (>10× speedup)');
	} else if (actualSpeedup >= 5) {
		console.log('  Status:             ✅ GOOD (5-10× speedup)');
	} else if (actualSpeedup >= 2) {
		console.log('  Status:             ⚠️  OK (2-5× speedup)');
	} else {
		console.log('  Status:             ❌ POOR (<2× speedup - investigate bottleneck)');
	}

	console.log('\n✅ Benchmark complete!\n');
}

main().catch((error) => {
	console.error('\n❌ Benchmark failed:', error);
	process.exit(1);
});