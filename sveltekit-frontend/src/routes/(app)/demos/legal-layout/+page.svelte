<script lang="ts">
	import LegalAILayout from '$lib/components/legal-ai/LegalAILayout.svelte';

	export const ssr = false;
</script>

<LegalAILayout title="Legal AI Workspace" subtitle="3-column layout with nav rail, main content, and system status panel">
	<div class="p-6">
		<h2 class="text-lg font-bold mb-4">Main Content Area</h2>
		<p class="text-sm opacity-70 mb-4">This is the center column of the LegalAILayout (566L). It includes a collapsible sidebar with navigation, a main content area with snippet support, and a right rail showing system status bars for Postgres, Qdrant, and Neo4j.</p>
		<div class="grid grid-cols-2 gap-4">
			<div class="p-4 rounded border border-sand/20">
				<h3 class="text-sm font-bold mb-2">Case Analysis</h3>
				<p class="text-xs opacity-60">Placeholder for case analysis content.</p>
			</div>
			<div class="p-4 rounded border border-sand/20">
				<h3 class="text-sm font-bold mb-2">Evidence Review</h3>
				<p class="text-xs opacity-60">Placeholder for evidence review content.</p>
			</div>
		</div>
	</div>
</LegalAILayout>
