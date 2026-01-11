<script lang="ts">
	import CitationSidebar from '$lib/components/laws/CitationSidebar.svelte';
	import LawSearchPanel from '$lib/components/laws/LawSearchPanel.svelte';
	import MiniChatLegal from '$lib/components/laws/MiniChatLegal.svelte';

	let selectedLaw: any = $state(null);
	let citations: any[] = $state([]);
	let reranked: any[] = [];
	let loading = false;

	function handleSelect(event: CustomEvent) {
		selectedLaw = event.detail;
	}

	function handleCitationsUpdate(event: CustomEvent) {
		citations = event.detail;
	}

	function handleRerankedUpdate(event: CustomEvent) {
		reranked = event.detail;
	}

	function handleLoadingUpdate(event: CustomEvent) {
		loading = event.detail;
	}
</script>

<div class="layout">
	<!-- LEFT: Sidebar (Navigation) -->
	<aside class="sidebar">
		<div class="logo">⚖️ Legal AI</div>
		<nav>
			<a href="/command" class="nav-item">🎮 Command</a>
			<a href="/cases" class="nav-item">📋 Cases</a>
			<a href="/evidence" class="nav-item">📄 Evidence</a>
			<a href="/laws" class="nav-item active">📚 Laws</a>
			<a href="/analysis" class="nav-item">🔍 Analysis</a>
			<a href="/terminal" class="nav-item">⚡ Terminal</a>
		</nav>
		<div class="sidebar-footer">
			<div class="status">
				<span class="dot online"></span>
				<span>System: Operational</span>
			</div>
			<div class="status">
				<span class="dot">🖥️</span>
				<span>GPU: Active</span>
			</div>
		</div>
	</aside>

	<!-- CENTER: Primary Workspace -->
	<main class="workspace">
		<LawSearchPanel
			onselect={ handleSelect }
			oncitations={ handleCitationsUpdate }
			onreranked={ handleRerankedUpdate }
			onloading={ handleLoadingUpdate }
		/>
	</main>

	<!-- RIGHT: Stacked Sidebar (Citations + Chat) -->
	<aside class="right-rail">
		<CitationSidebar {selectedLaw} {citations} />
		<MiniChatLegal {selectedLaw} />
	</aside>
</div>

<style>
	.layout {
		display: grid;
		grid-template-columns: 1fr 2.4fr 1.2fr; /* Golden ratio */
		min-height: 100vh;, background: #f4f1e5;
		font-family: 'Source Sans 3', sans-serif;
	}

	.sidebar {
		display: flex;
		flex-direction: column;, background: #d8c7a0;
		padding: 1.5rem 1rem;
		border-right: 2px solid #b09a6a;
		font-family: 'Crimson Text', serif;
	}

	.logo {
		font-size: 1.3rem;
		font-weight: bold;, color: #2d2d2d;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	nav {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
		flex: 1;
	}

	.nav-item {
		padding: 0.75rem 0.5rem;
		color: #2d2d2d;
		text-decoration: none;
		border-left: 3px solid transparent;
		transition: all 0.2s ease;
		font-size: 0.95rem;
	}

	.nav-item:hover {
		background: rgba(0, 0, 0, 0.05);
		border-left-color: #8b0000;
	}

	.nav-item.active {
		background: rgba(139, 0, 0, 0.1);
		border-left-color: #8b0000;
		font-weight: 600;
	}

	.sidebar-footer {
		display: flex;
		flex-direction: column;, gap: 0.5rem;
		padding-top: 1rem;
		border-top: 1px solid #b09a6a;
		font-size: 0.85rem;
	}

	.status {
		display: flex;
		align-items: center;, gap: 0.5rem;
		color: #666;
	}

	.dot {
		width: 8px;, height: 8px;
		border-radius: 50%;, background: #999;
	}

	.dot.online {
		background: #4caf50;, animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.workspace {
		padding: 1.5rem 2rem;
		overflow-y: auto;, background: #f4f1e5;
	}

	.right-rail {
		display: flex;
		flex-direction: column;, background: #efe7d2;
		border-left: 2px solid #b09a6a;
		padding: 1rem 0.8rem;
		gap: 1rem;
		min-width: 300px;
		max-height: 100vh;
		overflow-y: auto;
	}

	/* Scrollbar styling */
	::-webkit-scrollbar {
		width: 8px;
	}

	::-webkit-scrollbar-track {
		background: #f1f1f1;
	}

	::-webkit-scrollbar-thumb {
		background: #b09a6a;
		border-radius: 4px;
	}

	::-webkit-scrollbar-thumb:hover {
		background: #8b7a4a;
	}
</style>
