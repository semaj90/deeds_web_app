import { createHash } from 'node:crypto';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import type { AnalysisPipelineResult } from '$lib/server/analysis/evidence-analysis-pipeline.js';
import type { VLMAnalysisResult } from '$lib/server/analysis/vlm-evidence-analyzer.js';

const imageMimeSchema = z.enum([
	'image/png',
	'image/jpeg',
	'image/tiff',
	'image/bmp',
	'image/webp',
]);

const imageInputSchema = z.object({
	evidenceId: z.string().uuid(),
	caseId: z.string().uuid().optional(),
	fileName: z.string().trim().min(1).max(255),
	contentType: imageMimeSchema,
	buffer: z.custom<Buffer>(Buffer.isBuffer).refine((buffer) => buffer.length > 0 && buffer.length <= 32 * 1024 * 1024),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict();

const depthResponseSchema = z.object({
	depth_base64: z.string().min(1).max(48 * 1024 * 1024).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
	width: z.number().int().min(1).max(8192),
	height: z.number().int().min(1).max(8192),
	processing_time_ms: z.number().finite().nonnegative().optional(),
}).passthrough();

const depthConfigSchema = z.object({ endpoint: z.string().url(), bucket: z.string().trim().min(1).max(63) });

export interface EvidenceVisualAnalysisDependenciesV1 {
	runPipeline(input: { evidenceId: string; caseId?: string; fileName: string; buffer: Buffer }): Promise<AnalysisPipelineResult>;
	analyzeVlm(input: { buffer: Buffer; fileName: string; detectionContext?: string }): Promise<VLMAnalysisResult>;
	getDepthConfig(): { endpoint: string; bucket: string } | null;
	fetchDepth(url: string, imageBase64: string): Promise<unknown>;
	uploadDepth(bucket: string, key: string, bytes: Buffer): Promise<void>;
}

export interface EvidenceVisualAnalysisV1 {
	schema: 'atlas.evidence-visual-analysis.v1';
	authority: 'OBSERVATION_ONLY';
	sourceRevision: string;
	status: 'COMPLETE' | 'PARTIAL' | 'UNAVAILABLE';
	objectDetections: Array<{ class: string; confidence: number; bbox: number[] }>;
	layoutRegions: Array<{ type: string; confidence: number; bbox: number[] }>;
	visionSummary: string | null;
	visionFindings: string[];
	visionTags: string[];
	depthMap: { objectKey: string; width: number; height: number; processingTimeMs: number | null } | null;
	stageErrors: string[];
}

const pipelineResultSchema = z.object({
	yolo: z.object({
		objects: z.array(z.object({
			class: z.string().min(1).max(100),
			confidence: z.number().finite().min(0).max(1),
			bbox: z.array(z.number().finite()).length(4),
		})),
		layout: z.object({
			regions: z.array(z.object({
				type: z.string().min(1).max(100),
				confidence: z.number().finite().min(0).max(1),
				bbox: z.array(z.number().finite()).length(4),
			})),
		}),
	}).nullable(),
}).passthrough();

const vlmResultSchema = z.object({
	summary: z.string().max(5000),
	keyFindings: z.array(z.string().max(2000)).max(100),
	suggestedTags: z.array(z.string().max(100)).max(100),
}).passthrough();

const defaultDependencies: EvidenceVisualAnalysisDependenciesV1 = {
	runPipeline: async (input) => {
		const { runEvidenceAnalysisPipeline } = await import('$lib/server/analysis/evidence-analysis-pipeline.js');
		return runEvidenceAnalysisPipeline(input);
	},
	analyzeVlm: async (input) => {
		const { analyzeEvidenceImage } = await import('$lib/server/analysis/vlm-evidence-analyzer.js');
		return analyzeEvidenceImage(input);
	},
	getDepthConfig: () => ENV.IMAGE_SYNTHESIS_URL && ENV.MINIO_EVIDENCE_BUCKET
		? { endpoint: ENV.IMAGE_SYNTHESIS_URL, bucket: ENV.MINIO_EVIDENCE_BUCKET }
		: null,
	fetchDepth: async (url, imageBase64) => {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ image_base64: imageBase64 }),
			signal: AbortSignal.timeout(60_000),
		});
		if (!response.ok) throw new Error(`DEPTH_SERVICE_HTTP_${response.status}`);
		return response.json();
	},
	uploadDepth: async (bucket, key, bytes) => {
		const { uploadSeaweedFile } = await import('$lib/server/seaweed-client.js');
		await uploadSeaweedFile(bucket, key, bytes, {
			'Content-Type': 'image/png',
			'X-Analysis-Type': 'depth_map',
		});
	},
};

function boundedError(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	return message.slice(0, 300);
}

export async function analyzeEvidenceImageV1(
	input: unknown,
	dependencies: EvidenceVisualAnalysisDependenciesV1 = defaultDependencies,
): Promise<EvidenceVisualAnalysisV1> {
	const parsed = imageInputSchema.safeParse(input);
	if (!parsed.success) throw new Error(`EVIDENCE_VISUAL_INPUT_INVALID:${parsed.error.issues[0]?.path.join('.') ?? 'input'}`);
	const image = parsed.data;
	const actualRevision = `sha256:${createHash('sha256').update(image.buffer).digest('hex')}`;
	if (actualRevision !== image.sourceRevision) throw new Error('EVIDENCE_VISUAL_SOURCE_REVISION_MISMATCH');

	const pipelinePromise = dependencies.runPipeline({
		evidenceId: image.evidenceId,
		caseId: image.caseId,
		fileName: image.fileName,
		buffer: image.buffer,
	});
	const vlmPromise = dependencies.analyzeVlm({ buffer: image.buffer, fileName: image.fileName });
	const depthPromise = async () => {
		const config = dependencies.getDepthConfig();
		if (!config) throw new Error('DEPTH_SERVICE_OR_EVIDENCE_BUCKET_NOT_CONFIGURED');
		const parsedConfig = depthConfigSchema.safeParse(config);
		if (!parsedConfig.success || !/^https?:$/.test(new URL(config.endpoint).protocol)) {
			throw new Error('DEPTH_SERVICE_URL_INVALID');
		}
		const response = depthResponseSchema.parse(await dependencies.fetchDepth(`${config.endpoint.replace(/\/$/, '')}/depth`, image.buffer.toString('base64')));
		const bytes = Buffer.from(response.depth_base64, 'base64');
		if (bytes.length < 8 || bytes.length > 32 * 1024 * 1024) throw new Error('DEPTH_MAP_SIZE_INVALID');
		if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
			throw new Error('DEPTH_MAP_PNG_SIGNATURE_INVALID');
		}
		const key = `evidence/${image.caseId ?? 'default'}/${image.evidenceId}-depth.png`;
		await dependencies.uploadDepth(config.bucket, key, bytes);
		return { objectKey: key, width: response.width, height: response.height, processingTimeMs: response.processing_time_ms ?? null };
	};

	const [pipelineSettled, vlmSettled, depthSettled] = await Promise.allSettled([
		pipelinePromise,
		vlmPromise,
		depthPromise(),
	]);
	const stageErrors: string[] = [];
	const pipeline = pipelineSettled.status === 'fulfilled'
		? pipelineResultSchema.safeParse(pipelineSettled.value)
		: null;
	if (pipelineSettled.status === 'rejected') stageErrors.push(`detection:${boundedError(pipelineSettled.reason)}`);
	else if (!pipeline?.success) stageErrors.push('detection:RESULT_SCHEMA_INVALID');
	const vlm = vlmSettled.status === 'fulfilled' ? vlmResultSchema.safeParse(vlmSettled.value) : null;
	if (vlmSettled.status === 'rejected') stageErrors.push(`vision:${boundedError(vlmSettled.reason)}`);
	else if (!vlm?.success) stageErrors.push('vision:RESULT_SCHEMA_INVALID');
	if (depthSettled.status === 'rejected') stageErrors.push(`depth:${boundedError(depthSettled.reason)}`);

	const objectDetections = pipeline?.success ? pipeline.data.yolo?.objects ?? [] : [];
	const layoutRegions = pipeline?.success ? pipeline.data.yolo?.layout.regions ?? [] : [];
	const vision = vlm?.success ? vlm.data : null;
	const depthMap = depthSettled.status === 'fulfilled' ? depthSettled.value : null;
	const completedStages = Number(pipeline?.success && pipeline.data.yolo !== null) + Number(vision !== null) + Number(depthMap !== null);
	return {
		schema: 'atlas.evidence-visual-analysis.v1',
		authority: 'OBSERVATION_ONLY',
		sourceRevision: image.sourceRevision,
		status: completedStages === 3 ? 'COMPLETE' : completedStages > 0 ? 'PARTIAL' : 'UNAVAILABLE',
		objectDetections,
		layoutRegions,
		visionSummary: vision?.summary ?? null,
		visionFindings: vision?.keyFindings ?? [],
		visionTags: vision?.suggestedTags ?? [],
		depthMap,
		stageErrors,
	};
}
