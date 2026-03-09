<script lang="ts">
	import TensorRTStatus from '$lib/components/tensorrt/TensorRTStatus.svelte';
	import LegalAIChat from '$lib/components/tensorrt/LegalAIChat.svelte';
	import EmbeddingDemo from '$lib/components/tensorrt/EmbeddingDemo.svelte';

	let activeTab = 'chat';

	const tabs = [
		{ id: 'chat', label: '💬 Legal AI Chat', icon: '🤖' },
		{ id: 'embeddings', label: '🔍 Embeddings', icon: '📊' },
		{ id: 'status', label: '⚙️ Status', icon: '🔧' }
	];
</script>

<svelte:head>
	<title>TensorRT-LLM Legal AI Platform</title>
	<meta name="description" content="Legal AI powered by TensorRT-LLM optimization" />
</svelte:head>

<div class="tensorrt-dashboard">
	<div class="dashboard-header">
		<div class="hero-section">
			<h1>🚀 TensorRT-LLM Legal AI Platform</h1>
			<p class="hero-subtitle">
				High-performance legal AI inference with NVIDIA TensorRT optimization
			</p>
			<div class="hero-features">
				<span class="feature">⚡ RTX 3060 Ti Accelerated</span>
				<span class="feature">🎯 512-Dimension Embeddings</span>
				<span class="feature">⚖️ Legal Specialist Models</span>
			</div>
		</div>

		<div class="quick-status">
			<TensorRTStatus />
		</div>
	</div>

	<div class="dashboard-content">
		<nav class="tab-navigation">
			{#each tabs as tab}
				<button
					class="tab-btn"
					class:active={activeTab === tab.id}
					onclick={() => activeTab = tab.id}
				>
					<span class="tab-icon">{tab.icon}</span>
					{tab.label}
				</button>
			{/each}
		</nav>

		<div class="tab-content">
			{#if activeTab === 'chat'}
				<div class="tab-panel">
					<div class="panel-header">
						<h2>💬 Legal AI Conversation</h2>
						<p>Interact with TensorRT-optimized legal models for document analysis and legal advice</p>
					</div>
					<LegalAIChat />
				</div>
			{:else if activeTab === 'embeddings'}
				<div class="tab-panel">
					<div class="panel-header">
						<h2>🔍 Legal Document Embeddings</h2>
						<p>Generate and analyze 512-dimension embeddings for legal text similarity and search</p>
					</div>
					<EmbeddingDemo />
				</div>
			{:else if activeTab === 'status'}
				<div class="tab-panel">
					<div class="panel-header">
						<h2>⚙️ System Status & Performance</h2>
						<p>Monitor TensorRT-LLM server health, GPU utilization, and inference performance</p>
					</div>

					<div class="status-grid">
						<TensorRTStatus />

						<div class="performance-metrics">
							<h3>📈 Performance Metrics</h3>
							<div class="metrics-grid">
								<div class="metric-card">
									<div class="metric-icon">🎯</div>
									<div class="metric-info">
										<span class="metric-label">Model Architecture</span>
										<span class="metric-value">Gemma3 Legal</span>
									</div>
								</div>

								<div class="metric-card">
									<div class="metric-icon">⚡</div>
									<div class="metric-info">
										<span class="metric-label">Optimization</span>
										<span class="metric-value">TensorRT-LLM</span>
									</div>
								</div>

								<div class="metric-card">
									<div class="metric-icon">🔢</div>
									<div class="metric-info">
										<span class="metric-label">Vector Dimensions</span>
										<span class="metric-value">512</span>
									</div>
								</div>

								<div class="metric-card">
									<div class="metric-icon">💾</div>
									<div class="metric-info">
										<span class="metric-label">GPU Memory</span>
										<span class="metric-value">8GB RTX 3060 Ti</span>
									</div>
								</div>
							</div>
						</div>

						<div class="system-info">
							<h3>🖥️ System Information</h3>
							<div class="info-list">
								<div class="info-item">
									<span class="info-label">Environment:</span>
									<span class="info-value">WSL2 Ubuntu + Windows SvelteKit</span>
								</div>
								<div class="info-item">
									<span class="info-label">CUDA Version:</span>
									<span class="info-value">12.8</span>
								</div>
								<div class="info-item">
									<span class="info-label">TensorRT Version:</span>
									<span class="info-value">10.11.0</span>
								</div>
								<div class="info-item">
									<span class="info-label">Python Environment:</span>
									<span class="info-value">~/legal-ai-system/tensorrt_env</span>
								</div>
								<div class="info-item">
									<span class="info-label">Server Endpoint:</span>
									<span class="info-value">http://localhost:8100</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.tensorrt-dashboard {
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		padding: 2rem;
	}

	.dashboard-header {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2rem;
		margin-bottom: 2rem;
		align-items: start;
	}

	.hero-section {
		color: white;
	}

	.hero-section h1 {
		font-size: 2.5rem;
		font-weight: 700;
		margin: 0 0 1rem 0;
		text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
	}

	.hero-subtitle {
		font-size: 1.2rem;
		margin: 0 0 1.5rem 0;
		opacity: 0.95;
		line-height: 1.4;
	}

	.hero-features {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.feature {
		background: rgba(255, 255, 255, 0.15);
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.9rem;
		font-weight: 500;
		backdrop-filter: blur(10px);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.quick-status {
		min-width: 300px;
	}

	.dashboard-content {
		background: white;
		border-radius: 16px;
		overflow: hidden;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
	}

	.tab-navigation {
		display: flex;
		background: #f8fafc;
		border-bottom: 1px solid #e2e8f0;
	}

	.tab-btn {
		background: none;
		border: none;
		padding: 1rem 1.5rem;
		cursor: pointer;
		font-size: 0.95rem;
		font-weight: 500;
		color: #64748b;
		border-bottom: 3px solid transparent;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.tab-btn:hover {
		color: #3b82f6;
		background: rgba(59, 130, 246, 0.05);
	}

	.tab-btn.active {
		color: #3b82f6;
		border-bottom-color: #3b82f6;
		background: white;
	}

	.tab-icon {
		font-size: 1.1rem;
	}

	.tab-content {
		min-height: 600px;
	}

	.tab-panel {
		padding: 2rem;
	}

	.panel-header {
		margin-bottom: 2rem;
		text-align: center;
	}

	.panel-header h2 {
		font-size: 1.5rem;
		color: #1e293b;
		margin: 0 0 0.5rem 0;
	}

	.panel-header p {
		color: #64748b;
		margin: 0;
		line-height: 1.5;
	}

	.status-grid {
		display: grid;
		gap: 2rem;
		grid-template-columns: 1fr 1fr;
	}

	.performance-metrics,
	.system-info {
		background: #f8fafc;
		border-radius: 12px;
		padding: 1.5rem;
		border: 1px solid #e2e8f0;
	}

	.performance-metrics h3,
	.system-info h3 {
		margin: 0 0 1.5rem 0;
		color: #1e293b;
		font-size: 1.1rem;
	}

	.metrics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.metric-card {
		background: white;
		padding: 1rem;
		border-radius: 8px;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		border: 1px solid #e5e7eb;
	}

	.metric-icon {
		font-size: 1.5rem;
	}

	.metric-info {
		display: flex;
		flex-direction: column;
	}

	.metric-label {
		font-size: 0.8rem;
		color: #6b7280;
		margin-bottom: 0.25rem;
	}

	.metric-value {
		font-weight: 600;
		color: #1f2937;
		font-size: 0.9rem;
	}

	.info-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.info-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.75rem;
		background: white;
		border-radius: 6px;
		border: 1px solid #e5e7eb;
	}

	.info-label {
		font-weight: 500;
		color: #4b5563;
	}

	.info-value {
		font-family: 'Monaco', 'Menlo', monospace;
		font-size: 0.85rem;
		color: #1f2937;
	}

	@media (max-width: 1024px) {
		.dashboard-header {
			grid-template-columns: 1fr;
		}

		.quick-status {
			min-width: auto;
		}

		.status-grid {
			grid-template-columns: 1fr;
		}

		.metrics-grid {
			grid-template-columns: 1fr;
		}

		.hero-section h1 {
			font-size: 2rem;
		}

		.tab-navigation {
			flex-wrap: wrap;
		}
	}
</style>


