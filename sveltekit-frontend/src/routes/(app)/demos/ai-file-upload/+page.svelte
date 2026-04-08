<script lang="ts">
	import AIFileUpload from '$lib/components/ui/AIFileUpload.svelte';
	export const ssr = false;
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">AI File Upload</h1>
		<p class="text-sm opacity-60">Drag-and-drop file upload with AI entity extraction, auto-detection for PDFs/images/video, OCR text, and confidence scoring.</p>
	</header>
	<AIFileUpload />
</div>