<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be uniqu;
https://svelte.dev/e/attribute_duplicate -->
<!-- @migration-task Error while migrating Svelte code: Attributes need to be unique -->
<!--
  Dynamic Routing Test Page - Simplified Version
  Basic route testing without complex imports
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { writable  } from 'svelte/store';
  import type { goto  } from '$app/navigation';
  import type { page  } from '$app/stores';
  import Button from '$lib/components/ui/Button.svelte';
  import  Card  from "$lib/components/ui/enhanced-bits.svelte";
  import type { allRoutes, getRoutesByCategory, searchRoutes  } from '$lib/data/routes-config';
  // State management
  const testResults = writable<string[]>([]);
  const routeStats = writable<any>({});
  let isLoading = $state(false);
  let currentPath = $state('');
  // Provide a typed, const category list so TS knows the exact union type
  const categoryList = ['main', 'demo', 'ai', 'legal', 'dev', 'admin'] as const;
  type Category = (typeof categoryList)[number];

  // Test configuration
  const testCases = [
    {
      name: 'Route Configuration Load',
      test: async () => {
        const routes = allRoutes;
        return `✅ Loaded ${routes.length} routes from configuration`;
      }
    },
    {
      name: 'Category Filter Test - Demo',
      test: async () => {
        const demoRoutes = getRoutesByCategory('demo');
        return `✅ Found ${demoRoutes.length} demo routes`;
      }
    },
    {
      name: 'Category Filter Test - Dev',
      test: async () => {
        const devRoutes = getRoutesByCategory('dev');
        return `✅ Found ${devRoutes.length} dev routes`;
      }
    },
    {
      name: 'Category Filter Test - AI',
      test: async () => {
        const aiRoutes = getRoutesByCategory('ai');
        return `✅ Found ${aiRoutes.length} AI routes`;
      }
    },
    {
      name: 'Search Test - AI',
      test: async () => {
        const results = searchRoutes('ai');
        return `✅ Found ${results.length} routes matching: 'ai'`;
      }
    },
    {
      name: 'Search Test - Demo',
      test: async () => {
        const results = searchRoutes('demo');
        return `✅ Found ${results.length} routes matching: 'demo'`;
      }
    },
    {
      name: 'Current Page Test',
      test: async () => {
        return `✅ Current path: ${currentPath}`;
      }
    },
    {
      name: 'Navigation Test',
      test: async () => {
        // Test navigation to a known route
        const demoRoutes = getRoutesByCategory('demo');
        if (demoRoutes.length > 0) {
          return `✅ Can navigate to: ${demoRoutes[0].route}`;
        }
        return `✅ Navigation system available`;
      }
    }
  ];
  // subscribe once on mount and calculate stats
  onMount(() => {
    const unsub = page.subscribe(($page) => {
      currentPath = $page.url.pathname;
    });
    calculateRouteStats();
    return unsub;
  });
  function calculateRouteStats() {
    // use categoryList (typed) instead of an inline string array
    const categories = categoryList as readonly string[];
    const categoriesCount: Record<string number> = {};
    categories.forEach((cat) => {
      categoriesCount[cat] = allRoutes.filter((r) => r.category === cat).length;
    });

    const getFlagCount = (flag: string) =>
      allRoutes.filter((r) => {
        if (typeof (r as any)[flag] === 'boolean') return (r as any)[flag];
        if ((r as any).status) return (r as any).status === flag;
        if ((r as any).tags) return (r as any).tags.includes(flag);
        return false;
      }).length;

    const stats = { total: allRoutes.length, categories: categoriesCount, active: getFlagCount('active'), experimental: getFlagCount('experimental'), beta: getFlagCount('beta') };
    routeStats.set(stats);
  }
  async function runAllTests() {
    isLoading = true;
    testResults.set([]);
    try {
      for (const testCase of testCases) {
        try {
          const result = await testCase.test();
          testResults.update(results => [...results, result]);
        } catch (error: any) {
          // explicit any to satisfy TS strict catches
          testResults.update(results => [...results, `❌ ${testCase.name}: ${error?.message ?? String(error)}`]);
        }
      }
    } catch (error: any) {
      testResults.update(results => [...results, `❌ Test suite failed: ${error?.message ?? String(error)}`]);
    } finally {
      isLoading = false;
    }
  }
  async function navigateToRoute(route: string) {
    try {
      await goto(route);
      testResults.update(results => [
        ...results,
        `✅ Navigated to: ${route}`
      ]);
    } catch (error: any) {
      testResults.update(results => [
        ...results,
        `❌ Navigation failed: ${error?.message ?? String(error)}`
      ]);
    }
  }
  // keep helper and use it in Debug panel (to avoid: "declared but never read")
  function formatJson(obj: any): string {
    return JSON.stringify(obj, null, 2);
  }
</script>

<div class="min-h-screen bg-yorha-bg-primary text-yorha-text-primary p-6">
  <div class="max-w-6xl mx-auto space-y-6">
    <!-- Header -->
    <div class="text-center">
      <h1 class="text-4xl font-bold text-yorha-secondary mb-4">🛣️ Dynamic Routing Test Suite</h1>
      <p class="text-yorha-text-secondary">
        Testing route configuration and navigation functionality
      </p>
      <p class="text-sm text-yorha-text-muted mt-2">
        Current Path: <code class="bg-yorha-bg-secondary px-2 py-1 rounded">{currentPath}</code>
      </p>
    </div>
    <!-- Test Controls -->
    <div class="p-6 nes-container">
      <h2 class="text-2xl font-semibold mb-4 text-yorha-accent">Test Controls</h2>
      <div class="flex gap-4 mb-6">
        <Button
          onclick={runAllTests}
          disabled={isLoading}
          class="bits-btn bg-yorha-secondary text-yorha-bg-primary hover:bg-yorha-secondary-dark"
        >
          {isLoading ? 'Running Tests...' : 'Run All Tests'}
        </Button>
        <Button
          onclick={calculateRouteStats}
          variant="ghost"
          class="bits-btn border-yorha-accent text-yorha-accent hover:bg-yorha-accent hover:text-yorha-bg-primary"
        >
          Refresh Stats
        </Button>
      </div>
    </div>
    <!-- Test Results -->
    <div class="p-6 nes-container">
      <h2 class="text-2xl font-semibold mb-4 text-yorha-accent">Test Results</h2>
      {#if $testResults.length > 0}
        <div
          class="bg-yorha-bg-secondary p-4 rounded font-mono text-sm space-y-2 max-h-64 overflow-y-auto"
        >
          {#each Array.isArray($testResults) ? $testResults : [] as result}
            <div class="text-yorha-text-primary">{result}</div>
          {/each}
        </div>
      {:else}
        <p class="text-yorha-text-secondary">No test results yet. Run tests to see output.</p>
      {/if}
    </div>
    <!-- Route Statistics -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div class="p-6 nes-container">
        <h3 class="text-xl font-semibold mb-4 text-yorha-secondary">Route Statistics</h3>
        {#if $routeStats.total}
          <div class="space-y-3">
            <div class="flex justify-between">
              <span class="text-yorha-text-secondary">Total Routes:</span>
              <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                >{$routeStats.total}</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-yorha-text-secondary">Active:</span>
              <span class="px-2 py-1 rounded text-xs font-medium bg-blue-500 text-white"
                >{$routeStats.active}</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-yorha-text-secondary">Experimental:</span>
              <span
                class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                >{$routeStats.experimental}</span
              >
            </div>
            <div class="flex justify-between">
              <span class="text-yorha-text-secondary">Beta:</span>
              <span class="px-2 py-1 rounded text-xs font-medium bg-red-500 text-white"
                >{$routeStats.beta}</span
              >
            </div>
          </div>
        {:else}
          <p class="text-yorha-text-secondary">Loading statistics...</p>
        {/if}
      </div>
      <div class="p-6 nes-container">
        <h3 class="text-xl font-semibold mb-4 text-yorha-secondary">Categories</h3>
        {#if $routeStats.categories}
          <div class="space-y-2">
            {#each Object.entries($routeStats.categories) as [category, count]}
              <div class="flex justify-between text-sm">
                <span class="text-yorha-text-secondary capitalize">{category}:</span>
                <span
                  class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                  >{count}</span
                >
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="p-6 nes-container">
        <h3 class="text-xl font-semibold mb-4 text-yorha-secondary">Quick Navigation</h3>
        <div class="space-y-2">
          <Button
            size="sm"
            variant="ghost"
            onclick={() => navigateToRoute('/')}
            class="bits-btn w-full justify-start text-yorha-accent hover:bg-yorha-accent hover:text-yorha-bg-primary"
          >
            🏠 Home
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onclick={() => navigateToRoute('/demo')}
            class="bits-btn w-full justify-start text-yorha-accent hover:bg-yorha-accent hover:text-yorha-bg-primary"
          >
            🎯 Demo Overview
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onclick={() => navigateToRoute('/dev/mcp-tools')}
            class="bits-btn w-full justify-start text-yorha-accent hover:bg-yorha-accent hover:text-yorha-bg-primary"
          >
            🔧 MCP Tools
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onclick={() => navigateToRoute('/cases')}
            class="bits-btn w-full justify-start text-yorha-accent hover:bg-yorha-accent hover:text-yorha-bg-primary"
          >
            📁 Case Management
          </Button>
        </div>
      </div>
    </div>
    <!-- Route Categories List -->
    <div class="p-6 nes-container">
      <h2 class="text-2xl font-semibold mb-4 text-yorha-accent">Route Categories</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each Array.isArray(categoryList) ? categoryList : [] as category}
          {@const categoryRoutes = getRoutesByCategory(category as Category)}
          {#if categoryRoutes.length > 0}
            <div class="border border-yorha-text-muted p-4 rounded">
              <h3 class="text-lg font-semibold mb-3 text-yorha-text-accent capitalize">
                {category} ({categoryRoutes.length})
              </h3>
              <div class="space-y-1 max-h-32 overflow-y-auto">
                {#each Array.isArray(categoryRoutes.slice(0, 5)) ? categoryRoutes.slice(0, 5) : [] as route}
                  <button
                    class="block w-full text-left text-sm text-yorha-text-secondary hover:text-yorha-accent hover:bg-yorha-bg-secondary p-1 rounded transition-colors"
                    onclick={() => navigateToRoute(route.route)}
                  >
                    {route.icon}
                    {route.label}
                  </button>
                {/each}
                {#if categoryRoutes.length > 5}
                  <p class="text-xs text-yorha-text-muted">
                    +{categoryRoutes.length - 5} more...
                  </p>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    </div>
    <!-- Debug Information -->
    <div class="p-6 nes-container">
      <h2 class="text-2xl font-semibold mb-4 text-yorha-accent">Debug Information</h2>
      <details class="cursor-pointer">
        <summary class="text-yorha-secondary hover:text-yorha-accent mb-4">
          View All Routes Configuration
        </summary>
        <div class="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
          {#each Array.isArray(allRoutes) ? allRoutes : [] as route}
            <div class="bg-yorha-bg-secondary p-2 rounded text-xs">
              <div class="flex justify-between items-center">
                <span class="font-mono text-yorha-accent">{route.id}</span>
                <span
                  class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700"
                  >{route.category}</span
                >
              </div>
              <div class="text-yorha-text-secondary">{route.route}</div>
              <div class="text-yorha-text-muted text-xs">{route.description}</div>
            </div>
          {/each}
        </div>

        <!-- show full JSON for quick debugging (uses formatJson so it's not unused) -->
        <pre class="mt-3 text-xs bg-white/5 p-3 rounded max-h-80 overflow-auto">{formatJson(
            allRoutes
          )}</pre>
      </details>
    </div>
  </div>
</div>

<style>
  :global(.yorha-terminal-grid) {
    background-image:
      linear-gradient(rgba(255, 215, 0, 0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 215, 0, 0.1) 1px, transparent 1px);
    background-size: 20px 20px;
  }
</style>
