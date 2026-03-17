<script lang="ts">
	import LibrarySidebar from '$lib/components/legal/LibrarySidebar.svelte';

	let { children } = $props();
</script>

<div class="library-shell">
	<div class="library-sidebar">
		<LibrarySidebar />
	</div>
	<div class="library-content">
		{@render children()}
	</div>
</div>

<style>
	.library-shell {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		height: 100vh;
		background: var(--app-bg, #0a0b0e);
	}

	.library-sidebar {
		border-right: 1px solid rgba(255, 255, 255, 0.06);
		background: #0d0e14;
		overflow-y: auto;
	}

	.library-content {
		overflow-y: auto;
		height: 100%;
	}
</style>