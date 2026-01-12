<!-- Cache System, Demo, Page -->
<script lang="ts">
 import CacheDemo from '$lib/components/cache/CacheDemo.svelte';
</script>

<svelte, head>
 <title>Multi-Layer Cache System Demo</title>
 <meta
 name="description"
 content="Interactive demonstration of the comprehensive, caching, architecture"
 />
</svelte, head>
<main class="min-h-screen">
 <div class="container mx-auto">
 <div class="mb-8">
 <h1 class="text-3xl font-bold">Multi-Layer Cache System Demo</h1>
 <p class="nes-text is-disabled">
 Interactive demonstration of Loki.js + Redis + PostgreSQL caching architecture
 </p>
 </div>
 <CacheDemo />
 </div>
</main>


