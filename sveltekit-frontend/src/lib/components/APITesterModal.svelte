<script lang="ts">
	/**
	 * API Tester Modal - NES Edition
	 * Postman-style endpoint testing UI
	 */

	import { fade, fly } from 'svelte/transition';
	import type { RouteEndpoint } from '$lib/server/api-metadata-extractor';

	let {
		endpoint = null,
		open = $bindable(false)
	}: {
		endpoint: RouteEndpoint | null;
		open?: boolean;
	} = $props();

	let selectedMethod = $state('GET');
	let requestBody = $state('{}');
	let requestHeaders = $state('{}');
	let responseData = $state<any>(null);
	let responseStatus = $state<number | null>(null);
	let responseTime = $state<number | null>(null);
	let isLoading = $state(false);
	let errorMessage = $state<string | null>(null);

	$effect(() => {
		if (endpoint) {
			selectedMethod = endpoint.methods[0] || 'GET';
			requestBody = selectedMethod === 'GET' ? '' : '{}';
			responseData = null;
			responseStatus = null;
			responseTime = null;
			errorMessage = null;
		}
	});

	async function sendRequest() {
		if (!endpoint) return;

		isLoading = true;
		errorMessage = null;
		const startTime = Date.now();

		try {
			const options: RequestInit = {
				method: selectedMethod,
				headers: {
					'Content-Type': 'application/json',
					...parseJSON(requestHeaders)
				}
			};

			if (selectedMethod !== 'GET' && requestBody.trim()) {
				options.body = requestBody;
			}

			const response = await fetch(endpoint.path, options);
			responseStatus = response.status;
			responseTime = Date.now() - startTime;

			const contentType = response.headers.get('content-type');
			if (contentType?.includes('application/json')) {
				responseData = await response.json();
			} else {
				responseData = await response.text();
			}
		} catch (err) {
			errorMessage = err instanceof Error ? err.message : 'Request failed';
			responseStatus = null;
			responseData = null;
		} finally {
			isLoading = false;
		}
	}

	function parseJSON(str: string): any {
		try {
			return JSON.parse(str);
		} catch {
			return {};
		}
	}

	function formatJSON(obj: any): string {
		return JSON.stringify(obj, null, 2);
	}

	function handleOverlayClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			open = false;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			open = false;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open && endpoint}
	<div class="modal-overlay" onclick={handleOverlayClick} transition:fade={{ duration: 200 }} role="presentation">
		<div class="api-tester-modal" transition:fly={{ y: 50, duration: 300 }} role="dialog" aria-modal="true">
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title">API ENDPOINT TESTER</div>
				<button class="modal-close" onclick={() => (open = false)}>[X]</button>
			</div>

			<!-- Endpoint Info -->
			<div class="endpoint-info">
				<div class="endpoint-path-display">
					<span class="method-label" style="color: {selectedMethod === 'GET' ? '#33ff33' : selectedMethod === 'POST' ? '#ffff33' : '#3399ff'}">
						{selectedMethod}
					</span>
					<span class="path-label">{endpoint.path}</span>
				</div>
				{#if endpoint.description}
					<div class="endpoint-desc">{endpoint.description}</div>
				{/if}
			</div>

			<!-- Request Section -->
			<div class="request-section">
				<div class="section-header">REQUEST</div>

				<!-- Method Selector -->
				<div class="form-row">
					<label class="form-label">METHOD</label>
					<select bind:value={selectedMethod} class="method-select">
						{#each endpoint.methods as method}
							<option value={method}>{method}</option>
						{/each}
					</select>
				</div>

				<!-- Request Headers -->
				<div class="form-row">
					<label class="form-label">HEADERS (JSON)</label>
					<textarea
						bind:value={requestHeaders}
						class="json-input"
						rows="3"
						placeholder="Enter JSON headers"
					></textarea>
				</div>

				<!-- Request Body -->
				{#if selectedMethod !== 'GET'}
					<div class="form-row">
						<label class="form-label">BODY (JSON)</label>
						<textarea
							bind:value={requestBody}
							class="json-input"
							rows="8"
							placeholder="Enter JSON body"
						></textarea>
					</div>
				{/if}

				<!-- Send Button -->
				<div class="form-row">
					<button
						class="send-btn"
						onclick={sendRequest}
						disabled={isLoading}
					>
						{isLoading ? 'SENDING...' : 'SEND REQUEST'}
					</button>
				</div>
			</div>

			<!-- Response Section -->
			{#if responseData !== null || errorMessage}
				<div class="response-section">
					<div class="section-header">
						RESPONSE
						{#if responseStatus !== null}
							<span class="status-badge" class:status-success={responseStatus >= 200 && responseStatus < 300} class:status-error={responseStatus >= 400}>
								{responseStatus}
							</span>
						{/if}
						{#if responseTime !== null}
							<span class="time-badge">{responseTime}ms</span>
						{/if}
					</div>

					{#if errorMessage}
						<div class="error-display">
							<span class="error-icon">❌</span>
							<span class="error-text">{errorMessage}</span>
						</div>
					{:else}
						<div class="response-display">
							<pre class="response-json">{typeof responseData === 'string' ? responseData : formatJSON(responseData)}</pre>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ── Modal Overlay ── */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.85);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	/* ── Modal Container ── */
	.api-tester-modal {
		background: #0c0c0c;
		border: 2px solid #3399ff;
		max-width: 900px;
		width: 100%;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		font-family: 'Courier New', 'Consolas', monospace;
		color: #33ff33;
		box-shadow: 0 0 20px rgba(51, 153, 255, 0.3);
	}

	/* ── Header ── */
	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #3399ff;
		background: #001a33;
	}

	.modal-title {
		font-weight: bold;
		font-size: 0.9rem;
		letter-spacing: 0.15em;
		color: #3399ff;
	}

	.modal-close {
		background: none;
		border: 1px solid #3399ff;
		color: #3399ff;
		font-family: inherit;
		font-size: 0.8rem;
		cursor: pointer;
		padding: 0.2rem 0.5rem;
	}

	.modal-close:hover {
		background: #3399ff;
		color: #000;
	}

	/* ── Endpoint Info ── */
	.endpoint-info {
		padding: 1rem;
		background: #001a33;
		border-bottom: 1px solid #1a3a5a;
	}

	.endpoint-path-display {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 0.5rem;
	}

	.method-label {
		font-weight: bold;
		font-size: 0.85rem;
		padding: 0.2rem 0.5rem;
		border: 1px solid currentColor;
	}

	.path-label {
		font-size: 0.9rem;
		color: #55ff55;
		font-weight: bold;
	}

	.endpoint-desc {
		font-size: 0.75rem;
		color: #aaaaaa;
		line-height: 1.4;
	}

	/* ── Sections ── */
	.request-section,
	.response-section {
		padding: 1rem;
		overflow-y: auto;
	}

	.request-section {
		border-bottom: 1px solid #1a3a5a;
	}

	.section-header {
		font-weight: bold;
		font-size: 0.8rem;
		letter-spacing: 0.15em;
		color: #3399ff;
		margin-bottom: 1rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.status-badge {
		font-size: 0.7rem;
		padding: 0.15rem 0.4rem;
		border: 1px solid;
		background: rgba(51, 153, 255, 0.1);
	}

	.status-badge.status-success {
		color: #33ff33;
		border-color: #33ff33;
		background: rgba(51, 255, 51, 0.1);
	}

	.status-badge.status-error {
		color: #ff3333;
		border-color: #ff3333;
		background: rgba(255, 51, 51, 0.1);
	}

	.time-badge {
		font-size: 0.7rem;
		color: #ffaa33;
		padding: 0.15rem 0.4rem;
		border: 1px solid #ffaa33;
		background: rgba(255, 170, 51, 0.1);
	}

	/* ── Form Rows ── */
	.form-row {
		margin-bottom: 1rem;
	}

	.form-label {
		display: block;
		font-size: 0.7rem;
		color: #66aaff;
		margin-bottom: 0.3rem;
		letter-spacing: 0.1em;
	}

	.method-select {
		width: 100%;
		background: #0a0a0a;
		border: 1px solid #3399ff;
		color: #3399ff;
		padding: 0.4rem 0.6rem;
		font-family: inherit;
		font-size: 0.85rem;
		cursor: pointer;
	}

	.method-select:focus {
		outline: 1px solid #3399ff;
	}

	.json-input {
		width: 100%;
		background: #0a0a0a;
		border: 1px solid #3399ff;
		color: #33ff33;
		padding: 0.5rem;
		font-family: 'Courier New', monospace;
		font-size: 0.8rem;
		resize: vertical;
		line-height: 1.5;
	}

	.json-input:focus {
		outline: 1px solid #3399ff;
	}

	.json-input::placeholder {
		color: #1a5a8a;
	}

	/* ── Send Button ── */
	.send-btn {
		width: 100%;
		background: #3399ff;
		border: 1px solid #3399ff;
		color: #000;
		padding: 0.6rem 1rem;
		font-family: inherit;
		font-size: 0.85rem;
		font-weight: bold;
		cursor: pointer;
		letter-spacing: 0.1em;
		transition: all 0.15s;
	}

	.send-btn:hover:not(:disabled) {
		background: #55aaff;
	}

	.send-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* ── Response Display ── */
	.response-display {
		background: #0a0a0a;
		border: 1px solid #3399ff;
		max-height: 400px;
		overflow: auto;
	}

	.response-json {
		margin: 0;
		padding: 1rem;
		font-family: 'Courier New', monospace;
		font-size: 0.75rem;
		color: #33ff33;
		line-height: 1.6;
		white-space: pre-wrap;
		word-break: break-all;
	}

	/* ── Error Display ── */
	.error-display {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: rgba(255, 51, 51, 0.1);
		border: 1px solid #ff3333;
	}

	.error-icon {
		font-size: 1.2rem;
		flex-shrink: 0;
	}

	.error-text {
		color: #ff6666;
		font-size: 0.85rem;
	}

	/* ── Scrollbars ── */
	.response-display::-webkit-scrollbar,
	.request-section::-webkit-scrollbar,
	.response-section::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}

	.response-display::-webkit-scrollbar-track,
	.request-section::-webkit-scrollbar-track,
	.response-section::-webkit-scrollbar-track {
		background: rgba(0, 0, 0, 0.3);
	}

	.response-display::-webkit-scrollbar-thumb,
	.request-section::-webkit-scrollbar-thumb,
	.response-section::-webkit-scrollbar-thumb {
		background: #3399ff;
		border-radius: 4px;
	}
</style>
