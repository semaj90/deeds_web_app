<!-- EvidenceCard.svelte - Standardized for Svelte 5 -->
<script lang="ts">
import { Badge } from "$lib/components/ui/badge";
import * as Card from "$lib/components/ui/card/index.js";
import { formatDistanceToNow } from "date-fns";
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

let { item, onview } = $props<{
    item: {
	id: string;
        title: string;
	evidenceType: string;
        fileSize?: number;
	createdAt: Date;
        tags: string[];
        url?: string };
    onview?: () => void }>();

const typeIcon = $derived(() => {
    switch (item.evidenceType) {
        case 'image': return '🖼️';
        case 'video': return '🎥';
        case 'audio': return '🎵';
        case 'document': return '📝';
        case 'email': return '📧';
        default: return '📁';
    }
});

function formatSize(bytes?: number) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
</script>

<Card.Root class="nes-container is-rounded p-2 bg-background hover:border-primary transition-colors cursor-pointer group">
    <div class="flex items-start gap-3">
        <div class="text-2xl mt-1">{typeIcon()}</div>
        <div class="flex-1 min-w-0">
            <h3 class="text-sm font-bold uppercase truncate mb-1">{item.title}</h3>
            <div class="flex flex-wrap gap-1 mb-2">
                <Badge class="text-[10px] py-0 px-1 uppercase">{item.evidenceType}</Badge>
                {#if item.tags}
                    {#each item.tags.slice(0, 2) as tag}
                        <Badge variant="outline" class="text-[10px] py-0 px-1 uppercase">{tag}</Badge>
                    {/each}
                {/if}
            </div>
            <div class="flex justify-between items-center text-[10px] opacity-60">
                <span>{formatSize(item.fileSize)}</span>
                {#if item.createdAt}
                    <span>{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</span>
                {/if}
            </div>
        </div>
    </div>

    <div class="mt-2 pt-2 border-t border-primary/10 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
        <button class="nes-btn is-primary is-small text-[10px]" onclick={(e) => { e.stopPropagation(); onview?.(); }}>
            VIEW
        </button>
    </div>
</Card.Root>

<style>
    :global(.nes-container.is-rounded) {
        padding: 0.5rem !important }
</style>
