<script lang="ts">
import TTSDemo from '$lib/components/demos/TTSDemo.svelte';
</script>

<svelte:head>
	<title>Piper TTS Demo | Legal AI</title>
</svelte:head>

<div class="tts-demo-page">
	<header class="page-header">
		<h1>NEURAL_TEXT_TO_SPEECH</h1>
		<p class="subtitle">Piper TTS — Offline ONNX-powered voice synthesis</p>
	</header>

	<TTSDemo />

	<footer class="page-footer">
		<div class="tech-stack">
			<span class="tech-badge">Piper TTS</span>
			<span class="tech-badge">ONNX Runtime</span>
			<span class="tech-badge">Web Audio API</span>
			<span class="tech-badge">61MB Model</span>
		</div>
	</footer>
</div>

<style>
	.tts-demo-page {
		min-height: 100vh;
		background: var(--yorha-bg-primary, #0a0a0a);
		color: var(--yorha-text-primary, #e8e8e8);
		padding: 2rem;
	}

	.page-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-family: var(--yorha-font-secondary, 'Orbitron', sans-serif);
		font-size: 2.5rem;
		color: var(--yorha-accent, #ffd700);
		text-transform: uppercase;
		letter-spacing: 0.1em;
		margin: 0;
		text-shadow: 0 0 20px rgba(255, 215, 0, 0.3);
	}

	.subtitle {
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		color: var(--yorha-text-secondary, #b8b8b8);
		margin-top: 0.5rem;
		font-size: 0.875rem;
		letter-spacing: 0.05em;
	}

	.page-footer {
		margin-top: 3rem;
		padding-top: 2rem;
		border-top: 1px solid var(--yorha-border-primary, #333);
	}

	.tech-stack {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.tech-badge {
		background: var(--yorha-bg-card, #1f1f1f);
		border: 1px solid var(--yorha-border-accent, #d4af37);
		color: var(--yorha-accent, #ffd700);
		padding: 0.5rem 1rem;
		border-radius: 4px;
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>