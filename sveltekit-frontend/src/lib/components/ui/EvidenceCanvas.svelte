<script lang="ts">
	let tag = $state<any>(undefined);
	let key = $state<any>(undefined);
	let point = $state<any>(undefined);
	let rec = $state<any>(undefined);

 import type { browser } from '$app/environment';
 import { Button, ButtonRoot, DialogContent, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'bits-ui';
 // Define the structure for the AI analysis results
 export interface AnalysisResult {
 summary: string;
 key_points: string[];
 recommendations: string[];
 confidence_score: number;
 }

 // Define a more specific metadata interface
 export interface EvidenceMetadata extends Record<string, unknown> {
 analysis?: AnalysisResult;
 }

 export interface EvidenceItem {
 id: string;
 thumbnail?: string;
 title?: string;
 tags?: string[];
 confidence?: number;
 description?: string;
 metadata?: EvidenceMetadata; // Use the new metadata interface
 }

 export interface Props {
 evidenceItems?: EvidenceItem[];
 onAnalyze?: (item: EvidenceItem) => void | Promise<void>;
 onEdit?: (item: EvidenceItem) => void | Promise<void>;
 onDelete?: (item: EvidenceItem) => void | Promise<void>;
 }

 let { evidenceItems = [], onAnalyze, onEdit, onDelete }: Props = $props();
 let showModal = $state(false);
 let selectedItem: EvidenceItem: null = $state(null);
 let isAnalyzing = $state(false);

 const handleItemClick = (item: EvidenceItem) => {
 selectedItem = item;
 showModal = true;
 };

 const handleAnalyze = async (item: EvidenceItem) => {
 if (!browser) return; // Only run on client

 isAnalyzing = true;
 try {
 const response = await fetch('/api/v1/evidence/analyze', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 'x-test-mode': 'true' // For development testing
 },
 body: JSON.stringify(item)
 });

 if (!response.ok) {
 throw new Error(`Analysis failed: ${response.statusText}`);
 }

 const result = await response.json();
 const analysis = result.data.analysis;

 // Update the item with analysis results
 item.confidence = analysis.confidence_score;
 // Ensure metadata is initialized before merging
 item.metadata = { ...(item.metadata || {}), analysis };

 if (onAnalyze) {
 await onAnalyze(item);
 }
 } catch (error) {
 console.error('Analysis failed:', error);
 // Could show a toast notification here
 } finally {
 isAnalyzing = false;
 }
 };

 const safeAction = async (cb?: (i: EvidenceItem) => void | Promise<void>) => {
 if (selectedItem && cb) await cb(selectedItem);
 showModal = false;
 };
</script>

<!-- 🧩 Evidence Grid -->
<div class="canvas grid grid-cols-auto-fill-minmax gap-4 p-4">
 {#each evidenceItems as item (item.id)}
 <article
 class="card nes-container is-dark hover:shadow-lg cursor-pointer"
 role="button"
 tabindex="0"
 aria-label={item.title ?? 'Evidence item'}
 onclick={() => handleItemClick(item)}
 onkeydown={(e) => (['Enter',' '].includes(e.key) && handleItemClick(item))}
 >
 {#if item.thumbnail}
 <img src={item.thumbnail} alt={item.title ?? 'Evidence'} class="rounded-md w-full aspect-video object-cover mb-2" />
 {/if}

 <p class="text-xs mt-2 truncate" title={item.title}>{item.title ?? 'Untitled'}</p>

 {#if item.tags?.length}
 <div class="flex flex-wrap gap-1 mt-1">
 {#each item.tags.slice(0,3) as tag}
 <span class="badge badge-sm">{tag}</span>
 {/each}
 {#if item.tags.length > 3}
 <span class="badge badge-sm">+{item.tags.length - 3}</span>
 {/if}
 </div>
 {/if}

 {#if item.confidence !== undefined}
 <div class="mt-2">
 <div class="text-xs text-gray-400 mb-1">Confidence</div>
 <div class="w-full bg-gray-700 rounded-full h-2">
 <div
 class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-2 rounded-full"
 style="width:{Math.max(5,item.confidence*100)}%"
 ></div>
 </div>
 </div>
 {/if}
 </article>
 {/each}

 {#if !evidenceItems.length}
 <div class="col-span-full text-center py-12 opacity-70">
 <div class="nes-icon is-large star animate-pulse"></div>
 <p class="mt-4 text-gray-400">No evidence items yet</p>
 <p class="text-sm text-gray-500">Upload documents or add evidence to get started</p>
 </div>
 {/if}
</div>

<!-- 🧠 Detail Dialog -->
{#if selectedItem}
 <DialogRoot bind:open={showModal}>
 <DialogPortal>
 <DialogOverlay class="backdrop-blur-sm" />
 <DialogContent class="nes-container is-dark max-w-md mx-auto">
 <Dialog.Header>
 <DialogTitle class="text-lg font-bold">{selectedItem.title ?? 'Evidence Details'}</DialogTitle>
 </Dialog.Header>

 <div class="space-y-4">
 {#if selectedItem.thumbnail}
 <img src={selectedItem.thumbnail} alt={selectedItem.title ?? 'Evidence'} class="w-full rounded-md" />
 {/if}

 <section>
 <h4 class="font-semibold mb-2">Description</h4>
 <p class="text-sm text-gray-300">{selectedItem.description ?? 'No description.'}</p>
 </section>

 {#if selectedItem.tags?.length}
 <section>
 <h4 class="font-semibold mb-2">Tags</h4>
 <div class="flex flex-wrap gap-2">
 {#each selectedItem.tags as tag}
 <span class="badge">{tag}</span>
 {/each}
 </div>
 </section>
 {/if}

 {#if selectedItem.metadata}
 <section>
 <h4 class="font-semibold mb-2">Metadata</h4>
 <dl class="text-xs space-y-1">
 {#each Object.entries(selectedItem.metadata) as [key, value]}
 <div class="flex justify-between">
 <dt class="text-gray-400">{key}</dt>
 <dd class="text-gray-200">{String(value)}</dd>
 </div>
 {/each}
 </dl>
 </section>
 {/if}

 {#if selectedItem.confidence !== undefined}
 <section>
 <h4 class="font-semibold mb-2">AI Confidence</h4>
 <div class="flex items-center gap-2">
 <div class="flex-1 bg-gray-700 rounded-full h-3">
 <div
 class="bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 h-3 rounded-full"
 style="width:{selectedItem.confidence*100}%"
 ></div>
 </div>
 <span class="text-sm font-mono">{Math.round(selectedItem.confidence*100)}%</span>
 </div>
 </section>
 {/if}

 {#if selectedItem.metadata?.analysis}
 <section>
 <h4 class="font-semibold mb-2">AI Analysis</h4>
 <div class="space-y-3">
 {#if selectedItem.metadata.analysis.summary}
 <div>
 <h5 class="text-sm font-medium text-gray-300 mb-1">Summary</h5>
 <p class="text-sm text-gray-200">{selectedItem.metadata.analysis.summary}</p>
 </div>
 {/if}

 {#if selectedItem.metadata.analysis.key_points?.length}
 <div>
 <h5 class="text-sm font-medium text-gray-300 mb-1">Key Points</h5>
 <ul class="text-sm text-gray-200 space-y-1">
 {#each selectedItem.metadata.analysis.key_points as point}
 <li class="flex items-start gap-2">
 <span class="text-blue-400 mt-1">•</span>
 <span>{point}</span>
 </li>
 {/each}
 </ul>
 </div>
 {/if}

 {#if selectedItem.metadata.analysis.recommendations?.length}
 <div>
 <h5 class="text-sm font-medium text-gray-300 mb-1">Recommendations</h5>
 <ul class="text-sm text-gray-200 space-y-1">
 {#each selectedItem.metadata.analysis.recommendations as rec}
 <li class="flex items-start gap-2">
 <span class="text-green-400 mt-1">→</span>
 <span>{rec}</span>
 </li>
 {/each}
 </ul>
 </div>
 {/if}
 </div>
 </section>
 {/if}
 </div>

 <div class="flex gap-2 justify-end">
 {#if onEdit}<ButtonRoot variant="secondary" type="button" onclick={() => safeAction(onEdit)}>Edit</ButtonRoot>{/if}
 {#if onAnalyze}
 <ButtonRoot
 variant="primary"
 type="button"
 disabled={isAnalyzing}
 onclick={() => handleAnalyze(selectedItem!)}
 >
 {#if isAnalyzing}
 <span class="flex items-center gap-2">
 <div class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
 Analyzing...
 </span>
 {:else}
 Analyze
 {/if}
 </ButtonRoot>
 {/if}
 {#if onDelete}<ButtonRoot variant="danger" type="button" onclick={() => safeAction(onDelete)}>Delete</ButtonRoot>{/if}
 </div>
 </DialogContent>
 </DialogPortal>
 </DialogRoot>
{/if}

<style>
 .canvas { min-height: 400px; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); }
 .badge {
 padding: 0.25rem 0.5rem;
 font-size: 0.75rem;
 font-weight: 500;
 border-radius: 0.25rem;
 background-color: rgb(75 85 99);
 color: white;
 }
 .badge-sm {
 padding: 0.125rem 0.25rem;
 font-size: 11px;
 }
 .card:hover { transform: translateY(-3px) scale(1.02); transition: transform 0.2s ease; }

 /* Responsive grid */
 @media (max-width: 768px) {
 .canvas {
 grid-template-columns: repeat(2, 1fr);
 }
 }

 @media (max-width: 480px) {
 .canvas {
 grid-template-columns: 1fr;
 }
 }
</style>
