#!/usr/bin/env node

import { trtLLMClient } from '../src/lib/trt-llm/client.ts';

async function testTRTLLMPipeline() {
	console.log('🚀 Testing TensorRT-LLM Pipeline...\n');

	try {
		// Test 1: Health Check
		console.log('1️⃣ Testing Health Check...');
		const health = await trtLLMClient.health();
		console.log('✅ Health Status:', health);

		if (health.status !== 'healthy') {
			throw new Error('Service is not healthy');
		}

		// Test 2: Basic Generation
		console.log('\n2️⃣ Testing Basic Generation...');
		const basicResult = await trtLLMClient.generate({
			prompt: 'Explain what a legal contract is in one sentence.',
			max_tokens: 64,
			temperature: 0.5
		});
		console.log('✅ Basic Generation Result:', basicResult);

		// Test 3: Streaming Generation
		console.log('\n3️⃣ Testing Streaming Generation...');
		let streamText = '';
		let chunks = 0;
		for await (const chunk of trtLLMClient.generateStream({
			prompt: 'List 3 key elements of a valid contract.',
			max_tokens: 128,
			temperature: 0.7
		})) {
			streamText += chunk.text;
			chunks++;
			if (chunks % 5 === 0) {
				console.log(`📡 Stream chunk ${chunks}:`, streamText.slice(-50));
			}
			if (chunk.done) break;
		}
		console.log('✅ Streaming Result:', streamText);

		// Test 4: Legal Document Analysis
		console.log('\n4️⃣ Testing Legal Document Analysis...');
		const legalResult = await trtLLMClient.analyzeLegalDocument(`
This agreement is between ABC Corp and XYZ LLC.
Terms: Payment of $10,000 upon completion.
Duration: 6 months from signing date.
		`, 'What are the payment terms and duration?');
		console.log('✅ Legal Analysis Result:', legalResult);

		// Test 5: Performance Benchmark
		console.log('\n5️⃣ Running Performance Benchmark...');
		const startTime = Date.now();
		const benchmarkResults = [];

		for (let i = 0; i < 5; i++) {
			const benchStart = Date.now();
			await trtLLMClient.generate({
				prompt: `Generate a legal clause about confidentiality ${i + 1}.`,
				max_tokens: 32,
				temperature: 0.8
			});
			const benchTime = Date.now() - benchStart;
			benchmarkResults.push(benchTime);
			console.log(`⏱️  Request ${i + 1}: ${benchTime}ms`);
		}

		const avgTime = benchmarkResults.reduce((a, b) => a + b) / benchmarkResults.length;
		const totalTime = Date.now() - startTime;

		console.log(`\n📊 Benchmark Results:`);
		console.log(`Average response time: ${avgTime.toFixed(2)}ms`);
		console.log(`Total time for 5 requests: ${totalTime}ms`);
		console.log(`Requests per second: ${(5000 / totalTime).toFixed(2)}`);

		console.log('\n🎉 All tests passed! TensorRT-LLM pipeline is working correctly.');

	} catch (error) {
		console.error('\n❌ Test failed:', error);
		process.exit(1);
	}
}

// Run the tests
testTRTLLMPipeline();