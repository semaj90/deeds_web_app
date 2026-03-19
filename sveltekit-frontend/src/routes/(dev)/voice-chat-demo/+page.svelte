<script lang="ts">
import SimpleWorkingChat from '$lib/components/ai/SimpleWorkingChat.svelte';
import Icon from '$lib/components/ui/Icon.svelte';

let demoMode = $state<'basic' | 'handsfree'>('basic');
</script>

<svelte:head>
	<title>Voice Chat Demo | Legal AI</title>
</svelte:head>

<div class="voice-chat-demo-page">
	<header class="page-header">
		<h1>VOICE_ENABLED_CHAT</h1>
		<p class="subtitle">Bidirectional voice conversation with AI — Speech-to-Text + Text-to-Speech + Hands-Free Mode</p>
	</header>

	<div class="demo-container">
		<!-- Mode Selector -->
		<div class="mode-selector">
			<button
				class="mode-btn"
				class:active={demoMode === 'basic'}
				onclick={() => demoMode = 'basic'}
			>
				<Icon name="mic" size={18} />
				<span>Basic Mode</span>
			</button>
			<button
				class="mode-btn"
				class:active={demoMode === 'handsfree'}
				onclick={() => demoMode = 'handsfree'}
			>
				<Icon name="radio" size={18} />
				<span>🔴 Hands-Free Mode</span>
			</button>
		</div>

		<!-- Features Grid -->
		<div class="features-grid">
			{#if demoMode === 'basic'}
				<div class="feature-card">
					<Icon name="mic" size={24} />
					<h3>Voice Input</h3>
					<p>Web Speech API for real-time speech recognition. Click the microphone to speak your question.</p>
				</div>
				<div class="feature-card">
					<Icon name="volume-2" size={24} />
					<h3>TTS Output</h3>
					<p>Piper neural TTS speaks AI responses. Click the volume icon on any assistant message.</p>
				</div>
				<div class="feature-card">
					<Icon name="message-circle" size={24} />
					<h3>Dual Mode</h3>
					<p>Switch between typing and voice seamlessly. Interim transcripts show live as you speak.</p>
				</div>
			{:else}
				<div class="feature-card">
					<Icon name="radio" size={24} />
					<h3>Auto-Listen</h3>
					<p>AI automatically listens for your next question after speaking its response. No buttons needed.</p>
				</div>
				<div class="feature-card">
					<Icon name="zap" size={24} />
					<h3>Auto-Send</h3>
					<p>Your speech auto-sends after 2 seconds of silence. Speak naturally without clicking.</p>
				</div>
				<div class="feature-card">
					<Icon name="shield" size={24} />
					<h3>Interrupt</h3>
					<p>Start speaking while AI talks to interrupt and ask a new question immediately.</p>
				</div>
			{/if}
		</div>

		<!-- Chat Wrapper with Conditional Hands-Free -->
		<div class="chat-wrapper">
			<SimpleWorkingChat
				chatId={demoMode === 'handsfree' ? 'voice-demo-handsfree' : 'voice-demo-basic'}
				height="600px"
				enableVoice={true}
				handsFree={demoMode === 'handsfree'}
				silenceThreshold={2000}
			/>
		</div>

		<!-- Mode-Specific Instructions -->
		<div class="info-panel">
			{#if demoMode === 'basic'}
				<h3><Icon name="info" size={16} /> Basic Mode — Manual Control</h3>
				<ol>
					<li><strong>Voice Input:</strong> Click the <Icon name="mic" size={12} /> microphone button, speak your question, then click <Icon name="mic-off" size={12} /> to stop or wait for auto-detection. Your speech appears as you talk.</li>
					<li><strong>Speak Response:</strong> After the AI responds, click the <Icon name="volume-2" size={12} /> volume icon next to any assistant message to hear it spoken aloud.</li>
					<li><strong>Mixed Mode:</strong> Type and speak interchangeably. Voice input appends to the text box, allowing you to edit before sending.</li>
					<li><strong>Browser Support:</strong> Voice input requires Chrome, Edge, or Safari. TTS works in all modern browsers.</li>
				</ol>
			{:else}
				<h3><Icon name="radio" size={16} /> 🔴 Hands-Free Mode — True Conversation</h3>
				<ol>
					<li><strong>Enable:</strong> Click the "🎧 Hands-Free" button in the chat header. It turns into "🔴 Live" when active.</li>
					<li><strong>Speak Naturally:</strong> Just talk — the AI listens continuously. After 2 seconds of silence, your message auto-sends.</li>
					<li><strong>AI Auto-Speaks:</strong> The AI automatically speaks its response via TTS. No volume button needed.</li>
					<li><strong>AI Auto-Listens:</strong> After the AI finishes speaking, it automatically starts listening for your next question (500ms delay).</li>
					<li><strong>Interrupt Anytime:</strong> Start speaking while the AI is talking — it stops immediately and listens to you.</li>
					<li><strong>No Clicks Required:</strong> After enabling hands-free, have an entire conversation without touching your keyboard or mouse.</li>
				</ol>
				<div class="warning-box">
					<Icon name="circle-alert" size={14} />
					<span><strong>Note:</strong> Hands-free mode works best in a quiet environment. Background noise may trigger false positives.</span>
				</div>
			{/if}
		</div>
	</div>

	<footer class="page-footer">
		<div class="tech-stack">
			<span class="tech-badge">Web Speech API</span>
			<span class="tech-badge">Piper TTS</span>
			<span class="tech-badge">ONNX Runtime</span>
			<span class="tech-badge">ChatSession Router</span>
			<span class="tech-badge">SSE Streaming</span>
			<span class="tech-badge">Voice Activity Detection</span>
		</div>
	</footer>
</div>

<style>
	.voice-chat-demo-page {
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

	.demo-container {
		max-width: 1200px;
		margin: 0 auto;
	}

	.mode-selector {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.75rem 1.5rem;
		background: var(--yorha-bg-secondary, #1a1a1a);
		border: 2px solid var(--yorha-border-primary, #333);
		color: var(--yorha-text-secondary, #b8b8b8);
		border-radius: 8px;
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.mode-btn:hover {
		border-color: var(--yorha-accent, #ffd700);
		color: var(--yorha-accent, #ffd700);
	}

	.mode-btn.active {
		background: rgba(255, 215, 0, 0.1);
		border-color: var(--yorha-accent, #ffd700);
		color: var(--yorha-accent, #ffd700);
	}

	.features-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 1rem;
		margin-bottom: 2rem;
	}

	.feature-card {
		background: var(--yorha-bg-secondary, #1a1a1a);
		border: 1px solid var(--yorha-border-primary, #333);
		border-radius: 8px;
		padding: 1.5rem;
		text-align: center;
	}

	.feature-card :global(.i-lucide-mic),
	.feature-card :global(.i-lucide-volume-2),
	.feature-card :global(.i-lucide-message-circle),
	.feature-card :global(.i-lucide-radio),
	.feature-card :global(.i-lucide-zap),
	.feature-card :global(.i-lucide-shield) {
		color: var(--yorha-accent, #ffd700);
		margin-bottom: 1rem;
	}

	.feature-card h3 {
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		font-size: 1rem;
		margin: 0 0 0.5rem 0;
		color: var(--yorha-text-primary, #e8e8e8);
	}

	.feature-card p {
		font-size: 0.875rem;
		color: var(--yorha-text-secondary, #b8b8b8);
		line-height: 1.6;
		margin: 0;
	}

	.chat-wrapper {
		margin-bottom: 2rem;
	}

	.info-panel {
		background: var(--yorha-bg-secondary, #1a1a1a);
		border: 2px solid var(--yorha-accent, #ffd700);
		border-radius: 8px;
		padding: 1.5rem;
	}

	.info-panel h3 {
		font-family: var(--yorha-font-primary, 'JetBrains Mono', monospace);
		font-size: 1rem;
		margin: 0 0 1rem 0;
		color: var(--yorha-accent, #ffd700);
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.info-panel ol {
		margin: 0;
		padding-left: 1.5rem;
		color: var(--yorha-text-secondary, #b8b8b8);
		line-height: 1.8;
	}

	.info-panel li {
		margin-bottom: 0.75rem;
		font-size: 0.875rem;
	}

	.info-panel strong {
		color: var(--yorha-text-primary, #e8e8e8);
	}

	.info-panel :global(.i-lucide-mic),
	.info-panel :global(.i-lucide-mic-off),
	.info-panel :global(.i-lucide-volume-2),
	.info-panel :global(.i-lucide-info),
	.info-panel :global(.i-lucide-radio),
	.info-panel :global(.i-lucide-alert-circle) {
		display: inline-block;
		vertical-align: middle;
	}

	.warning-box {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(255, 165, 0, 0.1);
		border: 1px solid rgba(255, 165, 0, 0.3);
		border-radius: 6px;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: var(--yorha-text-secondary, #b8b8b8);
	}

	.warning-box :global(.i-lucide-alert-circle) {
		color: #ffa500;
		flex-shrink: 0;
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
