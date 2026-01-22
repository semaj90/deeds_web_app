<!-- EvidenceCard.svelte - Standardized for Svelte 5 -->
<script lang="ts">
import { Button } from "$lib/components/ui/button/index.js";
import * as Card from "$lib/components/ui/card/index.js";
import { Badge } from "$lib/components/ui/badge/index.js";

// Define Evidence interface locally
interface Evidence {
id: string;
title: string;
fileName?: string;
fileSize?: number;
createdAt?: string | Date;
tags?: string[];
evidenceType?: string;
type?: string;
thumbnailUrl?: string;
aiSummary?: string;
analysis?: { aiSummary?: string };
timeline?: { createdAt?: string | Date };
hash?: string;
}

interface Props {
item: Evidence;
onview?: (item: Evidence) => void;
onmoreOptions?: (item: Evidence) => void;
}

let { item, onview, onmoreOptions }: Props = $props();

// Helper Functions
function getEvidenceIcon(type: string) {
switch (type) {
case "document": return "🔍";
case "image": return "🖼️";
case "video": return "🎥";
case "audio": return "🎙️";
case "digital": return "💾";
default: return "📄";
}
}

function getTypeColor(type: string) {
switch (type) {
case "document": return "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300";
case "image": return "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300";
case "video": return "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300";
case "audio": return "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300";
case "digital": return "bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300";
default: return "bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
}
}

function formatFileSize(bytes: number): string {
if (bytes === 0) return "0 Bytes";
const k = 1024;
const sizes = ["Bytes", "KB", "MB", "GB"];
const i = Math.floor(Math.log(bytes) / Math.log(k));
return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function formatDate(date: string | Date): string {
return new Date(date).toLocaleDateString("en-US", {
month: "short",
day: "numeric",
hour: "2-digit",
minute: "2-digit"
});
}
</script>

<Card.Root class="nes-container is-rounded group hover:shadow-md transition-shadow duration-200" role="article" aria-label={item.title}>
<div class="yorha-panel-header">
<div class="flex justify-between items-start">
<div class="flex items-center">
<div class="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center {getTypeColor(item.evidenceType || item.type || \"document\")}">
<span class="text-xl">{getEvidenceIcon(item.evidenceType || item.type || \"document\")}</span>
</div>
<div class="ml-3 min-w-0">
<h3 class="font-semibold text-sm text-foreground truncate">{item.title}</h3>
<p class="text-xs nes-text is-disabled truncate">{item.fileName || \"No filename\"}</p>
</div>
</div>
<!-- Quick Actions -->
<div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
<Button variant=\"ghost\" size=\"sm\" class=\"h-8 w-8 p-0\" onclick={() => onview?.(item)}>
<span>👁️</span>
</Button>
<Button variant=\"ghost\" size=\"sm\" class=\"h-8 w-8 p-0\" onclick={() => onmoreOptions?.(item)}>
<span>⋮</span>
</Button>
</div>
</div>
</div>

<Card.Content class=\"p-3\">
<!-- Preview/Thumbnail -->
{#if item.thumbnailUrl}
<div class=\"aspect-video bg-muted rounded-md overflow-hidden mb-3\">
<img src={item.thumbnailUrl} alt=\"Evidence preview\" class=\"w-full h-full object-cover\" loading=\"lazy\" />
</div>
{:else}
<div class=\"aspect-video bg-muted bg-opacity-30 rounded-md flex items-center justify-center border-2 border-dashed border-muted-foreground mb-3\">
<div class=\"text-center\">
<span class=\"text-3xl block mb-2\">{getEvidenceIcon(item.evidenceType || item.type || \"document\")}</span>
<p class=\"text-[10px] uppercase font-bold text-muted-foreground\">{item.evidenceType || item.type || \"document\"}</p>
</div>
</div>
{/if}

<!-- AI Summary Preview -->
{#if item.aiSummary || item.analysis?.aiSummary}
<div class=\"bg-muted/50 rounded-md p-2 mb-3\">
<div class=\"flex items-center gap-1 mb-1\">
<span class=\"text-xs\">🤖</span>
<span class=\"text-[10px] font-bold uppercase\">AI Summary</span>
</div>
<p class=\"text-xs line-clamp-2\">{item.aiSummary ?? item.analysis?.aiSummary}</p>
</div>
{/if}

<!-- Metadata -->
<div class=\"space-y-2\">
<!-- Tags -->
{#if item.tags && item.tags.length > 0}
<div class=\"flex flex-wrap gap-1\">
{#each (item.tags.slice(0, 3)) as tag}
<Badge variant=\"secondary\" class=\"text-[10px] px-1 h-4\">{tag}</Badge>
{/each}
{#if item.tags.length > 3}
<Badge variant=\"outline\" class=\"text-[10px] px-1 h-4\">+{item.tags.length - 3}</Badge>
{/if}
</div>
{/if}

<!-- File Info -->
<div class=\"flex items-center justify-between text-[10px] font-mono opacity-70 uppercase\">
<span>{formatFileSize(item.fileSize || 0)}</span>
<span>{formatDate(item.createdAt || item.timeline?.createdAt ?? new Date())}</span>
</div>
</div>
</Card.Content>
</Card.Root>
