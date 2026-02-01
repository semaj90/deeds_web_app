<script lang="ts">
	import Button from '$lib/components/ui/button/Button.svelte';
	import { Content as DialogContent, Description as DialogDescription, Overlay as DialogOverlay, Portal as DialogPortal, Root as DialogRoot, Title as DialogTitle } from '$lib/components/ui/dialog';
	// Migrated to $effect
	import type { PageData } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

	// ═══════════════════════════════════════════════════════════════════════
	// Phase 89: RAG+KAG Powered Error Analysis UI
	// Features: Agentic recommendations, next steps, timestamp tracking
	// ═══════════════════════════════════════════════════════════════════════

	let { data }: { data: PageData } = $props();

	let analysisData = $state<any>(null);
	let selectedCluster = $state<any>(null);
	let dialogOpen = $state(false);
	let loading = $state(false);
	let agenticLogs = $state<string[]>([]);
	let showRecommendations = $state(true);

	// Load enhanced analysis from API
	async function loadAnalysis() {
		loading = true;
		try {
			const response = await fetch('/api/phase89/analyze');
			const result = await response.json();

			if (result.success) {
				analysisData = result;
			} else {
				console.error('Analysis failed:', result.error);
			}
		} catch (err) {
			console.error('Failed to load analysis:', err);
		} finally {
			loading = false;
		}
	}

	// Execute agentic fix with function tool calling
	async function executeAgenticFix(clusterId: number) {
		agenticLogs = [`🚀 Starting agentic fix for cluster #${clusterId}...`];

		try {
			const response = await fetch('/api/phase89/agentic-fix', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ cluster_id: clusterId, enable_tools: true })
			});

			if (!response.body) throw new Error('No response body');

			const reader = response.body.getReader();
			const decoder = new TextDecoder();

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				const chunk = decoder.decode(value);
				const lines = chunk.split('\n');

				for (const line of lines) {
					if (line.startsWith('data: ')) {
						const data = JSON.parse(line.slice(6));
						if (data.log) {
							agenticLogs = [...agenticLogs, data.log];
						}
					}
				}
			}

			agenticLogs = [...agenticLogs, '✅ Agentic fix completed!'];

			// Reload analysis
			await loadAnalysis();

		} catch (err) {
			agenticLogs = [...agenticLogs, `❌ Error: ${err}`];
		}
	}

	// Execute next step command
	async function executeNextStep(command: string) {
		agenticLogs = [`⚡ Executing: ${command}`];

		try {
			const response = await fetch('/api/phase89/execute-command', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ command })
			});

			const result = await response.json();

			if (result.success) {
				agenticLogs = [...agenticLogs, `✅ ${result.output}`];
			} else {
				agenticLogs = [...agenticLogs, `❌ ${result.error}`];
			}
        } catch (e) {
            console.error(e);
        }
    }
</script>

<div class="error-analysis">
    <h1>Error Analysis & Remediation</h1>

    <div class="controls">
        <button onclick={loadAnalysis} disabled={loading}>
            {loading ? 'Analyzing...' : 'Refresh Analysis'}
        </button>
    </div>

    {#if loading}
        <p>Loading analysis...</p>
    {:else if analysisData}
        <div class="analysis-content">
            <p>Analysis loaded: {analysisData.timestamp || 'Just now'}</p>

            <div class="clusters-list">
                {#if analysisData.clusters}
                    {#each analysisData.clusters as cluster}
                        <div class="cluster-item">
                            <h3>{cluster.pattern}</h3>
                            <button onclick={() => executeAgenticFix(cluster.cluster_id)}>
                                Fix Cluster #{cluster.cluster_id}
                            </button>
                        </div>
                    {/each}
                {:else}
                    <p>No error clusters found or analysis data pending.</p>
                {/if}
            </div>
        </div>
    {/if}

    {#if agenticLogs.length > 0}
        <div class="logs-panel">
            <h3>Agent Operations Log</h3>
            <pre>{agenticLogs.join('\n')}</pre>
        </div>
    {/if}
</div>

<style>
    .error-analysis {
        padding: 2rem;
        color: #e0e0e0;
        min-height: 100vh;
        background: #1a1a2e;
    }
    .controls {
        margin-bottom: 2rem;
    }
    button {
        background: #00d4ff;
        color: #000;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
    }
    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .cluster-item {
        background: rgba(255, 255, 255, 0.05);
        padding: 1rem;
        margin-bottom: 1rem;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .logs-panel {
        margin-top: 2rem;
        padding: 1rem;
        background: #000;
        border-radius: 8px;
        font-family: monospace;
        max-height: 300px;
        overflow-y: auto;
    }
</style>
