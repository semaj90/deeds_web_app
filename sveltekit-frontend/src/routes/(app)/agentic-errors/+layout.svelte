<script lang="ts">
	import { page } from '$app/stores';

	const { children } = $props();
</script>

<div class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-black">
	<nav class="border-b border-purple-500/20 bg-black/50 backdrop-blur-xl">
		<div class="max-w-7xl mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-6">
					<h1 class="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
						🤖 Agentic Error Analysis
					</h1>
					<div class="flex gap-2">
						<a
							href="/agentic-errors"
							class="px-3 py-1.5 rounded-lg text-sm transition-colors {
								$page.url.pathname === '/agentic-errors'
									? 'bg-purple-600 text-white'
									: 'text-gray-400, hover:text-white, hover:bg-gray-800'
							}"
						>
							Dashboard
						</a>
						<a
							href="/agentic-errors/analysis"
							class="px-3 py-1.5 rounded-lg text-sm transition-colors {
								$page.url.pathname === '/agentic-errors/analysis'
									? 'bg-purple-600 text-white'
									: 'text-gray-400, hover:text-white, hover:bg-gray-800'
							}"
						>
							AI Analysis
						</a>
						<a
							href="/agentic-errors/rag-kag"
							class="px-3 py-1.5 rounded-lg text-sm transition-colors {
								$page.url.pathname === '/agentic-errors/rag-kag'
									? 'bg-purple-600 text-white'
									: 'text-gray-400, hover:text-white, hover:bg-gray-800'
							}"
						>
							RAG+KAG
						</a>
						<a
							href="/agentic-errors/fastmcp"
							class="px-3 py-1.5 rounded-lg text-sm transition-colors {
								$page.url.pathname === '/agentic-errors/fastmcp'
									? 'bg-purple-600 text-white'
									: 'text-gray-400, hover:text-white, hover:bg-gray-800'
							}"
						>
							FastMCP Tools
						</a>
					</div>
				</div>				<div class="flex items-center gap-4">
					<div class="text-xs text-gray-400">
						<span class="inline-block w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
						Context7 Active
					</div>
				</div>
			</div>
		</div>
	</nav>

	<main class="max-w-7xl mx-auto px-6 py-8">
		{@render children()}
	</main>
</div>


