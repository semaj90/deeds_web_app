<!--
  NES.css Typewriter Text Streaming Component
  Cached alphabet texture streaming for enhanced AI chat
  Uses quantized cached text with Nintendo-inspired styling
-->
<script lang="ts">
	// Migrated to $effect
	import { chrRomPatternCache } from '../../cache/chr-rom-pattern-cache';
	import { base64FP32Quantizer } from '../../text/base64-fp32-quantizer';

	// Props interface
	interface TypewriterProps {
		text: string;
		speed?: number;
		enableSound?: boolean;
		nesTheme?: 'classic' | 'modern' | 'legal';
		cacheTextures?: boolean;
		quantizeText?: boolean;
		maxWidth?: string;
		onComplete?: () => void;
	}

	let {
		text = '',
		speed = 50,
		enableSound = true,
		nesTheme = 'legal',
		cacheTextures = true,
		quantizeText = true,
		maxWidth = '100%',
		onComplete
	}: TypewriterProps = $props();

	// State management
	let currentIndex = $state<number>(0);
	let isTyping = $state<boolean>(false);
	let displayText = $state<string>('');
	let cursor = $state<boolean>(true);

	// Derived state
	const visibleText = $derived(displayText.slice(0, currentIndex));

	// Texture cache for alphabet characters
	interface AlphabetTexture {
		char: string;
	texture: ImageData | null;
		quantizedData: Float32Array;
	nesPattern: Uint8Array;
		cached: boolean;
	}

	const alphabetCache = new Map<string, AlphabetTexture>();
	let textureCanvas: HTMLCanvasElement;
	let textureCtx: CanvasRenderingContext2D;

	// Audio context for NES-style typing sounds
	let audioContext: AudioContext | null = null;
	let typingSoundBuffer: AudioBuffer | null = null;

	// Animation frame ID
	let animationFrame: number;
	let typewriterInterval: ReturnType<typeof setInterval> | undefined;
    let cursorBlinkInterval: ReturnType<typeof setInterval> | undefined;

	// Component references
	let containerElement: HTMLDivElement;
	let textElement: HTMLSpanElement;
	let cursorElement: HTMLSpanElement;

	$effect(() => {
		initializeTextureSystem();
		initializeAudioSystem();
		startTypewriterEffect();

		return () => {
			cleanup();
		};
	});

	function initializeTextureSystem(): void {
		if (!cacheTextures) return;

		textureCanvas = document.createElement('canvas');
		textureCanvas.width = 128;
		textureCanvas.height = 128;
		textureCtx = textureCanvas.getContext('2d')!;

		textureCtx.imageSmoothingEnabled = false;
		textureCtx.font = '8px "Courier New", monospace';
		textureCtx.textAlign = 'left';
		textureCtx.textBaseline = 'top';

		console.log('🎮 NES texture system initialized (2D Canvas context)');
		preloadAlphabetTextures();
	}

	async function preloadAlphabetTextures(): Promise<void> {
		const commonChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:!?-()[] "\' ';
		for (const char of commonChars) {
			await cacheCharacterTexture(char);
		}
		console.log(`📤 Pre-cached ${commonChars.length} character textures`);
	}

	async function cacheCharacterTexture(char: string): Promise<AlphabetTexture> {
		if (alphabetCache.has(char)) {
			return alphabetCache.get(char)!;
		}

		try {
			const nesPattern = generateNESPattern(char);
			const texture = renderCharacterTexture(char, nesPattern);

			let quantizedData = new Float32Array(64);
			if (quantizeText) {
				const charData = btoa(char);
				const quantizationResult = await base64FP32Quantizer.quantizeGemmaOutput(charData, {
					quantizationBits: 8,
					scalingMethod: 'sigmoid',
					targetLength: 64,
					cudaThreads: 64,
					cacheStrategy: 'aggressive'
				});

				const qd = quantizationResult.quantizedData;
				try {
					quantizedData = new Float32Array(Array.from(qd as unknown as ArrayLike<number>));
				} catch {
					quantizedData = new Float32Array(64);
				}
			}

			const alphabetTexture: AlphabetTexture = {
				char,
				texture,
				quantizedData,
				nesPattern,
				cached: true
			};

			alphabetCache.set(char, alphabetTexture);

			if (cacheTextures && chrRomPatternCache) {
				await chrRomPatternCache.generateAndCachePattern(`char_${char.charCodeAt(0)}`, {
					documentType: 'citation',
					riskLevel: 'low',
					visualStyle: 'classic',
					colorScheme: 'default',
					animated: false
				});
			}

			return alphabetTexture;
		} catch (error) {
			console.error(`❌ Failed to cache texture for: '${char}':`, error);
			return {
				char,
				texture: null,
				quantizedData: new Float32Array(64),
				nesPattern: new Uint8Array(64),
				cached: false
			};
		}
	}

	function generateNESPattern(char: string): Uint8Array {
		const pattern = new Uint8Array(64);
		const charCode = char.charCodeAt(0);

		for (let y = 0; y < 8; y++) {
			for (let x = 0; x < 8; x++) {
				const index = y * 8 + x;
				if (char === ' ') {
					pattern[index] = 0;
				} else if (char.match(/[A-Z]/)) {
					pattern[index] = (x + y + charCode) % 3 === 0 ? 255 : 0;
				} else if (char.match(/[a-z]/)) {
					pattern[index] = (x + y + charCode) % 4 === 0 ? 192 : 0;
				} else if (char.match(/[0-9]/)) {
					pattern[index] = x === y || x + y === 7 ? 255 : 0;
				} else {
					pattern[index] = (x * y + charCode) % 7 === 0 ? 255 : 128;
				}
			}
		}
		return pattern;
	}

	function renderCharacterTexture(char: string, pattern: Uint8Array): ImageData | null {
		if (!textureCtx) return null;

		try {
			textureCtx.clearRect(0, 0, 8, 8);

			const themeColors: Record<string, string> = {
				classic: '#FFFFFF',
				modern: '#00FF00',
				legal: '#FFD700'
			};

			textureCtx.fillStyle = themeColors[nesTheme] || themeColors.legal;

			for (let y = 0; y < 8; y++) {
				for (let x = 0; x < 8; x++) {
					const pixelValue = pattern[y * 8 + x];
					if (pixelValue > 0) {
						textureCtx.fillRect(x, y, 1, 1);
					}
				}
			}

			return textureCtx.getImageData(0, 0, 8, 8);
		} catch (error) {
			console.error('❌ Character texture rendering failed:', error);
			return null;
		}
	}

	function initializeAudioSystem(): void {
		if (!enableSound || typeof window === 'undefined') return;

		try {
			audioContext = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
			generateTypingSoundBuffer();
			console.log('🔊 NES audio system initialized');
		} catch (error) {
			console.warn('⚠️ Audio system initialization failed:', error);
		}
	}

	function generateTypingSoundBuffer(): void {
		if (!audioContext) return;

		const sampleRate = audioContext.sampleRate;
		const duration = 0.1;
		const buffer = audioContext.createBuffer(1, sampleRate * duration, sampleRate);
		const channelData = buffer.getChannelData(0);

		for (let i = 0; i < channelData.length; i++) {
			const frequency = 800;
			const time = i / sampleRate;
			const wave = Math.sin(2 * Math.PI * frequency * time);
			const envelope = Math.exp(-time * 10);
			channelData[i] = wave * envelope * 0.1;
		}

		typingSoundBuffer = buffer;
	}

	function playTypingSound(): void {
		if (!audioContext || !typingSoundBuffer || !enableSound) return;

		try {
			const source = audioContext.createBufferSource();
			source.buffer = typingSoundBuffer;
			const pitchVariation = 0.9 + Math.random() * 0.2;
			source.playbackRate.value = pitchVariation;
			source.connect(audioContext.destination);
			source.start(0);
		} catch (error) {
			console.warn('⚠️ Typing sound playback failed:', error);
		}
	}

	async function startTypewriterEffect(): Promise<void> {
		if (!text) return;

		isTyping = true;
		currentIndex = 0;
		displayText = text;

		const uniqueChars = [...new Set(text.split(''))];
		for (const char of uniqueChars) {
			await cacheCharacterTexture(char);
		}

		const charactersPerFrame = Math.max(1, Math.floor(speed / 60));
		const frameDelay = 1000 / 60;

		typewriterInterval = setInterval(() => {
			if (currentIndex >= text.length) {
				isTyping = false;
				if (typewriterInterval) clearInterval(typewriterInterval);
				onComplete?.();
				return;
			}

			for (let i = 0; i < charactersPerFrame && currentIndex < text.length; i++) {
				currentIndex++;
				if (text[currentIndex - 1] !== ' ') {
					playTypingSound();
				}
				applyCharacterEffects(text[currentIndex - 1]);
			}
		},
	frameDelay);

		startCursorBlink();
	}

	function applyCharacterEffects(char: string): void {
		const texture = alphabetCache.get(char);
		if (texture && texture.cached) {
			console.log(`🎨 Applied texture effect for: '${char}'`);
		}

		if (char === '!' || char === '?') {
			setTimeout(() => {
				if (textElement) {
					textElement.classList.add('nes-text-emphasis');
					setTimeout(() => {
						textElement.classList.remove('nes-text-emphasis');
					},
	200);
				}
			},
	50);
		}
	}

	function startCursorBlink(): void {
        if (cursorBlinkInterval) clearInterval(cursorBlinkInterval);
		cursorBlinkInterval = setInterval(() => {
			if (!isTyping) {
				cursor = !cursor;
			} else {
				cursor = true;
			}
		}, 500);
	}

	function cleanup(): void {
		if (typewriterInterval) {
			clearInterval(typewriterInterval);
		}
        if (cursorBlinkInterval) {
            clearInterval(cursorBlinkInterval);
        }
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		if (audioContext) {
			audioContext.close();
		}
		alphabetCache.clear();
	}

	$effect(() => {
		if (text && containerElement) {
			startTypewriterEffect();
		}
	});
</script>

<div
	bind:this={containerElement}
	class="nes-typewriter-container"
	class:nes-classic={nesTheme === 'classic'}
	class:nes-modern={nesTheme === 'modern'}
	class:nes-legal={nesTheme === 'legal'}
	style:max-width={maxWidth}
>
	<span
		bind:this={textElement}
		class="nes-typewriter-text"
		class:typing={isTyping}
	>
		{visibleText}
	</span>
	<span
		bind:this={cursorElement}
		class="nes-typewriter-cursor"
		class:visible={cursor}
		class:blinking={!isTyping}
	>
		█
	</span>
</div>

<style>
	.nes-typewriter-container {
		font-family: 'Courier New', 'Press Start 2P', monospace;
		font-size: 16px;
		line-height: 1.5;
	color: #212529;
		background: transparent;
	padding: 8px;
		border: 2px solid transparent;
		word-wrap: break-word;
	position: relative;
	}

	.nes-classic {
		color: #ffffff;
	background: #000000;
		border-color: #ffffff;
	}

	.nes-modern {
		color: #00ff00;
	background: #001100;
		border-color: #00ff00;
		text-shadow: 0 0 2px #00ff00;
	}

	.nes-legal {
		color: #ffd700;
	background: #1a1a2e;
		border-color: #ffd700;
		text-shadow: 0 0 1px #ffd700;
	}

	.nes-typewriter-text {
		display: inline;
		font-weight: normal;
		letter-spacing: 0.5px;
	}

	.nes-typewriter-text.typing {
		text-shadow: 0 0 3px currentColor;
	}

	.nes-typewriter-text:global(.nes-text-emphasis) {
		animation: emphasize 0.3s ease-out;
	}

	@keyframes emphasize {
		0% {
			transform: scale(1);
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
		}
	}

	.nes-typewriter-cursor {
		display: inline-block;
	opacity: 0;
		margin-left: 1px;
		font-weight: bold;
	color: currentColor;
	}

	.nes-typewriter-cursor.visible {
		opacity: 1;
	}

	.nes-typewriter-cursor.blinking {
		animation: blink 1s infinite;
	}

	@keyframes blink {
		0%,
		50% {
			opacity: 1;
		}
		51%,
		100% {
			opacity: 0;
		}
	}

	.nes-classic .nes-typewriter-text,
	.nes-modern .nes-typewriter-text,
	.nes-legal .nes-typewriter-text {
		image-rendering: pixelated;
		image-rendering: -moz-crisp-edges;
		image-rendering: crisp-edges;
	}

	@media (max-width: 768px) {
		.nes-typewriter-container {
			font-size: 14px;
	padding: 6px;
		}
	}

	@media (max-width: 480px) {
		.nes-typewriter-container {
			font-size: 12px;
	padding: 4px;
		}
	}

	@media (prefers-contrast: high) {
		.nes-typewriter-container {
			border-width: 3px;
		}

		.nes-legal {
			color: #ffff00;
			text-shadow: 0 0 2px #000000;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.nes-typewriter-cursor {
			animation: none;
	opacity: 1;
		}

		.nes-typewriter-text:global(.nes-text-emphasis) {
			animation: none;
		}
	}
</style>
