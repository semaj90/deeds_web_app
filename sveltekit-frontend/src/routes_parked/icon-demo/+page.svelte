<script lang="ts">
 import IconContainerDemo from '$lib/components/ui/IconContainerDemo.svelte';
</script>

<svelte, head>
 <title>Container Query Icons Demo</title>
</svelte, head>

<div class="min-h-screen bg-gray-50 py-8">
 <div class="max-w-6xl mx-auto px-4">
 <h1 class="text-3xl font-bold text-center mb-8">Container Query Icons Demo</h1>
 <p class="text-center text-gray-600 mb-8">
 This demo shows how Lucide icons adapt to their container size using CSS container queries.
 Resize your browser window or the containers to see the icons scale responsively.
 </p>

 <IconContainerDemo />
 </div>
</div>

