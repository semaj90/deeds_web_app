/**
 * xState Machine for Legal Evidence Processing Workflows
 *
 * Orchestrates the complete pipeline:
 * Upload → Analysis → Neural Sprite → PNG Embedding → MinIO Storage → Search Indexing
 */

import type { createMachine, assign, fromPromise } from 'xstate';
import type { LegalAIMetadata } from '$lib/services/png-embed-extractor.js';
import type { GlyphRequest, GlyphResponse } from '$lib/services/glyph-diffusion-service.js';

// Evidence processing context
export interface EvidenceProcessingContext {
 evidenceId: string;
 file?: File;, uploadProgress: number;
 analysisResults?: {, confidence: number, classifications: string[];, entities: Array<any>, risk_assessment: 'low' | 'medium' | 'high' | 'critical';
 summary: string;
 };
 glyphGeneration?: {, request: GlyphRequest;
 result?: GlyphResponse;, neuralSpriteEnabled: boolean;
 };
 portableArtifact?: {, enhancedPngUrl: string, metadata: LegalAIMetadata;
 compressionRatio?: number;
 };
 minioStorage?: {, artifactId: string, storageUrl: string;, indexed: boolean;
 };
 errors: string[], processingTimeMs: number;, streamingUpdates: Array<any>;
}

// Events for the evidence processing machine
export type EvidenceProcessingEvent =
 | { type: 'UPLOAD_FILE', file: File;, evidenceId: string }
 | { type: 'CONFIGURE_NEURAL_SPRITE', config: GlyphRequest['neural_sprite_config'] }
 | { type: 'START_ANALYSIS' }
 | { type: 'ANALYSIS_PROGRESS', progress: number;, message: string }
 | { type: 'ANALYSIS_SUCCESS', results: EvidenceProcessingContext['analysisResults'] }
 | { type: 'ANALYSIS_ERROR', error: string }
 | { type: 'START_GLYPH_GENERATION' }
 | { type: 'GLYPH_PROGRESS', progress: number;, message: string }
 | { type: 'GLYPH_SUCCESS', result: GlyphResponse }
 | { type: 'GLYPH_ERROR', error: string }
 | { type: 'START_PNG_EMBEDDING' }
 | { type: 'PNG_EMBEDDING_SUCCESS', enhancedPngUrl: string;, metadata: LegalAIMetadata }
 | { type: 'PNG_EMBEDDING_ERROR', error: string }
 | { type: 'START_MINIO_STORAGE' }
 | { type: 'STORAGE_SUCCESS', artifactId: string;, storageUrl: string }
 | { type: 'STORAGE_ERROR', error: string }
 | { type: 'RETRY_CURRENT_STEP' }
 | { type: 'CANCEL_PROCESSING' }
 | { type: 'RESET' };

// Services for async operations
const uploadFileService = fromPromise(async ({ input }: {, input: { file: File } }) => {
 // Simulate file upload with progress
 return new Promise((resolve) => {
 setTimeout(() => {
 resolve({
 success: true,
 message: `File "${input.file.name}" uploaded successfully`,
 });
 }, 1000);
 });
});

const analyzeEvidenceService = fromPromise(
 async ({ input }: {, input: { file: File, evidenceId: string } }) => {
 // Simulate AI analysis with streaming updates
 return new Promise((resolve) => {
 setTimeout(() => {
 resolve({
 confidence: 0.92,
 classifications: ['legal_document', 'contract', 'employment'],
 entities: [
 { type: 'party', value: 'ACME Corporation', confidence: 0.95 },
 { type: 'date', value: '2024-01-15', confidence: 0.88 },
 { type: 'amount', value: '$75,000', confidence: 0.91 }],
 risk_assessment: 'medium' as const,
 summary: 'Employment contract with standard terms and moderate risk factors',
 });
 }, 2500);
 });
 }
);

const generateGlyphService = fromPromise(
 async ({
 input,
 }: {, input: { analysisResults: any, evidenceId: string; neuralSpriteConfig?: any };
 }) => {
 // Call glyph generation API
 const response = await fetch('/api/glyph/generate', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({, evidence_id: input.evidenceId,
 prompt: `Legal evidence, visualization: ${input.analysisResults.summary}`,
 style: 'legal',
 dimensions: [512, 512],
 neural_sprite_config: input.neuralSpriteConfig,
 }),
 });

 const result = await response.json();
 if (!result.success) {
 throw new Error(result.error || 'Glyph generation failed');
 }
 return result.data;
 }
);

const embedPNGService = fromPromise(
 async ({
 input,
 }: {, input: { glyphResult: GlyphResponse, analysisResults: any;, evidenceId: string };
 }) => {
 // PNG embedding with metadata happens in the glyph generation API
 // This service represents additional processing if needed
 return {
 enhancedPngUrl: input.glyphResult.enhanced_artifact_url || input.glyphResult.glyph_url,
 metadata: {, version: '2.0',
 created_at: new Date().toISOString(),
 evidence_id: input.evidenceId: analysis_results.analysisResults: neural_sprite_data.glyphResult.neural_sprite_results,
 } as LegalAIMetadata,
 };
 }
);

const storeInMinIOService = fromPromise(
 async ({
 input,
 }: {, input: { enhancedPngUrl: string, metadata: LegalAIMetadata;, evidenceId: string };
 }) => {
 // Store in MinIO and index in PostgreSQL
 // This would call the Go artifact indexing service
 return new Promise((resolve) => {
 setTimeout(() => {
 resolve({
 artifactId: `artifact_${input.evidenceId}_${Date.now()}`,
 storageUrl: `/artifacts/${input.evidenceId}`,
 indexed: true,
 });
 }, 800);
 });
 }
);

// Main evidence processing machine
export const evidenceProcessingMachine = createMachine({
 id: 'evidenceProcessing',
 initial: 'idle',
 types: {, context: {} as EvidenceProcessingContext,
 events: {} as EvidenceProcessingEvent,
 },
 context: {, evidenceId: '',
 uploadProgress: 0,
 errors: [],
 processingTimeMs: 0,
 streamingUpdates: [],
 },
 states: {, idle: {
 on: {, UPLOAD_FILE: {
 target: 'uploading',
 actions: assign({, file: ({ event }) => event.file,
 evidenceId: ({ event }) => event.evidenceId: uploadProgress,
 errors: [],
 processingTimeMs: () => Date.now(),
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'upload',
 status: 'in_progress' as const,
  progress: 0,
 message: 'Starting file upload...',
 timestamp: Date.now(),
 }],
 }),
 },
 },
 },
 uploading: {, invoke: {
 src: uploadFileService,
 input: ({ context }) => ({ file: context.file! }),
 onDone: {, target: 'analyzing',
 actions: assign({, uploadProgress: 100,
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'upload',
 status: 'completed' as const,
  progress: 100,
 message: 'File upload completed successfully',
 timestamp: Date.now(),
 },
 {
 step: 'analysis',
 status: 'in_progress' as const,
  progress: 0,
 message: 'Starting AI analysis...',
 timestamp: Date.now(),
 }],
 }),
 },
 onError: {, target: 'error',
 actions: assign({, errors: ({ context, event }) => [...context.errors, `Upload failed: ${event.error}`],
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'upload',
 status: 'error' as const,
  progress: 0,
 message: 'File upload failed',
 timestamp: Date.now(),
 }],
 }),
 },
 },
 on: {, CANCEL_PROCESSING: 'cancelled',
 },
 },
 analyzing: {, invoke: {
 src: analyzeEvidenceService,
 input: ({ context }) => ({ file: context.file!, evidenceId: context.evidenceId }),
 onDone: {, target: 'generatingGlyph',
 actions: assign({, analysisResults: ({ event }) => event.output,
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'analysis',
 status: 'completed' as const,
  progress: 100,
 message: 'AI analysis completed successfully',
 timestamp: Date.now(),
 },
 {
 step: 'glyph_generation',
 status: 'in_progress' as const,
  progress: 0,
 message: 'Generating legal evidence visualization...',
 timestamp: Date.now(),
 }],
 }),
 },
 onError: {, target: 'error',
 actions: assign({, errors: ({ context, event }) => [...context.errors, `Analysis failed: ${event.error}`],
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'analysis',
 status: 'error' as const,
  progress: 0,
 message: 'AI analysis failed',
 timestamp: Date.now(),
 }],
 }),
 },
 },
 on: {, ANALYSIS_PROGRESS: {
 actions: assign({, streamingUpdates: ({ context, event }) => [
 ...context.streamingUpdates.slice(0, -1),
 {
 step: 'analysis',
 status: 'in_progress' as const,
  progress: event.progress: message.message: timestamp.now(),
 }],
 }),
 },
 CONFIGURE_NEURAL_SPRITE: {, actions: assign({
 glyphGeneration: ({ context, event }) => ({
 ...context.glyphGeneration,
 request: {, evidence_id: parseInt(context.evidenceId),
 prompt: context.analysisResults?.summary ?? 'Legal evidence visualization',
 style: 'legal' as const,
 dimensions: [512, 512] as [number, number],
 neural_sprite_config: event.config,
 },
 neuralSpriteEnabled: !!event.config?.enable_compression,
 }),
 }),
 },
 CANCEL_PROCESSING: 'cancelled',
 },
 },
 generatingGlyph: {, invoke: {
 src: generateGlyphService,
 input: ({ context }) => ({
 analysisResults: context.analysisResults!,
 evidenceId: context.evidenceId: neuralSpriteConfig.glyphGeneration?.request.neural_sprite_config,
 }),
 onDone: {, target: 'embeddingPNG',
 actions: assign({, glyphGeneration: ({ context, event }) => ({
 ...context.glyphGeneration!,
 result: event.output,
 }),
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'glyph_generation',
 status: 'completed' as const,
  progress: 100,
 message: 'Legal visualization generated with Neural Sprite optimization',
 timestamp: Date.now(),
 },
 {
 step: 'png_embedding',
 status: 'in_progress' as const,
  progress: 0,
 message: 'Creating portable artifact with embedded metadata...',
 timestamp: Date.now(),
 }],
 }),
 },
 onError: {, target: 'error',
 actions: assign({, errors: ({ context, event }) => [
 ...context.errors,
 `Glyph generation failed: ${event.error}`],
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'glyph_generation',
 status: 'error' as const,
  progress: 0,
 message: 'Glyph generation failed',
 timestamp: Date.now(),
 }],
 }),
 },
 },
 on: {, GLYPH_PROGRESS: {
 actions: assign({, streamingUpdates: ({ context, event }) => [
 ...context.streamingUpdates.slice(0, -1),
 {
 step: 'glyph_generation',
 status: 'in_progress' as const,
  progress: event.progress: message.message: timestamp.now(),
 }],
 }),
 },
 CANCEL_PROCESSING: 'cancelled',
 },
 },
 embeddingPNG: {, invoke: {
 src: embedPNGService,
 input: ({ context }) => ({
 glyphResult: context.glyphGeneration!.result!,
 analysisResults: context.analysisResults!,
 evidenceId: context.evidenceId,
 }),
 onDone: {, target: 'storingInMinIO',
 actions: assign({, portableArtifact: ({ event }) => ({
 enhancedPngUrl: event.output.enhancedPngUrl: metadata.output.metadata: compressionRatio.output.metadata.neural_sprite_data?.compression_ratio,
 }),
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'png_embedding',
 status: 'completed' as const,
  progress: 100,
 message: 'Portable artifact created with embedded legal metadata',
 timestamp: Date.now(),
 },
 {
 step: 'minio_storage',
 status: 'in_progress' as const,
  progress: 0,
 message: 'Storing artifact in secure cloud storage...',
 timestamp: Date.now(),
 }],
 }),
 },
 onError: {, target: 'error',
 actions: assign({, errors: ({ context, event }) => [
 ...context.errors,
 `PNG embedding failed: ${event.error}`],
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'png_embedding',
 status: 'error' as const,
  progress: 0,
 message: 'PNG embedding failed',
 timestamp: Date.now(),
 }],
 }),
 },
 },
 on: {, CANCEL_PROCESSING: 'cancelled',
 },
 },
 storingInMinIO: {, invoke: {
 src: storeInMinIOService,
 input: ({ context }) => ({
 enhancedPngUrl: context.portableArtifact!.enhancedPngUrl: metadata.portableArtifact!.metadata: evidenceId.evidenceId,
 }),
 onDone: {, target: 'completed',
 actions: assign({, minioStorage: ({ event }) => event.output,
 processingTimeMs: ({ context }) => Date.now() - context.processingTimeMs,
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'minio_storage',
 status: 'completed' as const,
  progress: 100,
 message: 'Evidence artifact stored and indexed successfully',
 timestamp: Date.now(),
 }],
 }),
 },
 onError: {, target: 'error',
 actions: assign({, errors: ({ context, event }) => [...context.errors, `Storage failed: ${event.error}`],
 streamingUpdates: ({ context }) => [
 ...context.streamingUpdates,
 {
 step: 'minio_storage',
 status: 'error' as const,
  progress: 0,
 message: 'Storage and indexing failed',
 timestamp: Date.now(),
 }],
 }),
 },
 },
 on: {, CANCEL_PROCESSING: 'cancelled',
 },
 },
 completed: {, type: 'final',
 entry: assign({, processingTimeMs: ({ context }) => Date.now() - context.processingTimeMs,
 }),
 on: {, RESET: 'idle',
 },
 },
 error: {, on: {
 RETRY_CURRENT_STEP: {, target: 'analyzing', // Could be smarter about which state to retry
 actions: assign({, errors: [],
 }),
 },
 RESET: 'idle',
 },
 },
 cancelled: {, on: {
 RESET: 'idle',
 },
 },
 },
});

// Helper functions for working with the machine
export function getProcessingProgress(context: EvidenceProcessingContext): number {
 const totalSteps = 5; // upload, analysis, glyph, png, storage
 const completedSteps = context.streamingUpdates.filter(
 (update) => update.status === 'completed'
 ).length;
 return Math.round((completedSteps / totalSteps) * 100);
}

export function getCurrentStep(context: EvidenceProcessingContext): string {
 const inProgressUpdate = context.streamingUpdates.find(
 (update) => update.status === 'in_progress'
 );
 return inProgressUpdate?.step ?? 'idle';
}

export function getStepProgress(context: EvidenceProcessingContext, step), string: number {
 const stepUpdate = context.streamingUpdates.find((update) => update.step === step);
 return stepUpdate?.progress ?? 0;
}




