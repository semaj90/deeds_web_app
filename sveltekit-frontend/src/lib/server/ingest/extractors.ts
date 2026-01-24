/**
 * Content Extractors for Multimodal Ingestion
 *
 * CPU-intensive operations for extracting content and features:
 * - OCR for images and PDFs (Tesseract.js)
 * - Audio extraction and processing (ffmpeg)
 * - Video frame sampling (ffmpeg)
 * - Image processing and optimization (Sharp)
 * - Large JSON parsing (simdjson-wasm)
 */

import fs from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { tmpdir } from 'os';

// Types
export interface ExtractionResult {
	success: boolean;
	extractedText?: string;
	metadata?: Record<string, unknown>;
	error?: string;
	processingTime: number;
}

export interface FrameExtractionResult extends ExtractionResult {
	frames?: Buffer[];
	frameCount?: number;
}

export interface AudioExtractionResult extends ExtractionResult {
	audioPath?: string;
	duration?: number;
	sampleRate?: number;
}

type FFProbeStream = {
	codec_type?: string;
	sample_rate?: string;
	channels?: number | string;
	width?: number | string;
	height?: number | string;
};

type FFProbeFormat = {
	duration?: string;
};

type FFProbeResult = {
	streams?: FFProbeStream[];
	format?: FFProbeFormat;
};

type AudioInfo = {
	duration: number;
	sampleRate: number;
	channels: number;
};

type VideoInfo = {
	duration: number;
	width: number;
	height: number;
};

// Temp file utilities
async function bufferToTempFile(buffer: Buffer, extension = ''): Promise<string> {
	const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`;
	const filepath = path.join(tmpdir(), filename);
	await fs.writeFile(filepath, buffer);
	return filepath;
}

async function cleanupTempFile(filepath: string): Promise<void> {
	try {
		await fs.unlink(filepath);
	} catch {
		// Ignore cleanup errors
	}
}

/**
 * OCR Extraction using Tesseract.js
 */
export async function extractTextFromImage(
	buffer: Buffer,
	options: { language?: string; pageSegMode?: number; preserveInterword?: boolean } = {}
): Promise<ExtractionResult> {
	const startTime = Date.now();

	try {
		const Tesseract = await import('tesseract.js');
		const sharp = await import('sharp');

		const { language = 'eng', pageSegMode = 6, preserveInterword = true } = options;

		// Optimize image for OCR
		const optimizedBuffer = await sharp
			.default(buffer)
			.ensureAlpha()
			.greyscale()
			.sharpen()
			.png()
			.toBuffer();

		const worker = await Tesseract.createWorker();

		try {
			await worker.load();
			await worker.loadLanguage(language);
			await worker.initialize(language);

			await worker.setParameters({
				tessedit_pageseg_mode: pageSegMode.toString(),
				preserve_interword_spaces: preserveInterword ? '1' : '0'
			});

			const { data } = await worker.recognize(optimizedBuffer);

			return {
				success: true,
				extractedText: data.text.trim(),
				metadata: {
					confidence: data.confidence,
					wordCount: data.words?.length ?? 0,
					language,
					optimization: 'greyscale_sharpen'
				},
				processingTime: Date.now() - startTime
			};
		} finally {
			await worker.terminate();
		}
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			processingTime: Date.now() - startTime
		};
	}
}

/**
 * PDF to text extraction
 */
export async function extractTextFromPDF(buffer: Buffer): Promise<ExtractionResult> {
	const startTime = Date.now();

	try {
		return await extractTextFromImage(buffer, { language: 'eng', pageSegMode: 6 });
	} catch (error) {
		return {
			success: false,
			error: `PDF extraction failed: ${error}`,
			processingTime: Date.now() - startTime
		};
	}
}

/**
 * Audio extraction from video/audio files using ffmpeg
 */
export async function extractAudioFromBuffer(
	buffer: Buffer,
	filename: string
): Promise<AudioExtractionResult> {
	const startTime = Date.now();
	let inputPath: string | null = null;
	let outputPath: string | null = null;

	try {
		const extension = path.extname(filename) || '.bin';
		inputPath = await bufferToTempFile(buffer, extension);
		outputPath = `${inputPath}.wav`;

		const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';

		await new Promise<void>((resolve, reject) => {
			const ffmpeg = spawn(
				ffmpegPath,
				[
					'-i',
					inputPath!,
					'-vn',
					'-acodec',
					'pcm_s16le',
					'-ar',
					'16000',
					'-ac',
					'1',
					'-f',
					'wav',
					'-y',
					outputPath!
				],
				{ stdio: 'pipe' }
			);

			let stderr = '';
			ffmpeg.stderr?.on('data', (data) => {
				stderr += data.toString();
			});

			ffmpeg.on('close', (code: number) => {
				if (code === 0) {
					resolve();
				} else {
					reject(new Error(`ffmpeg failed with code ${code}: ${stderr}`));
				}
			});

			ffmpeg.on('error', (error) => {
				reject(error);
			});
		});

		const audioInfo = await getAudioInfo(outputPath!, ffmpegPath);

		return {
			success: true,
			audioPath: outputPath!,
			metadata: {
				originalFormat: extension,
				extractedFormat: 'wav',
				sampleRate: audioInfo.sampleRate,
				duration: audioInfo.duration,
				channels: audioInfo.channels
			},
			duration: audioInfo.duration,
			sampleRate: audioInfo.sampleRate,
			processingTime: Date.now() - startTime
		};
	} catch (error) {
		if (outputPath) await cleanupTempFile(outputPath);

		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			processingTime: Date.now() - startTime
		};
	} finally {
		if (inputPath) await cleanupTempFile(inputPath);
	}
}

/**
 * Video frame sampling using ffmpeg
 */
export async function sampleFramesFromVideo(
	buffer: Buffer,
	filename: string,
	frameCount = 3
): Promise<FrameExtractionResult> {
	const startTime = Date.now();
	let inputPath: string | null = null;
	const outputPaths: string[] = [];

	try {
		const extension = path.extname(filename) || '.mp4';
		inputPath = await bufferToTempFile(buffer, extension);

		const ffmpegPath = process.env.FFMPEG_PATH ?? 'ffmpeg';
		const videoInfo = await getVideoInfo(inputPath, ffmpegPath);
		const duration = videoInfo.duration;

		if (duration <= 0) {
			throw new Error('Could not determine video duration');
		}

		// Calculate frame timestamps
		const timestamps: number[] = [];
		for (let i = 1; i <= frameCount; i++) {
			timestamps.push((i * duration) / (frameCount + 1));
		}

		const frameBuffers: Buffer[] = [];

		for (let i = 0; i < timestamps.length; i++) {
			const outputPath = `${inputPath}_frame_${i}.jpg`;
			outputPaths.push(outputPath);

			await new Promise<void>((resolve, reject) => {
				const ffmpeg = spawn(
					ffmpegPath,
					[
						'-i',
						inputPath!,
						'-ss',
						timestamps[i].toString(),
						'-vframes',
						'1',
						'-f',
						'image2',
						'-vcodec',
						'mjpeg',
						'-q:v',
						'2',
						'-s',
						'1280x720',
						'-y',
						outputPath
					],
					{ stdio: 'pipe' }
				);

				let stderr = '';
				ffmpeg.stderr?.on('data', (data) => {
					stderr += data.toString();
				});

				ffmpeg.on('close', (code: number) => {
					if (code === 0) {
						resolve();
					} else {
						reject(new Error(`Frame extraction failed: ${stderr}`));
					}
				});

				ffmpeg.on('error', (error) => reject(error));
			});

			const frameBuffer = await fs.readFile(outputPath);
			frameBuffers.push(frameBuffer);
		}

		return {
			success: true,
			frames: frameBuffers,
			frameCount: frameBuffers.length,
			metadata: {
				originalFormat: extension,
				videoDuration: duration,
				frameTimestamps: timestamps,
				frameResolution: '1280x720'
			},
			processingTime: Date.now() - startTime
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			processingTime: Date.now() - startTime
		};
	} finally {
		if (inputPath) await cleanupTempFile(inputPath);
		for (const outputPath of outputPaths) {
			await cleanupTempFile(outputPath);
		}
	}
}

/**
 * Large JSON parsing with simdjson-wasm
 */
export async function parseJsonWithSimd(jsonText: string): Promise<ExtractionResult> {
	const startTime = Date.now();

	try {
		// Try simdjson for large files
		if (jsonText.length > 1024 * 1024) {
			try {
				const simdjson = await import('simdjson');
				const parsed = simdjson.parse(jsonText);

				return {
					success: true,
					extractedText: JSON.stringify(parsed, null, 2),
					metadata: {
						parser: 'simdjson-wasm',
						originalSize: jsonText.length,
						jsonKeys: typeof parsed === 'object' ? Object.keys(parsed ?? {}).length : 0
					},
					processingTime: Date.now() - startTime
				};
			} catch (simdjsonError) {
				console.warn('simdjson-wasm failed, falling back to JSON.parse:', simdjsonError);
			}
		}

		// Fallback to native JSON.parse
		const parsed = JSON.parse(jsonText);

		return {
			success: true,
			extractedText: JSON.stringify(parsed, null, 2),
			metadata: {
				parser: 'native',
				originalSize: jsonText.length,
				jsonKeys: typeof parsed === 'object' ? Object.keys(parsed ?? {}).length : 0
			},
			processingTime: Date.now() - startTime
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			processingTime: Date.now() - startTime
		};
	}
}

// Utility functions
async function getAudioInfo(filePath: string, ffmpegPath: string): Promise<AudioInfo> {
	return new Promise<AudioInfo>((resolve, reject) => {
		const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
		const ffprobe = spawn(
			ffprobePath,
			['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
			{ stdio: 'pipe' }
		);

		let stdout = '';
		ffprobe.stdout?.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		ffprobe.on('close', (code: number) => {
			if (code !== 0) {
				reject(new Error(`ffprobe failed with code ${code}`));
				return;
			}

			try {
				const info = JSON.parse(stdout) as FFProbeResult;
				const audioStream = info.streams?.find((s) => s.codec_type === 'audio');
				const duration = parseFloat(info.format?.duration ?? '0');
				const sampleRate = parseInt(audioStream?.sample_rate ?? '16000', 10);
				const channels =
					audioStream?.channels !== undefined ? Number(audioStream.channels) : 1;

				resolve({
					duration,
					sampleRate: Number.isNaN(sampleRate) ? 16000 : sampleRate,
					channels: Number.isNaN(channels) ? 1 : channels
				});
			} catch (err) {
				reject(err);
			}
		});

		ffprobe.on('error', (error) => reject(error));
	});
}

async function getVideoInfo(filePath: string, ffmpegPath: string): Promise<VideoInfo> {
	return new Promise<VideoInfo>((resolve, reject) => {
		const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
		const ffprobe = spawn(
			ffprobePath,
			['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
			{ stdio: 'pipe' }
		);

		let stdout = '';
		ffprobe.stdout?.on('data', (data: Buffer) => {
			stdout += data.toString();
		});

		ffprobe.on('close', (code: number) => {
			if (code !== 0) {
				reject(new Error(`ffprobe failed with code ${code}`));
				return;
			}

			try {
				const info = JSON.parse(stdout) as FFProbeResult;
				const videoStream = info.streams?.find((s) => s.codec_type === 'video');
				const duration = parseFloat(info.format?.duration ?? '0');
				const width = videoStream?.width ? Number(videoStream.width) : 0;
				const height = videoStream?.height ? Number(videoStream.height) : 0;

				resolve({
					duration,
					width: Number.isNaN(width) ? 0 : width,
					height: Number.isNaN(height) ? 0 : height
				});
			} catch (err) {
				reject(err);
			}
		});

		ffprobe.on('error', (error) => reject(error));
	});
}

/**
 * Main extractor router
 */
export async function extractContent(
	buffer: Buffer,
	contentType: string,
	filename?: string
): Promise<ExtractionResult> {
	const startTime = Date.now();

	try {
		if (contentType.startsWith('image/')) {
			return await extractTextFromImage(buffer);
		}

		if (contentType === 'application/pdf') {
			return await extractTextFromPDF(buffer);
		}

		if (contentType.startsWith('text/')) {
			const text = buffer.toString('utf-8');
			return {
				success: true,
				extractedText: text,
				metadata: {
					originalSize: buffer.length,
					encoding: 'utf-8'
				},
				processingTime: Date.now() - startTime
			};
		}

		if (contentType === 'application/json') {
			const jsonText = buffer.toString('utf-8');
			return await parseJsonWithSimd(jsonText);
		}

		if (contentType.startsWith('audio/') || contentType.startsWith('video/')) {
			return {
				success: true,
				extractedText: `${contentType} file: ${filename || 'unknown'}`,
				metadata: {
					contentType,
					size: buffer.length,
					isMediaFile: true
				},
				processingTime: Date.now() - startTime
			};
		}

		return {
			success: false,
			error: `Unsupported content type: ${contentType}`,
			processingTime: Date.now() - startTime
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			processingTime: Date.now() - startTime
		};
	}
}

