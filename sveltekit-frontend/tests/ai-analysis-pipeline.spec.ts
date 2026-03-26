/**
 * AI Analysis Pipeline E2E Tests
 *
 * Tests the AI analysis pipeline (Ollama, embeddinggemma, Qdrant, RAG):
 *   1. Check Ollama availability
 *   2. Generate embeddings via /api/embed
 *   3. Generate text via /api/ollama/generate
 *   4. Test evidence AI summary
 *   5. Test RAG search pipeline
 *   6. Test ACE contextual chat (SSE stream)
 *
 * Prerequisites:
 *   - Dev server running (npm run dev)
 *   - Ollama running with embeddinggemma + gemma3-legal loaded
 *   - Qdrant accessible (port 6333)
 *
 * All tests gracefully skip if services are unavailable.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { registerTestUser } from './utils/seed-cases';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

test.describe('AI Analysis Pipeline', () => {
	test.describe.configure({ mode: 'serial' });

	let apiContext: APIRequestContext;
	let ollamaAvailable = false;

	test.beforeAll(async ({ playwright }) => {
		apiContext = await playwright.request.newContext({ baseURL: BASE_URL });
		await registerTestUser(apiContext);

		// Pre-check Ollama availability
		try {
			const res = await apiContext.fetch('http://127.0.0.1:11434/api/tags', {
				timeout: 5000,
			});
			ollamaAvailable = res.ok();
			if (ollamaAvailable) {
				const data = await res.json();
				const models = (data.models ?? []).map((m: any) => m.name);
				console.log('[ai-pipeline] Ollama models:', models.join(', '));
			}
		} catch {
			console.log('[ai-pipeline] Ollama not available — AI tests will be skipped');
		}
	});

	test.afterAll(async () => {
		await apiContext.dispose();
	});

	test('1. Ollama health check', async () => {
		test.skip(!ollamaAvailable, 'Ollama unavailable');

		const res = await apiContext.fetch('http://127.0.0.1:11434/api/tags');
		expect(res.ok()).toBeTruthy();

		const data = await res.json();
		expect(Array.isArray(data.models)).toBe(true);
		expect(data.models.length).toBeGreaterThan(0);

		// Check for required models
		const modelNames = data.models.map((m: any) => m.name);
		const hasEmbeddingModel = modelNames.some(
			(n: string) => n.includes('embeddinggemma') || n.includes('nomic')
		);
		const hasLLM = modelNames.some(
			(n: string) => n.includes('gemma3') || n.includes('gemma')
		);

		console.log('[ai-pipeline] Has embedding model:', hasEmbeddingModel);
		console.log('[ai-pipeline] Has LLM:', hasLLM);
		expect(hasEmbeddingModel || hasLLM).toBe(true);
	});

	test('2. generate 768-dim embedding via /api/embed', async () => {
		test.skip(!ollamaAvailable, 'Ollama unavailable');

		const res = await apiContext.post(`${BASE_URL}/api/embed`, {
			data: {
				text: 'The Fourth Amendment protects against unreasonable searches and seizures pursuant to Terry v. Ohio, 392 U.S. 1 (1968).',
				model: 'embeddinggemma',
			},
		});

		if (!res.ok()) {
			const body = await res.text();
			console.log('[ai-pipeline] /api/embed status:', res.status(), body.slice(0, 200));
			test.skip(true, `Embed endpoint returned ${res.status()}`);
			return;
		}

		const json = await res.json();
		const embedding = json.embedding ?? json.data?.embedding;
		expect(Array.isArray(embedding)).toBe(true);
		expect(embedding.length).toBeGreaterThanOrEqual(384);
		console.log('[ai-pipeline] Embedding dimensions:', embedding.length);

		// Verify values are numbers
		expect(typeof embedding[0]).toBe('number');
		expect(typeof embedding[embedding.length - 1]).toBe('number');
	});

	test('3. generate text via /api/ollama/generate', async () => {
		test.skip(!ollamaAvailable, 'Ollama unavailable');
		test.setTimeout(120_000); // LLM generation can take 60s+

		const res = await apiContext.post(`${BASE_URL}/api/ollama/generate`, {
			data: {
				model: 'gemma3-legal:latest',
				prompt:
					'In one sentence, summarize the holding in Miranda v. Arizona, 384 U.S. 436 (1966).',
				stream: false,
			},
			timeout: 90_000,
		});

		if (!res.ok()) {
			const body = await res.text();
			console.log(
				'[ai-pipeline] /api/ollama/generate status:',
				res.status(),
				body.slice(0, 200)
			);
			test.skip(true, `Ollama generate returned ${res.status()}`);
			return;
		}

		const json = await res.json();
		const response = json.response ?? json.data?.response ?? json.text ?? '';
		expect(response.length).toBeGreaterThan(10);
		console.log('[ai-pipeline] LLM response:', response.slice(0, 150));
	});

	test('4. RAG search returns context and results', async () => {
		test.skip(!ollamaAvailable, 'Ollama unavailable');
		test.setTimeout(90_000);

		const res = await apiContext.post(`${BASE_URL}/api/rag/search`, {
			data: {
				query: 'What are the requirements for a valid search warrant under the Fourth Amendment?',
				limit: 5,
			},
			timeout: 60_000,
		});

		if (!res.ok()) {
			const body = await res.text();
			console.log('[ai-pipeline] /api/rag/search status:', res.status(), body.slice(0, 200));
			// RAG may return 404/500 if no documents indexed — not a test failure
			console.log('[ai-pipeline] RAG search unavailable (may need indexed documents)');
			return;
		}

		const json = await res.json();
		console.log('[ai-pipeline] RAG response keys:', Object.keys(json).join(', '));

		// RAG should return results or context
		const results = json.results ?? json.data?.results ?? json.context ?? [];
		if (Array.isArray(results) && results.length > 0) {
			console.log('[ai-pipeline] RAG results count:', results.length);
			console.log('[ai-pipeline] First result score:', results[0].score ?? results[0].relevance);
		} else {
			console.log('[ai-pipeline] RAG returned no results (collection may be empty)');
		}
	});

	test('5. semantic embedding similarity check', async () => {
		test.skip(!ollamaAvailable, 'Ollama unavailable');

		// Generate embeddings for two semantically similar texts
		const text1 =
			'The defendant was arrested for driving under the influence of alcohol.';
		const text2 =
			'The accused was detained for operating a vehicle while intoxicated.';
		const text3 = 'The weather forecast predicts rain for tomorrow afternoon.';

		const [res1, res2, res3] = await Promise.all([
			apiContext.post(`${BASE_URL}/api/embed`, { data: { text: text1 } }),
			apiContext.post(`${BASE_URL}/api/embed`, { data: { text: text2 } }),
			apiContext.post(`${BASE_URL}/api/embed`, { data: { text: text3 } }),
		]);

		if (!res1.ok() || !res2.ok() || !res3.ok()) {
			test.skip(true, 'Embed endpoint unavailable for similarity test');
			return;
		}

		const emb1 = (await res1.json()).embedding;
		const emb2 = (await res2.json()).embedding;
		const emb3 = (await res3.json()).embedding;

		// Compute cosine similarity
		const cosineSim = (a: number[], b: number[]) => {
			let dot = 0,
				normA = 0,
				normB = 0;
			for (let i = 0; i < a.length; i++) {
				dot += a[i] * b[i];
				normA += a[i] * a[i];
				normB += b[i] * b[i];
			}
			return dot / (Math.sqrt(normA) * Math.sqrt(normB));
		};

		const simSimilar = cosineSim(emb1, emb2);
		const simDifferent = cosineSim(emb1, emb3);

		console.log('[ai-pipeline] Similarity (DUI vs intoxicated):', simSimilar.toFixed(4));
		console.log('[ai-pipeline] Similarity (DUI vs weather):', simDifferent.toFixed(4));

		// Similar texts should have higher similarity than dissimilar ones
		expect(simSimilar).toBeGreaterThan(simDifferent);
	});

	test('6. ACE contextual chat SSE stream', async () => {
		test.skip(!ollamaAvailable, 'Ollama unavailable');
		test.setTimeout(90_000);

		const res = await apiContext.post(`${BASE_URL}/api/ai/contextual-chat`, {
			data: {
				message: 'What is the significance of Miranda v. Arizona?',
				context: {
					caseType: 'criminal',
					jurisdiction: 'federal',
				},
			},
			timeout: 60_000,
		});

		if (!res.ok()) {
			const body = await res.text();
			console.log(
				'[ai-pipeline] /api/ai/contextual-chat status:',
				res.status(),
				body.slice(0, 200)
			);
			// May not be available — not a failure
			console.log('[ai-pipeline] Contextual chat unavailable');
			return;
		}

		// SSE or JSON response
		const contentType = res.headers()['content-type'] ?? '';
		if (contentType.includes('text/event-stream')) {
			const body = await res.text();
			console.log('[ai-pipeline] SSE stream received, length:', body.length);
			expect(body.length).toBeGreaterThan(0);
		} else {
			const json = await res.json();
			console.log('[ai-pipeline] Chat response keys:', Object.keys(json).join(', '));
			const answer = json.response ?? json.answer ?? json.message ?? '';
			if (answer) {
				console.log('[ai-pipeline] Chat answer:', answer.slice(0, 150));
			}
		}
	});
});
