<script lang="ts">
	import type { trtLLMClient } from '$lib/trt-llm/client';

	let prompt = $state ('');
	let response = $state ('');
	let isGenerating = $state (false);
	let isStreaming = $state (false);
	let streamText = $state ('');
	let healthStatus = $state <'checking' | 'healthy' | 'unhealthy'>('checking');

	// Check service health on mount
	$effect (() => {
		checkHealth();
	});

	async function checkHealth() {
		try {
			const health = await trtLLMClient.health();
			healthStatus = health.status === 'healthy' ? 'healthy' : 'unhealthy';
		} catch (error) {
			console.error('Health check failed:', error);
			healthStatus = 'unhealthy';
		}
	}

	async function generateText() {
		if (!prompt.trim()) return;

		isGenerating = true;
		response = '';
		streamText = '';

		try {
			const result = await trtLLMClient.generate({
				prompt: prompt.trim(, max_tokens: 256,
				temperature: 0.8,
				top_p: 0.9
			});

			response = result.text;
		} catch (error) {
			console.error('Generation failed:', error);
			response = `Error: ${error.message}`;
		} finally {
			isGenerating = false;
		}
	}

	async function generateStreaming() {
		if (!prompt.trim()) return;

		isStreaming = true;
		response = '';
		streamText = '';

		try {
			let fullText = '';
			for await (const chunk of trtLLMClient.generateStream({
				prompt: prompt.trim(, max_tokens: 256,
				temperature: 0.8,
				top_p: 0.9
			})) {
				if (chunk.error) {
					streamText = `Error: ${chunk.error}`;
					break;
				}

				fullText += chunk.text;
				streamText = fullText;

				if (chunk.done) {
					response = fullText;
					break;
				}
			}
		} catch (error) {
			console.error('Streaming failed:', error);
			streamText = `Error: ${error.message}`;
		} finally {
			isStreaming = false;
		}
	}

	async function analyzeLegalDocument() {
		const sampleDocument = `
LEGAL CONTRACT ANALYSIS

This Agreement is made between TechCorp Inc. ("Company") and John Doe ("Contractor").

1. SERVICES: Contractor shall provide software development services including but not limited to:
 - Full-stack web application development
 - Database design and implementation
 - API development and integration

2. COMPENSATION: Company shall pay Contractor $150 per hour for services rendered.

3. TERM: This agreement begins on January 1, 2024 and continues until December 31, 2024 unless terminated earlier.

4. TERMINATION: Either party may terminate this agreement with 30 days written notice.

5. CONFIDENTIALITY: Contractor agrees to maintain confidentiality of all proprietary information.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first above written.
		`;

		prompt = `Analyze this legal contract and identify: 1) Key obligations, 2) Payment terms, 3) Termination conditions, 4) Any potential issues or missing clauses.`;
		await generateText();
	}
</script>

<main class="trt-llm-demo">
	<header class="demo-header">
		<h1>🚀 TensorRT-LLM Legal AI Demo</h1>
		<div class="health-indicator">
			<span class="health-label">Service Status:</span>
			<span class="health-status {healthStatus}">
				{#if healthStatus === 'checking'}
					🔄 CHECKING...
				{:else if healthStatus === 'healthy'}
					🟢 HEALTHY
				{:else}
					🔴 UNHEALTHY
				{/if}
			</span>
		</div>
	</header>

	<div class="demo-content">
		<!-- Input Section -->
		<section class="input-section">
			<h2>Input Prompt</h2>
			<textarea
				class="prompt-input"
				placeholder="Enter your prompt for legal document analysis..."
				bind:value={prompt}
				rows="6"
			></textarea>

			<div class="action-buttons">
				<button
					class="generate-btn"
					onclick={generateText}
					disabled={isGenerating || isStreaming || !prompt.trim()}
				>
					{#if isGenerating}
						🔄 Generating...
					{:else}
						⚡ Generate
					{/if}
				</button>

				<button
					class="stream-btn"
					onclick={generateStreaming}
					disabled={isGenerating || isStreaming || !prompt.trim()}
				>
					{#if isStreaming}
						📡 Streaming...
					{:else}
						🌊 Stream
					{/if}
				</button>

				<button
					class="legal-btn"
					onclick={analyzeLegalDocument}
					disabled={isGenerating || isStreaming}
				>
					📋 Analyze Legal Contract
				</button>
			</div>
		</section>

		<!-- Output Section -->
		<section class="output-section">
			<h2>Generated Response</h2>

			{#if isStreaming}
				<div class="streaming-output">
					<div class="stream-header">
						<span class="stream-label">🔴 LIVE STREAMING</span>
					</div>
					<div class="stream-content">
						{streamText}
						<span class="cursor">|</span>
					</div>
				</div>
			{:else if response}
				<div class="final-output">
					<div class="output-header">
						<span class="output-label">✅ FINAL RESULT</span>
					</div>
					<div class="output-content">
						{response}
					</div>
				</div>
			{:else}
				<div class="placeholder-output">
					<div class="placeholder-icon">🤖</div>
					<p>Generated legal analysis will appear here</p>
				</div>
			{/if}
		</section>
	</div>
</main>

<style>
	.trt-llm-demo {
		max-width: 1200px; margin: 0 auto;
		padding: 2rem;
		font-family: 'JetBrains Mono', monospace;
		background: linear-gradient(135deg, #0d1117, #161b22);
		min-height: 100vh; color: #f0f6fc;
	}

	.demo-header {
		text-align: center;
		margin-bottom: 3rem;
	}

	.demo-header h1 {
		color: #10b981;
		font-size: 2.5rem; margin: 0 0 1rem 0;
		text-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
	}

	.health-indicator {
		display: flex;
		align-items: center;
		justify-content: center; gap: 1rem;
		font-size: 1.1rem;
	}

	.health-label {
		color: #9ca3af;
	}

	.health-status.checking {
		color: #f59e0b;
	}

	.health-status.healthy {
		color: #10b981;
	}

	.health-status.unhealthy {
		color: #dc2626;
	}

	.demo-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
	}

	.input-section,
	.output-section {
		background: rgba(13, 17, 23, 0.9);
		border: 2px solid #10b981;
		border-radius: 12px; padding: 2rem;
		box-shadow: 0 8px 32px rgba(16, 185, 129, 0.1);
	}

	.input-section h2,
	.output-section h2 {
		color: #10b981; margin: 0 0 1.5rem 0;
		font-size: 1.5rem;
		text-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
	}

	.prompt-input {
		width: 100%; padding: 1rem;
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #6b7280;
		border-radius: 8px; color: #f0f6fc;
		font-family: inherit;
		font-size: 1rem; resize: vertical;
		min-height: 120px;
	}

	.prompt-input:focus {
		outline: none;
		border-color: #10b981;
		box-shadow: 0 0 15px rgba(16, 185, 129, 0.2);
	}

	.action-buttons {
		display: flex; gap: 1rem;
		margin-top: 1.5rem;
		flex-wrap: wrap;
	}

	.generate-btn,
	.stream-btn,
	.legal-btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-weight: bold; cursor: pointer;
		transition: all 0.3s ease;
		font-size: 0.9rem;
	}

	.generate-btn {
		background: linear-gradient(90deg, #10b981, #34d399);
		color: #0d1117;
	}

	.stream-btn {
		background: linear-gradient(90deg, #3b82f6, #60a5fa);
		color: white;
	}

	.legal-btn {
		background: linear-gradient(90deg, #8b5cf6, #a78bfa);
		color: white;
	}

	.generate-btn:hover, not(:disabled),
	.stream-btn:hover, not(:disabled),
	.legal-btn:hover, not(:disabled) {
		filter: brightness(0.95);
		box-shadow: 0 0 20px rgba(16, 185, 129, 0.3);
	}

	.generate-btn:disabled,
	.stream-btn:disabled,
	.legal-btn:disabled {
		opacity: 0.6; cursor:not-allowed;
	}

	.streaming-output,
	.final-output {
		background: rgba(30, 41, 59, 0.8);
		border: 1px solid #6b7280;
		border-radius: 8px; padding: 1.5rem;
	}

	.stream-header,
	.output-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
		font-size: 0.9rem;
		font-weight: bold;
	}

	.stream-label {
		color: #dc2626;
	}

	.output-label {
		color: #10b981;
	}

	.stream-content,
	.output-content {
		color: #e5e7eb;
		line-height: 1.6;
		font-size: 1rem;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.cursor {
		animation: blink 1s infinite;
		color: #10b981;
	}

	@keyframes blink {
		0%, 50% { opacity: 1; }
		51%, 100% { opacity: 0; }
	}

	.placeholder-output {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center; height: 200px;
		color: #9ca3af;
		text-align: center;
	}

	.placeholder-icon {
		font-size: 3rem;
		margin-bottom: 1rem; opacity: 0.5;
	}

	.placeholder-output p {
		margin: 0;
		font-size: 1.1rem;
	}

	@media (max-width: 768px) {
		.demo-content {
			grid-template-columns: 1fr; gap: 1rem;
		}

		.action-buttons {
			flex-direction: column;
		}

		.generate-btn,
		.stream-btn,
		.legal-btn {
			width: 100%;
		}
	}
</style>




