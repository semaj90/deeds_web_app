<script lang="ts">
	interface Props {
		text?: string;
		speed?: number;
		showCursor?: boolean;
		cursorChar?: string;
		enableThinking?: boolean;
		autoStart?: boolean;
		showControls?: boolean;
		oncomplete?: () => void;
	}

	let {
		text = '',
		speed = 50,
		showCursor = true,
		cursorChar = '\u258B',
		enableThinking = true,
		autoStart = true,
		showControls = false,
		oncomplete
	}: Props = $props();

	let displayedText = $state('');
	let isTyping = $state(false);
	let isPaused = $state(false);
	let cursorVisible = $state(true);
	let thinkingPhase = $state<'analyzing' | 'processing' | 'generating' | 'complete'>('complete');
	let thinkingProgress = $state(0);
	let thinkingThought = $state('');

	let typingTimer: ReturnType<typeof setTimeout> | null = null;
	let cursorTimer: ReturnType<typeof setInterval> | null = null;
	let thinkingTimer: ReturnType<typeof setInterval> | null = null;

	const thinkingPhrases: Record<string, string[]> = {
		analyzing: ['Analyzing legal context...', 'Processing case precedents...', 'Reviewing contract clauses...'],
		processing: ['Cross-referencing legal databases...', 'Applying legal reasoning models...', 'Evaluating risk factors...'],
		generating: ['Crafting legal analysis...', 'Structuring recommendations...', 'Finalizing response...']
	};

	function clearTimers() {
		if (typingTimer) clearTimeout(typingTimer);
		if (cursorTimer) clearInterval(cursorTimer);
		if (thinkingTimer) clearInterval(thinkingTimer);
	}

	async function startTypewriter() {
		if (isTyping) return;
		isTyping = true;
		displayedText = '';

		if (enableThinking) {
			await showThinking();
		}

		await typeText(text, speed);
		oncomplete?.();
	}

	function showThinking(): Promise<void> {
		return new Promise((resolve) => {
			thinkingPhase = 'analyzing';
			thinkingProgress = 0;
			const phases: string[] = ['analyzing', 'processing', 'generating'];
			let phaseIdx = 0;

			thinkingTimer = setInterval(() => {
				const phase = phases[phaseIdx];
				thinkingPhase = phase as typeof thinkingPhase;
				const thoughts = thinkingPhrases[phase] ?? [];
				thinkingThought = thoughts[Math.floor(Math.random() * thoughts.length)] ?? 'Processing...';
				thinkingProgress += 10 + Math.random() * 15;

				if (thinkingProgress > 33 && phaseIdx < 1) phaseIdx = 1;
				if (thinkingProgress > 66 && phaseIdx < 2) phaseIdx = 2;

				if (thinkingProgress >= 100) {
					if (thinkingTimer) clearInterval(thinkingTimer);
					thinkingPhase = 'complete';
					thinkingProgress = 100;
					resolve();
				}
			}, 300);
		});
	}

	function typeText(content: string, typingSpeed: number): Promise<void> {
		return new Promise((resolve) => {
			let idx = 0;
			const type = () => {
				if (idx < content.length && !isPaused) {
					const char = content[idx];
					displayedText += char;
					idx++;
					const variance = char === ' ' ? typingSpeed * 0.5
						: (char === '.' || char === '!' || char === '?') ? typingSpeed * 2
						: typingSpeed;
					typingTimer = setTimeout(type, variance + Math.random() * 20 - 10);
				} else {
					isTyping = false;
					thinkingPhase = 'complete';
					resolve();
				}
			};
			type();
		});
	}

	function pause() { isPaused = true; }
	function resume() { isPaused = false; }
	function stop() { clearTimers(); isTyping = false; isPaused = false; }
	function restart() { stop(); displayedText = ''; startTypewriter(); }

	$effect(() => {
		cursorTimer = setInterval(() => { cursorVisible = !cursorVisible; }, 530);
		if (autoStart && text) startTypewriter();
		return () => clearTimers();
	});
</script>

{#if enableThinking && thinkingPhase !== 'complete' && isTyping && !displayedText}
	<div class="thinking-container">
		<div class="thinking-indicator">
			<div class="thinking-dots">
				<span class="dot" style="animation-delay: 0ms"></span>
				<span class="dot" style="animation-delay: 150ms"></span>
				<span class="dot" style="animation-delay: 300ms"></span>
			</div>
			<div class="thinking-text">{thinkingThought || 'Processing...'}</div>
			<div class="thinking-progress">
				<div class="progress-bar" style="width: {thinkingProgress}%"></div>
			</div>
		</div>
	</div>
{/if}

<div class="typewriter-container">
	<span class="typewriter-text">{displayedText}</span>
	{#if showCursor}
		<span class="typewriter-cursor" class:visible={cursorVisible} class:hidden={!cursorVisible} class:blinking={!isTyping}>
			{cursorChar}
		</span>
	{/if}
</div>

{#if showControls}
	<div class="typewriter-controls">
		<button onclick={pause} disabled={!isTyping || isPaused}>Pause</button>
		<button onclick={resume} disabled={!isPaused}>Resume</button>
		<button onclick={restart}>Restart</button>
		<button onclick={stop}>Stop</button>
	</div>
{/if}

<style>
	.typewriter-container {
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		line-height: 1.6;
		position: relative;
	}
	.typewriter-text {
		white-space: pre-wrap;
		word-wrap: break-word;
	}
	.typewriter-cursor {
		color: #00ff00;
		font-weight: bold;
		transition: opacity 0.1s;
	}
	.typewriter-cursor.visible { opacity: 1; }
	.typewriter-cursor.hidden { opacity: 0; }
	.typewriter-cursor.blinking { animation: blink 1.06s infinite; }
	@keyframes blink {
		0%, 50% { opacity: 1; }
		51%, 100% { opacity: 0; }
	}
	.thinking-container {
		padding: 1rem;
		background: rgba(0, 255, 0, 0.05);
		border: 1px solid rgba(0, 255, 0, 0.2);
		border-radius: 0.5rem;
		margin-bottom: 1rem;
	}
	.thinking-indicator {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}
	.thinking-dots {
		display: flex;
		gap: 0.25rem;
	}
	.dot {
		width: 0.5rem;
		height: 0.5rem;
		background: #00ff00;
		border-radius: 50%;
		display: inline-block;
		animation: dotPulse 1.2s infinite;
	}
	@keyframes dotPulse {
		0%, 100% { opacity: 0.3; transform: scale(0.8); }
		50% { opacity: 1; transform: scale(1); }
	}
	.thinking-text {
		font-size: 0.875rem;
		color: #00ff00;
		text-align: center;
		font-style: italic;
	}
	.thinking-progress {
		width: 100%;
		height: 0.25rem;
		background: rgba(0, 255, 0, 0.1);
		border-radius: 0.125rem;
		overflow: hidden;
	}
	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #00ff00, #00ff88);
		transition: width 0.3s ease;
	}
	.typewriter-controls {
		margin-top: 1rem;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.1);
		border-radius: 0.5rem;
		font-size: 0.875rem;
	}
	.typewriter-controls button {
		margin-right: 0.5rem;
		padding: 0.25rem 0.5rem;
		background: #333;
		color: #00ff00;
		border: 1px solid #00ff00;
		border-radius: 0.25rem;
		cursor: pointer;
	}
	.typewriter-controls button:hover:not(:disabled) {
		background: rgba(0, 255, 0, 0.1);
	}
	.typewriter-controls button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
