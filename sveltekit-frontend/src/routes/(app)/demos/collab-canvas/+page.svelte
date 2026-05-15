<script lang="ts">
	import CollaborativeEvidenceCanvas from '$lib/components/canvas/CollaborativeEvidenceCanvas.svelte';
</script>

<div class="p-4" style="height: calc(100vh - 4rem);">
	<header class="mb-4">
		<h1 class="text-xl font-bold mb-1">Collaborative Evidence Canvas</h1>
		<p class="text-sm opacity-60">Miro/FigJam-style infinite SVG canvas with drag-drop evidence nodes, pan/zoom, and BoardSnapshot persistence.</p>
	</header>
	<CollaborativeEvidenceCanvas caseId="demo-case-001" />
</div>
