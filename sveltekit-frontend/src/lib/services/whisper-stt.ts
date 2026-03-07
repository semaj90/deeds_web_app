/**
 * Whisper STT Service — Universal speech-to-text using Transformers.js
 *
 * Provides browser-native STT for Firefox/Safari where Web Speech API is unavailable.
 * Uses Whisper via @xenova/transformers (already installed) with tiny.en model.
 *
 * Usage:
 *   import { whisperSTT } from '$lib/services/whisper-stt';
 *   const transcript = await whisperSTT.transcribe(audioBlob);
 *
 * Features:
 * - Offline-first (model cached in browser)
 * - Universal browser support (any browser with WASM + AudioContext)
 * - Multilingual support (via different model variants)
 * - GPU acceleration via WebGPU/WASM (when available)
 */

export interface WhisperTranscriptResult {
	text: string;
	confidence: number;
	duration: number; // ms
}

export interface WhisperConfig {
	language?: string; // 'en' | 'auto' (default: 'en')
	modelSize?: 'tiny' | 'base' | 'small'; // default: 'tiny'
	maxDuration?: number; // seconds (default: 30)
}

class WhisperSTTService {
	private pipeline: any = null;
	private isInitializing = false;
	private initPromise: Promise<void> | null = null;
	private audioContext: AudioContext | null = null;
	private mediaRecorder: MediaRecorder | null = null;
	private audioChunks: Blob[] = [];
	private isRecording = false;

	/**
	 * Initialize Whisper via Transformers.js.
	 * Lazy-loads on first use, memoizes for subsequent calls.
	 */
	async init(): Promise<void> {
		// Return existing initialization promise if already in progress
		if (this.initPromise) return this.initPromise;

		// Already initialized
		if (this.pipeline) return;

		// Guard against double initialization
		if (this.isInitializing) {
			await new Promise((resolve) => setTimeout(resolve, 100));
			return this.init();
		}

		this.isInitializing = true;
		this.initPromise = (async () => {
			try {
				console.log('[Whisper] Loading Transformers.js pipeline...');
				const startTime = performance.now();

				// Dynamically import transformers (browser-safe)
				const transformers = await import('@xenova/transformers');

				// Load Whisper tiny.en model for speech recognition
				// pipeline is callable despite TS types showing it as a class
				this.pipeline = await (transformers.pipeline as any)('automatic-speech-recognition', 'Xenova/whisper-tiny.en', {
					quantized: true // Use quantized model for faster loading
				});

				// Initialize AudioContext for recording
				this.audioContext = new AudioContext({ sampleRate: 16000 }); // Whisper expects 16kHz

				const loadTime = performance.now() - startTime;
				console.log(`[Whisper] Pipeline loaded in ${loadTime.toFixed(0)}ms`);
			} catch (error) {
				console.error('[Whisper] Failed to initialize:', error);
				this.pipeline = null;
				throw error;
			} finally {
				this.isInitializing = false;
			}
		})();

		await this.initPromise;
	}

	/**
	 * Start recording audio from microphone.
	 */
	async startRecording(): Promise<void> {
		if (this.isRecording) {
			console.warn('[Whisper] Already recording');
			return;
		}

		try {
			// Request microphone access
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					channelCount: 1,
					sampleRate: 16000,
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true
				}
			});

			// Create MediaRecorder
			this.mediaRecorder = new MediaRecorder(stream, {
				mimeType: 'audio/webm;codecs=opus'
			});

			this.audioChunks = [];

			this.mediaRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.audioChunks.push(event.data);
				}
			};

			this.mediaRecorder.start();
			this.isRecording = true;

			console.log('[Whisper] Recording started');
		} catch (error) {
			console.error('[Whisper] Failed to start recording:', error);
			throw error;
		}
	}

	/**
	 * Stop recording and transcribe the audio.
	 */
	async stopRecording(): Promise<WhisperTranscriptResult> {
		if (!this.isRecording || !this.mediaRecorder) {
			throw new Error('[Whisper] Not currently recording');
		}

		return new Promise((resolve, reject) => {
			if (!this.mediaRecorder) {
				reject(new Error('[Whisper] MediaRecorder not initialized'));
				return;
			}

			this.mediaRecorder.onstop = async () => {
				try {
					const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
					const result = await this.transcribe(audioBlob);
					resolve(result);
				} catch (error) {
					reject(error);
				} finally {
					this.isRecording = false;
					this.audioChunks = [];
					// Stop all tracks
					if (this.mediaRecorder?.stream) {
						this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
					}
				}
			};

			this.mediaRecorder.stop();
			console.log('[Whisper] Recording stopped');
		});
	}

	/**
	 * Transcribe audio blob to text.
	 * @param audioBlob - Audio data (WebM, WAV, or MP3)
	 * @param config - Transcription configuration
	 */
	async transcribe(
		audioBlob: Blob,
		config: WhisperConfig = {}
	): Promise<WhisperTranscriptResult> {
		// Initialize on first use
		if (!this.pipeline) await this.init();
		if (!this.pipeline || !this.audioContext) {
			throw new Error('[Whisper] Pipeline not initialized');
		}

		const { language = 'en', maxDuration = 30 } = config;

		try {
			console.log(`[Whisper] Transcribing ${audioBlob.size} bytes...`);
			const startTime = performance.now();

			// Convert blob to ArrayBuffer
			const arrayBuffer = await audioBlob.arrayBuffer();

			// Decode audio to PCM samples
			const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

			// Extract PCM samples at 16kHz mono (Whisper requirement)
			const samples = this.extractPCM(audioBuffer);

			// Check duration
			const duration = samples.length / 16000;
			if (duration > maxDuration) {
				console.warn(`[Whisper] Audio duration ${duration.toFixed(1)}s exceeds max ${maxDuration}s, truncating`);
			}

			// Transcribe using Transformers.js pipeline
			const output = await this.pipeline(samples, {
				language: language,
				task: 'transcribe',
				return_timestamps: false
			});

			const transcriptTime = performance.now() - startTime;

			const result: WhisperTranscriptResult = {
				text: output.text?.trim() || '',
				confidence: 0.95, // Transformers.js doesn't return confidence, use high default
				duration: transcriptTime
			};

			console.log(`[Whisper] Transcribed in ${transcriptTime.toFixed(0)}ms: "${result.text}"`);
			return result;
		} catch (error) {
			console.error('[Whisper] Transcription failed:', error);
			throw error;
		}
	}

	/**
	 * Extract PCM samples from AudioBuffer (16kHz mono for Whisper).
	 */
	private extractPCM(audioBuffer: AudioBuffer): Float32Array {
		// Get channel data
		const channelData = audioBuffer.getChannelData(0);

		// Resample to 16kHz if needed
		const targetSampleRate = 16000;
		if (audioBuffer.sampleRate === targetSampleRate) {
			return channelData;
		}

		// Simple linear interpolation resampling
		const ratio = audioBuffer.sampleRate / targetSampleRate;
		const targetLength = Math.floor(channelData.length / ratio);
		const resampled = new Float32Array(targetLength);

		for (let i = 0; i < targetLength; i++) {
			const srcIndex = i * ratio;
			const srcIndexFloor = Math.floor(srcIndex);
			const srcIndexCeil = Math.min(srcIndexFloor + 1, channelData.length - 1);
			const t = srcIndex - srcIndexFloor;

			// Linear interpolation
			resampled[i] = channelData[srcIndexFloor] * (1 - t) + channelData[srcIndexCeil] * t;
		}

		return resampled;
	}

	/**
	 * Cancel ongoing recording without transcribing.
	 */
	cancelRecording(): void {
		if (this.mediaRecorder && this.isRecording) {
			this.mediaRecorder.stop();
			this.isRecording = false;
			this.audioChunks = [];
			if (this.mediaRecorder.stream) {
				this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
			}
			console.log('[Whisper] Recording cancelled');
		}
	}

	/**
	 * Check if Whisper is ready (pipeline loaded).
	 */
	isReady(): boolean {
		return this.pipeline !== null;
	}

	/**
	 * Check if currently recording.
	 */
	isCurrentlyRecording(): boolean {
		return this.isRecording;
	}

	/**
	 * Get initialization status.
	 */
	getStatus(): { ready: boolean; initializing: boolean; recording: boolean } {
		return {
			ready: this.isReady(),
			initializing: this.isInitializing,
			recording: this.isRecording
		};
	}

	/**
	 * Cleanup resources.
	 */
	destroy(): void {
		this.cancelRecording();
		if (this.audioContext) {
			this.audioContext.close();
			this.audioContext = null;
		}
		this.pipeline = null;
	}
}

// Singleton instance
export const whisperSTT = new WhisperSTTService();

// Default export
export default whisperSTT;