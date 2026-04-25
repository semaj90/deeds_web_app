<script lang="ts">
	import { onMount } from 'svelte';
	import VectorSearch from '$lib/components/ai/VectorSearch.svelte';
	import DocumentUpload from '$lib/components/ai/DocumentUpload.svelte';

	// Svelte 5 runes
	let activeTab = $state('search');
	let systemStatus = $state<{
		adapter_loaded: boolean;
		vector_db_size: number;
		last_updated: string;
		model_status: string;
	} | null>(null);

	// Check system status on mount
	onMount(async () => {
		try {
			// Test the embedding endpoint
			const response = await fetch('/api/embeddings', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: 'test' })
			});

			if (response.ok) {
				systemStatus = {
					adapter_loaded: true,
					vector_db_size: 10, // From our sample database
					last_updated: new Date().toISOString(),
					model_status: 'Online'
				};
			} else {
				systemStatus = {
					adapter_loaded: false,
					vector_db_size: 0,
					last_updated: '',
					model_status: 'Error'
				};
			}
		} catch (error) {
			console.error('System status check failed:', error);
			systemStatus = {
				adapter_loaded: false,
				vector_db_size: 0,
				last_updated: '',
				model_status: 'Offline'
			};
		}
	});

	function switchTab(tab: string) {
		activeTab = tab;
	}
</script>

<svelte:head>
	<title>Legal Vector Search - 512-Dimension Embeddings</title>
	<meta name="description" content="Search and manage legal documents using 512-dimension vector embeddings powered by Ollama models" />
</svelte:head>

<div class="vector-search-page min-h-screen bg-gray-50">
	<!-- Header -->
	<header class="bg-white shadow-sm border-b border-gray-200">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between items-center py-6">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">Legal Vector Search</h1>
					<p class="mt-1 text-sm text-gray-500">
						512-dimension embeddings • Powered by Ollama • RTX 3060 Ti optimized
					</p>
				</div>

				<!-- System Status -->
				{#if systemStatus}
					<div class="system-status flex items-center space-x-4">
						<div class="status-indicator flex items-center">
							<div class="w-3 h-3 rounded-full mr-2 {
								systemStatus.model_status === 'Online' ? 'bg-green-500' :
								systemStatus.model_status === 'Error' ? 'bg-yellow-500' :
								'bg-red-500'
							}"></div>
							<span class="text-sm text-gray-600">{systemStatus.model_status}</span>
						</div>
						<div class="text-sm text-gray-500">
							{systemStatus.vector_db_size} documents indexed
						</div>
					</div>
				{/if}
			</div>
		</div>
	</header>

	<!-- Navigation Tabs -->
	<nav class="bg-white border-b border-gray-200">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex space-x-8">
				<button
					onclick={() => switchTab('search')}
					class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {
						activeTab === 'search'
							? 'border-blue-500 text-blue-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
					}"
				>
					<svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
					</svg>
					Vector Search
				</button>

				<button
					onclick={() => switchTab('upload')}
					class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {
						activeTab === 'upload'
							? 'border-blue-500 text-blue-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
					}"
				>
					<svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
					</svg>
					Add Documents
				</button>

				<button
					onclick={() => switchTab('analytics')}
					class="py-4 px-1 border-b-2 font-medium text-sm transition-colors {
						activeTab === 'analytics'
							? 'border-blue-500 text-blue-600'
							: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
					}"
				>
					<svg class="w-5 h-5 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
					</svg>
					Analytics
				</button>
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{#if activeTab === 'search'}
			<div class="search-tab">
				<VectorSearch />
			</div>
		{:else if activeTab === 'upload'}
			<div class="upload-tab">
				<DocumentUpload />
			</div>
		{:else if activeTab === 'analytics'}
			<div class="analytics-tab">
				<div class="analytics-dashboard p-6 bg-white rounded-lg shadow-lg">
					<h2 class="text-2xl font-bold text-gray-800 mb-6">Vector Database Analytics</h2>

					{#if systemStatus}
						<div class="stats-grid grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
							<div class="stat-card p-4 bg-blue-50 rounded-lg">
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-blue-600">Documents Indexed</p>
										<p class="text-2xl font-bold text-blue-900">{systemStatus.vector_db_size}</p>
									</div>
									<div class="text-blue-400">
										<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
										</svg>
									</div>
								</div>
							</div>

							<div class="stat-card p-4 bg-green-50 rounded-lg">
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-green-600">Embedding Model</p>
										<p class="text-lg font-bold text-green-900">Gemma 768→512</p>
									</div>
									<div class="text-green-400">
										<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
										</svg>
									</div>
								</div>
							</div>

							<div class="stat-card p-4 bg-purple-50 rounded-lg">
								<div class="flex items-center justify-between">
									<div>
										<p class="text-sm font-medium text-purple-600">System Status</p>
										<p class="text-lg font-bold text-purple-900">{systemStatus.model_status}</p>
									</div>
									<div class="text-purple-400">
										<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
										</svg>
									</div>
								</div>
							</div>
						</div>
					{/if}

					<div class="system-info">
						<h3 class="text-lg font-semibold text-gray-800 mb-4">System Configuration</h3>
						<div class="config-grid grid grid-cols-1 md:grid-cols-2 gap-6">
							<div class="config-section p-4 bg-gray-50 rounded-lg">
								<h4 class="font-medium text-gray-700 mb-3">Embedding Pipeline</h4>
								<ul class="space-y-2 text-sm text-gray-600">
									<li>• Model: embeddinggemma:latest</li>
									<li>• Input: 768 dimensions</li>
									<li>• Output: 512 dimensions</li>
									<li>• Reduction: Linear projection</li>
									<li>• Compatibility: pgvector(512)</li>
								</ul>
							</div>

							<div class="config-section p-4 bg-gray-50 rounded-lg">
								<h4 class="font-medium text-gray-700 mb-3">Hardware Optimization</h4>
								<ul class="space-y-2 text-sm text-gray-600">
									<li>• GPU: RTX 3060 Ti (8GB VRAM)</li>
									<li>• Batch processing: Enabled</li>
									<li>• Memory efficient: True</li>
									<li>• Quantization: FP16</li>
									<li>• Cache: Persistent adapter</li>
								</ul>
							</div>
						</div>
					</div>

					<div class="feature-overview mt-8">
						<h3 class="text-lg font-semibold text-gray-800 mb-4">Features</h3>
						<div class="features-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
							<div class="feature-card p-3 border border-gray-200 rounded-lg">
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
										</svg>
									</div>
									<span class="text-sm font-medium text-gray-700">Semantic Search</span>
								</div>
							</div>

							<div class="feature-card p-3 border border-gray-200 rounded-lg">
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
										</svg>
									</div>
									<span class="text-sm font-medium text-gray-700">Document Upload</span>
								</div>
							</div>

							<div class="feature-card p-3 border border-gray-200 rounded-lg">
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path>
										</svg>
									</div>
									<span class="text-sm font-medium text-gray-700">Auto Classification</span>
								</div>
							</div>

							<div class="feature-card p-3 border border-gray-200 rounded-lg">
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
										</svg>
									</div>
									<span class="text-sm font-medium text-gray-700">Risk Assessment</span>
								</div>
							</div>

							<div class="feature-card p-3 border border-gray-200 rounded-lg">
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
										</svg>
									</div>
									<span class="text-sm font-medium text-gray-700">Real-time Processing</span>
								</div>
							</div>

							<div class="feature-card p-3 border border-gray-200 rounded-lg">
								<div class="flex items-center space-x-3">
									<div class="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
										<svg class="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4"></path>
										</svg>
									</div>
									<span class="text-sm font-medium text-gray-700">Vector Database</span>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		{/if}
	</main>
</div>

<style>
	.vector-search-page {
		font-family: system-ui, -apple-system, sans-serif;
	}

	.stat-card {
		transition: transform 0.2s ease-in-out;
	}

	.stat-card:hover {
		transform: translateY(-2px);
	}

	.feature-card {
		transition: all 0.2s ease-in-out;
	}

	.feature-card:hover {
		border-color: #3b82f6;
		box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
	}
</style>


