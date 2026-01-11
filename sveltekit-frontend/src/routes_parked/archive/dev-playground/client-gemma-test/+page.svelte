<script lang="ts">
 import ClientGemmaDemo from '$lib/components/ClientGemmaDemo.svelte';
</script>

<svelte:head>
 <title>Client Gemma Inference Test</title>
</svelte:head>

<div class="client-gemma-test">
 <ClientGemmaDemo />
</div>

<style>
 .client-gemma-test {
 min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
 padding: 20px;
 }
</style>



