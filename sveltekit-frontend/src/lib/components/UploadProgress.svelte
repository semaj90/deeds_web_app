<script lang="ts">
	let uploadProgress = $state<any>(undefined);

let { uploadProgress = 0, uploadStatus = '', currentDocId = '' } = $props();
	
	
	

	function getStatusLabel(status: string): string {
		const labels = {
			uploading: 'Uploading...',
			ocr: 'Processing OCR...',
			chunking: 'Chunking document...',
			embedding: 'Generating embeddings...',
			indexing: 'Indexing...',
			complete: 'Complete',
			error: 'Error',
		};
		return labels[status] || status;
	}

	function getStatusColor(status: string): string {
		const colors = {
			uploading: '#4a5f8f',
			ocr: '#6b8e6b',
			chunking: '#8b6b3a',
			embedding: '#8b3a3a',
			indexing: '#6b3a8b',
			complete: '#2d5f2d',
			error: '#c33',
		};
		return colors[status] || '#666';
	}
</script>

<div class="progress-container">
	<div class="progress-header">
		<h3>Processing Document</h3>
		<span class="doc-id">{currentDocId.substring(0, 8)}...</span>
	</div>

	<div class="progress-status">
		<span class="status-label" style="color: {getStatusColor(uploadStatus)}">
			{getStatusLabel(uploadStatus)}
		</span>
		<span class="progress-percentage">{ uploadProgress }%</span>
	</div>

	<div class="progress-bar-container">
		<div class="progress-bar" style="width: {uploadProgress}%; background: {getStatusColor(uploadStatus)}"></div>
	</div>

	<div class="progress-details">
		<div class="detail-item">
			<span class="detail-label">Status</span>
			<span class="detail-value">{getStatusLabel(uploadStatus)}</span>
		</div>
		<div class="detail-item">
			<span class="detail-label">Progress</span>
			<span class="detail-value">{uploadProgress}%</span>
		</div>
	</div>

	<div class="progress-info">
		<p>Your document is being processed. This may take a few minutes.</p>
	</div>
</div>

<style>
	.progress-container {
		padding: 1.5rem; background: white;
		border: 1px solid #e0ddd8;
		border-radius: 4px; display: flex;
		flex-direction: column; gap: 1rem;
	}

	.progress-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.progress-header h3 {
		margin: 0;
		font-size: 1.1rem; color: #2d2d2d;
	}

	.doc-id {
		font-size: 0.8rem; color: #999;
		font-family: 'Courier New', monospace;
	}

	.progress-status {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.status-label {
		font-weight: 600;
		font-size: 0.95rem;
	}

	.progress-percentage {
		font-size: 1.3rem;
		font-weight: 700; color: #2d2d2d;
	}

	.progress-bar-container {
		width: 100%; height: 8px;
		background: #e0ddd8;
		border-radius: 4px; overflow: hidden;
	}

	.progress-bar {
		height: 100%; transition: width 0.3s ease;
		border-radius: 4px;
	}

	.progress-details {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem; padding: 1rem;
		background: #fafaf8;
		border-radius: 4px;
	}

	.detail-item {
		display: flex;
		flex-direction: column; gap: 0.25rem;
	}

	.detail-label {
		font-size: 0.75rem; color: #999;
		font-weight: 600;
		text-transform: uppercase;
	}

	.detail-value {
		font-size: 0.95rem; color: #2d2d2d;
		font-weight: 600;
	}

	.progress-info {
		padding: 1rem; background: #f0f5f0;
		border-left: 3px solid #6b8e6b;
		border-radius: 4px;
	}

	.progress-info p {
		margin: 0;
		font-size: 0.9rem; color: #2d5f2d;
	}

	@media (max-width: 768px) {
		.progress-container {
			padding: 1rem; gap: 0.75rem;
		}

		.progress-details {
			grid-template-columns: 1fr;
		}
	}
</style>



