<script lang="ts">
    import type { PageData } from './$types';

    let { data }: {data: PageData } = $props();

    function getRiskColor(errorCode: string): string {
        if (errorCode.startsWith('SYNTAX')) return 'text-red-400';
        if (errorCode.startsWith('TS2304')) return 'text-orange-400';
        if (errorCode.startsWith('TS2307')) return 'text-yellow-400';
        return 'text-blue-400';
    }

    function getCountBadgeColor(count: number): string {
        if (count > 5000) return 'bg-red-500/20 text-red-300 border-red-500/30';
        if (count > 1000) return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
        if (count > 100) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
        return 'bg-green-500/20 text-green-300 border-green-500/30';
    }
</script>

<svelte:head>
    <title>Cluster {data.clusterId} | Command Center</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
    <!-- Back Link -->
    <a href="/command-center/codebase/errors" class="inline-flex items-center gap-2 text-slate-400 hover:text-white mb-6">
        <span>←</span> Back to Error Cards
    </a>

    {#if data.error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p class="text-red-400">⚠️ {data.error}</p>
        </div>
    {:else if !data.cluster}
        <div class="bg-slate-800/40 rounded-xl p-12 text-center">
            <p class="text-slate-400 text-lg">Cluster not found: {data.clusterId}</p>
        </div>
    {:else}
        <!-- Cluster Header -->
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-8">
            <div class="flex items-start justify-between gap-6">
                <div>
                    <div class="flex items-center gap-4 mb-3">
                        <h1 class="text-2xl font-bold text-white">{data.cluster.name}</h1>
                        <span class={`px-3 py-1 text-sm rounded-full border ${getCountBadgeColor(data.cluster.count)}`}>
                            {data.cluster.count.toLocaleString()} errors
                        </span>
                    </div>

                    <div class="flex items-center gap-3 mb-4">
                        <span class={`font-mono text-xl font-bold ${getRiskColor(data.cluster.errorCode)}`}>
                            {data.cluster.errorCode}
                        </span>
                        <span class="text-slate-500">|</span>
                        <span class="text-slate-400 text-sm">Run: {data.cluster.runId}</span>
                    </div>

                    <!-- Summary -->
                    <div class="bg-slate-700/30 rounded-lg p-4 mb-4">
                        <h3 class="text-sm font-medium text-slate-300 mb-2">📝 Summary</h3>
                        <p class="text-white">{data.cluster.summary || 'No summary available'}</p>
                    </div>

                    <!-- Fix Suggestion -->
                    <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                        <h3 class="text-sm font-medium text-emerald-300 mb-2">🔧 Fix Suggestion</h3>
                        <p class="text-emerald-100">{data.cluster.fix_suggestion || 'No fix suggestion available'}</p>
                    </div>
                </div>

                <!-- Actions -->
                <div class="flex flex-col gap-3">
                    <button class="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors">
                        Apply Safe Patch
                    </button>
                    <button class="px-6 py-2 bg-slate-600 hover:bg-slate-500 text-white rounded-lg font-medium transition-colors">
                        Export Errors
                    </button>
                </div>
            </div>

            <!-- Tags -->
            <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-700/50">
                <span class="text-slate-400 text-sm mr-2">Surfaces:</span>
                {#each data.cluster.surface || [] as s}
                    <span class="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-300 rounded-full">{s}</span>
                {/each}
                <span class="text-slate-400 text-sm mx-2">|</span>
                <span class="text-slate-400 text-sm mr-2">Tech:</span>
                {#each data.cluster.tech || [] as t}
                    <span class="px-2 py-0.5 text-xs bg-blue-500/20 text-blue-300 rounded-full">{t}</span>
                {/each}
            </div>
        </div>

        <!-- Top Files -->
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-8">
            <h2 class="text-lg font-bold text-white mb-4">📂 Top Affected Files</h2>
            <div class="space-y-2">
                {#each data.cluster.top_files || [] as file}
                    <div class="font-mono text-sm text-slate-300 bg-slate-700/30 rounded-lg px-4 py-2">
                        {file}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Top Messages -->
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-8">
            <h2 class="text-lg font-bold text-white mb-4">💬 Common Error Messages</h2>
            <div class="space-y-2">
                {#each data.cluster.top_messages || [] as msg}
                    <div class="text-sm text-slate-300 bg-slate-700/30 rounded-lg px-4 py-2">
                        {msg}
                    </div>
                {/each}
            </div>
        </div>

        <!-- Member Errors -->
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
            <h2 class="text-lg font-bold text-white mb-4">🔬 Member Errors ({data.members.length})</h2>

            {#if data.members.length === 0}
                <p class="text-slate-400">No member errors loaded yet. Run the pipeline to populate.</p>
            {:else}
                <div class="space-y-3 max-h-[600px] overflow-y-auto">
                    {#each data.members as member}
                        <div class="bg-slate-700/30 rounded-lg p-4 hover:bg-slate-700/50 transition-colors">
                            <div class="flex items-start justify-between gap-4">
                                <div class="flex-1 min-w-0">
                                    <div class="font-mono text-sm text-slate-300 truncate mb-1">
                                        📄 {member.filePath}:{member.line}:{member.col}
                                    </div>
                                    <div class="text-slate-400 text-sm">
                                        {member.message}
                                    </div>
                                </div>
                                <span class={`font-mono text-sm font-bold ${getRiskColor(String(member.errorCode))}`}>
                                    {member.errorCode}
                                </span>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
</div>
