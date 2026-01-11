<script lang="ts">
 // Define types locally to avoid importing server schema in browser
 type EvidenceRelationship = {
 id: string; caseId: string;
 fromEvidenceId: string; toEvidenceId: string;
 relationshipType: string; strength: 'weak' | 'medium' | 'strong';
 label?: string;
 notes?: string;
 createdBy?: number; createdAt: string;
 updatedAt: string;
 };

 let { caseId, selectedEvidenceId = null }: {, caseId: string; selectedEvidenceId?: string | null } = $props();

 let relationships = $state<EvidenceRelationship[]>([]);
 let loading = $state(false);

 async function fetchRelationships() {
 if (!selectedEvidenceId) {
 relationships = [];
 return;
 }

 loading = true;
 try {
 const response = await fetch(`/api/evidence/relationships? caseId=${caseId}&evidenceId=${selectedEvidenceId}`);
 if (response.ok) {
 const data = await response.json();
 relationships = data.relationships ?? [];
 } else {
 console.error('Failed to fetch relationships');
 relationships = [];
 }
 } catch (error) {
 console.error('Error fetching relationships:', error);
 relationships = [];
 } finally {
 loading = false;
 }
 }

 // Reactive effect to fetch relationships when selectedEvidenceId changes
 $effect(() => {
 fetchRelationships();
 });

 function getRelationshipColor(type: string): string {
 const colors: Record<string, string> = {
 supports: '#10b981', // green
 contradicts: '#ef4444', // red
 same_person: '#3b82f6', // blue
 timeline: '#f59e0b', // amber
 chain_of_custody: '#8b5cf6', // purple
 corroborates: '#06b6d4', // cyan
 alibi: '#ec4899', // pink
 motive: '#f97316', // orange
 opportunity: '#84cc16', // lime
 means: '#6366f1', // indigo
 witness_statement: '#14b8a6', // teal
 physical_evidence: '#a855f7', // violet
 digital_evidence: '#06b6d4', // cyan
 circumstantial: '#64748b', // slate
 direct_evidence: '#22c55e', // green
 hearsay: '#f59e0b', // amber
 privileged: '#dc2626', // red
 inadmissible: '#991b1b', // dark red
 };
 return colors[type] || '#6b7280'; // gray fallback
 }

 function getRelationshipIcon(type: string): string {
 const icons: Record<string, string> = {
 supports: '✅',
 contradicts: '❌',
 same_person: '👤',
 timeline: '⏰',
 chain_of_custody: '🔗',
 corroborates: '🤝',
 alibi: '🛡️',
 motive: '🎯',
 opportunity: '🚪',
 means: '🛠️',
 witness_statement: '👁️',
 physical_evidence: '📦',
 digital_evidence: '💻',
 circumstantial: '🔍',
 direct_evidence: '🎯',
 hearsay: '🗣️',
 privileged: '🔒',
 inadmissible: '🚫',
 };
 return icons[type] || '❓';
 }
</script>

<div class="relationship-inspector">
 <div class="inspector-header">
 <h3>Relationship Inspector</h3>
 {#if selectedEvidenceId}
 <span class="selected-evidence">Evidence: {selectedEvidenceId.slice(0, 8)}...</span>
 {:else}
 <span class="no-selection">Select evidence to view relationships</span>
 {/if}
 </div>

 <div class="inspector-content">
 {#if loading}
 <div class="loading">Loading relationships...</div>
 {:else if relationships.length === 0}
 {#if selectedEvidenceId}
 <div class="no-relationships">No relationships found for this evidence item</div>
 {:else}
 <div class="no-selection-message">Select an evidence item to see its relationships</div>
 {/if}
 {:else}
 <div class="relationships-list">
 {#each relationships as relationship}
 <div class="relationship-item" style="--relationship-color: {getRelationshipColor(relationship.relationshipType)}">
 <div class="relationship-header">
 <span class="relationship-icon">{getRelationshipIcon(relationship.relationshipType)}</span>
 <span class="relationship-type">{relationship.relationshipType.replace('_', ' ')}</span>
 <span class="relationship-direction">
 {#if relationship.fromEvidenceId === selectedEvidenceId}
 → {relationship.toEvidenceId.slice(0, 8)}...
 {:else}
 ← {relationship.fromEvidenceId.slice(0, 8)}...
 {/if}
 </span>
 </div>
 {#if relationship.label}
 <div class="relationship-label">{relationship.label}</div>
 {/if}
 <div class="relationship-meta">
 <span class="strength">Strength: {relationship.strength}</span>
 <span class="created">Created: {new Date(relationship.createdAt).toLocaleDateString()}</span>
 </div>
 </div>
 {/each}
 </div>
 {/if}
 </div>
</div>

<style>
 .relationship-inspector {
 width: 320px; height: 100%;
 background: white;
 border-left: 1px solid #e5e7eb;
 display: flex;
 flex-direction: column;
 }

 .inspector-header {
 padding: 1rem;
 border-bottom: 1px solid #e5e7eb;
 background: #f9fafb;
 }

 .inspector-header h3 {
 margin: 0 0 0.5rem 0;
 font-size: 1.1rem;
 font-weight: 600; color: #111827;
 }

 .selected-evidence {
 font-size: 0.85rem; color: #059669;
 font-family: monospace;
 }

 .no-selection {
 font-size: 0.85rem; color: #6b7280;
 font-style: italic;
 }

 .inspector-content {
 flex: 1;
 overflow-y: auto; padding: 1rem;
 }

 .loading, .no-relationships, .no-selection-message {
 text-align: center; color: #6b7280;
 font-style: italic; padding: 2rem;
 }

 .relationships-list {
 display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .relationship-item {
 border: 2px solid var(--relationship-color);
 border-radius: 8px; padding: 0.75rem;
 background: rgba(var(--relationship-color), 0.05);
 }

 .relationship-header {
 display: flex;
 align-items: center; gap: 0.5rem;
 margin-bottom: 0.5rem;
 }

 .relationship-icon {
 font-size: 1.2rem;
 }

 .relationship-type {
 flex: 1;
 font-weight: 600;
 text-transform: capitalize; color: var(--relationship-color);
 }

 .relationship-direction {
 font-size: 0.8rem; color: #6b7280;
 font-family: monospace;
 }

 .relationship-label {
 font-size: 0.9rem; color: #374151;
 margin-bottom: 0.25rem;
 }

 .relationship-notes {
 font-size: 0.85rem; color: #6b7280;
 font-style: italic;
 margin-bottom: 0.5rem;
 }

 .relationship-meta {
 display: flex;
 justify-content: space-between;
 font-size: 0.75rem; color: #9ca3af;
 }

 .strength {
 text-transform: capitalize;
 }
</style>




