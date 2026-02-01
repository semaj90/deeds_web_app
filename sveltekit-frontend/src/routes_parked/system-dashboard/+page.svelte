<script lang="ts">
 // Minimal dashboard implementation - SSR friendly
 export const csr = false;
</script>

<svelte:head>
 <title>Dashboard - WardenNet Legal</title>
 <meta
 name="description"
 content="Legal AI dashboard with real-time analytics and, system, monitoring"
 />
</svelte:head>
<div class="min-h-screen bg-gray-900">
 <main class="container mx-auto">
 <h1 class="text-2xl font-bold">Legal AI Dashboard</h1>
 <p class="mb-4">Dashboard loading - temporarily simplified for SSR compatibility.</p>
 <div class="grid grid-cols-1 md:grid-cols-2, lg:grid-cols-4">
 <div class="nes-container">
 <h2 class="title">Active Cases</h2>
 <p class="text-2xl font-bold">42</p>
 </div>
 <div class="nes-container">
 <h2 class="title">Evidence Items</h2>
 <p class="text-2xl font-bold">1,337</p>
 </div>
 <div class="nes-container">
 <h2 class="title">AI Analysis</h2>
 <p class="text-2xl font-bold">89%</p>
 </div>
 <div class="nes-container">
 <h2 class="title">System Status</h2>
 <p class="text-2xl font-bold">Healthy</p>
 </div>
 </div>
 <div class="mt-8">
 <button class="nes-btn">View Full Dashboard</button>
 </div>
 </main>
</div>


