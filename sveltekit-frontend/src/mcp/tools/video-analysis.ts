/**
 * Video Analysis Tools for FastMCP
 * Tools 11-13: Video frame extraction, Stable Diffusion generation, facial analysis
 */

import { z } from 'zod';
import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Tool 11: Extract frames from video evidence
 */
export const videoToFramesTool = {
	name: 'video_to_frames',
	description: 'Extract frames from video evidence (depositions, surveillance, courtroom recordings) for analysis',
	parameters: z.object({
		videoPath: z.string().describe('Path to video file (local path or MinIO key)'),
		fps: z.number().default(1.0).describe('Frames per second to extract (1.0 = 1 frame/sec, 30.0 = full FPS)'),
		outputDir: z.string().optional().describe('Output directory for frames (auto-generated if not specified)'),
		quality: z.number().min(1).max(100).default(95).describe('JPEG quality (1-100)'),
		format: z.enum(['jpg', 'png']).default('jpg').describe('Output image format')
	}),
	execute: async ({ videoPath, fps, outputDir, quality, format }) => {
		const output = outputDir || `./frames/${Date.now()}`;

		return new Promise((resolve, reject) => {
			const args = [
				'scripts/video-to-frames.py',
				videoPath,
				'-o', output,
				'-f', fps.toString(),
				'-q', quality.toString(),
				'--format', format
			];

			const proc = spawn('python', args);

			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data) => {
				stdout += data.toString();
				console.log(data.toString()); // Stream output to console
			});

			proc.stderr.on('data', (data) => {
				stderr += data.toString();
				console.error(data.toString());
			});

			proc.on('close', async (code) => {
				if (code === 0) {
					// Read metadata
					const metadataPath = join(output, 'metadata.json');
					const metadata = JSON.parse(await readFile(metadataPath, 'utf-8'));

					resolve({
						success: true,
						framesDir: output,
						framesExtracted: metadata.extracted_frames,
						videoFPS: metadata.video_fps,
						extractFPS: metadata.extract_fps,
						duration: metadata.duration_sec,
						timestamps: metadata.timestamps,
						metadataPath
					});
				} else {
					reject(new Error(`Frame extraction failed (code ${code}): ${stderr || stdout}`));
				}
			});
		});
	}
};

/**
 * Tool 12: Generate images with Stable Diffusion
 */
export const stableDiffusionGenerateTool = {
	name: 'stable_diffusion_generate',
	description: 'Generate images from text prompts using Stable Diffusion (legal document visualization, crime scene reconstruction, etc.)',
	parameters: z.object({
		prompt: z.string().describe('Text prompt describing the image to generate'),
		negativePrompt: z.string().optional().describe('Negative prompt (what to avoid)'),
		width: z.number().default(1024).describe('Image width in pixels'),
		height: z.number().default(1024).describe('Image height in pixels'),
		steps: z.number().default(30).describe('Inference steps (20-50, higher = better quality)'),
		cfgScale: z.number().default(7.5).describe('CFG scale (1-20, higher = more prompt adherence)'),
		seed: z.number().optional().describe('Random seed for reproducibility'),
		numImages: z.number().min(1).max(4).default(1).describe('Number of images to generate')
	}),
	execute: async ({ prompt, negativePrompt, width, height, steps, cfgScale, seed, numImages }) => {
		// Call Triton SDXL endpoint (port 8100)
		const SDXL_URL = process.env.SDXL_SERVICE_URL || 'http://localhost:8100';

		const payload = {
			prompt,
			negative_prompt: negativePrompt || 'blurry, low quality, distorted',
			width,
			height,
			num_inference_steps: steps,
			guidance_scale: cfgScale,
			num_images_per_prompt: numImages,
			...(seed !== undefined && { seed })
		};

		try {
			const response = await fetch(`${SDXL_URL}/v2/models/sdxl_legal/infer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				throw new Error(`SDXL inference failed: ${response.statusText}`);
			}

			const result = await response.json();

			// Images are base64-encoded in result.images
			return {
				success: true,
				images: result.images, // Array of base64 image strings
				prompt,
				negativePrompt,
				config: { width, height, steps, cfgScale, seed },
				count: result.images.length
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				fallback: 'SDXL service unavailable - check port 8100'
			};
		}
	}
};

/**
 * Tool 13: Analyze faces in image/video frames
 */
export const facialAnalysisTool = {
	name: 'facial_analysis',
	description: 'Detect and analyze faces in images or video frames (witness identification, security footage analysis)',
	parameters: z.object({
		imagePath: z.string().describe('Path to image or video frame'),
		detectOnly: z.boolean().default(false).describe('Only detect faces (no identification)'),
		confidenceThreshold: z.number().min(0).max(1).default(0.7).describe('Minimum confidence for face detection')
	}),
	execute: async ({ imagePath, detectOnly, confidenceThreshold }) => {
		// Use OpenCV for face detection
		return new Promise((resolve, reject) => {
			const args = [
				'scripts/facial-analysis.py',
				imagePath,
				'--confidence', confidenceThreshold.toString()
			];

			if (detectOnly) {
				args.push('--detect-only');
			}

			const proc = spawn('python', args);

			let stdout = '';
			let stderr = '';

			proc.stdout.on('data', (data) => stdout += data.toString());
			proc.stderr.on('data', (data) => stderr += data.toString());

			proc.on('close', (code) => {
				if (code === 0) {
					const result = JSON.parse(stdout);
					resolve({
						success: true,
						facesDetected: result.faces.length,
						faces: result.faces,
						imagePath,
						confidenceThreshold
					});
				} else {
					reject(new Error(`Facial analysis failed: ${stderr || stdout}`));
				}
			});
		});
	}
};

// Export all video analysis tools
export const videoAnalysisTools = [
	videoToFramesTool,
	stableDiffusionGenerateTool,
	facialAnalysisTool
];
