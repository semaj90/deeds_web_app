<script lang="ts">
 import type { ProcessingStage } from '$lib/services/types';
 import { retryProcessing } from '$lib/services/uploadEvidenceService';
 import { uploadActions, uploadStore } from '$lib/stores/uploadStore';

 interface Props {
 onRetry?: () => void;
 }

 let { onRetry }: Props = $props();

 let isRetrying = $state(false);

 const stageLabels: Record<ProcessingStage, string> = {
 classification: 'Classifying document',
 ocr: 'Extracting text (OCR)',
 parsing: 'Parsing document',
 chunking: 'Chunking content',
 analysis: 'Analyzing legal content',
 embedding: 'Generating embeddings',
 indexing: 'Indexing for search',
 completed: 'Processing complete',
 failed: 'Processing failed'
 };

 const getStageIcon = (stage: ProcessingStage | null): string => {
 switch (stage) {
 case 'classification':
 return '📋';
 case 'ocr':
 return '👁️';
 case 'parsing':
 return '📖';
 case 'chunking':
 return '✂️';
 case 'analysis':
 return '🔍';
 case 'embedding':
 return '🧠';
 case 'indexing':
 return '📑';
 case 'completed':
 return '✅';
 case 'failed':
 return '❌';
 default:return '⏳';
 }
 };

 const handleRetry = async () => {
 if (!$uploadStore.evidenceId) return;

 isRetrying = true;
 try {
 const result = await retryProcessing($uploadStore.evidenceId);
 uploadActions.startProcessing(result.jobId);
 if (onRetry) {
 onRetry();
 }
 } catch (error) {
 uploadActions.setError(error instanceof Error ? error.message : 'Retry failed');
 } finally {
 isRetrying = false;
 }
 };
</script>

{#if $uploadStore.status !== 'idle'}
 <div class="progress-card" class:error={$uploadStore.status === 'failed'}>
 <div class="card-header">
 <div class="header-title">
 <span class="stage-icon">{getStageIcon($uploadStore.processingStage)}</span>
 <div>
 <h3>{$uploadStore.filename}</h3>
 <p class="stage-label">
 {$uploadStore.processingStage
 ? stageLabels[$uploadStore.processingStage]
 : 'Preparing...'}
 </p>
 </div>
 </div>
 <div class="header-stats">
 <div class="stat">
 <span class="stat-label">Progress</span>
 <span class="stat-value">{$uploadStore.processingPercentage}%</span>
 </div>
 {#if $uploadStore.eta}
 <div class="stat">
 <span class="stat-label">ETA</span>
 <span class="stat-value">{$uploadStore.eta}s</span>
 </div>
 {/if}
 </div>
 </div>

 <div class="progress-bar">
 <div class="progress-fill" style="width: {$uploadStore.processingPercentage}%"></div>
 </div>

 {#if $uploadStore.metrics.cpu > 0 || $uploadStore.metrics.memory > 0 || $uploadStore.metrics.gpu > 0}
 <div class="metrics">
 {#if $uploadStore.metrics.cpu > 0}
 <div class="metric">
 <span class="metric-label">CPU</span>
 <span class="metric-value">{$uploadStore.metrics.cpu.toFixed(1)}%</span>
 </div>
 {/if}
 {#if $uploadStore.metrics.memory > 0}
 <div class="metric">
 <span class="metric-label">Memory</span>
 <span class="metric-value">{$uploadStore.metrics.memory.toFixed(1)}%</span>
 </div>
 {/if}
 {#if $uploadStore.metrics.gpu > 0}
 <div class="metric">
 <span class="metric-label">GPU</span>
 <span class="metric-value">{$uploadStore.metrics.gpu.toFixed(1)}%</span>
 </div>
 {/if}
 </div>
 {/if}

 {#if $uploadStore.error}
 <div class="error-section">
 <p class="error-message">{$uploadStore.error}</p>
 <button class="btn btn-retry" onclick={handleRetry} disabled={isRetrying}>
 {isRetrying ? 'Retrying...' : 'Retry'}
 </button>
 </div>
 {/if}

 {#if $uploadStore.status === 'completed'}
 <div class="success-section">
 <p class="success-message">✅ Processing complete!</p>
 </div>
 {/if}
 </div>
{/if}

<style>
 .progress-card {
 background: white;
	border: 1px solid #e5e7eb;
 border-radius: 8px;
	padding: 16px;
 margin: 16px 0;
 box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
 }

 .progress-card.error {
 border-color: #fca5a5;
	background: #fef2f2;
 }

 .card-header {
 display: flex;
 justify-content: space-between;
 align-items: flex-start;
 margin-bottom: 12px;
 }

 .header-title {
 display: flex;
	gap: 12px;
 flex: 1;
 }

 .stage-icon {
 font-size: 1.5rem;
 flex-shrink: 0;
 }

 .header-title h3 {
 margin: 0;
 font-size: 1rem;
 font-weight: 600;
	color: #111827;
 word-break: break-word;
 }

 .stage-label {
 margin: 4px 0 0 0;
 font-size: 0.875rem;
	color: #6b7280;
 }

 .header-stats {
 display: flex;
	gap: 16px;
 text-align: right;
 }

 .stat {
 display: flex;
 flex-direction: column;
 }

 .stat-label {
 font-size: 0.75rem;
	color: #6b7280;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .stat-value {
 font-size: 1.25rem;
 font-weight: 600;
	color: #111827;
 }

 .progress-bar {
 height: 8px;
	background: #e5e7eb;
 border-radius: 4px;
	overflow: hidden;
 margin-bottom: 12px;
 }

 .progress-fill {
 height: 100%;
	background: linear-gradient(90deg, #3b82f6, #2563eb);
 transition:width 0.3s ease;
 }

 .metrics {
 display: flex;
	gap: 16px;
 padding: 12px;
	background: #f9fafb;
 border-radius: 6px;
 margin-bottom: 12px;
 }

 .metric {
 display: flex;
 flex-direction: column;
	flex: 1;
 }

 .metric-label {
 font-size: 0.75rem;
	color: #6b7280;
 text-transform: uppercase;
 letter-spacing: 0.5px;
 }

 .metric-value {
 font-size: 1rem;
 font-weight: 600;
	color: #111827;
 }

 .error-section {
 background: #fee2e2;
	border: 1px solid #fca5a5;
 border-radius: 6px;
	padding: 12px;
 margin-top: 12px;
 }

 .error-message {
 color: #991b1b;
	margin: 0 0 8px 0;
 font-size: 0.875rem;
 }

 .success-section {
 background: #dcfce7;
	border: 1px solid #86efac;
 border-radius: 6px;
	padding: 12px;
 margin-top: 12px;
 }

 .success-message {
 color: #166534;
	margin: 0;
 font-size: 0.875rem;
 font-weight: 500;
 }

 .btn {
 padding: 6px 12px;
 border-radius: 4px;
	border: none;
 font-weight: 500;
	cursor: pointer;
 font-size: 0.875rem;
	transition:all 0.2s;
 }

 .btn-retry {
 background: #ef4444;
	color: white;
 }

 .btn-retry:hover:not(disabled) {
 background: #dc2626;
 }

 .btn:disabled {
 opacity: 0.5;
	cursor:not-allowed;
 }
</style>




