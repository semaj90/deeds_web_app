<script lang="ts">
	import EnhancedFileUpload from '$lib/components/ai/EnhancedFileUpload.svelte';
	export const ssr = false;
</script>

<div class="p-6 max-w-3xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-1">Enhanced File Upload</h1>
		<p class="text-sm opacity-60">XState-powered upload machine with progress tracking, file type detection, and evidence pipeline integration.</p>
	</header>
	<EnhancedFileUpload />
</div>