<script lang="ts">
	import { page } from '$app/state';

	const { children } = $props();
</script>

<div class="min-h-screen">
	<nav class="border-b-2 border-black/20 bg-gradient-to-r from-sand/80 to-sandDark/80 backdrop-blur-xl">
		<div class="max-w-7xl mx-auto px-6 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-6">
					<h1 class="text-2xl font-bold text-black tracking-wide uppercase">
						🤖 Agentic Error Analysis
					</h1>
					<div class="flex gap-2">
						<a
							href="/agentic-errors"
							class="px-3 py-1.5 rounded-lg text-sm font-semibold uppercase tracking-wide transition-all {
								page.url.pathname === '/agentic-errors'
									? 'bg-accent text-white shadow-md'
									: 'text-black/70 hover:text-black hover:bg-black/10'
							}"
						>
							Dashboard
						</a>
						<a
							href="/agentic-errors/analysis"
							class="px-3 py-1.5 rounded-lg text-sm font-semibold uppercase tracking-wide transition-all {
								page.url.pathname === '/agentic-errors/analysis'
									? 'bg-accent text-white shadow-md'
									: 'text-black/70 hover:text-black hover:bg-black/10'
							}"
						>
							AI Analysis
						</a>
						<a
							href="/agentic-errors/rag-kag"
							class="px-3 py-1.5 rounded-lg text-sm font-semibold uppercase tracking-wide transition-all {
								page.url.pathname === '/agentic-errors/rag-kag'
									? 'bg-accent text-white shadow-md'
									: 'text-black/70 hover:text-black hover:bg-black/10'
							}"
						>
							RAG+KAG
						</a>
						<a
							href="/agentic-errors/fastmcp"
							class="px-3 py-1.5 rounded-lg text-sm font-semibold uppercase tracking-wide transition-all {
								page.url.pathname === '/agentic-errors/fastmcp'
									? 'bg-accent text-white shadow-md'
									: 'text-black/70 hover:text-black hover:bg-black/10'
							}"
						>
							FastMCP Tools
						</a>
					</div>
				</div>
				<div class="flex items-center gap-4">
					<div class="text-xs text-black/70 font-mono uppercase tracking-wide">
						<span class="inline-block w-2 h-2 bg-green-600 rounded-full animate-pulse"></span>
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
