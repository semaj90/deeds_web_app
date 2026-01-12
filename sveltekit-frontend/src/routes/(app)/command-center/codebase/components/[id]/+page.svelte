<script lang="ts">
    import type { PageData } from './$types';

    let { data }: {data: PageData } = $props();

    function getRiskColor(risk: string): string {
        if (risk === 'high') return 'text-red-400 bg-red-500/20 border-red-500/30';
        if (risk === 'med') return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
        return 'text-green-400 bg-green-500/20 border-green-500/30';
    }

    function getFrequencyColor(freq: string): string {
        if (freq === 'hot') return 'text-red-400';
        if (freq === 'warm') return 'text-yellow-400';
        return 'text-blue-400';
    }

    function getRoleIcon(role: string): string {
        const icons: Record<string, string> = {
            'component': '🧩',
            'api_route': '🔌',
            'service': '⚙️',
            'schema': '📊',
            'worker': '👷',
            'adapter': '🔗',
            'route': '🛤️',
            'unknown': '📄'
        };
        return icons[role] || '📄';
    }
</script>

<svelte:head>
    <title>Component {data.fileId} | Command Center</title>
</svelte:head>

<div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
    <!-- Back Link -->
    <a href="/codebase-index" class="inline-flex items-center gap-2 text-slate-400 hover, text-white mb-6">
        <span>←</span> Back to Codebase Index
    </a>

    {#if data.error}
        <div class="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
            <p class="text-red-400">⚠️ {data.error}</p>
        </div>
    {:else if !data.profile}
        <div class="bg-slate-800/40 rounded-xl p-12 text-center">
            <p class="text-slate-400 text-lg">Component not found: {data.fileId}</p>
        </div>
    {:else}
        <!-- Component Header -->
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mb-8">
            <div class="flex items-start justify-between gap-6">
                <div class="flex-1">
                    <div class="flex items-center gap-4 mb-3">
                        <span class="text-4xl">{getRoleIcon(data.profile.role)}</span>
                        <div>
                            <h1 class="text-2xl font-bold text-white">
                                {data.profile.file_path.split('/').pop()}
                            </h1>
                            <p class="text-slate-400 font-mono text-sm">{data.profile.file_path}</p>
                        </div>
                    </div>

                    <!-- Role & Status -->
                    <div class="flex items-center gap-4 mb-4">
                        <span class="px-3 py-1 text-sm bg-blue-500/20 text-blue-300 rounded-full border border-blue-500/30">
                            {data.profile.role}
                        </span>
                        <span class={`px-3 py-1 text-sm rounded-full border ${getRiskColor(data.profile.risk)}`}>
                            {data.profile.risk} risk
                        </span>
                        <span class={`text-sm ${getFrequencyColor(data.profile.change_frequency)}`}>
                            {data.profile.change_frequency} changes
                        </span>
                    </div>

                    <!-- Summary -->
                    <div class="bg-slate-700/30 rounded-lg p-4">
                        <h3 class="text-sm font-medium text-slate-300 mb-2">📝 AI Summary</h3>
                        <p class="text-white">{data.profile.summary || 'No summary available'}</p>
                    </div>
                </div>

                <!-- Generated Info -->
                <div class="text-right text-sm text-slate-400">
                    <p>Generated: {new Date(data.profile.generated_at).toLocaleString()}</p>
                </div>
            </div>

            <!-- Tags -->
            <div class="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-700/50">
                <span class="text-slate-400 text-sm mr-2">Surface:</span>
                {#each data.profile.surface || [] as s}
                    <span class="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-300 rounded-full">{s}</span>
                {/each}
                <span class="text-slate-400 text-sm mx-2">|</span>
                <span class="text-slate-400 text-sm mr-2">Tags:</span>
                {#each data.profile.tags || [] as t}
                    <span class="px-2 py-0.5 text-xs bg-purple-500/20 text-purple-300 rounded-full">{t}</span>
                {/each}
            </div>
        </div>

        <!-- Two Column Layout -->
        <div class="grid grid-cols-1 lg, grid-cols-2 gap-8">
            <!-- Left Column -->
            <div class="space-y-8">
                <!-- Imports -->
                <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h2 class="text-lg font-bold text-white mb-4">📥 Imports ({data.profile.imports?.length ?? 0})</h2>
                    {#if data.profile.imports?.length > 0}
                        <div class="space-y-2 max-h-[300px] overflow-y-auto">
                            {#each data.profile.imports as imp}
                                <div class="font-mono text-sm text-slate-300 bg-slate-700/30 rounded-lg px-4 py-2">
                                    {imp}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-slate-400">No imports detected</p>
                    {/if}
                </div>

                <!-- Exports -->
                <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h2 class="text-lg font-bold text-white mb-4">📤 Exports ({data.profile.exports?.length ?? 0})</h2>
                    {#if data.profile.exports?.length > 0}
                        <div class="space-y-2 max-h-[300px] overflow-y-auto">
                            {#each data.profile.exports as exp}
                                <div class="font-mono text-sm text-emerald-300 bg-slate-700/30 rounded-lg px-4 py-2">
                                    {exp}
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-slate-400">No exports detected</p>
                    {/if}
                </div>
            </div>

            <!-- Right Column -->
            <div class="space-y-8">
                <!-- Comments -->
                <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h2 class="text-lg font-bold text-white mb-4">💬 Comments ({data.profile.comments?.length ?? 0})</h2>
                    {#if data.profile.comments?.length > 0}
                        <div class="space-y-2 max-h-[300px] overflow-y-auto">
                            {#each data.profile.comments.slice(0, 10) as comment}
                                <div class="text-sm text-slate-300 bg-slate-700/30 rounded-lg px-4 py-2 italic">
                                    "{comment}"
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-slate-400">No comments extracted</p>
                    {/if}
                </div>

                <!-- Related Errors -->
                <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50">
                    <h2 class="text-lg font-bold text-white mb-4">🔬 Related Errors ({data.relatedErrors?.length ?? 0})</h2>
                    {#if data.relatedErrors?.length > 0}
                        <div class="space-y-2 max-h-[300px] overflow-y-auto">
                            {#each data.relatedErrors as error}
                                <div class="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">
                                    <div class="flex justify-between items-start">
                                        <span class="font-mono text-sm text-red-300">{error.errorCode}</span>
                                        <span class="text-xs text-slate-400">:{error.line}:{error.col}</span>
                                    </div>
                                    <p class="text-sm text-slate-300 mt-1">{error.message}</p>
                                </div>
                            {/each}
                        </div>
                    {:else}
                        <p class="text-slate-400">No errors found for this file</p>
                    {/if}
                </div>
            </div>
        </div>

        <!-- LLM Output -->
        <div class="bg-slate-800/60 backdrop-blur-sm rounded-xl p-6 border border-slate-700/50 mt-8">
            <h2 class="text-lg font-bold text-white mb-4">🤖 Full LLM Analysis</h2>
            <pre class="text-sm text-slate-300 bg-slate-700/30 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">{data.profile.llm_output || 'No LLM output available'}</pre>
        </div>
    {/if}
</div>
