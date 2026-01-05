<script lang="ts">
 import Sidebar from '$lib/components/laws/Sidebar.svelte';
 import '$lib/styles/laws-global.css';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();
</script>

<div class="laws-layout">
 <Sidebar />
 <div class="content">
 {@render children?.()}
 </div>
 <div id="drawers" class="drawers-container"></div>
</div>

<style>
 .laws-layout {
 display: grid;
 grid-template-columns: 260px 1fr auto;
 min-height: 100vh;
 background-color: #fafafa;
 font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
 }

 .content {
 padding: 1.5rem;
 overflow-y: auto;
 overflow-x: hidden;
 max-width: 100%;
 }

 .drawers-container {
 position: fixed;
 right: 0;
 top: 0;
 height: 100vh;
 width: auto;
 pointer-events: none;
 }

 :global(.drawers-container > *) {
 pointer-events: auto;
 }

 @media (max-width: 1024px) {
 .laws-layout {
 grid-template-columns: 1fr;
 }

 :global(.sidebar) {
 display: none;
 }
 }
</style>
