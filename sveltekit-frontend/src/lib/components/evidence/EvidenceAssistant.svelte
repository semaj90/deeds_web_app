import { createEventDispatcher } from 'svelte';
<script lang="ts">
 import type { Badge } from '$lib/components/ui/badge';
 import type { Button } from '$lib/components/ui/button';
 import type { Dialog, DialogContent,
 DialogDescription, DialogHeader, DialogTitle } from '$lib/components/ui/dialog';
 import type { Textarea } from '$lib/components/ui/textarea';
 import type { EvidenceNode } from '$lib/server/db/schema-postgres';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
 // Migrated from createEventDispatcher to callback props;

 let { node, open = $bindable(false) } = $props<{
 node: EvidenceNode;
 open?: boolean;
 }>();

 let analysis = '';
 let isAnalyzing = false;
 let suggestions: string[] = [];

 const dispatch = createEventDispatcher<{ update: { nodeId: string; updates: Partial<EvidenceNode> };
 close: void;
 }>();

 async function analyzeEvidence() {
 isAnalyzing = true;
 try {
 const response = await fetch('/api/evidence/ai/analyze', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ node }),
 });

 const result = await response.json();
 analysis = result.analysis;
 suggestions = result.suggestions || [];
 } catch (error) {
 console.error('Failed to analyze evidence:', error);
 analysis = 'Analysis failed. Please try again.';
 } finally {
 isAnalyzing = false;
 }
 }

 function applySuggestion(suggestion: string) {
 // Parse suggestion and apply to node
 // This could update metadata, confidence, or other properties
 dispatch('update', {
 nodeId: node.id,
 updates: {
description: suggestion },
	});
 }

 function updateNode(updates: Partial<EvidenceNode>) {
 dispatch('update', {
 nodeId: node.id,
 updates,
 });
 }

 function getNodeTypeIcon(type: string): string {
 const icons = {
 person: '👤',
 document: '📄',
 location: '📍',
 vehicle: '🚗',
 weapon: '🔪',
 financial: '💰',
 digital: '💻',
 other: '📦',
 };
 return icons[type as keyof typeof icons] || icons.other;
 }
</script>

<Dialog bind:open>
 <DialogContent class="evidence-dialog">
 <DialogHeader>
 <DialogTitle class="flex items-center gap-2">
 <span>{getNodeTypeIcon(node.type)}</span>
 {node.title}
 {#if node.confidence}
 <Badge variant={node.confidence > 0.7 ? 'default' : node.confidence > 0.3 ? 'secondary' : 'destructive'}>
 {Math.round(node.confidence * 100)}% confidence
 </Badge>
 {/if}
 </DialogTitle>
 <DialogDescription>
 Evidence analysis and management
 </DialogDescription>
 </DialogHeader>

 <div class="dialog-body">
 <!-- Node Details -->
 <div class="node-details">
 <h4>Type: {node.type}</h4>
 {#if node.description}
 <p><strong>Description:</strong> {node.description}</p>
 {/if}

 {#if node.metadata && Object.keys(node.metadata).length > 0}
 <div class="metadata-section">
 <h5>Metadata:</h5>
 <dl>
 {#each Object.entries(node.metadata) as [key, value]}
 <div>
 <dt>{ key }:</dt>
 <dd>{ value }</dd>
 </div>
 {/each}
 </dl>
 </div>
 {/if}
 </div>

 <!-- AI Analysis Section -->
 <div class="ai-analysis">
 <div class="analysis-header">
 <h4>AI Analysis</h4>
 <Button class="bits-btn"
 onclick={analyzeEvidence}
 disabled={isAnalyzing}
 variant="outline"
 size="sm"
 >
 {#if isAnalyzing}
 Analyzing...
 {:else}
 Analyze with AI
 {/if}
 </Button>
 </div>

 {#if analysis}
 <div class="analysis-content">
 <textarea
 bind:value={analysis}
 placeholder="AI analysis will appear here..."
 rows={ 6 }
 readonly
 ></textarea>
 </div>
 {/if}

 {#if suggestions.length > 0}
 <div class="suggestions">
 <h5>AI Suggestions:</h5>
 <div class="suggestion-list">
 {#each suggestions as suggestion}
 <Button class="bits-btn"
 variant="ghost"
 size="sm"
 onclick={() => applySuggestion(suggestion)}
 >
 {suggestion}
 </Button>
 {/each}
 </div>
 </div>
 {/if}
 </div>

 <!-- Edit Section -->
 <div class="edit-section">
 <h4>Edit Evidence</h4>
 <div class="edit-form">
 <label>
 Title:
 <input
 type="text"
 bind:value={node.title}
 onchange={(e) => updateNode({ title: e.currentTarget.value })}
 />
 </label>

 <label>
 Description: <Textarea, bind:value={node.description}
 onchange={(e) => updateNode({ description: e.currentTarget.value })}
 rows={ 3 }
 />
 </label>

 <label>
 Confidence (0-1):
 <input
 type="number"
 min="0"
 max="1"
 step="0.1"
 bind:value={node.confidence}
 onchange={(e) => updateNode({ confidence: parseFloat(e.currentTarget.value) })}
 />
 </label>
 </div>
 </div>
 </div>
 </DialogContent>
</Dialog>

<style>
 .evidence-dialog {
 max-width: 600px;
 max-height: 80vh;
 overflow-y: auto;
 }

 .dialog-body {
 display: flex;
 flex-direction: column;
	gap: 1.5rem;
 }

 .node-details h4 {
 margin: 0 0 0.5rem 0;
 color: #374151;
 font-size: 1rem;
 }

 .node-details p {
 margin: 0.5rem 0;
 color: #6b7280;
 }

 .metadata-section h5 {
 margin: 1rem 0 0.5rem 0;
 font-size: 0.9rem;
	color: #374151;
 }

 .metadata-section dl {
 display: grid;
 grid-template-columns: auto 1fr;
 gap: 0.25rem 1rem;
 }

 .metadata-section dt {
 font-weight: 600;
	color: #374151;
 }

 .metadata-section dd {
 color: #6b7280;
 }

 .ai-analysis {
 border: 1px solid #e5e7eb;
 border-radius: 8px;
	padding: 1rem;
 background: #f9fafb;
 }

 .analysis-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1rem;
 }

 .analysis-header h4 { margin: 0, color: #374151;
 }

 .analysis-content {
 margin-bottom: 1rem;
 }

 .suggestions h5 {
 margin: 1rem 0 0.5rem 0;
 font-size: 0.9rem;
	color: #374151;
 }

 .suggestion-list {
 display: flex;
 flex-wrap: wrap;
	gap: 0.5rem;
 }

 .edit-section h4 {
 margin: 0 0 1rem 0;
 color: #374151;
 }

 .edit-form {
 display: flex;
 flex-direction: column;
	gap: 1rem;
 }

 .edit-form label {
 display: flex;
 flex-direction: column;
	gap: 0.5rem;
 font-weight: 500;
	color: #374151;
 }

 .edit-form input,
 .edit-form textarea { padding: 0.5rem, border: 1px solid #d1d5db;
 border-radius: 4px;
 font-size: 0.9rem;
 }
</style>




