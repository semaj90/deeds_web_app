<script lang="ts">
    import HybridBoard from '$lib/components/canvas/HybridBoard.svelte';
    import type { PageData } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

    // Props
    let { data }: {
	data: PageData } = $props();
    let caseId = $derived(data.caseId);
    let initialState = $derived(data.initialState);

    // State
    let board: HybridBoard = $state() as HybridBoard; // Component instance
    let isDirty = $state(false);
    let isSaving = $state(false);

    async function save() {
        if (!board) return;
        isSaving = true;

        try {
            const snapshot = board.serialize();
            const res = await fetch(`/api/cases/${caseId}/canvas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(snapshot)
            });
            if (!res.ok) {
                console.error('Failed to save', await res.json());
                alert('Failed to save board state');
            } else {
                isDirty = false;
            }
        } catch (e) {
            console.error('Save error', e);
            alert('Error saving board state');
        } finally {
            isSaving = false;
        }
    }
</script>

<div class="flex flex-col h-[calc(100vh-64px)] overflow-hidden bg-gray-50 dark:bg-gray-900">
    <div class="flex-none h-12 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 justify-between bg-white dark:bg-gray-950 z-10">
        <h2 class="text-sm font-medium text-gray-700 dark:text-gray-200">Evidence Board</h2>
        <div class="flex items-center gap-2">
            {#if isDirty}
                <span class="text-xs text-amber-500 font-medium animate-pulse">Unsaved changes</span>
            {/if}
            <button
                class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 shadow-sm"
                onclick={save}
                disabled={isSaving}
            >
                {isSaving ? 'Saving...' : 'Save Board'}
            </button>
        </div>
    </div>

    <div class="flex-1 relative overflow-hidden">
        {#key caseId}
            <HybridBoard
                bind:this={board}
                initialSnapshot={initialState as any}
                onDirtyChange={(d) => isDirty = d}
                {caseId}
            />
        {/key}
    </div>
</div>
