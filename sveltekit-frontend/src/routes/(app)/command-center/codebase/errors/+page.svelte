<script lang="ts">
    import { untrack } from 'svelte';
    import type { PageData } from './$types';

    let { data }: {
	data: PageData } = $props();

    const initFilters = untrack(() => data?.filters);
    let selectedErrorCode = $state(initFilters?.errorCode ?? '');
    let selectedSurface = $state(initFilters?.surface ?? '');
    let selectedTech = $state(initFilters?.tech ?? '');
    let searchQuery = $state('');

    const filteredErrors = $derived.by(() => {
        if (!searchQuery) return data.errors;
        const q = searchQuery.toLowerCase();
        return data.errors.filter(err =>
            err.filePath.toLowerCase().includes(q) ||
            err.message.toLowerCase().includes(q) ||
            err.errorCode.toLowerCase().includes(q)
        );
    });

    function applyFilters() {
        const params = new URLSearchParams();
        if (selectedErrorCode) params.set('errorCode', selectedErrorCode);
        if (selectedSurface) params.set('surface', selectedSurface);
        if (selectedTech) params.set('tech', selectedTech);
        window.location.search = params.toString();
    }

    function clearFilters() {
        selectedErrorCode = '';
        selectedSurface = '';
        selectedTech = '';
        window.location.search = '';
    }

    function getRiskColor(errorCode: string): string {
        if (errorCode.startsWith('SYNTAX')) return 'text-red-400';
        if (errorCode.startsWith('TS2304')) return 'text-orange-400';
        if (errorCode.startsWith('TS2307')) return 'text-yellow-400';
        return 'text-blue-400';
    }

    function getSeverityBadge(severity: string): string {
        if (severity === 'error') return 'bg-red-500/20 text-red-300 border-red-500/30';
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
    }
</script>

<svelte:head>
    <title>Error Cards | Command Center</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
    <!-- Header -->
    <div class="mb-8">
        <h1 class="text-3xl font-bold text-white mb-2">🔬 Error Cards</h1>
        <p class="text-slate-400">Browse and filter {data.totalErrors.toLocaleString()} diagnostic cards from Phase 90 pipeline</p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md grid-cols-4 gap-4 mb-8">
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
            <div class="text-3xl font-bold text-white">{data.totalErrors.toLocaleString()}</div>
            <div class="text-slate-400 text-sm">Total Errors</div>
        </div>
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
            <div class="text-3xl font-bold text-blue-400">{Object.keys(data.errorCodeCounts).length}</div>
            <div class="text-slate-400 text-sm">Error Patterns</div>
        </div>
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
            <div class="text-3xl font-bold text-emerald-400">{Object.keys(data.surfaceCounts).length}</div>
            <div class="text-slate-400 text-sm">Surface Areas</div>
        </div>
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50">
            <div class="text-3xl font-bold text-purple-400">{Object.keys(data.techCounts).length}</div>
            <div class="text-slate-400 text-sm">Tech Stacks</div>
        </div>
    </div>

    <!-- Filters -->
    <div class="bg-slate-800/40 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-8">
        <div class="flex flex-wrap gap-4 items-end">
            <!-- Search -->
            <div class="flex-1 min-w-[200px]">
                <label for="err-search" class="block text-sm text-slate-400 mb-2">Search</label>
                <input
                    id="err-search"
                    type="text"
                    bind:value={searchQuery}
                    placeholder="Search by file, message, or code..."
                    class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            <!-- Error Code Filter -->
            <div class="min-w-[150px]">
                <label for="err-code" class="block text-sm text-slate-400 mb-2">Error Code</label>
                <select
                    id="err-code"
                    bind:value={selectedErrorCode}
                    class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Codes</option>
                    {#each Object.entries(data.errorCodeCounts).sort((a, b) => b[1] - a[1]) as [code, count]}
                        <option value={code}>{code} ({count})</option>
                    {/each}
                </select>
            </div>

            <!-- Surface Filter -->
            <div class="min-w-[150px]">
                <label for="err-surface" class="block text-sm text-slate-400 mb-2">Surface</label>
                <select
                    id="err-surface"
                    bind:value={selectedSurface}
                    class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Surfaces</option>
                    {#each Object.entries(data.surfaceCounts).sort((a, b) => b[1] - a[1]) as [s, count]}
                        <option value={s}>{s} ({count})</option>
                    {/each}
                </select>
            </div>

            <!-- Tech Filter -->
            <div class="min-w-[150px]">
                <label for="err-tech" class="block text-sm text-slate-400 mb-2">Tech</label>
                <select
                    id="err-tech"
                    bind:value={selectedTech}
                    class="w-full bg-slate-700/50 border border-slate-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">All Tech</option>
                    {#each Object.entries(data.techCounts).sort((a, b) => b[1] - a[1]) as [t, count]}
                        <option value={t}>{t} ({count})</option>
                    {/each}
                </select>
            </div>

            <!-- Buttons -->
            <button
                onclick={applyFilters}
                class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
            >
                Apply
            </button>
            <button
                onclick={clearFilters}
                class="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors"
            >
                Clear
            </button>
        </div>
    </div>

    <!-- Error Cards Grid -->
    {#if data.error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p class="text-red-400">{data.error}</p>
            <p class="text-slate-400 text-sm mt-2">Make sure Qdrant is running and the phase90 pipeline has completed.</p>
        </div>
    {:else if filteredErrors.length === 0}
        <div class="bg-slate-800/40 rounded-xl p-12 text-center">
            <p class="text-slate-400 text-lg">No errors found matching your filters.</p>
        </div>
    {:else}
        <div class="space-y-3">
            {#each filteredErrors as error}
                <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50 hover:border-blue-500/30 transition-colors">
                    <div class="flex items-start justify-between gap-4">
                        <div class="flex-1 min-w-0">
                            <!-- Error Code & Message -->
                            <div class="flex items-center gap-3 mb-2">
                                <span class={`font-mono font-bold ${getRiskColor(error.errorCode)}`}>
                                    {error.errorCode}
                                </span>
                                <span class={`px-2 py-0.5 text-xs rounded-full border ${getSeverityBadge(error.severity)}`}>
                                    {error.severity}
                                </span>
                                {#if error.clusterId}
                                    <a
                                        href="/command-center/codebase/clusters/{error.clusterId}"
                                        class="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded-full hover:bg-purple-500/30"
                                    >
                                        {error.clusterId}
                                    </a>
                                {/if}
                            </div>

                            <!-- File Path -->
                            <div class="font-mono text-sm text-slate-300 truncate mb-1">
                                {error.filePath}:{error.line}:{error.col}
                            </div>

                            <!-- Message -->
                            <div class="text-slate-400 text-sm line-clamp-2">
                                {error.message}
                            </div>

                            <!-- Tags -->
                            <div class="flex flex-wrap gap-2 mt-3">
                                {#each error.surface || [] as s}
                                    <span class="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-300 rounded-full">
                                        {s}
                                    </span>
                                {/each}
                                {#each error.tech || [] as t}
                                    <span class="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full">
                                        {t}
                                    </span>
                                {/each}
                            </div>
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        {#if data.hasNextPage}
            <div class="mt-6 text-center">
                <button class="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg">
                    Load More
                </button>
            </div>
        {/if}
    {/if}
</div>

<style>
    .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }
</style>