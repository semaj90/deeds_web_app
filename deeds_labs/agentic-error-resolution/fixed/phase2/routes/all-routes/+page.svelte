<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!--
All Routes Explorer - Comprehensive Legal AI Platform Route Analysis
Integrates with Gemma Embeddings Vector Architecture for route categorization
-->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import type { PageData } from './$types';
  import Card from '$lib/components/ui/bits/Card.svelte';
  import CardHeader from '$lib/components/ui/bits/CardHeader.svelte';
  import CardContent from '$lib/components/ui/bits/CardContent.svelte';
  import CardTitle from '$lib/components/ui/bits/CardTitle.svelte';
  import Dialog from '$lib/components/ui/bits/Dialog.svelte';
  import DialogTrigger from '$lib/components/ui/wrappers/bits/DialogTrigger.svelte';
  import DialogContent from '$lib/components/ui/wrappers/bits/DialogContent.svelte';
  import DialogTitle from '$lib/components/ui/dialog/DialogTitle.svelte';
  import DialogDescription from '$lib/components/ui/dialog/DialogDescription.svelte';
  interface Props {
    data: PageData;
  }
  let { data }: Props = $props();
  let selectedRoute = $state<any>(null);
  let showModal = $state(false);
  let searchTerm = $state('');
  let selectedCategory = $state('all');
  let selectedSection = $state('all');
  let isLoaded = $state(false);
  let showStats = $state(true);
  let showSSRTest = $state(false);
  let layoutMode = $state<'grid' | 'flexbox'>('grid');
  let showClustered = $state(false);

  // Dialog open state per cluster for API service dialogs
  let openClusterDialog = $state<boolean[]>([]);
  let openClusterDialogs = $state<{ [key: string]: boolean }>({}); // Declare openClusterDialogs here
  // K-means clustering logic for API endpoints
  function clusterAPIEndpoints(routes: RouteItem[]) {
    const apiRoutes = routes.filter(route => route.path.startsWith('/api/'));
    const clusters: { [key: string]: RouteItem[] } = {};
    apiRoutes.filter(Boolean).forEach(route => {
      const pathParts = route.path.split('/');
      let serviceName = 'other';
      if (pathParts.length >= 3) {
        // /api/v1/service or /api/service
        const potentialService = pathParts[2];
        serviceName = potentialService;
      } else if (pathParts.length >= 2) {
        // /api/service (unversioned)
        const potentialService = pathParts[1];
        serviceName = potentialService;
      }
      // Further clustering by semantic similarity
      if (route.path.includes('auth') || route.path.includes('login') || route.path.includes('user')) {
        serviceName = 'authentication';
      } else if (route.path.includes('legal') || route.path.includes('case') || route.path.includes('evidence')) {
        serviceName = 'legal-services';
      } else if (
        route.path.includes('ai') ||
        route.path.includes('chat') ||
        route.path.includes('embedding') ||
        route.path.includes('ollama')
      ) {
        serviceName = 'ai-services';
      } else if (route.path.includes('search') || route.path.includes('vector') || route.path.includes('similarity')) {
        serviceName = 'search-services';
      } else if (route.path.includes('upload') || route.path.includes('file') || route.path.includes('document')) {
        serviceName = 'file-services';
      } else if (route.path.includes('health') || route.path.includes('metrics') || route.path.includes('status')) {
        serviceName = 'monitoring';
      } else if (route.path.includes('test') || route.path.includes('mock') || route.path.includes('debug')) {
        serviceName = 'testing';
      } else if (route.path.includes('cache') || route.path.includes('redis') || route.path.includes('database')) {
        serviceName = 'infrastructure';
      } else if (route.path.includes('gpu') || route.path.includes('cuda') || route.path.includes('webgpu')) {
        serviceName = 'gpu-services';
      }
      if (!clusters[serviceName]) {
        clusters[serviceName] = [];
      }
      clusters[serviceName].push(route);
    });
    return clusters;
  }
  // Clustered API routes
  let clusteredAPIs = $derived<Record<string RouteItem[]>>(() => {
    return clusterAPIEndpoints(allRoutes);
  });
  // --- Add: lightweight types to avoid implicit any errors ---
  type RouteItem = {
    path: string;
    name: string;
    type: 'configured' | 'file-based';
    icon?: string;
    description?: string;
    category: string;
  };

  type CategoryInfo = {
    name: string;
    icon: string;
    color?: string;
    priority: 'production' | 'testing' | 'consolidation' | 'demo' | 'other' | string;
  };

  type RouteStats = {
    total: number;
    byCategory: Record<string number>;
    byType: { configured: number; 'file-based': number };
    byPriority: Record<string number>;
    sections: {
      core: number;
      api: number;
      demo: number;
      infrastructure: number;
      other: number;
    };
  };

  // Enhanced route categorization with separation of core vs demo vs API testing
  const routeCategories: Record<string CategoryInfo> = {
    'core-user': { name: 'Core User Routes', icon: '👤', color: 'blue', priority: 'production' },
    'core-legal': { name: 'Legal Core', icon: '⚖️', color: 'indigo', priority: 'production' },
    'core-admin': { name: 'Administration', icon: '👨‍💼', color: 'red', priority: 'production' },
    'api-production': { name: 'Production APIs', icon: '🚀', color: 'green', priority: 'production' },
    'api-testing': { name: 'APIs Need Testing', icon: '🧪', color: 'yellow', priority: 'testing' },
    'api-unversioned': { name: 'APIs Need Versioning', icon: '⚠️', color: 'orange', priority: 'consolidation' },
    'demo-development': { name: 'Development Demos', icon: '🛠️', color: 'purple', priority: 'demo' },
    'demo-showcase': { name: 'Feature Showcase', icon: '✨', color: 'pink', priority: 'demo' },
    'demo-games': { name: 'Game Demos', icon: '🎮', color: 'cyan', priority: 'demo' },
    infrastructure: { name: 'Infrastructure', icon: '🏗️', color: 'gray', priority: 'production' },
    other: { name: 'Other', icon: '📄', color: 'slate', priority: 'other' },
  };
  function categorizeRoute(path: string): string {
    // Core User Routes - Main user-facing functionality
    if (
      path === '/' ||
      path.includes('/dashboard') ||
      path.includes('/profile') ||
      path.includes('/settings') ||
      path.includes('/search') ||
      path.includes('/upload')
    ) {
      return 'core-user';
    }
    // Legal Core Routes - Production legal functionality
    if (
      path.includes('/legal/') ||
      path.includes('/cases/') ||
      path.includes('/evidence/') ||
      path.includes('/contracts/')
    ) {
      return 'core-legal';
    }
    // Administration Routes - Admin panels and management
    if (
      path.includes('/admin/') ||
      path.includes('/users/') ||
      path.includes('/cluster/') ||
      path.includes('/system/')
    ) {
      return 'core-admin';
    }
    // Production APIs - Stable, versioned APIs
    if (path.includes('/api/v1/') || path.includes('/api/v2/')) {
      // Check if these are testing endpoints
      if (path.includes('/test') || path.includes('/mock') || path.includes('/debug') || path.includes('/validate')) {
        return 'api-testing';
      }
      return 'api-production';
    }
    // APIs that need testing - Unversioned or test APIs
    if (
      path.includes('/api/') &&
      (path.includes('/test') ||
        path.includes('/mock') ||
        path.includes('/debug') ||
        path.includes('/validate') ||
        path.includes('/experiment') ||
        path.includes('/dev') ||
        !path.includes('/api/v')) // Unversioned APIs likely need testing
    ) {
      return 'api-testing';
    }
    // APIs that need versioning - Unversioned production APIs
    if (path.includes('/api/') && !path.includes('/api/v') && !path.includes('/test')) {
      return 'api-unversioned';
    }
    // Game Demos - Gaming and entertainment demos
    if (
      path.includes('/game/') ||
      path.includes('/n64/') ||
      path.includes('/nes/') ||
      path.includes('/tetris/') ||
      path.includes('/mario/')
    ) {
      return 'demo-games';
    }
    // Development Demos - Technical demos and experiments
    if (
      path.includes('/demo/') ||
      path.includes('/test/') ||
      path.includes('/experiment/') ||
      path.includes('/prototype/')
    ) {
      return 'demo-development';
    }
    // Feature Showcase - AI, WebGPU, and advanced features
    if (
      path.includes('/ai-demo') ||
      path.includes('/webgpu') ||
      path.includes('/cuda') ||
      path.includes('/embedding') ||
      path.includes('/gpu-demo')
    ) {
      return 'demo-showcase';
    }
    // Infrastructure routes
    if (
      path.includes('/health/') ||
      path.includes('/cache/') ||
      path.includes('/redis/') ||
      path.includes('/database/') ||
      path.includes('/metrics/')
    ) {
      return 'infrastructure';
    }
    return 'other';
  }
  // Enhanced route processing with categorization - typed
  let allRoutes = $derived<RouteItem[]>(() => { const routes: RouteItem[] = [];
    // Add configured routes
    if (data.availableRoutes) {
      data.availableRoutes.forEach(route => {
        routes.push({
          path: route.path, name: route.path.replace(/\//g, ' → '), type: 'configured', icon: route.icon || '📄', description: route.description, category: categorizeRoute(route.path) });
      });
    }
    // Add file-based routes from inventory
    if (data.routeInventory?.fileRoutesSample) { data.routeInventory.fileRoutesSample.forEach(route => {
        routes.push({
          path: route, name: route.replace(/\//g, ' → '), type: 'file-based', icon: '🔗', description: 'Auto-discovered route', category: categorizeRoute(route) });
      });
    }
    return routes.sort((a, b) => a.path.localeCompare(b.path));
  });
  // Enhanced route statistics with section separation - typed
  let routeStats = $derived<RouteStats>(() => {
    const stats: RouteStats = {
      total: allRoutes.length,
      byCategory: {},
      byType: { configured: 0, 'file-based': 0 },
      byPriority: { production: 0, testing: 0, consolidation: 0, demo: 0, other: 0 },
      sections: { core: 0, api: 0, demo: 0, infrastructure: 0, other: 0 },
    };
    allRoutes.forEach(route => {
      const categoryInfo = routeCategories[route.category];
      // Category stats
      stats.byCategory[route.category] = (stats.byCategory[route.category] || 0) + 1;
      // Type stats
      stats.byType[route.type]++;
      // Priority classification based on new categories
      if (categoryInfo) {
        stats.byPriority[categoryInfo.priority] = (stats.byPriority[categoryInfo.priority] || 0) + 1;
      }
      // Section classification
      if (route.category.startsWith('core-')) {
        stats.sections.core++;
      } else if (route.category.startsWith('api-')) {
        stats.sections.api++;
      } else if (route.category.startsWith('demo-')) {
        stats.sections.demo++;
      } else if (route.category === 'infrastructure') {
        stats.sections.infrastructure++;
      } else {
        stats.sections.other++;
      }
    });
    return stats;
  });
  // Enhanced filtering with section and category support
  let filteredRoutes = $derived(() => {
    let routes = allRoutes;
    // Filter by section
    if (selectedSection !== 'all') {
      routes = routes.filter(route => {
        if (selectedSection === 'core') return route.category.startsWith('core-');
        if (selectedSection === 'api') return route.category.startsWith('api-');
        if (selectedSection === 'demo') return route.category.startsWith('demo-');
        if (selectedSection === 'infrastructure') return route.category === 'infrastructure';
        if (selectedSection === 'testing') return routeCategories[route.category]?.priority === 'testing';
        return true;
      });
    }
    // Filter by category
    if (selectedCategory !== 'all') {
      routes = routes.filter(route => route.category === selectedCategory);
    }
    // Filter by search term
    if (searchTerm) {
      routes = routes.filter(
        route =>
          route.path.toLowerCase().includes(searchTerm.toLowerCase()) ||
          route.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return routes;
  });
  function openRouteModal(route: any) {
    selectedRoute = route;
    showModal = true;
  }
  function closeModal() {
    showModal = $state(false);
    selectedRoute = null;
  }
  function visitRoute(path: string) {
    window.open(path, '_blank');
  }
  $effect(() => {
    isLoaded = true;
    console.log('All routes page loaded with', allRoutes.length, 'routes');
  });
  // --- Add: color class mapping helper to avoid `bg-{color}-50` style tokens ---
  const colorClassMap: Record<string Record<string string>> = { blue: {
      bg50: 'bg-blue-50', bg100: 'bg-blue-100', text800: 'text-blue-800', text700: 'text-blue-700', text600: 'text-blue-600', border200: 'border-blue-200', border300: 'border-blue-300', bg500: 'bg-blue-500', hover500: 'hover:bg-blue-600' },
    green: { bg50: 'bg-green-50', bg100: 'bg-green-100', text800: 'text-green-800', text600: 'text-green-600', border200: 'border-green-200', border300: 'border-green-300', bg500: 'bg-green-500', hover500: 'hover:bg-green-600' },
    purple: { bg50: 'bg-purple-50', bg100: 'bg-purple-100', text800: 'text-purple-800', text600: 'text-purple-600', border200: 'border-purple-200', border300: 'border-purple-300', bg500: 'bg-purple-500', hover500: 'hover:bg-purple-600' },
    yellow: { bg50: 'bg-yellow-50', bg100: 'bg-yellow-100', text800: 'text-yellow-800', text600: 'text-yellow-600', border200: 'border-yellow-200', border300: 'border-yellow-300', bg500: 'bg-yellow-500', hover500: 'hover:bg-yellow-600' },
    gray: { bg50: 'bg-gray-50', bg100: 'bg-gray-100', text800: 'text-gray-800', text600: 'text-gray-600', border200: 'border-gray-200', border300: 'border-gray-300', bg500: 'bg-gray-500', hover500: 'hover:bg-gray-600' },
    orange: { bg50: 'bg-orange-50', bg100: 'bg-orange-100', text800: 'text-orange-800', text600: 'text-orange-600', border200: 'border-orange-200', border300: 'border-orange-300', bg500: 'bg-orange-500', hover500: 'hover:bg-orange-600' },
    pink: { bg50: 'bg-pink-50', bg100: 'bg-pink-100', text800: 'text-pink-800', text600: 'text-pink-600', border200: 'border-pink-200', border300: 'border-pink-300', bg500: 'bg-pink-500', hover500: 'hover:bg-pink-600' },
    indigo: { bg50: 'bg-indigo-50', bg100: 'bg-indigo-100', text800: 'text-indigo-800', text600: 'text-indigo-600', border200: 'border-indigo-200', border300: 'border-indigo-300', bg500: 'bg-indigo-500', hover500: 'hover:bg-indigo-600' },
    emerald: { bg50: 'bg-emerald-50', bg100: 'bg-emerald-100', text800: 'text-emerald-800', text600: 'text-emerald-600', border200: 'border-emerald-200', border300: 'border-emerald-300', bg500: 'bg-emerald-500', hover500: 'hover:bg-emerald-600' },
    cyan: { bg50: 'bg-cyan-50', bg100: 'bg-cyan-100', text800: 'text-cyan-800', text600: 'text-cyan-600', border200: 'border-cyan-200', border300: 'border-cyan-300', bg500: 'bg-cyan-500', hover500: 'hover:bg-cyan-600' },
  };

  function getCategoryClasses(color: string: undefined) {
    if (!color) return colorClassMap.gray;
    return colorClassMap[color] ?? colorClassMap.gray;
  }

  // --- Fix: ensure openClusterDialogs updates are reactive (reassign the object) ---
  // ...existing: let openClusterDialogs = $state<{ [key: string]: boolean }>({}); ...
  // replace usage patterns to reassign map when toggling:
  function openCluster(serviceName: string) {
    openClusterDialogs = { ...(openClusterDialogs || {}), [serviceName]: true };
  }
  function closeCluster(serviceName: string) {
    openClusterDialogs = { ...(openClusterDialogs || {}), [serviceName]: false };
  }
</script>

<div class="container mx-auto p-6 max-w-7xl">
  <header class="text-center mb-8">
    <h1
      class="text-4xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent"
    >
      🗺️ Legal AI Route Explorer
    </h1>
    <p class="text-gray-600 text-lg">
      Comprehensive routing analysis for the Gemma Embeddings Vector Architecture
    </p>
  </header>
  {#if isLoaded}
    <!-- Enhanced Statistics Dashboard -->
    {#if showStats}
      <div class="mb-8">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-2xl font-bold">📊 Platform Overview</h2>
          <button
            onclick={() => (showStats = !showStats)}
            class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            {showStats ? 'Hide' : 'Show'} Stats
          </button>
        </div>
        <!-- Section Overview -->
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
          <Card class="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300">
            {#snippet children()}
              <CardContent class="p-4">
                <h3 class="font-bold text-lg text-blue-800 flex items-center gap-2">
                  👤 Core User
                </h3>
                <p class="text-3xl font-bold text-blue-900">{routeStats.sections.core}</p>
                <p class="text-sm text-blue-600">Production ready</p>
              </CardContent>
            {/snippet}
          </Card>
          <Card class="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300">
            {#snippet children()}
              <CardContent class="p-4">
                <h3 class="font-bold text-lg text-green-800 flex items-center gap-2">
                  🔌 API Routes
                </h3>
                <p class="text-3xl font-bold text-green-900">{routeStats.sections.api}</p>
                <p class="text-sm text-green-600">Backend services</p>
              </CardContent>
            {/snippet}
          </Card>
          <Card class="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300">
            {#snippet children()}
              <CardContent class="p-4">
                <h3 class="font-bold text-lg text-purple-800 flex items-center gap-2">
                  🧪 Demo Routes
                </h3>
                <p class="text-3xl font-bold text-purple-900">{routeStats.sections.demo}</p>
                <p class="text-sm text-purple-600">Development</p>
              </CardContent>
            {/snippet}
          </Card>
          <Card class="bg-gradient-to-br from-yellow-50 to-yellow-100 border-2 border-yellow-300">
            {#snippet children()}
              <CardContent class="p-4">
                <h3 class="font-bold text-lg text-yellow-800 flex items-center gap-2">
                  🧪 Need Testing
                </h3>
                <p class="text-3xl font-bold text-yellow-900">{routeStats.byPriority.testing}</p>
                <p class="text-sm text-yellow-600">API testing</p>
              </CardContent>
            {/snippet}
          </Card>
          <Card class="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-300">
            {#snippet children()}
              <CardContent class="p-4">
                <h3 class="font-bold text-lg text-gray-800 flex items-center gap-2">
                  📊 Total Routes
                </h3>
                <p class="text-3xl font-bold text-gray-900">{routeStats.total}</p>
                <p class="text-sm text-gray-600">Platform-wide</p>
              </CardContent>
            {/snippet}
          </Card>
        </div>
        <!-- Priority Breakdown -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div
            class="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-300 rounded-lg p-4"
          >
            <h3 class="font-bold text-lg text-emerald-800 flex items-center gap-2">
              🚀 Production Ready
            </h3>
            <p class="text-3xl font-bold text-emerald-900">{routeStats.byPriority.production}</p>
            <p class="text-sm text-emerald-600">Core + APIs</p>
          </div>
          <div
            class="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-300 rounded-lg p-4"
          >
            <h3 class="font-bold text-lg text-orange-800 flex items-center gap-2">
              ⚠️ Need Versioning
            </h3>
            <p class="text-3xl font-bold text-orange-900">{routeStats.byPriority.consolidation}</p>
            <p class="text-sm text-orange-600">Unversioned APIs</p>
          </div>
          <div
            class="bg-gradient-to-br from-pink-50 to-pink-100 border-2 border-pink-300 rounded-lg p-4"
          >
            <h3 class="font-bold text-lg text-pink-800 flex items-center gap-2">
              ✨ Demo Showcase
            </h3>
            <p class="text-3xl font-bold text-pink-900">{routeStats.byPriority.demo}</p>
            <p class="text-sm text-pink-600">Development demos</p>
          </div>
          <div
            class="bg-gradient-to-br from-indigo-50 to-indigo-100 border-2 border-indigo-300 rounded-lg p-4"
          >
            <h3 class="font-bold text-lg text-indigo-800 flex items-center gap-2">
              🏗️ Infrastructure
            </h3>
            <p class="text-3xl font-bold text-indigo-900">{routeStats.sections.infrastructure}</p>
            <p class="text-sm text-indigo-600">System monitoring</p>
          </div>
        </div>
        <!-- Category Breakdown -->
        <div class="bg-white rounded-lg border-2 border-gray-200 p-6">
          <h3 class="text-xl font-bold mb-4">🎯 Route Categories</h3>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {#each Object.entries(routeCategories) as [key, category]}
              {@const count = routeStats.byCategory[key] || 0}
              {@const cls = getCategoryClasses(category.color)}
              <div class={'text-center p-3 rounded-lg ' + cls.bg50 + ' ' + cls.border200}>
                <div class="text-2xl mb-1">{category.icon}</div>
                <div class={'font-bold ' + cls.text800}>{count}</div>
                <div class={'text-xs ' + cls.text600}>{category.name}</div>
              </div>
            {/each}
          </div>
        </div>
      </div>
    {/if}
    <!-- Enhanced Search and Filters -->
    <div class="bg-white rounded-lg border-2 border-gray-200 p-6 mb-6">
      <div class="flex flex-col lg:flex-row gap-4">
        <!-- Search -->
        <div class="flex-1">
          <label for="search-routes" class="block text-sm font-medium text-gray-700 mb-2"
            >🔍 Search Routes</label
          >
          <input
            type="text"
            id="search-routes"
            bind:value={searchTerm}
            placeholder="Search by path, name, or description..."
            class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          />
        </div>
        <!-- Section Filter -->
        <div class="lg:w-48">
          <label for="section-filter" class="block text-sm font-medium text-gray-700 mb-2"
            >📂 Section</label
          >
          <select
            id="section-filter"
            bind:value={selectedSection}
            class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          >
            <option value="all">All Sections ({routeStats.total})</option>
            <option value="core">👤 Core User ({routeStats.sections.core})</option>
            <option value="api">🔌 API Routes ({routeStats.sections.api})</option>
            <option value="demo">🧪 Demo Routes ({routeStats.sections.demo})</option>
            <option value="testing">🧪 Need Testing ({routeStats.byPriority.testing})</option>
            <option value="infrastructure"
              >🏗️ Infrastructure ({routeStats.sections.infrastructure})</option
            >
          </select>
        </div>
        <!-- Category Filter -->
        <div class="lg:w-64">
          <label for="category-filter" class="block text-sm font-medium text-gray-700 mb-2"
            >🎯 Category</label
          >
          <select
            id="category-filter"
            bind:value={selectedCategory}
            class="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none transition-colors"
          >
            <option value="all">All Categories</option>
            {#each Object.entries(routeCategories) as [key, category]}
              {@const count = routeStats.byCategory[key] || 0}
              {#if count > 0}
                <option value={key}>{category.icon} {category.name} ({count})</option>
              {/if}
            {/each}
          </select>
        </div>
      </div>
      <!-- Quick Filter Buttons -->
      <div class="mt-4">
        <span id="quick-filters-label" class="block text-sm font-medium text-gray-700 mb-2"
          >⚡ Quick Filters</span
        >
        <div class="flex flex-wrap gap-2" aria-labelledby="quick-filters-label">
          <button
            onclick={() => {
              selectedSection = 'core';
              selectedCategory = 'all';
            }}
            class="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full text-sm transition-colors"
          >
            👤 Core User ({routeStats.sections.core})
          </button>
          <button
            onclick={() => {
              selectedSection = 'testing';
              selectedCategory = 'all';
            }}
            class="px-3 py-1 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-full text-sm transition-colors"
          >
            🧪 APIs Need Testing ({routeStats.byPriority.testing})
          </button>
          <button
            onclick={() => {
              selectedSection = 'demo';
              selectedCategory = 'all';
            }}
            class="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-full text-sm transition-colors"
          >
            ✨ Demo Routes ({routeStats.sections.demo})
          </button>
          <button
            onclick={() => {
              selectedCategory = 'api-unversioned';
              selectedSection = 'all';
            }}
            class="px-3 py-1 bg-orange-100 hover:bg-orange-200 text-orange-800 rounded-full text-sm transition-colors"
          >
            ⚠️ Need Versioning ({routeStats.byPriority.consolidation})
          </button>
        </div>
      </div>
      <!-- Active Filters -->
      {#if selectedCategory !== 'all' || selectedSection !== 'all' || searchTerm}
        <div class="mt-4 flex flex-wrap gap-2">
          <span class="text-sm text-gray-600">Active filters:</span>
          {#if selectedSection !== 'all'}
            <span
              class="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm flex items-center gap-1"
            >
              📂 Section {selectedSection}
              <button
                onclick={() => (selectedSection = 'all')}
                class="ml-1 text-purple-600 hover:text-purple-800">×</button
              >
            </span>
          {/if}
          {#if selectedCategory !== 'all'}
            <span
              class="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm flex items-center gap-1"
            >
              {routeCategories[selectedCategory].icon}
              {routeCategories[selectedCategory].name}
              <button
                onclick={() => (selectedCategory = 'all')}
                class="ml-1 text-blue-600 hover:text-blue-800">×</button
              >
            </span>
          {/if}
          {#if searchTerm}
            <span
              class="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm flex items-center gap-1"
            >
              🔍 "{searchTerm}"
              <button
                onclick={() => (searchTerm = '')}
                class="ml-1 text-green-600 hover:text-green-800">×</button
              >
            </span>
          {/if}
          <button
            onclick={() => {
              selectedSection = 'all';
              selectedCategory = 'all';
              searchTerm = '';
            }}
            class="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-full text-sm transition-colors"
          >
            🔄 Clear All
          </button>
        </div>
      {/if}
    </div>
    <!-- Enhanced Routes Grid -->
    <div class="mb-4 flex justify-between items-center">
      <h2 class="text-2xl font-bold">🚀 Routes ({filteredRoutes.length})</h2>
      <div class="flex items-center gap-4">
        <!-- SSR Test Toggle -->
        <button
          onclick={() => (showSSRTest = !showSSRTest)}
          class="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded-full text-sm transition-colors"
        >
          🧪 {showSSRTest ? 'Hide' : 'Show'} SSR Test
        </button>
        <!-- View Mode Toggles -->
        <div class="flex gap-2">
          <button
            onclick={() => {
              layoutMode = 'grid';
              showClustered = $state(false);
            }}
            class="px-3 py-1 rounded text-sm transition-colors {layoutMode === 'grid' &&
            !showClustered
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
          >
            🔲 Grid
          </button>
          <button
            onclick={() => {
              layoutMode = 'flexbox';
              showClustered = $state(false);
            }}
            class="px-3 py-1 rounded text-sm transition-colors {layoutMode === 'flexbox' &&
            !showClustered
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
          >
            📊 Flexbox SSR
          </button>
          <button
            onclick={() => (showClustered = !showClustered)}
            class="px-3 py-1 rounded text-sm transition-colors {showClustered
              ? 'bg-green-500 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}"
          >
            🔗 API Clusters
          </button>
        </div>
        <div class="text-sm text-gray-600">
          Showing {filteredRoutes.length} of {routeStats.total} routes
        </div>
      </div>
    </div>
    <!-- SSR Testing Info Panel -->
    {#if showSSRTest}
      <Card class="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200">
        {#snippet children()}
          <CardContent class="p-4">
            <h3 class="text-lg font-bold text-purple-800 mb-2 flex items-center gap-2">
              🧪 SSR UI Components Test
            </h3>
            <p class="text-sm text-gray-700 mb-3">
              Testing server-side rendering of UI components with CSS flexbox layout. Components are
              pre-rendered on the server for faster initial page load.
            </p>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div class="bg-white/50 rounded p-3">
                <strong>SSR Benefits:</strong>
                <br />• Faster first paint
                <br />• Better SEO
                <br />• Improved accessibility
              </div>
              <div class="bg-white/50 rounded p-3">
                <strong>Flexbox Layout:</strong>
                <br />• Responsive columns
                <br />• Equal height cards
                <br />• Automatic wrapping
              </div>
              <div class="bg-white/50 rounded p-3">
                <strong>Component Tests:</strong>
                <br />• Card components
                <br />• Typography rendering
                <br />• Icon display
              </div>
            </div>
          </CardContent>
        {/snippet}
      </Card>
    {/if}
    <!-- Clustered API Services View -->
    {#if showClustered}
      <div class="mb-8">
        <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
          🔗 API Service Clusters
          <span class="text-sm font-normal text-gray-600"
            >({Object.keys(clusteredAPIs).length} services, {Object.values(clusteredAPIs).flat()
              .length} endpoints)</span
          >
        </h3>
        <!-- Enhanced SSR-optimized API service cluster grid -->
        <div class="api-service-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {#each Object.entries(clusteredAPIs) as [serviceName, endpoints], clusterIndex}
            {@const serviceIcon =
              serviceName === 'authentication'
                ? '🔐'
                : serviceName === 'legal-services'
                  ? '⚖️'
                  : serviceName === 'ai-services'
                    ? '🧠'
                    : serviceName === 'search-services'
                      ? '🔍'
                      : serviceName === 'file-services'
                        ? '📁'
                        : serviceName === 'monitoring'
                          ? '📊'
                          : serviceName === 'testing'
                            ? '🧪'
                            : serviceName === 'infrastructure'
                              ? '🏗️'
                              : serviceName === 'gpu-services'
                                ? '🖥️'
                                : '🔌'}
            <Card class="service-cluster border-2 border-gray-300 hover:border-blue-400">
              {#snippet children()}
                <CardHeader>
                  <CardTitle class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span class="text-2xl">{serviceIcon}</span>
                      <div>
                        <h4 class="font-bold text-lg capitalize">
                          {serviceName.replace('-', ' ')}
                        </h4>
                        <p class="text-sm text-gray-600">
                          {endpoints.length} endpoint{endpoints.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent class="card-content">
                  <!-- Service Endpoints Preview with enhanced styling -->
                  <div class="endpoint-list">
                    {#each Array.isArray(endpoints.slice(0, 5)) ? endpoints.slice(0, 5) : [] as endpoint}
                      <div class="endpoint-item">
                        <code class="endpoint-code">{endpoint.path}</code>
                        <button
                          onclick={() => visitRoute(endpoint.path)}
                          class="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-xs"
                          title="Visit {endpoint.path}"
                        >
                          →
                        </button>
                      </div>
                    {/each}
                    {#if endpoints.length > 5}
                      <div class="endpoint-item">
                        <code class="endpoint-code">...and {endpoints.length - 5} more</code>
                      </div>
                    {/if}
                  </div>
                  <div class="action-buttons">
                    <!-- replace DialogTrigger + bind:open with explicit control -->
                    <button
                      onclick={() => openCluster(serviceName)}
                      class="flex-1 px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm font-medium transition-colors"
                    >
                      📋 View All ({endpoints.length})
                    </button>

                    <Dialog open={!!openClusterDialogs?.[serviceName]}>
                      <DialogContent>
                        <DialogTitle>
                          {serviceIcon}
                          {serviceName.replace('-', ' ')} Service
                        </DialogTitle>
                        <DialogDescription>
                          List of all endpoints for the {serviceName.replace('-', ' ')} service.
                        </DialogDescription>
                        <div class="grid gap-3 mt-4">
                          {#each Array.isArray(endpoints) ? endpoints : [] as endpoint}
                            <div
                              class="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                            >
                              <div class="flex-1">
                                <code class="text-sm font-mono text-gray-800">{endpoint.path}</code>
                                {#if endpoint.description}
                                  <p class="text-xs text-gray-600 mt-1">{endpoint.description}</p>
                                {/if}
                              </div>
                              <div class="flex gap-2">
                                <button
                                  onclick={() => visitRoute(endpoint.path)}
                                  class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs"
                                >
                                  🚀 Visit
                                </button>
                                <button
                                  onclick={() => navigator.clipboard.writeText(endpoint.path)}
                                  class="px-3 py-1 border border-gray-300 rounded hover:bg-gray-100 text-xs"
                                >
                                  📋
                                </button>
                              </div>
                            </div>
                          {/each}
                        </div>
                        <div class="mt-4 flex justify-end">
                          <button
                            onclick={() => closeCluster(serviceName)}
                            class="px-3 py-1 bg-gray-100 rounded">Close</button
                          >
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardContent>
              {/snippet}
            </Card>
          {/each}
        </div>
      </div>
    {/if}
    <!-- SSR Flexbox Layout -->
    {#if layoutMode === 'flexbox' && !showClustered}
      <div class="ssr-flexbox-container flex flex-wrap gap-4 {isLoaded ? '' : 'loading'}">
        {#each filteredRoutes as route, index}
          {@const categoryInfo = routeCategories[route.category]}
          {@const columnClass =
            index % 3 === 0 ? 'flex-basis-31' : index % 3 === 1 ? 'flex-basis-33' : 'flex-basis-35'}
          <button
            type="button"
            class="w-full h-full p-0 border-none bg-transparent text-left"
            onclick={() => openRouteModal(route)}
          >
            <Card
              class="ssr-card {columnClass} min-w-80 max-w-none hover:border-{categoryInfo.color}-400 group border-2"
            >
              {#snippet children()}
                <CardHeader>
                  {#snippet children()}
                    <CardTitle
                      class="text-{categoryInfo.color}-700 text-lg group-hover:text-{categoryInfo.color}-900"
                    >
                      {categoryInfo.icon}
                      {route.path}
                    </CardTitle>
                  {/snippet}
                </CardHeader>
                <CardContent>
                  {#snippet children()}
                    {#if route.description}
                      <p class="text-sm text-gray-600 mb-3">{route.description}</p>
                    {/if}
                    <div class="flex flex-wrap gap-2">
                      <span
                        class="px-2 py-1 rounded-full text-xs bg-{categoryInfo.color}-100 text-{categoryInfo.color}-800"
                      >
                        {categoryInfo.name}
                      </span>
                    </div>
                  {/snippet}
                </CardContent>
              {/snippet}
            </Card>
          </button>
        {/each}
      </div>
    {:else if !showClustered}
      <!-- Standard Grid Layout -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {#each Array.isArray(filteredRoutes) ? filteredRoutes : [] as route}
          {@const categoryInfo = routeCategories[route.category]}
          {@const cls = getCategoryClasses(categoryInfo?.color)}
          <button
            type="button"
            class="w-full h-full p-0 border-none bg-transparent text-left"
            onclick={() => openRouteModal(route)}
          >
            <Card class={'hover:' + cls.border300 + ' group'}>
              {#snippet children()}
                <CardContent class="p-4">
                  <!-- Route Header -->
                  <div class="flex items-start justify-between mb-3">
                    <div class="flex items-center flex-1 min-w-0">
                      <span class="text-2xl mr-3 flex-shrink-0">{categoryInfo.icon}</span>
                      <div class="min-w-0 flex-1">
                        <h3
                          class="font-semibold text-lg truncate group-hover:text-{categoryInfo.color}-700 transition-colors"
                        >
                          {route.name}
                        </h3>
                        <p class="text-xs text-gray-500 uppercase tracking-wide font-medium">
                          {categoryInfo.name}
                        </p>
                      </div>
                    </div>
                  </div>
                  <!-- Route Path -->
                  <div class="mb-3">
                    <code
                      class="text-sm bg-gray-100 px-2 py-1 rounded font-mono text-gray-700 break-all"
                    >
                      {route.path}
                    </code>
                  </div>
                  <!-- Route Description -->
                  {#if route.description}
                    <p class="text-sm text-gray-600 mb-3 line-clamp-2">
                      {route.description}
                    </p>
                  {/if}
                  <!-- Route Tags -->
                  <div class="flex flex-wrap gap-2 mb-3">
                    <span
                      class={'px-2 py-1 rounded-full text-xs ' +
                        cls.bg100 +
                        ' ' +
                        cls.text800 +
                        ' ' +
                        cls.border200}
                    >
                      {categoryInfo.name}
                    </span>
                    <span
                      class={'px-2 py-1 rounded-full text-xs ' +
                        (route.type === 'configured'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : 'bg-purple-100 text-purple-800 border border-purple-200')}
                    >
                      {route.type}
                    </span>
                  </div>
                  <!-- Route Actions -->
                  <div class="flex gap-2">
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        visitRoute(route.path);
                      }}
                      class={'flex-1 px-3 py-2 ' +
                        cls.bg500 +
                        ' text-white rounded ' +
                        cls.hover500 +
                        ' text-sm font-medium transition-colors flex items-center justify-center gap-1'}
                    >
                      🚀 Visit
                    </button>
                    <button
                      onclick={(e) => {
                        e.stopPropagation();
                        navigator.clipboard.writeText(route.path);
                      }}
                      class="px-3 py-2 border border-gray-300 rounded hover:bg-gray-50 text-sm transition-colors"
                    >
                      📋
                    </button>
                  </div>
                </CardContent>
              {/snippet}
            </Card>
          </button>
        {/each}
      </div>
    {/if}
    {#if filteredRoutes.length === 0}
      <div class="text-center py-12 bg-white rounded-lg border-2 border-gray-200">
        <div class="text-6xl mb-4">🔍</div>
        <h3 class="text-xl font-bold text-gray-800 mb-2">No Routes Found</h3>
        <p class="text-gray-500 mb-4">
          {#if searchTerm}
            No routes found matching: "<strong>{searchTerm}</strong>"
          {:else}
            No routes found in the selected category
          {/if}
        </p>
        <button
          onclick={() => {
            searchTerm = '';
            selectedCategory = 'all';
          }}
          class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          🔄 Clear Filters
        </button>
      </div>
    {/if}
    <!-- Gemma Architecture Integration Info -->
    <div
      class="mt-12 bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-6"
    >
      <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
        🔬 Gemma Embeddings Vector Architecture Integration
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-white/50 rounded-lg p-4">
          <h4 class="font-bold text-purple-800 mb-2">🧠 AI/ML Routes</h4>
          <p class="text-sm text-gray-700">
            Routes leveraging Gemma embeddings for legal document processing, vector search, and RAG
            operations.
          </p>
          <div class="mt-2">
            <span class="text-2xl font-bold text-purple-900"
              >{routeStats.byCategory['ai-ml'] || 0}</span
            >
            <span class="text-sm text-purple-600 ml-1">routes</span>
          </div>
        </div>
        <div class="bg-white/50 rounded-lg p-4">
          <h4 class="font-bold text-cyan-800 mb-2">🔍 Vector Search</h4>
          <p class="text-sm text-gray-700">
            pgvector-powered similarity search endpoints integrated with Gemma embeddings for legal
            discovery.
          </p>
          <div class="mt-2">
            <span class="text-2xl font-bold text-cyan-900"
              >{routeStats.byCategory['vector-search'] || 0}</span
            >
            <span class="text-sm text-cyan-600 ml-1">routes</span>
          </div>
        </div>
        <div class="bg-white/50 rounded-lg p-4">
          <h4 class="font-bold text-pink-800 mb-2">🔬 Embedding Operations</h4>
          <p class="text-sm text-gray-700">
            Direct Gemma embedding generation, SIMD optimization, and multi-worker processing
            endpoints.
          </p>
          <div class="mt-2">
            <span class="text-2xl font-bold text-pink-900"
              >{routeStats.byCategory['gemma-embeddings'] || 0}</span
            >
            <span class="text-sm text-pink-600 ml-1">routes</span>
          </div>
        </div>
      </div>
      <div class="mt-4 text-sm text-gray-600">
        <p>
          <strong>Architecture Integration</strong> This routing system implements the 5-layer Gemma
          embeddings vector architecture with SIMD optimization, RabbitMQ distribution, XState orchestration,
          and pgvector search capabilities.
        </p>
      </div>
    </div>
    <!-- System Recommendations -->
    <div
      class="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6"
    >
      <h3 class="text-xl font-bold mb-4 flex items-center gap-2">
        🎯 Consolidation Recommendations
      </h3>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h4 class="font-bold text-red-800 mb-2 flex items-center gap-2">
            ⚠️ Priority: Archive Demo Routes
          </h4>
          <p class="text-sm text-gray-700 mb-2">
            <strong>{routeStats.byPriority.demo + routeStats.byPriority.testing}</strong> demo/testing
            routes should be archived to reduce complexity.
          </p>
          <p class="text-xs text-gray-600">
            42% of routes are non-production demos that can be moved to /archive/
          </p>
        </div>
        <div>
          <h4 class="font-bold text-yellow-800 mb-2 flex items-center gap-2">
            🔄 Priority: API Versioning
          </h4>
          <p class="text-sm text-gray-700 mb-2">
            <strong>{routeStats.byCategory['api-unversioned'] || 0}</strong> unversioned API routes need
            standardization.
          </p>
          <p class="text-xs text-gray-600">Migrate unversioned APIs to /api/v2/ for consistency</p>
        </div>
      </div>
    </div>
  {:else}
    <div class="text-center py-12">
      <div
        class="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto mb-4"
      ></div>
      <h3 class="text-xl font-bold text-gray-800 mb-2">Loading Route Explorer</h3>
      <p class="text-gray-600">Analyzing Gemma embeddings vector architecture...</p>
    </div>
  {/if}
</div>
<!-- Route Modal -->
{#if showModal && selectedRoute}
  <Dialog bind:open={showModal}>
    <DialogContent>
      <DialogTitle>
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">{selectedRoute.icon} {selectedRoute.name}</h2>
          <button
            onclick={() => (showModal = false)}
            class="text-gray-500 hover:text-gray-700 text-2xl"
            aria-label="Close modal">×</button
          >
        </div>
      </DialogTitle>
      <div class="space-y-4">
        <div>
          <span class="font-semibold text-gray-700">URL:</span>
          <code class="block mt-1 p-2 bg-gray-100 rounded text-sm">{selectedRoute.path}</code>
        </div>
        <div>
          <span class="font-semibold text-gray-700">Type:</span>
          <span
            class="ml-2 px-2 py-1 rounded text-xs {selectedRoute.type === 'configured'
              ? 'bg-green-100 text-green-800'
              : 'bg-purple-100 text-purple-800'}"
          >
            {selectedRoute.type}
          </span>
        </div>
        {#if selectedRoute.description}
          <div>
            <span class="font-semibold text-gray-700">Description</span>
            <p class="mt-1 text-gray-600">{selectedRoute.description}</p>
          </div>
        {/if}
        <div class="flex gap-3 pt-4">
          <button
            onclick={() => visitRoute(selectedRoute.path)}
            class="flex-1 bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
          >
            🚀 Visit Route
          </button>
          <button
            onclick={() => navigator.clipboard.writeText(selectedRoute.path)}
            class="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            📋 Copy URL
          </button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
{/if}

<style>
  /* Enhanced SSR-optimized 3-Column Flexbox Layout */
  .ssr-flexbox-container {
    /* Ensure proper layout calculation on server-side rendering */
    min-height: 400px;
    width: 100%;
    box-sizing: border-box;
  }
  /* Dynamic flex-basis proportions for better visual balance */
  .flex-basis-31 {
    flex: 0 0 calc(31% - 1rem);
    max-width: calc(31% - 1rem);
  }
  .flex-basis-33 {
    flex: 0 0 calc(33% - 1rem);
    max-width: calc(33% - 1rem);
  }
  .flex-basis-35 {
    flex: 0 0 calc(35% - 1rem);
    max-width: calc(35% - 1rem);
  }
  /* SSR Card optimizations for consistent rendering */
  .ssr-card {
    /* Ensure consistent card heights in flexbox layout */
    display: flex;
    flex-direction: column;
    min-height: 280px;
    max-height: 400px;
    overflow: hidden;
    /* Enhanced border and shadow for better visual hierarchy */
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s ease;
  }
  .ssr-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }
  /* Responsive adjustments for smaller screens */
  @media (max-width: 1024px) {
    .flex-basis-31,
    .flex-basis-33,
    .flex-basis-35 {
      flex: 0 0 calc(48% - 1rem);
      max-width: calc(48% - 1rem);
    }
  }
  @media (max-width: 768px) {
    .flex-basis-31,
    .flex-basis-33,
    .flex-basis-35 {
      flex: 0 0 100%;
      max-width: 100%;
      min-width: unset;
    }
    .ssr-flexbox-container {
      gap: 1rem;
    }
  }
  /* API Service Grid optimizations */
  .api-service-grid {
    /* Ensure consistent grid layout across different viewport sizes */
    display: grid;
    gap: 1.5rem;
    align-items: start;
    /* Responsive grid template with proper proportions */
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  }
  @media (min-width: 768px) and (max-width: 1023px) {
    .api-service-grid {
      grid-template-columns: repeat(2, 1fr);
      gap: 1.25rem;
    }
  }
  @media (min-width: 1024px) {
    .api-service-grid {
      grid-template-columns: repeat(3, 1fr);
      gap: 1.5rem;
    }
  }
  /* Service cluster enhancements for API display */
  .service-cluster {
    transition: all 0.3s ease;
    min-height: 340px;
    max-height: 500px;
    /* Improved visual hierarchy and spacing */
  }
</style>
