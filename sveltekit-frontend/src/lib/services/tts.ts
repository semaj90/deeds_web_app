/**
 * Piper TTS Service — Neural text-to-speech using ONNX Runtime
 *
 * Uses the same ONNX infrastructure as gemma270m (onnxruntime-web).
 * Model: Lessac medium (en_US) - 61MB ONNX model with natural voice quality.
 *
 * Usage:
 *   import { ttsService } from '$lib/services/tts';
 *   await ttsService.speak("Your legal summary here");
 *
 * Features:
 * - Offline-first (model cached in browser)
 * - Zero latency (no server calls)
 * - Natural neural voice (Piper quality)
 * - Automatic AudioContext management
 */

import type { PiperWasm } from 'piper-wasm';

class TTSService {
	private piper: PiperWasm | null = null;
	private audioContext: AudioContext | null = null;
	private isInitializing = false;
	private initPromise: Promise<void> | null = null;

	/**
	 * Initialize Piper TTS with the model.
	 * Lazy-loads on first use, memoizes for subsequent calls.
	 */
	async init(): Promise<void> {
		// Return existing initialization promise if already in progress
		if (this.initPromise) return this.initPromise;

		// Already initialized
		if (this.piper) return;

		// Guard against double initialization
		if (this.isInitializing) {
			// Wait for in-flight init
			await new Promise((resolve) => setTimeout(resolve, 100));
			return this.init();
		}

		this.isInitializing = true;
		this.initPromise = (async () => {
			try {
				// Dynamically import piper-wasm (only in browser)
				const { PiperWasm } = await import('piper-wasm');

				console.log('[TTS] Loading Piper model...');
				const startTime = performance.now();

				// Load model from static/models/
				this.piper = await PiperWasm.load('/models/piper-en-us.onnx');

				const loadTime = performance.now() - startTime;
				console.log(`[TTS] Piper model loaded in ${loadTime.toFixed(0)}ms`);

				// Initialize AudioContext
				this.audioContext = new AudioContext();
			} catch (error) {
				console.error('[TTS] Failed to initialize Piper:', error);
				this.piper = null;
				throw error;
			} finally {
				this.isInitializing = false;
			}
		})();

		await this.initPromise;
	}

	/**
	 * Synthesize speech from text and play it immediately.
	 * @param text - Text to speak (max ~500 chars for best performance)
	 * @param options - Speaking options
	 */
	async speak(
		text: string,
		options: {
			rate?: number; // Speech rate multiplier (0.5 - 2.0, default: 1.0)
			volume?: number; // Volume (0.0 - 1.0, default: 1.0)
		} = {}
	): Promise<void> {
		if (!text.trim()) return;

		// Initialize on first use
		if (!this.piper) await this.init();
		if (!this.piper || !this.audioContext) {
			throw new Error('[TTS] Piper not initialized');
		}

		const { rate = 1.0, volume = 1.0 } = options;

		try {
			console.log(`[TTS] Synthesizing: "${text.slice(0, 50)}${text.length > 50 ? '...' : ''}"`);
			const startTime = performance.now();

			// Synthesize audio (returns WAV buffer)
			const wavBuffer = await this.piper.synthesize(text);

			// Decode WAV to AudioBuffer
			const audioBuffer = await this.audioContext.decodeAudioData(wavBuffer.buffer);

			const synthTime = performance.now() - startTime;
			console.log(`[TTS] Synthesized in ${synthTime.toFixed(0)}ms (${audioBuffer.duration.toFixed(1)}s audio)`);

			// Play audio
			const source = this.audioContext.createBufferSource();
			const gainNode = this.audioContext.createGain();

			source.buffer = audioBuffer;
			source.playbackRate.value = rate;
			gainNode.gain.value = volume;

			source.connect(gainNode);
			gainNode.connect(this.audioContext.destination);

			source.start();

			return new Promise((resolve) => {
				source.onended = () => resolve();
			});
		} catch (error) {
			console.error('[TTS] Synthesis failed:', error);
			throw error;
		}
	}

	/**
	 * Stop any currently playing audio.
	 */
	stop(): void {
		if (this.audioContext) {
			// Disconnect all sources
			this.audioContext.close();
			this.audioContext = new AudioContext();
		}
	}

	/**
	 * Check if TTS is ready (model loaded).
	 */
	isReady(): boolean {
		return this.piper !== null;
	}

	/**
	 * Get initialization status.
	 */
	getStatus(): { ready: boolean; initializing: boolean } {
		return {
			ready: this.isReady(),
			initializing: this.isInitializing
		};
	}
}

// Singleton instance
export const ttsService = new TTSService();

// Default export
export default ttsService;
