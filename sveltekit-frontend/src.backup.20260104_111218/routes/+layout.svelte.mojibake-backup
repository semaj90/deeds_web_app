<script lang="ts">
  import { page } from '$app/stores';
  import CommandCenterNav from '$lib/components/yorha/CommandCenterNav.svelte';
  import SystemStatus from '$lib/components/yorha/SystemStatus.svelte';
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';

  // Svelte 5 children prop
  let { children }: { children: Snippet } = $props();

  // Import webgpu modules dynamically to avoid SSR issues
  let webgpu: any = null;
  let cpuFallback: any = null;

  // Simple boolean flags
  let webgpuReady = $state(false);
  let cpuFallbackReady = $state(false);

  onMount(() => {
    (async () => {
      try {
        const webgpuModule = await import('$lib/webgpu/webgpu-init');
        webgpu = webgpuModule.webgpu;
        await webgpu.initialize();
        webgpuReady = true;
      } catch (error) {
        console.warn('WebGPU initialization failed:', error);
      }

      try {
        const cpuFallbackModule = await import('$lib/webgpu/webgpu-cpu-fallback');
        cpuFallback = cpuFallbackModule.cpuFallback;
        await cpuFallback.initialize();
        cpuFallbackReady = true;
      } catch (error) {
        console.warn('CPU fallback initialization failed:', error);
      }
    })();
  });

  import { browser } from '$app/environment';

  // Derived value based on the page store (runes-mode compatible)
  // Use simple reactive statement for SSR compatibility
  let isCommandCenter = $state(false);

  $effect(() => {
    if (browser && $page) {
      const path = $page.url.pathname || '';
      isCommandCenter = (
        path.startsWith('/yorha') ||
        path === '/' ||
        ['/command-center', '/active-cases', '/evidence-library',
         '/persons-of-interest', '/analysis-center', '/global-search',
         '/terminal', '/system-configuration', '/gpu-evidence-graph', '/all-routes'].includes(path)
      );
    }
  });

</script>

<svelte:head>
  <title>YoRHa Legal AI Platform</title>
  <meta name="description" content="Advanced Legal AI Platform with GPU acceleration and evidence analysis" />
  <link rel="icon" href="/favicon.ico" />
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white font-mono">
  {#if isCommandCenter}
    <!-- YoRHa Command Center Interface -->
    <div class="flex h-screen">
      <!-- Navigation Sidebar -->
      <aside class="w-64 bg-slate-800/50 backdrop-blur border-r border-slate-700/50">
        <CommandCenterNav />
      </aside>

      <!-- Main Content Area -->
      <main class="flex-1 flex flex-col overflow-hidden">
        <!-- Top Status Bar -->
        <header class="h-16 bg-slate-800/30 backdrop-blur border-b border-slate-700/50 flex items-center justify-between px-6">
          <div class="flex items-center space-x-4">
            <div class="text-cyan-400 font-bold text-lg">YoRHa</div>
            <div class="text-slate-400 text-sm">Legal AI Command Center</div>
          </div>

          <SystemStatus {webgpuReady} {cpuFallbackReady} />
        </header>

        <!-- Page Content -->
        <div class="flex-1 overflow-auto p-6">
          {@render children()}
        </div>
      </main>
    </div>
  {:else}
    <!-- Standard Layout for other routes -->
    <div class="min-h-screen">
      <header class="bg-slate-800/50 backdrop-blur border-b border-slate-700/50">
        <nav class="container mx-auto px-6 py-4">
          <div class="flex items-center justify-between">
            <a href="/" class="text-cyan-400 font-bold text-xl">YoRHa Legal AI</a>
            <div class="flex space-x-6">
              <a href="/yorha" class="text-slate-300 hover:text-cyan-400 transition-colors">Command Center</a>
              <a href="/ai" class="text-slate-300 hover:text-cyan-400 transition-colors">AI Tools</a>
              <a href="/evidence" class="text-slate-300 hover:text-cyan-400 transition-colors">Evidence</a>
              <a href="/legal" class="text-slate-300 hover:text-cyan-400 transition-colors">Legal</a>
            </div>
          </div>
        </nav>
      </header>

      <main class="container mx-auto px-6 py-8">
        {@render children()}
      </main>
    </div>
  {/if}
</div>

<style>
  /* YoRHa Terminal Aesthetic */
  /* Custom scrollbar for terminal aesthetic */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(30, 41, 59, 0.5);
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(34, 211, 238, 0.5);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(34, 211, 238, 0.7);
  }
</style>
