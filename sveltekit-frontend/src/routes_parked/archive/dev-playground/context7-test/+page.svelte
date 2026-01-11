<script lang="ts">
 import Context7TestDemo from '$lib/components/dev/Context7TestDemo.svelte';
</script>

<svelte:head>
 <title>Context7 Integration Test Suite - Legal AI Development</title>
 <meta
 name="description"
 content="Test suite for Context7 semantic search, agent orchestration, and MCP tools integration"
 />
</svelte:head>
<main class="min-h-screen">
 <div class="bg-gradient-to-r from-green-600 to-blue-600 text-white">
 <div class="max-w-6xl mx-auto">
 <h1 class="text-3xl font-bold">Context7 Integration Test Suite</h1>
 <p class="text-xl text-green-100">
 Comprehensive testing environment for Context7 semantic search, agent orchestration, MCP
 tools integration, and real-time workflow automation.
 </p>
 <div class="mt-6 grid grid-cols-1 md:grid-cols-3">
 <div class="bg-green-700 bg-opacity-50 rounded-lg">
 <h3 class="font-semibold">🔍 Semantic Search</h3>
 <p class="text-sm">Real Context7 MCP semantic search testing</p>
 </div>
 <div class="bg-blue-700 bg-opacity-50 rounded-lg">
 <h3 class="font-semibold">🤖 Agent Orchestration</h3>
 <p class="text-sm">Multi-agent coordination and triggers</p>
 </div>
 <div class="bg-teal-700 bg-opacity-50 rounded-lg">
 <h3 class="font-semibold">📊 Audit Logging</h3>
 <p class="text-sm">Real-time audit results and logging</p>
 </div>
 </div>
 </div>
 </div>
 <Context7TestDemo />
 <footer class="bg-white border-t border-gray-200">
 <div class="max-w-6xl mx-auto px-6">
 <p class="text-sm">
 Context7 MCP Integration Test Suite - Validate real semantic search, agent orchestration,
 and workflow automation.
 </p>
 </div>
 </footer>
</main>
;


