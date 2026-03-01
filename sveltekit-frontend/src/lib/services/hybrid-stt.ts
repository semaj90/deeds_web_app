/**
 * Hybrid STT Service — Automatic fallback from Web Speech API to Whisper.cpp
 *
 * Provides universal speech-to-text across all browsers:
 * - Chrome/Edge: Web Speech API (native, zero-latency)
 * - Firefox/Safari: Whisper.cpp WASM (offline, universal)
 *
 * Usage:
 *   import { hybridSTT } from '$lib/services/hybrid-stt';
 *
 *   // Auto-detect and use best available STT
 *   await hybridSTT.startListening((transcript) => {
 *     console.log('Transcript:', transcript);
 *   });
 *
 * Features:
 * - Automatic capability detection
 * - Seamless fallback
 * - Unified API for both backends
 * - Browser compatibility reporting
 */

import { whisperSTT, type WhisperTranscriptResult } from './whisper-stt.js';

export type STTBackend = 'web-speech' | 'whisper' | 'none';

export interface STTCapabilities {
	backend: STTBackend;
	supported: boolean;
	features: {
		continuous: boolean;
		interimResults: boolean;
		maxAlternatives: boolean;
	};
}

export interface STTTranscriptEvent {
	transcript: string;
	confidence: number;
	isFinal: boolean;
	backend: STTBackend;
}

type TranscriptCallback = (event: STTTranscriptEvent) => void;
type ErrorCallback = (error: string) => void;

class HybridSTTService {
	private backend: STTBackend = 'none';
	private recognition: any = null; // Web Speech API
	private isListening = false;
	private onTranscript: TranscriptCallback | null = null;
	private onError: ErrorCallback | null = null;

	/**
	 * Detect available STT capabilities.
	 */
	detectCapabilities(): STTCapabilities {
		// Check Web Speech API support
		const hasWebSpeech = 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;

		if (hasWebSpeech) {
			this.backend = 'web-speech';
			return {
				backend: 'web-speech',
				supported: true,
				features: {
					continuous: true,
					interimResults: true,
					maxAlternatives: true
				}
			};
		}

		// Fallback to Whisper.cpp (WASM support is universal in modern browsers)
		this.backend = 'whisper';
		return {
			backend: 'whisper',
			supported: true,
			features: {
				continuous: false, // Whisper transcribes chunks, not continuous
				interimResults: false, // Whisper only returns final results
				maxAlternatives: false
			}
		};
	}

	/**
	 * Start listening for speech input.
	 * @param onTranscript - Callback for transcript results
	 * @param onError - Callback for errors (optional)
	 */
	async startListening(
		onTranscript: TranscriptCallback,
		onError?: ErrorCallback
	): Promise<void> {
		if (this.isListening) {
			console.warn('[HybridSTT] Already listening');
			return;
		}

		this.onTranscript = onTranscript;
		this.onError = onError || null;

		// Detect backend if not already done
		if (this.backend === 'none') {
			this.detectCapabilities();
		}

		console.log(`[HybridSTT] Starting ${this.backend} backend`);

		if (this.backend === 'web-speech') {
			await this.startWebSpeech();
		} else if (this.backend === 'whisper') {
			await this.startWhisper();
		} else {
			const error = 'No STT backend available';
			console.error('[HybridSTT]', error);
			if (this.onError) this.onError(error);
		}
	}

	/**
	 * Start Web Speech API recognition.
	 */
	private async startWebSpeech(): Promise<void> {
		try {
			const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
			this.recognition = new SpeechRecognition();
			this.recognition.continuous = false;
			this.recognition.interimResults = false;
			this.recognition.lang = 'en-US';

			this.recognition.onstart = () => {
				this.isListening = true;
				console.log('[HybridSTT] Web Speech started');
			};

			this.recognition.onresult = (event: any) => {
				const result = event.results[0][0];
				const transcript = result.transcript;
				const confidence = result.confidence;

				console.log('[HybridSTT] Web Speech result:', transcript, `(${Math.round(confidence * 100)}%)`);

				if (this.onTranscript) {
					this.onTranscript({
						transcript,
						confidence,
						isFinal: true,
						backend: 'web-speech'
					});
				}
			};

			this.recognition.onerror = (event: any) => {
				console.error('[HybridSTT] Web Speech error:', event.error);
				if (this.onError) {
					this.onError(`Web Speech error: ${event.error}`);
				}
				this.isListening = false;
			};

			this.recognition.onend = () => {
				this.isListening = false;
				console.log('[HybridSTT] Web Speech ended');
			};

			this.recognition.start();
		} catch (error) {
			console.error('[HybridSTT] Failed to start Web Speech:', error);
			if (this.onError) {
				this.onError(`Failed to start Web Speech: ${error}`);
			}
		}
	}

	/**
	 * Start Whisper.cpp recognition.
	 */
	private async startWhisper(): Promise<void> {
		try {
			// Initialize Whisper if needed
			await whisperSTT.init();

			// Start recording
			await whisperSTT.startRecording();
			this.isListening = true;

			console.log('[HybridSTT] Whisper recording started');

			// Note: stopListening() will handle the transcription
			// This is different from Web Speech which transcribes continuously
		} catch (error) {
			console.error('[HybridSTT] Failed to start Whisper:', error);
			if (this.onError) {
				this.onError(`Failed to start Whisper: ${error}`);
			}
		}
	}

	/**
	 * Stop listening and finalize transcription.
	 */
	async stopListening(): Promise<void> {
		if (!this.isListening) {
			console.warn('[HybridSTT] Not currently listening');
			return;
		}

		console.log(`[HybridSTT] Stopping ${this.backend} backend`);

		if (this.backend === 'web-speech') {
			if (this.recognition) {
				try {
					this.recognition.stop();
				} catch {
					// Already stopped
				}
			}
			this.isListening = false;
		} else if (this.backend === 'whisper') {
			try {
				// Stop recording and transcribe
				const result = await whisperSTT.stopRecording();

				console.log('[HybridSTT] Whisper result:', result.text, `(${Math.round(result.confidence * 100)}%)`);

				if (this.onTranscript && result.text) {
					this.onTranscript({
						transcript: result.text,
						confidence: result.confidence,
						isFinal: true,
						backend: 'whisper'
					});
				}
			} catch (error) {
				console.error('[HybridSTT] Whisper transcription failed:', error);
				if (this.onError) {
					this.onError(`Whisper transcription failed: ${error}`);
				}
			}
			this.isListening = false;
		}
	}

	/**
	 * Cancel listening without transcription.
	 */
	cancelListening(): void {
		if (!this.isListening) return;

		console.log(`[HybridSTT] Cancelling ${this.backend} backend`);

		if (this.backend === 'web-speech') {
			if (this.recognition) {
				try {
					this.recognition.abort();
				} catch {
					// Already stopped
				}
			}
		} else if (this.backend === 'whisper') {
			whisperSTT.cancelRecording();
		}

		this.isListening = false;
	}

	/**
	 * Get current backend being used.
	 */
	getBackend(): STTBackend {
		return this.backend;
	}

	/**
	 * Check if currently listening.
	 */
	isCurrentlyListening(): boolean {
		return this.isListening;
	}

	/**
	 * Get detailed status.
	 */
	getStatus() {
		return {
			backend: this.backend,
			listening: this.isListening,
			capabilities: this.detectCapabilities()
		};
	}
}

// Singleton instance
export const hybridSTT = new HybridSTTService();

// Default export
export default hybridSTT;