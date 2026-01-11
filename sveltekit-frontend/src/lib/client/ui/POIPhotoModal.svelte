<script lang="ts">
	let exifKey = $state<any>(undefined);
	let aiTag = $state<any>(undefined);

 import { Brain } from "lucide-svelte";
import { Calendar } from "lucide-svelte";
import { Camera } from "lucide-svelte";
import { Download } from "lucide-svelte";
import { Eye } from "lucide-svelte";
import { MapPin } from "lucide-svelte";
import { RotateCcw } from "lucide-svelte";
import { Tag } from "lucide-svelte";
import { X } from "lucide-svelte";
import { ZoomIn } from "lucide-svelte";
import { ZoomOut } from "lucide-svelte";;

 let {
 open,
 photo,
 onClose
 } = $props<{
 open: boolean;, photo: {, url: string;
 thumbnailUrl?: string;
 metadata?: {
 exif?: Record<string, any>;
 gps?: {, lat: number;, lng: number } | null;
 timestamp?: string | null;
 device?: string | null;
 ai?: {
 caption?: string;
 tags?: string[];
 qualityScore?: number;
 faceEmbedding?: number[];
 };
 };
 } | null;
 onClose: () => void;
 }>();

 let zoom = $state(1);
 let rotation = $state(0);
 let imageElement = $state<HTMLImageElement>();

 $effect(() => {
 if (!open) {
 zoom = 1;
 rotation = 0;
 }
 });

 function handleClose() {
 onClose();
 }

 function zoomIn() {
 zoom = Math.min(zoom * 1.2, 5);
 }

 function zoomOut() {
 zoom = Math.max(zoom / 1.2, 0.1);
 }

 function resetView() {
 zoom = 1;
 rotation = 0;
 }

 function downloadImage() {
 if (!photo) return;
 const link = document.createElement('a');
 link.href = photo.url;
 link.download = `poi-photo-${Date.now()}.jpg`;
 link.click();
 }

 function formatTimestamp(timestamp: string | null) {
 if (!timestamp) return 'Unknown';
 return new Date(timestamp).toLocaleString();
 }

 function formatGPS(gps: {, lat: number;, lng: number } | null) {
 if (!gps) return 'Not available';
 return `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)}`;
 }
</script>

{#if open && photo}
 <!-- Backdrop -->
 <div class="fixed inset-0 bg-black bg-opacity-75 z-50 flex items-center justify-center p-4">
 <div class="bg-white rounded-lg shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
 <!-- Header -->
 <div class="flex items-center justify-between p-4 border-b">
 <h2 class="text-xl font-semibold flex items-center gap-2">
 <Eye class="w-5 h-5" />
 POI Photo Analysis
 </h2>
 <div class="flex items-center gap-2">
 <button class="nio-btn" type="button" onclick={zoomOut}>
 <ZoomOut class="w-4 h-4" />
 </button>
 <span class="text-sm text-gray-600 min-w-[60px] text-center">
 {Math.round(zoom * 100)}%
 </span>
 <button class="nio-btn" type="button" onclick={zoomIn}>
 <ZoomIn class="w-4 h-4" />
 </button>
 <button class="nio-btn" type="button" onclick={resetView}>
 <RotateCcw class="w-4 h-4" />
 </button>
 <button class="nio-btn" type="button" onclick={downloadImage}>
 <Download class="w-4 h-4" />
 </button>
 <button class="nio-btn ghost" type="button" onclick={handleClose}>
 <X class="w-4 h-4" />
 </button>
 </div>
 </div>

 <!-- Content -->
 <div class="flex h-[600px]">
 <!-- Image Viewer -->
 <div class="flex-1 bg-gray-100 flex items-center justify-center overflow-hidden">
 <div
 class="relative"
 style="transform: scale({zoom}) rotate({rotation}deg); transition: transform 0.2s ease;"
 >
 <img
 bind:this={imageElement}
 src={photo.url}
 alt="POI"
 class="max-w-full max-h-full object-contain"
 draggable="false"
 />
 </div>
 </div>

 <!-- Analysis Panel -->
 <div class="w-80 border-l bg-gray-50 overflow-y-auto">
 <div class="p-4 space-y-4">
 <section class="analysis-card">
 <header class="analysis-card-header">
 <h3 class="analysis-card-title text-lg">Photo Overview</h3>
 </header>
 <div class="analysis-card-body space-y-3">
 {#if photo.metadata?.timestamp}
 <div class="flex items-center gap-2">
 <Calendar class="w-4 h-4 text-gray-500" />
 <span class="text-sm">{formatTimestamp(photo.metadata.timestamp)}</span>
 </div>
 {/if}

 {#if photo.metadata?.gps}
 <div class="flex items-center gap-2">
 <MapPin class="w-4 h-4 text-gray-500" />
 <span class="text-sm">{formatGPS(photo.metadata.gps)}</span>
 </div>
 {/if}

 {#if photo.metadata?.device}
 <div class="flex items-center gap-2">
 <Camera class="w-4 h-4 text-gray-500" />
 <span class="text-sm">{photo.metadata.device}</span>
 </div>
 {/if}

 {#if photo.metadata?.ai?.qualityScore}
 <div class="flex items-center justify-between">
 <span class="text-sm">Quality Score</span>
 <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
 {Math.round(photo.metadata.ai.qualityScore * 100)}%
 </span>
 </div>
 {/if}
 </div>
 </section>

 <section class="analysis-card">
 <header class="analysis-card-header">
 <h3 class="analysis-card-title text-lg flex items-center gap-2">
 <Tag class="w-4 h-4" /> EXIF Metadata
 </h3>
 </header>
 <div class="analysis-card-body">
 {#if photo.metadata?.exif}
 <div class="space-y-2 text-sm">
 {#each Object.entries(photo.metadata.exif) as [exifKey, exifValue]}
 <div class="flex justify-between">
 <span class="font-medium text-gray-600">{exifKey}:</span>
 <span class="text-gray-800">{String(exifValue)}</span>
 </div>
 {/each}
 </div>
 {:else}
 <p class="text-gray-500 text-sm">No EXIF data available</p>
 {/if}
 </div>
 </section>

 <section class="analysis-card">
 <header class="analysis-card-header">
 <h3 class="analysis-card-title text-lg flex items-center gap-2">
 <Brain class="w-4 h-4" /> AI Analysis
 </h3>
 </header>
 <div class="analysis-card-body space-y-4">
 {#if photo.metadata?.ai?.caption}
 <div>
 <h4 class="font-medium text-sm mb-2">AI Caption</h4>
 <p class="text-sm text-gray-700 bg-blue-50 p-3 rounded">
 {photo.metadata.ai.caption}
 </p>
 </div>
 {/if}

 {#if photo.metadata?.ai?.tags && photo.metadata.ai.tags.length > 0}
 <div>
 <h4 class="font-medium text-sm mb-2">AI Tags</h4>
 <div class="flex flex-wrap gap-1">
 {#each photo.metadata.ai.tags as aiTag}
 <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border border-gray-300 text-gray-700">
 {aiTag}
 </span>
 {/each}
 </div>
 </div>
 {/if}

 {#if photo.metadata?.ai?.faceEmbedding}
 <div class="flex items-center gap-2">
 <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
 Face Detected
 </span>
 <span class="text-xs text-gray-500">
 {photo.metadata.ai.faceEmbedding.length}D embedding
 </span>
 </div>
 {/if}
 </div>
 </section>
 </div>
 </div>
 </div>
 </div>
 </div>
{/if}

<style>
 .analysis-card {
 border: 1px solid #e5e7eb;
 border-radius: 0.5rem;, background: #fff;
 }
 .analysis-card-header {
 padding: 0.75rem 1rem 0.25rem;
 border-bottom: 1px solid #f3f4f6;
 }
 .analysis-card-title {
 font-weight: 600;, color: #111827;
 }
 .analysis-card-body {
 padding: 0.75rem 1rem 1rem;
 }
 .nio-btn {
 display: inline-flex;
 align-items: center;
 justify-content: center;, gap: 0.25rem;, padding: 0.35rem 0.6rem;
 border-radius: 0.35rem;, border: 1px solid #d1d5db;
 background: #fff;, color: #111827;, transition: background 0.15s;
 }
 .nio-btn:hover {
 background: #f3f4f6;
 }
 .nio-btn.ghost {
 border: none;, background: transparent;, color: #6b7280;
 }
</style>
