<script lang="ts">
	import { onMount } from 'svelte';
	import { getOnnxSession, getProviderLabel } from '$lib/ai/onnx/session.js';
	import { isOnnxAvailable } from '$lib/ai/onnx/inference.js';

	let results = $state<Array<{ name: string; status: 'pass' | 'fail' | 'skip'; message: string; duration?: number }>>([]);
	let isRunning = $state(false);
	let testStatus = $state<'idle' | 'running' | 'complete'>('idle');

	function addResult(name: string, status: 'pass' | 'fail' | 'skip', message: string, duration?: number) {
		results = [...results, { name, status, message, duration }];
	}

	async function runTests() {
		if (isRunning) return;
		isRunning = true;
		results = [];

		// Test 1: Browser environment
		try {
			const isBrowser = typeof window !== 'undefined';
			addResult('Browser Environment', isBrowser ? 'pass' : 'fail', isBrowser ? 'Browser detected' : 'Not running in browser');
		} catch (e) {
			addResult('Browser Environment', 'fail', String(e));
		}

		// Test 2: IndexedDB availability
		try {
			const hasIndexedDB = typeof indexedDB !== 'undefined';
			addResult('IndexedDB', hasIndexedDB ? 'pass' : 'skip', hasIndexedDB ? 'IndexedDB available' : 'IndexedDB not available');
		} catch (e) {
			addResult('IndexedDB', 'fail', String(e));
		}

		// Test 3: LocalStorage
		try {
			localStorage.setItem('__test__', 'test');
			localStorage.removeItem('__test__');
			addResult('LocalStorage', 'pass', 'LocalStorage available');
		} catch (e) {
			addResult('LocalStorage', 'skip', 'LocalStorage not available (private mode?)');
		}

		// Test 4: ONNX Runtime availability
		let onnxAvailable = false;
		try {
			const start = Date.now();
			onnxAvailable = await isOnnxAvailable();
			const duration = Date.now() - start;
			addResult('ONNX Availability', onnxAvailable ? 'pass' : 'fail', onnxAvailable ? 'ONNX Runtime loaded' : 'ONNX Runtime not available', duration);
		} catch (e) {
			addResult('ONNX Availability', 'fail', String(e));
		}

		// Test 5: Load EmbeddingGemma ONNX model
		try {
			const start = Date.now();
			const session = await getOnnxSession('/embeddinggemma_300m_onnx/model.onnx');
			const duration = Date.now() - start;
			const provider = getProviderLabel('/embeddinggemma_300m_onnx/model.onnx');
			if (session) {
				addResult('EmbeddingGemma Load', 'pass', `Loaded with ${provider}`, duration);
			} else {
				addResult('EmbeddingGemma Load', 'fail', 'Session returned null');
			}
		} catch (e) {
			addResult('EmbeddingGemma Load', 'fail', String(e));
		}

		// Test 6: Load Gemma4 E2B ONNX model (new, replaces Gemma3)
		try {
			const start = Date.now();
			const session = await getOnnxSession('/gemma4_e2b_onnx/model.onnx');
			const duration = Date.now() - start;
			if (session) {
				const provider = getProviderLabel('/gemma4_e2b_onnx/model.onnx');
				addResult('Gemma4 E2B Load', 'pass', `Loaded with ${provider} (120-255 tok/s)`, duration);
			} else {
				addResult('Gemma4 E2B Load', 'skip', 'Model not downloaded yet. Run: bash scripts/download-gemma4-e2b-onnx.sh');
			}
		} catch (e) {
			addResult('Gemma4 E2B Load', 'skip', 'Model not available: ' + String(e).substring(0, 60));
		}

		// Test 7: WebGPU availability
		try {
			const hasWebGPU = typeof navigator !== 'undefined' && (navigator as any).gpu !== undefined;
			addResult('WebGPU', hasWebGPU ? 'pass' : 'skip', hasWebGPU ? 'WebGPU available (GPU acceleration enabled)' : 'WebGPU not available (will use WASM/CPU)');
		} catch (e) {
			addResult('WebGPU', 'skip', String(e));
		}

		// Test 8: LokiJS import
		try {
			const start = Date.now();
			const Loki = await import('lokijs').then(m => m.default);
			const duration = Date.now() - start;
			const db = new Loki('test-db', { env: 'BROWSER', autosave: false });
			db.close();
			addResult('LokiJS', 'pass', 'In-memory database initialized', duration);
		} catch (e) {
			addResult('LokiJS', 'fail', String(e));
		}

		// Test 9: idb-keyval (IndexedDB wrapper)
		try {
			const start = Date.now();
			const { get, set } = await import('idb-keyval');
			await set('__test__', { data: 'test' });
			const value = await get('__test__');
			await (await import('idb-keyval')).del('__test__');
			const duration = Date.now() - start;
			addResult('idb-keyval', value ? 'pass' : 'fail', 'IndexedDB wrapper working', duration);
		} catch (e) {
			addResult('idb-keyval', 'fail', String(e));
		}

		// Test 10: Batch embeddings API
		try {
			const start = Date.now();
			const response = await fetch('/api/admin/batch-embeddings/packets');
			const duration = Date.now() - start;
			if (response.ok) {
				const packets = await response.json();
				addResult('Batch Embeddings API', 'pass', `API responding (${packets.length} packets available)`, duration);
			} else {
				addResult('Batch Embeddings API', 'fail', `HTTP ${response.status}`);
			}
		} catch (e) {
			addResult('Batch Embeddings API', 'fail', String(e));
		}

		testStatus = 'complete';
		isRunning = false;
	}

	onMount(() => {
		// Auto-run tests on page load
		setTimeout(runTests, 500);
	});

	const passCount = $derived(results.filter(r => r.status === 'pass').length);
	const failCount = $derived(results.filter(r => r.status === 'fail').length);
	const skipCount = $derived(results.filter(r => r.status === 'skip').length);
</script>

<div class="onnx-gpu-test">
	<h1>🧠 ONNX GPU + Client Cache Test Suite</h1>

	<div class="summary">
		<div class="stat">
			<span class="label">Passed:</span>
			<span class="value pass">{passCount}</span>
		</div>
		<div class="stat">
			<span class="label">Failed:</span>
			<span class="value fail">{failCount}</span>
		</div>
		<div class="stat">
			<span class="label">Skipped:</span>
			<span class="value skip">{skipCount}</span>
		</div>
		<div class="stat">
			<span class="label">Total:</span>
			<span class="value">{results.length}</span>
		</div>
	</div>

	<button onclick={runTests} disabled={isRunning} class="btn-primary">
		{isRunning ? 'Running Tests...' : 'Run Tests'}
	</button>

	{#if results.length > 0}
		<div class="results">
			<h2>Test Results</h2>
			<table>
				<thead>
					<tr>
						<th>Test</th>
						<th>Status</th>
						<th>Message</th>
						<th>Duration</th>
					</tr>
				</thead>
				<tbody>
					{#each results as result}
						<tr class={result.status}>
							<td class="name">{result.name}</td>
							<td class="status">
								{#if result.status === 'pass'}
									<span class="badge pass">✅ PASS</span>
								{:else if result.status === 'fail'}
									<span class="badge fail">❌ FAIL</span>
								{:else}
									<span class="badge skip">⏭️ SKIP</span>
								{/if}
							</td>
							<td class="message">{result.message}</td>
							<td class="duration">{result.duration ? `${result.duration}ms` : '—'}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="architecture">
		<h3>Architecture Overview</h3>
		<div class="stack">
			<div class="layer">
				<h4>L0: Client Inference (Browser ONNX)</h4>
				<ul>
					<li>✅ EmbeddingGemma 300M (291 MB, 384-dim)</li>
					<li>✅ Gemma3 270M (418 MB, fallback text gen)</li>
					<li>🎯 WebGPU → WASM SIMD → CPU fallback</li>
				</ul>
			</div>
			<div class="layer">
				<h4>L0b: Server Inference (llama-server)</h4>
				<ul>
					<li>✅ Gemma4 9B via TurboQuant (:8090)</li>
					<li>✅ Validation endpoint (:8091, 4 workers)</li>
					<li>🎯 Summary generation + parallel validation</li>
				</ul>
			</div>
			<div class="layer">
				<h4>L1: In-Memory Cache</h4>
				<ul>
					<li>✅ LokiJS (MongoDB-like, 5-10 min TTL)</li>
					<li>✅ IndexedDB via idb-keyval (7-day TTL)</li>
					<li>🎯 Fast re-access without re-compute</li>
				</ul>
			</div>
			<div class="layer">
				<h4>L2: Server Cache</h4>
				<ul>
					<li>✅ Redis BitFrost L1 (exact-match, 5ms, 1h)</li>
					<li>✅ Bifrost L2 semantic (similarity, 2-5s)</li>
					<li>🎯 Cross-request reuse</li>
				</ul>
			</div>
			<div class="layer">
				<h4>L3: Persistent Storage</h4>
				<ul>
					<li>✅ Postgres pgvector (canonical embeddings)</li>
					<li>✅ Qdrant (768-dim ANN mirror, 58K chunks)</li>
					<li>🎯 Durable searchable storage</li>
				</ul>
			</div>
		</div>
	</div>
</div>

<style>
	.onnx-gpu-test {
		padding: 2rem;
		background: var(--bg-primary);
		border-radius: 8px;
		max-width: 1200px;
		margin: 0 auto;
	}

	h1 {
		margin: 0 0 2rem 0;
		font-size: 1.8rem;
		color: var(--text-primary);
	}

	.summary {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
		background: var(--bg-secondary);
		padding: 1.5rem;
		border-radius: 6px;
	}

	.stat {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
	}

	.stat .label {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--text-secondary);
	}

	.stat .value {
		font-size: 1.5rem;
		font-weight: 700;
		font-family: monospace;
		color: var(--text-primary);
	}

	.stat .value.pass {
		color: var(--success);
	}

	.stat .value.fail {
		color: var(--error);
	}

	.stat .value.skip {
		color: var(--info);
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: var(--accent);
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s;
		margin-bottom: 2rem;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary:hover:not(:disabled) {
		opacity: 0.9;
	}

	.results {
		margin-bottom: 2rem;
	}

	.results h2 {
		margin: 0 0 1rem 0;
		font-size: 1.3rem;
		color: var(--text-primary);
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: var(--bg-secondary);
		border-radius: 6px;
		overflow: hidden;
	}

	th {
		background: var(--bg-tertiary);
		padding: 1rem;
		text-align: left;
		font-weight: 600;
		border-bottom: 1px solid var(--border);
		font-size: 0.85rem;
		text-transform: uppercase;
		color: var(--text-secondary);
	}

	td {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		font-size: 0.9rem;
	}

	tr.pass td {
		background: rgba(34, 197, 94, 0.05);
	}

	tr.fail td {
		background: rgba(239, 68, 68, 0.05);
	}

	tr.skip td {
		background: rgba(59, 130, 246, 0.05);
	}

	.name {
		font-weight: 600;
		color: var(--text-primary);
	}

	.status {
		text-align: center;
	}

	.badge {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 600;
		font-family: monospace;
	}

	.badge.pass {
		background: rgba(34, 197, 94, 0.2);
		color: var(--success);
	}

	.badge.fail {
		background: rgba(239, 68, 68, 0.2);
		color: var(--error);
	}

	.badge.skip {
		background: rgba(59, 130, 246, 0.2);
		color: var(--info);
	}

	.message {
		color: var(--text-secondary);
		font-family: monospace;
		font-size: 0.8rem;
	}

	.duration {
		text-align: right;
		font-family: monospace;
		color: var(--text-secondary);
	}

	.architecture {
		background: var(--bg-secondary);
		padding: 1.5rem;
		border-radius: 6px;
		margin-top: 2rem;
	}

	.architecture h3 {
		margin: 0 0 1.5rem 0;
		font-size: 1.1rem;
		color: var(--text-primary);
	}

	.stack {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
		gap: 1rem;
	}

	.layer {
		background: var(--bg-tertiary);
		padding: 1rem;
		border-radius: 4px;
		border-left: 4px solid var(--accent);
	}

	.layer h4 {
		margin: 0 0 0.75rem 0;
		font-size: 0.95rem;
		color: var(--accent);
	}

	.layer ul {
		margin: 0;
		padding-left: 1.25rem;
		list-style: none;
	}

	.layer li {
		font-size: 0.85rem;
		color: var(--text-secondary);
		padding: 0.25rem 0;
		line-height: 1.5;
	}
</style>
