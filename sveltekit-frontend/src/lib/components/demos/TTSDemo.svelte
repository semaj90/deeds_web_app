<script lang="ts">
/**
 * Piper TTS Demo Component
 * Tests the neural text-to-speech service with YoRHa styling
 */
import { ttsService } from '$lib/services/tts';
import Button from '$lib/components/ui/Button.svelte';
import Icon from '$lib/components/ui/Icon.svelte';

let textInput = $state('The defendant is hereby found guilty on all charges. Sentence will be rendered after review of pre-sentencing reports.');
let isSpeaking = $state(false);
let isInitializing = $state(false);
let rate = $state(1.0);
let volume = $state(0.8);
let error = $state<string | null>(null);

// Sample legal texts
const samples = [
	'The defendant is hereby found guilty on all charges.',
	'Pursuant to the Fourth Amendment, the search was deemed unconstitutional.',
	'The court grants summary judgment in favor of the plaintiff.',
	'We find that the preponderance of evidence supports the petitioner\'s claim.',
	'The jury deliberated for twelve hours before reaching a unanimous verdict.'
];

async function speak() {
	if (isSpeaking) {
		ttsService.stop();
		isSpeaking = false;
		return;
	}

	error = null;
	isSpeaking = true;

	try {
		// Initialize on first use
		if (!ttsService.isReady()) {
			isInitializing = true;
		}

		await ttsService.speak(textInput, { rate, volume });
	} catch (err) {
		error = err instanceof Error ? err.message : 'Speech synthesis failed';
		console.error('[TTS Demo] Error:', err);
	} finally {
		isSpeaking = false;
		isInitializing = false;
	}
}

function loadSample(text: string) {
	textInput = text;
}
</script>

<div class="tts-demo">
	<header class="demo-header">
		<h2>PIPER_TTS_DEMO</h2>
		<div class="status">
			{#if isInitializing}
				<span class="badge loading">Loading Model...</span>
			{:else if ttsService.isReady()}
				<span class="badge ready">Ready</span>
			{:else}
				<span class="badge idle">Idle</span>
			{/if}
		</div>
	</header>

	<div class="demo-content">
		<!-- Text Input -->
		<div class="input-section">
			<label for="tts-text">Text to Speak</label>
			<textarea
				id="tts-text"
				bind:value={textInput}
				rows="4"
				placeholder="Enter legal text to synthesize..."
				disabled={isSpeaking}></textarea>
			<div class="char-count">{textInput.length} characters</div>
		</div>

		<!-- Sample Texts -->
		<div class="samples-section">
			<label>Sample Legal Texts</label>
			<div class="samples-grid">
				{#each samples as sample}
					<button
						class="sample-btn"
						onclick={() => loadSample(sample)}
						disabled={isSpeaking}
					>
						{sample.slice(0, 50)}...
					</button>
				{/each}
			</div>
		</div>

		<!-- Controls -->
		<div class="controls-section">
			<div class="control-group">
				<label for="rate">Speed: {rate.toFixed(1)}x</label>
				<input
					type="range"
					id="rate"
					bind:value={rate}
					min="0.5"
					max="2.0"
					step="0.1"
					disabled={isSpeaking}
				/>
			</div>

			<div class="control-group">
				<label for="volume">Volume: {Math.round(volume * 100)}%</label>
				<input
					type="range"
					id="volume"
					bind:value={volume}
					min="0"
					max="1"
					step="0.1"
					disabled={isSpeaking}
				/>
			</div>
		</div>

		<!-- Error Display -->
		{#if error}
			<div class="error-box">
				<Icon name="triangle-alert" />
				{error}
			</div>
		{/if}

		<!-- Speak Button -->
		<div class="action-section">
			<Button
				onclick={speak}
				disabled={!textInput.trim() || isInitializing}
				class="speak-btn {isSpeaking ? 'speaking' : ''}"
			>
				{#if isSpeaking}
					<Icon name="square" />
					Stop Speaking
				{:else if isInitializing}
					<Icon name="loader" />
					Initializing...
				{:else}
					<Icon name="volume-2" />
					Speak Text
				{/if}
			</Button>
		</div>

		<!-- Info -->
		<div class="info-box">
			<Icon name="info" />
			<div>
				<strong>Piper TTS</strong> — Neural text-to-speech using ONNX Runtime. Model: Lessac
				medium (61MB), runs offline in browser. First use loads the model (~2-3 seconds).
			</div>
		</div>
	</div>
</div>

<style>
	.tts-demo {
		max-width: 800px;
		margin: 0 auto;
		background: var(--yorha-bg-secondary, #1a1a1a);
		border: 2px solid var(--yorha-border-primary, #333);
		border-radius: 8px;
		overflow: hidden;
	}

	.demo-header {
		background: var(--yorha-bg-primary, #0a0a0a);
		padding: 1rem 1.5rem;
		border-bottom: 2px solid var(--yorha-accent, #ffd700);
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.demo-header h2 {
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		font-size: 1.25rem;
		margin: 0;
		color: var(--yorha-accent, #ffd700);
		letter-spacing: 0.05em;
	}

	.status {
		display: flex;
		gap: 0.5rem;
	}

	.badge {
		padding: 0.25rem 0.75rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.badge.ready {
		background: rgba(0, 255, 136, 0.1);
		color: var(--yorha-accent, #00ff41);
		border: 1px solid currentColor;
	}

	.badge.loading {
		background: rgba(255, 215, 0, 0.1);
		color: var(--yorha-secondary, #ffd700);
		border: 1px solid currentColor;
	}

	.badge.idle {
		background: rgba(136, 136, 136, 0.1);
		color: var(--yorha-text-muted, #888);
		border: 1px solid currentColor;
	}

	.demo-content {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.input-section label,
	.samples-section label,
	.control-group label {
		display: block;
		font-size: 0.875rem;
		color: var(--yorha-text-secondary, #b8b8b8);
		margin-bottom: 0.5rem;
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	textarea {
		width: 100%;
		background: var(--yorha-bg-tertiary, #2a2a2a);
		border: 1px solid var(--yorha-border-primary, #333);
		color: var(--yorha-text-primary, #e8e8e8);
		padding: 0.75rem;
		border-radius: 4px;
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		font-size: 0.875rem;
		resize: vertical;
	}

	textarea:focus {
		outline: none;
		border-color: var(--yorha-accent, #ffd700);
		box-shadow: 0 0 0 2px rgba(255, 215, 0, 0.1);
	}

	textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.char-count {
		text-align: right;
		font-size: 0.75rem;
		color: var(--yorha-text-muted, #888);
		margin-top: 0.25rem;
	}

	.samples-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 0.5rem;
	}

	.sample-btn {
		background: var(--yorha-bg-tertiary, #2a2a2a);
		border: 1px solid var(--yorha-border-primary, #333);
		color: var(--yorha-text-secondary, #b8b8b8);
		padding: 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s;
	}

	.sample-btn:hover:not(:disabled) {
		background: var(--yorha-bg-hover, #252525);
		border-color: var(--yorha-accent, #ffd700);
		color: var(--yorha-text-primary, #e8e8e8);
	}

	.sample-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.controls-section {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
	}

	.control-group input[type='range'] {
		width: 100%;
		accent-color: var(--yorha-accent, #ffd700);
	}

	.error-box {
		background: rgba(255, 71, 87, 0.1);
		border: 1px solid var(--yorha-error, #ff4757);
		color: var(--yorha-error, #ff4757);
		padding: 0.75rem;
		border-radius: 4px;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
	}

	.action-section {
		display: flex;
		justify-content: center;
	}

	:global(.speak-btn) {
		min-width: 200px;
		font-size: 1rem;
		padding: 0.75rem 1.5rem;
	}

	:global(.speak-btn.speaking) {
		background: var(--yorha-error, #ff4757) !important;
	}

	.info-box {
		background: rgba(74, 158, 255, 0.1);
		border: 1px solid var(--yorha-info, #4a9eff);
		color: var(--yorha-text-secondary, #b8b8b8);
		padding: 0.75rem;
		border-radius: 4px;
		display: flex;
		gap: 0.75rem;
		font-size: 0.875rem;
		line-height: 1.6;
	}

	.info-box strong {
		color: var(--yorha-info, #4a9eff);
	}
</style>
