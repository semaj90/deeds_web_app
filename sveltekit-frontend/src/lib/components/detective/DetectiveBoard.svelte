<!-- DetectiveBoard.svelte - Standardized for Svelte 5 -->
<script lang="ts">
import Fuse from "fuse.js";
import "nes.css/css/nes.min.css";
import { dndzone } from "svelte-dnd-action";
// UI Components
import { Badge } from "$lib/components/ui/badge/index.js";
import { Button } from "$lib/components/ui/button/index.js";
import * as Card from "$lib/components/ui/card/index.js";
// App stores & Services
import { aiService } from "$lib/features/ai/services/ai-service";
import AIAssistantPanel from "$lib/components/ai/AIAssistantPanel.svelte";
import EvidenceCard from "$lib/components/detective/EvidenceCard.svelte";
import UploadZone from "$lib/components/detective/UploadZone.svelte";
import { gpuService } from "$lib/services/gpu-acceleration-service";
import { rabbitmqService } from "$lib/services/rabbitmq-service";
import VectorService from "$lib/services/vector-service";
import { evidenceStore } from "$lib/stores/unified/evidence-store";

const vectorService = new VectorService();
const EvidenceCardAny = EvidenceCard as any;

// Svelte 5 Runes
interface Props {
  caseId?: string;
  evidence?: any[];
}

let {
  caseId = "case-001",
  evidence = []
}: Props = $props();

let evidenceStoreState = $state<any>({ evidence: [], isLoading: false, error: null, isConnected: false });
let allEvidence = $derived(() => evidenceStoreState.evidence || evidence || []);
let viewMode = $state<'columns' | 'canvas'>('columns');
let showAIAssistant = $state<boolean>(true);
let selectedEvidenceIds = $state<string[]>([]);
let aiHighlightedEvidence = $state<string[]>([]);
let canvasContainer = $state<HTMLDivElement | undefined>();

let columns = $state([
  { id: "new", title: "New Evidence", items: [] },
  { id: "processing", title: "Processing", items: [] },
  { id: "verified", title: "Verified", items: [] }
]);

let canvasEvidence = $state<any[]>([]);
let activeUsers = $state<any[]>([]);
let systemStatus = $state({ rabbitMQ: { connected: false, health: "unknown"
  },
  postgreSQL: {
    connected: false, vectorCount: 0
  },
  gpu: {
    available: false, utilization: 0, model: "RTX 3060 Ti"
  },
  processingStats: {
   totalFiles: 0, processed: 0, queued: 0
  }
});

let findModal = $state({ show: false, query: "", results: [] as any[], loading: false, error: "" });
let miniModal = $state({ show: false, x: 0, y: 0, type: "" });
let openContextMenuId = $state<string | null>(null);

// Effects
$effect(() => {
  const unsubscribe = evidenceStore.subscribe(v => { evidenceStoreState = v });
  return () => unsubscribe();
});

$effect(() => {
  void (async () => {
    await initializeEnhancedSystems();
  })();
});

async function initializeEnhancedSystems() {
  try {
    await rabbitmqService.initialize();
    systemStatus.rabbitMQ.connected = true;
    systemStatus.rabbitMQ.health = "connected";
  } catch (e) {
    console.warn("RabbitMQ failed", e);
  }

  try {
    const gpuStatus = await gpuService.getStatus();
    systemStatus.gpu.available = !!gpuStatus?.webgpuSupported;
    systemStatus.gpu.utilization = gpuStatus?.accelerationActive ? 75 : 0
  } catch (e) {
    console.warn("GPU failed", e);
  }
}

// Handlers
function handleFileUpload(result: any, columnId: string) {
  const newEvidence = {
    id: result?.id ?? `evidence-${Date.now()}-${Math.random()}`,
    title: result?.originalName ?? result?.fileName ?? "Untitled",
    fileName: result?.fileName,
    fileSize: result?.fileSize,
    evidenceType: result?.metadata?.evidenceType ?? "document",
    createdAt: new Date(result?.metadata?.uploadedAt ?? Date.now()),
    tags: [],
    x: 100 + Math.random() * 200,
    y: 100 + Math.random() * 200,
    url: result?.url
  };
  columns = columns.map(col => col.id === columnId ? { ...col, items: [...col.items, newEvidence] } : col);
}

function handleDndFinalize(e: CustomEvent<{ items: any[] }>, columnId: string) {
  const { items } = e.detail;
  columns = columns.map(col => col.id === columnId ? { ...col, items } : col);
}

function handleEvidenceSelect(id: string) {
  selectedEvidenceIds = selectedEvidenceIds.includes(id)
    ? selectedEvidenceIds.filter(i => i !== id)
    : [...selectedEvidenceIds, id];
}

function handleViewEvidence(item: any) {
  window.open(`/evidence/${item.id}`, "_blank");
}

async function analyzeSelectedEvidence() {
  if (selectedEvidenceIds.length === 0) return;
  try {
    if (selectedEvidenceIds.length === 1) {
      // Assuming 'document' as default type if not available
      await aiService.analyzeEvidence(selectedEvidenceIds[0], "document");
    } else {
      // await findEvidenceConnections(caseId, selectedEvidenceIds);
      console.warn("findEvidenceConnections not implemented yet");
    }
  } catch (e) {
    console.error("Analyze failed", e);
  }
}

function openFindModal(item: any) {
findModal.show = true;
findModal.query = item?.title ?? "";
findModal.results = [];
}

function closeFindModal() { findModal.show = false }

async function runFindSearch() {
findModal.loading = true;
findModal.error = "";
try {
const fuse = new Fuse(allEvidence(), { keys: ["title", "tags"] });
findModal.results = fuse.search(findModal.query).map(r => r.item);

const resp = await fetch("/api/vector-search", {
method: "POST",
headers: { "Content-Type": "application/json" },
	body: JSON.stringify({
query: findModal.query })
});
if (resp.ok) {
const vectorResults = await resp.json();
findModal.results = [...findModal.results, ...(vectorResults || [])];
}
} catch (e) { findModal.error = "Search failed"; }
finally { findModal.loading = false }
}

function handleCanvasDrop(e: DragEvent) {
e.preventDefault();
const data = e.dataTransfer?.getData("text/plain");
if (!data) return;
try {
const item = JSON.parse(data);
const rect = canvasContainer?.getBoundingClientRect();
if (rect) {
item.x = e.clientX - rect.left;
item.y = e.clientY - rect.top;
canvasEvidence = [...canvasEvidence, item];
}
} catch (err) { console.error("Drop failed", err); }
}
</script>

<svelte:window onkeydown={(e) => e.key === "Escape" && closeFindModal()} />

<div class="w-full h-full min-h-screen bg-background p-4 font-mono">
<Card.Root class="mb-6 nes-container is-rounded">
<div class="flex justify-between items-center p-4">
<div class="flex items-center gap-4">
<div class="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center text-3xl">🧩</div>
<div>
<h1 class="text-2xl font-bold uppercase">Detective Board</h1>
<p class="text-xs opacity-70">Case Evidence Management System</p>
</div>
</div>

<div class="flex items-center gap-4">
<div class="flex border-2 border-primary rounded overflow-hidden">
<button class="px-4 py-1 {viewMode === 'columns' ? 'bg-primary text-primary-foreground' : ""}" onclick={() => viewMode = 'columns'}>COLUMNS</button>
<button class="px-4 py-1 {viewMode === 'canvas' ? 'bg-primary text-primary-foreground' : ""}" onclick={() => viewMode = 'canvas'}>CANVAS</button>
</div>
<Button size="sm" class="nes-btn is-primary" onclick={() => showAIAssistant = !showAIAssistant}>AI ASSISTANT</Button>
<Button size="sm" class="nes-btn" onclick={analyzeSelectedEvidence}>ANALYZE ({selectedEvidenceIds.length})</Button>
</div>
</div>
</Card.Root>

<main class="flex gap-6 h-[calc(100vh-180px)]">
<div class="flex-1 overflow-auto custom-scrollbar">
{#if viewMode === 'columns'}
<div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-full">
{#each columns as column (column.id)}
<div class="nes-container is-rounded with-title flex flex-col h-full bg-background/50">
<p class="title bg-background">{column.title} ({column.items.length})</p>

<div class="flex-1 overflow-y-auto p-2 space-y-4 custom-scrollbar"
use:dndzone={{
	items: column.items, flipDurationMs: 200 }}
onfinalize={(e: any) => handleDndFinalize(e, column.id)}
>
{#if column.id === "new"}
<UploadZone onUploadComplete={(result: any) => handleFileUpload(result, column.id)} caseId={caseId} />
{/if}

{#each column.items as item (item.id)}
<div class="relative group">
<div class="cursor-grab active:cursor-grabbing transition-all"
class:ring-2={selectedEvidenceIds.includes(item.id)}
class:ring-primary={selectedEvidenceIds.includes(item.id)}
onclick={() => handleEvidenceSelect(item.id)}
                                            role="button"
                                            tabindex="0"
                                            onkeydown={(e) => e.key === "Enter" && handleEvidenceSelect(item.id)}
>
<EvidenceCardAny {item} onview={() => handleViewEvidence(item)} />
</div>
<button class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 nes-btn is-small p-1"
onclick={(e) => { e.stopPropagation(); openContextMenuId = openContextMenuId === item.id ? null : item.id }}
>⋮</button>

{#if openContextMenuId === item.id}
<div class="absolute right-0 top-10 z-50 bg-background border-2 border-primary p-2 shadow-xl text-xs flex flex-col gap-2 min-w-[150px]">
<button class="text-left hover:text-primary" onclick={() => { handleViewEvidence(item); openContextMenuId = null }}>VIEW DETAILS</button>
<button class="text-left hover:text-primary" onclick={() => { openFindModal(item); openContextMenuId = null }}>FIND RELATED</button>
<button class="text-left text-error" onclick={() => { openContextMenuId = null }}>DELETE</button>
</div>
{/if}
</div>
{/each}
</div>
</div>
{/each}
</div>
{:else}
	<div class="nes-container is-rounded h-full p-0 relative overflow-hidden bg-slate-900/10"
		role="region"
		aria-label="Evidence Board Canvas"
		bind:this={canvasContainer}
		ondrop={handleCanvasDrop}
		ondragover={(e) => e.preventDefault()}
	>
		<div class="absolute inset-0 bg-grid-pattern opacity-10"></div>

{#each canvasEvidence as item (item.id)}
<div class="absolute cursor-move" style="left: {item.x}px; top: {item.y}px; width: 250px;"
draggable="true"
onclick={() => handleEvidenceSelect(item.id)}
                            role="button"
                            tabindex="0"
                            onkeydown={(e) => e.key === "Enter" && handleEvidenceSelect(item.id)}
>
<EvidenceCardAny {item} onview={() => handleViewEvidence(item)} />
</div>
{/each}

{#if canvasEvidence.length === 0}
<div class="absolute inset-0 flex flex-col items-center justify-center opacity-30">
<p>CANVAS IS EMPTY</p>
<p class="text-xs">DRAG ITEMS HERE</p>
</div>
{/if}
</div>
{/if}
</div>

{#if showAIAssistant}
<aside class="w-96 h-full">
<AIAssistantPanel {caseId} {selectedEvidenceIds} />
</aside>
{/if}
</main>
</div>

{#if findModal.show}
<div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
<div class="nes-container is-rounded bg-background max-w-2xl w-full">
<header class="mb-4">
<h2 class="text-lg font-bold">FIND RELATED EVIDENCE</h2>
<p class="text-xs opacity-70">SEARCHING FOR: {findModal.query}</p>
</header>

<div class="flex gap-2 mb-4">
<input class="nes-input flex-1" bind:value={findModal.query} placeholder="Enter query..." />
<button class="nes-btn is-primary" onclick={runFindSearch} disabled={findModal.loading}>SEARCH</button>
</div>

<div class="max-h-64 overflow-y-auto custom-scrollbar">
{#each findModal.results as result}
<div class="p-2 border-b border-primary/20 hover:bg-primary/10 cursor-pointer flex justify-between items-center"
onclick={() => { handleViewEvidence(result); closeFindModal(); }}
                        role="button"
                        tabindex="0"
                        onkeydown={(e) => e.key === "Enter" && handleViewEvidence(result)}
>
<span class="truncate">{result.title}</span>
<Badge>{result.evidenceType}</Badge>
</div>
{/each}
</div>

<div class="flex justify-end mt-4">
<button class="nes-btn" onclick={closeFindModal}>CLOSE</button>
</div>
</div>
</div>
{/if}

<style>
.bg-grid-pattern {
background-image:
linear-gradient(rgba(0,0,0,0.1) 1px, transparent 1px),
linear-gradient(90deg, rgba(0,0,0,0.1) 1px, transparent 1px);
background-size: 40px 40px;}
.custom-scrollbar::-webkit-scrollbar { width: 4px;}
.custom-scrollbar::-webkit-scrollbar-thumb { background: currentColor;
		opacity: 0.2;}
</style>
