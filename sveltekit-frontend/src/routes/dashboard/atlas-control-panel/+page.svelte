<script>
import { onMount } from 'svelte';
import { $state, $derived, $effect } from 'svelte';

// Mock API calls for demonstration purposes
async function fetchAtlasData(query) {
    // Simulate fetching data from the LangGraph router/Atlas MCP
    await new Promise(resolve => setTimeout(resolve, 1000)); 
    if (query.includes('auth flow')) {
        return { 
            sourceRefs: [{ path: '...', source: 'atlas_run', confidence: 0.95 }],
            commands: ["npm run atlas:query"],
            validationFailures: [],
            bestAnswer: "The auth flow is managed by the service layer.",
            skeletonCode: "<!-- Svelte component skeleton here -->"
        };
    }
    return { sourceRefs: [], commands: [], validationFailures: [], bestAnswer: "No specific data found for this query." };
}
</script>

<div class="p-8 max-w-4xl mx-auto bg-white shadow-xl rounded-lg">
    <h1 class="text-3xl font-bold text-panel mb-6">OpenCode Control Panel</h1>
    
    <div class="mb-6 border-b pb-4">
        <label class="block text-sm font-medium text-gray-700">Query</label>
        <input type="text" bind:value={query} placeholder="e.g., 'What is the auth flow?'" class="mt-1 block w-full p-2 border border-gray-300 rounded-md">
        <button on:click={handleQuery} class="mt-3 bg-accent hover:bg-accent/80 text-white font-semibold py-2 px-4 rounded-lg">
            Run Atlas Audit & Query
        </button>
    </div>

    {#if loading}
        <div class="text-center py-10">
            <div class="animate-spin inline-block w-8 h-8 border-4 border-accent border-t-transparent rounded-full"></div>
            <p class="mt-2 text-gray-600">Analyzing codebase and querying Atlas...</p>
        </div>
    {:else if results.hasSources}
        <!-- Success View -->
        <div class="space-y-6">
            <!-- 1. Source References & Commands -->
            <div class="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-md">
                <h2 class="text-xl font-semibold mb-2 flex items-center"><span class="mr-2">🔍</span> Source References & Commands</h2>
                <p class="text-sm text-gray-700 mb-2">SourceRefs: {results.sourceRefs.length > 0 ? results.sourceRefs.map(r => `[${r.source}]`).join(', ') : 'None'}</p>
                <div class="flex flex-wrap gap-2">
                    {#each results.commands as cmd}
                        <span class="bg-blue-200 text-blue-800 text-xs px-3 py-1 rounded-full">{cmd}</span>
                    {/each}
                </div>
            </div>

            <!-- 2. Validation & Answer -->
            <div class="p-4 bg-green-50 border-l-4 border-green-500 rounded-md">
                <h2 class="text-xl font-semibold mb-2 flex items-center"><span class="mr-2">✅</span> Best Evidence-Backed Answer</h2>
                <p class="whitespace-pre-wrap">{results.bestAnswer}</p>
                {#if results.skeletonCode}
                    <h3 class="text-lg font-medium mt-4">Generated Skeleton Code:</h3>
                    <pre class="bg-gray-800 text-green-300 p-3 rounded-md whitespace-pre-wrap">{results.skeletonCode}</pre>
                {/if}
            </div>

            <!-- 3. Failure/Audit Log -->
            {#if results.validationFailures.length > 0}
                <div class="p-4 bg-red-50 border-l-4 border-red-500 rounded-md">
                    <h2 class="text-xl font-semibold mb-2 flex items-center"><span class="mr-2">⚠️</span> Validation Failures ({results.validationFailures.length})</h2>
                    <pre class="text-sm whitespace-pre-wrap">{results.validationFailures.join('\n')}</pre>
                </div>
            {/if}
        </div>
    {:else}
        <div class="text-center py-10 text-gray-500">
            <p>Enter a query and click the button to initiate the Parent Atlas audit and query cycle.</p>
        </div>
    {/if}
</div>
<script>
// --- SVELTE 5 STATE MANAGEMENT ---
let query = $state('');
let results = $state([]);
let loading = $state(false);

// --- COMPUTED STATE ---
const hasSources = $derived(results.sourceRefs?.length > 0);

async function handleQuery() {
    if (!query) return;

    loading = $state(true);
    results = $state([]); // Reset previous results
    
    // *** SIMULATION OF LANGGRAPH/ATLAS CALL ***
    // In a real setup, this would call the MCP endpoint:
    // const response = await callMcp('atlas.query', { query: query });
    
    // Using the simulation from the previous task:
    const simulatedData = await fetchAtlasData(query);

    // Simulate the LangGraph router's final output structure
    results = $state([
        { 
            sourceRefs: simulatedData.sourceRefs, 
            commands: simulatedData.commands, 
            validationFailures: simulatedData.validationFailures, 
            bestAnswer: simulatedData.bestAnswer,
            skeletonCode: simulatedData.skeletonCode
        }
    ]);

    loading = $state(false);
}
</script>

<style>
/* Global styles for the component */
</style>