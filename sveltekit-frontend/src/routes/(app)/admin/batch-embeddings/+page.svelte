<script lang="ts">
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	export let data: PageData;

	let status = $state('idle');
	let progress = $state(0);
	let totalPackets = $state(0);
	let embeddedCount = $state(0);
	let cacheHits = $state(0);
	let errors = $state(0);
	let estimatedTime = $state('');
	let isRunning = $state(false);

	interface BatchResult {
		packetKey: string;
		embedding: number[];
		cacheHit: boolean;
		duration: number;
	}

	let results: BatchResult[] = $state([]);

	async function startBatchEmbedding() {
		if (isRunning) return;
		isRunning = true;
		status = 'fetching-packets';
		progress = 0;
		embeddedCount = 0;
		cacheHits = 0;
		errors = 0;
		results = [];

		try {
			// Fetch packet list from server
			const response = await fetch('/api/admin/batch-embeddings/packets');
			const packets = await response.json();
			totalPackets = packets.length;

			// Process in batches of 10
			const batchSize = 10;
			const startTime = Date.now();

			for (let i = 0; i < packets.length; i += batchSize) {
				if (!isRunning) break;

				const batch = packets.slice(i, i + batchSize);
				status = `embedding-batch-${Math.floor(i / batchSize) + 1}`;

				const batchResults = await processBatch(batch);
				results = [...results, ...batchResults];

				// Update stats
				embeddedCount += batchResults.filter((r) => r.embedding?.length > 0).length;
				cacheHits += batchResults.filter((r) => r.cacheHit).length;
				errors += batchResults.filter((r) => !r.embedding?.length).length;

				progress = Math.round(((i + batchSize) / totalPackets) * 100);

				// Estimate time remaining
				const elapsed = Date.now() - startTime;
				const rate = (i + batchSize) / (elapsed / 1000); // packets/sec
				const remaining = Math.ceil((totalPackets - (i + batchSize)) / rate);
				estimatedTime = `${Math.ceil(remaining / 60)}m ${remaining % 60}s`;
			}

			status = 'complete';
			isRunning = false;
		} catch (err) {
			status = `error: ${err instanceof Error ? err.message : String(err)}`;
			isRunning = false;
		}
	}

	async function processBatch(packets: any[]): Promise<BatchResult[]> {
		const results: BatchResult[] = [];

		for (const packet of packets) {
			const startTime = Date.now();

			try {
				// Call server endpoint to embed packet
				const response = await fetch('/api/admin/batch-embeddings/embed', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						packetKey: packet.packet_key,
						text: packet.feature_label || packet.summary || '',
					}),
				});

				const data = await response.json();
				const duration = Date.now() - startTime;

				results.push({
					packetKey: packet.packet_key,
					embedding: data.embedding || [],
					cacheHit: data.cacheHit || false,
					duration,
				});
			} catch (err) {
				results.push({
					packetKey: packet.packet_key,
					embedding: [],
					cacheHit: false,
					duration: Date.now() - startTime,
				});
			}
		}

		return results;
	}

	function stopBatching() {
		isRunning = false;
		status = 'stopped';
	}

	function downloadResults() {
		const csv = [
			['Packet Key', 'Embedding Dim', 'Cache Hit', 'Duration (ms)'].join(','),
			...results.map((r) =>
				[
					r.packetKey,
					r.embedding?.length || 0,
					r.cacheHit ? 'yes' : 'no',
					r.duration,
				].join(',')
			),
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `batch-embeddings-${new Date().toISOString()}.csv`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="admin-batch-embeddings">
	<h1>🧠 Batch Embeddings (ONNX GPU + Bitfrost)</h1>

	<div class="controls">
		<button
			onclick={startBatchEmbedding}
			disabled={isRunning}
			class="btn-primary"
		>
			{isRunning ? `Processing (${progress}%)` : 'Start Batch Embedding'}
		</button>

		<button
			onclick={stopBatching}
			disabled={!isRunning}
			class="btn-secondary"
		>
			Stop
		</button>

		<button
			onclick={downloadResults}
			disabled={results.length === 0}
			class="btn-secondary"
		>
			📥 Download Results
		</button>
	</div>

	<div class="status-panel">
		<div class="status-row">
			<span>Status:</span>
			<span class="status-value">{status}</span>
		</div>

		<div class="status-row">
			<span>Progress:</span>
			<div class="progress-bar">
				<div class="progress-fill" style="width: {progress}%"></div>
			</div>
			<span>{progress}%</span>
		</div>

		<div class="status-row">
			<span>Total Packets:</span>
			<span class="status-value">{totalPackets}</span>
		</div>

		<div class="status-row">
			<span>Embedded:</span>
			<span class="status-value success">{embeddedCount}</span>
		</div>

		<div class="status-row">
			<span>Cache Hits (Bitfrost):</span>
			<span class="status-value info">{cacheHits}</span>
		</div>

		<div class="status-row">
			<span>Errors:</span>
			<span class="status-value error">{errors}</span>
		</div>

		<div class="status-row">
			<span>ETA:</span>
			<span class="status-value">{estimatedTime || '—'}</span>
		</div>
	</div>

	{#if results.length > 0}
		<div class="results-table">
			<h3>Recent Results</h3>
			<table>
				<thead>
					<tr>
						<th>Packet Key</th>
						<th>Embedding Dim</th>
						<th>Cache Hit</th>
						<th>Duration (ms)</th>
					</tr>
				</thead>
				<tbody>
					{#each results.slice(-20) as result}
						<tr>
							<td class="mono">{result.packetKey}</td>
							<td>{result.embedding?.length || 0}</td>
							<td>{result.cacheHit ? '✅' : '❌'}</td>
							<td>{result.duration}ms</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<div class="architecture-info">
		<h3>Architecture</h3>
		<ul>
			<li>🧠 ONNX Runtime Web + WebGPU (GPU acceleration on client)</li>
			<li>⚡ Bitfrost L1 Cache (Redis exact-match, 5ms lookups)</li>
			<li>🔄 llama-server fallback for validation</li>
			<li>📊 Batch size: 10 packets/request</li>
			<li>💾 Results persisted to Redis + Postgres atlas_packets</li>
		</ul>
	</div>
</div>

<style>
	.admin-batch-embeddings {
		padding: 2rem;
		background: var(--bg-primary);
		border-radius: 8px;
	}

	h1 {
		margin: 0 0 2rem 0;
		font-size: 1.5rem;
	}

	.controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.btn-primary,
	.btn-secondary {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 4px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.btn-primary {
		background: var(--accent);
		color: white;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--bg-secondary);
		color: var(--text-primary);
		border: 1px solid var(--border);
	}

	.status-panel {
		background: var(--bg-secondary);
		padding: 1.5rem;
		border-radius: 4px;
		margin-bottom: 2rem;
		display: grid;
		gap: 1rem;
	}

	.status-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}

	.progress-bar {
		flex: 1;
		height: 24px;
		background: var(--bg-tertiary);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, var(--accent), var(--accent-bright));
		transition: width 0.3s;
	}

	.status-value {
		font-weight: 600;
		font-family: monospace;
	}

	.status-value.success {
		color: var(--success);
	}

	.status-value.info {
		color: var(--info);
	}

	.status-value.error {
		color: var(--error);
	}

	.results-table {
		background: var(--bg-secondary);
		padding: 1.5rem;
		border-radius: 4px;
		margin-bottom: 2rem;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	th,
	td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid var(--border);
	}

	th {
		background: var(--bg-tertiary);
		font-weight: 600;
	}

	.mono {
		font-family: monospace;
		font-size: 0.8rem;
	}

	.architecture-info {
		background: var(--bg-tertiary);
		padding: 1.5rem;
		border-radius: 4px;
	}

	.architecture-info h3 {
		margin-top: 0;
	}

	.architecture-info ul {
		margin: 0;
		padding-left: 1.5rem;
		list-style: none;
	}

	.architecture-info li {
		padding: 0.5rem 0;
	}

	.architecture-info li::before {
		content: '→ ';
		margin-right: 0.5rem;
		color: var(--accent);
	}
</style>
