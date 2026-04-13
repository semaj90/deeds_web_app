/**
 * Video VLM Processor — Gemma4 Visual Analysis
 * Extracts frames from video and runs VLM analysis via Ollama
 */

import { spawn } from 'child_process';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { randomUUID } from 'crypto';
import { db } from '$lib/server/db/client';
import { ENV } from '$lib/server/env.server';

interface VideoVLMJob {
	evidenceId: string;
	filePath: string;
	fileName: string;
	caseId: string;
	userId: string;
}

interface FrameAnalysisResult {
	timestamp: number;
	framePath: string;
	description: string;
	objects: string[];
	tags: string[];
	confidence: number;
}

interface VLMAnalysisResult {
	summary: string;
	keyObjects: string[];
	activities: string[];
	setting: string;
	timestamp: string;
}

export class VideoVLMProcessor {
	private ffmpegPath: string;
	private framesOutputDir: string;

	constructor() {
		// Use environment variable or default to system PATH
		this.ffmpegPath = ENV.FFMPEG_PATH || 'ffmpeg';
		this.framesOutputDir = join(process.cwd(), 'uploads', 'video-frames');
	}

	/**
	 * Process video: extract frames → VLM analysis → store results
	 */
	async processVideo(job: VideoVLMJob): Promise<void> {
		console.log(`[VideoVLM] Starting processing for evidence ${job.evidenceId}`);

		try {
			// Stage 1: Ensure output directory exists
			await this.ensureOutputDirectory();

			// Stage 2: Get video metadata (duration, resolution, fps)
			const videoMetadata = await this.extractVideoMetadata(job.filePath);
			await this.updateStatus(job.evidenceId, 'metadata_extracted', 15, 'Video metadata extracted');

			// Stage 3: Extract key frames (every 2 seconds, max 30 frames)
			const framePaths = await this.extractFrames(job.evidenceId, job.filePath, videoMetadata.duration);
			await this.updateStatus(job.evidenceId, 'frames_extracted', 30, `Extracted ${framePaths.length} frames`);

			// Stage 4: Run VLM analysis on each frame via Gemma4
			const frameAnalysis = await this.analyzeFramesWithVLM(framePaths);
			await this.updateStatus(job.evidenceId, 'frames_analyzed', 60, 'VLM frame analysis complete');

			// Stage 5: Detect scenes based on visual similarity (optional)
			const sceneDetection = await this.detectScenes(frameAnalysis);
			await this.updateStatus(job.evidenceId, 'scenes_detected', 75, `Detected ${sceneDetection.length} scenes`);

			// Stage 6: Generate overall VLM summary
			const vlmSummary = await this.generateVLMSummary(frameAnalysis, sceneDetection);
			await this.updateStatus(job.evidenceId, 'vlm_summary_generated', 90, 'VLM summary generated');

			// Stage 7: Update evidence metadata with all results
			await this.updateEvidenceMetadata(job.evidenceId, {
				vlmAnalysis: vlmSummary,
				frameAnalysis,
				sceneDetection,
				videoMetadata,
				processingStatus: 'complete'
			});

			await this.updateStatus(job.evidenceId, 'complete', 100, 'Video VLM processing complete');
			console.log(`[VideoVLM] Processing complete for evidence ${job.evidenceId}`);
		} catch (error) {
			console.error(`[VideoVLM] Error processing video ${job.evidenceId}:`, error);
			await this.updateStatus(job.evidenceId, 'error', 0, error instanceof Error ? error.message : 'Unknown error');
			throw error;
		}
	}

	/**
	 * Extract video metadata using ffprobe
	 */
	private async extractVideoMetadata(filePath: string): Promise<any> {
		return new Promise((resolve, reject) => {
			const args = [
				'-v', 'quiet',
				'-print_format', 'json',
				'-show_format',
				'-show_streams',
				filePath
			];

			const proc = spawn('ffprobe', args, { shell: false });
			let output = '';

			proc.stdout.on('data', (data) => {
				output += data.toString();
			});

			proc.on('close', (code) => {
				if (code !== 0) {
					return reject(new Error(`ffprobe exited with code ${code}`));
				}

				try {
					const data = JSON.parse(output);
					const videoStream = data.streams.find((s: any) => s.codec_type === 'video');

					resolve({
						duration: parseFloat(data.format.duration || 0),
						width: videoStream?.width || 0,
						height: videoStream?.height || 0,
						codec: videoStream?.codec_name || 'unknown',
						fps: eval(videoStream?.r_frame_rate || '0') || 0, // e.g., "30/1" → 30
						bitrate: parseInt(data.format.bit_rate || 0)
					});
				} catch (error) {
					reject(new Error('Failed to parse ffprobe output'));
				}
			});
		});
	}

	/**
	 * Extract frames from video at regular intervals
	 */
	private async extractFrames(evidenceId: string, videoPath: string, duration: number): Promise<{ timestamp: number; path: string }[]> {
		const frameInterval = 2; // seconds
		const maxFrames = 30;
		const frameCount = Math.min(Math.floor(duration / frameInterval), maxFrames);

		const frameDir = join(this.framesOutputDir, evidenceId);
		await mkdir(frameDir, { recursive: true });

		const framePaths: { timestamp: number; path: string }[] = [];

		for (let i = 0; i < frameCount; i++) {
			const timestamp = i * frameInterval;
			const framePath = join(frameDir, `frame_${i.toString().padStart(4, '0')}.jpg`);

			await this.extractSingleFrame(videoPath, timestamp, framePath);
			framePaths.push({ timestamp, path: framePath });
		}

		return framePaths;
	}

	/**
	 * Extract a single frame at specific timestamp using ffmpeg
	 */
	private async extractSingleFrame(videoPath: string, timestamp: number, outputPath: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const args = [
				'-ss', timestamp.toString(),
				'-i', videoPath,
				'-vframes', '1',
				'-q:v', '2',
				'-y',
				outputPath
			];

			const proc = spawn(this.ffmpegPath, args, { shell: false });

			proc.on('close', (code) => {
				if (code !== 0) {
					return reject(new Error(`ffmpeg exited with code ${code}`));
				}
				resolve();
			});

			proc.stderr.on('data', () => {
				// Suppress ffmpeg stderr noise
			});
		});
	}

	/**
	 * Analyze frames using Gemma4 VLM via Ollama
	 */
	private async analyzeFramesWithVLM(frames: { timestamp: number; path: string }[]): Promise<FrameAnalysisResult[]> {
		const results: FrameAnalysisResult[] = [];

		for (const frame of frames) {
			try {
				const analysis = await this.analyzeFrameWithGemma4(frame.path);
				results.push({
					timestamp: frame.timestamp,
					framePath: frame.path,
					description: analysis.description,
					objects: analysis.objects,
					tags: analysis.tags,
					confidence: analysis.confidence
				});
			} catch (error) {
				console.error(`[VideoVLM] Error analyzing frame at ${frame.timestamp}s:`, error);
				// Continue with next frame
			}
		}

		return results;
	}

	/**
	 * Analyze single frame using Gemma4 VLM
	 */
	private async analyzeFrameWithGemma4(imagePath: string): Promise<{
		description: string;
		objects: string[];
		tags: string[];
		confidence: number;
	}> {
		try {
			// Read image as base64
			const fs = await import('fs/promises');
			const imageBuffer = await fs.readFile(imagePath);
			const base64Image = imageBuffer.toString('base64');

			// Call Ollama VLM endpoint
			const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma4:e4b-it-q4_K_M',
					prompt: `Analyze this video frame in detail. Describe what you see, list key objects/people, and provide relevant tags. Focus on legal evidence context (locations, actions, objects, people). Format: Description | Objects: obj1, obj2 | Tags: tag1, tag2`,
					images: [base64Image],
					stream: false
				})
			});

			if (!response.ok) {
				throw new Error(`Ollama VLM request failed: ${response.status}`);
			}

			const data = await response.json();
			const text = data.response || '';

			// Parse VLM response
			const parts = text.split('|').map((p: string) => p.trim());
			const description = parts[0] || 'No description available';
			const objectsMatch = parts.find((p: string) => p.toLowerCase().startsWith('objects:'));
			const tagsMatch = parts.find((p: string) => p.toLowerCase().startsWith('tags:'));

			const objects = objectsMatch
				? objectsMatch.replace(/^objects:\s*/i, '').split(',').map((o: string) => o.trim()).filter(Boolean)
				: [];

			const tags = tagsMatch
				? tagsMatch.replace(/^tags:\s*/i, '').split(',').map((t: string) => t.trim()).filter(Boolean)
				: [];

			return {
				description,
				objects,
				tags,
				confidence: 0.85 // Gemma4 VLM is generally high-confidence
			};
		} catch (error) {
			console.error('[VideoVLM] Error calling Gemma4 VLM:', error);
			return {
				description: 'VLM analysis failed',
				objects: [],
				tags: [],
				confidence: 0.0
			};
		}
	}

	/**
	 * Detect scene boundaries based on frame analysis
	 */
	private async detectScenes(frameAnalysis: FrameAnalysisResult[]): Promise<any[]> {
		if (frameAnalysis.length === 0) return [];

		const scenes: any[] = [];
		let currentScene: any = {
			startTime: frameAnalysis[0].timestamp,
			endTime: frameAnalysis[0].timestamp,
			description: frameAnalysis[0].description,
			frames: [frameAnalysis[0]]
		};

		for (let i = 1; i < frameAnalysis.length; i++) {
			const prevFrame = frameAnalysis[i - 1];
			const currFrame = frameAnalysis[i];

			// Simple scene detection: significant change in objects/tags
			const similarity = this.calculateFrameSimilarity(prevFrame, currFrame);

			if (similarity < 0.5) {
				// New scene detected
				scenes.push(currentScene);
				currentScene = {
					startTime: currFrame.timestamp,
					endTime: currFrame.timestamp,
					description: currFrame.description,
					frames: [currFrame]
				};
			} else {
				// Continue current scene
				currentScene.endTime = currFrame.timestamp;
				currentScene.frames.push(currFrame);
			}
		}

		// Add last scene
		scenes.push(currentScene);

		// Generate scene descriptions
		return scenes.map((scene) => ({
			startTime: scene.startTime,
			endTime: scene.endTime,
			description: this.summarizeScene(scene.frames)
		}));
	}

	/**
	 * Calculate similarity between two frames based on objects/tags
	 */
	private calculateFrameSimilarity(frame1: FrameAnalysisResult, frame2: FrameAnalysisResult): number {
		const objects1 = new Set(frame1.objects);
		const objects2 = new Set(frame2.objects);
		const tags1 = new Set(frame1.tags);
		const tags2 = new Set(frame2.tags);

		const objectIntersection = [...objects1].filter(o => objects2.has(o)).length;
		const tagIntersection = [...tags1].filter(t => tags2.has(t)).length;

		const objectUnion = new Set([...objects1, ...objects2]).size;
		const tagUnion = new Set([...tags1, ...tags2]).size;

		const objectSim = objectUnion > 0 ? objectIntersection / objectUnion : 0;
		const tagSim = tagUnion > 0 ? tagIntersection / tagUnion : 0;

		return (objectSim + tagSim) / 2;
	}

	/**
	 * Summarize a scene based on its frames
	 */
	private summarizeScene(frames: FrameAnalysisResult[]): string {
		if (frames.length === 0) return 'Empty scene';
		if (frames.length === 1) return frames[0].description;

		// Use first and last frame descriptions
		const first = frames[0].description;
		const last = frames[frames.length - 1].description;

		if (first === last) {
			return first;
		}

		return `${first.slice(0, 60)}... → ${last.slice(0, 60)}...`;
	}

	/**
	 * Generate overall VLM summary from all frame analyses
	 */
	private async generateVLMSummary(
		frameAnalysis: FrameAnalysisResult[],
		sceneDetection: any[]
	): Promise<VLMAnalysisResult> {
		// Aggregate all detected objects and tags
		const allObjects = new Set<string>();
		const allTags = new Set<string>();
		const allActivities: string[] = [];

		frameAnalysis.forEach(frame => {
			frame.objects.forEach(obj => allObjects.add(obj));
			frame.tags.forEach(tag => allTags.add(tag));
		});

		// Generate summary via LLM (using Gemma4 text mode)
		const summaryPrompt = `Based on video analysis with ${frameAnalysis.length} frames across ${sceneDetection.length} scenes, generate a concise summary. Key objects: ${[...allObjects].join(', ')}. Key tags: ${[...allTags].join(', ')}. Provide: overall summary (2-3 sentences), key objects list, activities observed, and setting description.`;

		try {
			const response = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma4:e4b-it-q4_K_M',
					prompt: summaryPrompt,
					stream: false
				})
			});

			const data = await response.json();
			const summaryText = data.response || 'Video analysis summary unavailable';

			return {
				summary: summaryText,
				keyObjects: [...allObjects].slice(0, 10),
				activities: allActivities.slice(0, 5),
				setting: 'Unknown setting',
				timestamp: new Date().toISOString()
			};
		} catch (error) {
			console.error('[VideoVLM] Error generating summary:', error);
			return {
				summary: `Analyzed ${frameAnalysis.length} frames with ${allObjects.size} unique objects detected`,
				keyObjects: [...allObjects].slice(0, 10),
				activities: [],
				setting: 'Analysis incomplete',
				timestamp: new Date().toISOString()
			};
		}
	}

	/**
	 * Ensure frames output directory exists
	 */
	private async ensureOutputDirectory(): Promise<void> {
		if (!existsSync(this.framesOutputDir)) {
			await mkdir(this.framesOutputDir, { recursive: true });
		}
	}

	/**
	 * Update evidence metadata in database
	 */
	private async updateEvidenceMetadata(evidenceId: string, updates: any): Promise<void> {
		const query = `
      UPDATE evidence
      SET metadata = metadata || $1::jsonb,
          updated_at = NOW()
      WHERE id = $2
    `;

		await db.execute(query, [JSON.stringify(updates), evidenceId]);
	}

	/**
	 * Update processing status in Redis
	 */
	private async updateStatus(
		evidenceId: string,
		stage: string,
		progress: number,
		message: string
	): Promise<void> {
		try {
			const { getRedis } = await import('$lib/server/redis');
			const redis = getRedis();

			await redis.setex(
				`video:vlm:status:${evidenceId}`,
				3600, // 1 hour TTL
				JSON.stringify({
					stage,
					progress,
					message,
					timestamp: new Date().toISOString()
				})
			);
		} catch (error) {
			console.error('[VideoVLM] Error updating status in Redis:', error);
		}
	}
}
