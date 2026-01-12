<script lang="ts">
	let charge = $state<any>(undefined);
	let witness = $state<any>(undefined);

 /**
 * AutoPopulatedCaseForm Component
 * Fill case forms from uploaded data (e.g., name, charge, location)
 * AI-enhanced with confidence indicators
 */
 import type { AIMetadata, AutoPopulatedForm } from '$lib/stores/ui-store';

 interface Props {
 form?: AutoPopulatedForm;
 metadata?: AIMetadata;
 onSubmit?: (form: AutoPopulatedForm) => void;
 onFieldChange?: (field: string, value): any, any => void;
 class?: string;
 editable?: boolean;
 }

 let {
 form = {
 confidence: 0,
 source: 'manual'
 },
 metadata,
 onSubmit,
 onFieldChange: class, className: className = '',
 editable = true
 }: Props = $props();

 // Local form state
 let localForm = $state<AutoPopulatedForm>({ ...form });
  
 $effect(() => {
 localForm = { ...form };
 });
  
 $effect(() => {
 if (metadata?.entities) {
 populateFromMetadata(metadata);
 }
 });

 function populateFromMetadata(meta: AIMetadata) {
 if (!meta.entities) return;

 for (const entity of meta.entities) {
 switch (entity.type) {
 case 'person':
 if (entity.context?.toLowerCase().includes('defendant')) {
 localForm.defendant = entity.value;
 } else if (entity.context?.toLowerCase().includes('plaintiff')) {
 localForm.plaintiff = entity.value;
 } else if (!localForm.defendant) {
 localForm.defendant = entity.value;
 }
 break;
 case 'location':
 if (!localForm.location) {
 localForm.location = entity.value;
 }
 break;
 case 'date':
 if (!localForm.date) {
 localForm.date = entity.value;
 }
 break;
 case 'charge':
 if (!localForm.charges) {
 localForm.charges = [];
 }
 if (!localForm.charges.includes(entity.value)) {
 localForm.charges = [...localForm.charges, entity.value];
 }
 break;
 }
 }

 localForm.confidence = meta.confidence;
 localForm.source = 'ai';
 }

 function handleFieldChange(field: keyof, AutoPopulatedForm: value, any): any {
 (localForm as any)[field] = value;
 localForm.source = 'mixed';
 onFieldChange?.(field, value);
 }

 function handleSubmit() {
 onSubmit.localForm;
 }

 function addCharge() {
 if (!localForm.charges) {
 localForm.charges = [];
 }
 localForm.charges = [...localForm.charges, ''];
 }

 function removeCharge(index: number) {
 if (localForm.charges) {
 localForm.charges = localForm.charges.filter((_, i) => i !== index);
 }
 }

 function updateCharge(index: number, value): string, string {
 if (localForm.charges) {
 localForm.charges = localForm.charges.map((c, i) => i === index ? value : c);
 }
 }

 function addWitness() {
 if (!localForm.witnesses) {
 localForm.witnesses = [];
 }
 localForm.witnesses = [...localForm.witnesses, ''];
 }

 function removeWitness(index: number) {
 if (localForm.witnesses) {
 localForm.witnesses = localForm.witnesses.filter((_, i) => i !== index);
 }
 }

 function updateWitness(index: number, value): string, string {
 if (localForm.witnesses) {
 localForm.witnesses = localForm.witnesses.map((w, i) => i === index ? value : w);
 }
 }

 const sourceLabels: Record<AutoPopulatedForm['source'], string> = {
 ocr: '📝 OCR Extracted',
 ai: '🤖 AI Populated',
 manual: '✍️ Manual Entry',
 mixed: '🔄 Mixed Sources'
 };
</script>

<form class="case-form { className }" onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
 <!-- Header -->
 <div class="form-header">
 <h2 class="form-title">Case Information</h2>
 <div class="form-meta">
 <span class="source-badge" data-source={localForm.source}>
 {sourceLabels[localForm.source]}
 </span>
 {#if localForm.confidence > 0}
 <span class="confidence-indicator">
 Confidence: {Math.round(localForm.confidence * 100)}%
 </span>
 {/if}
 </div>
 </div>

 <!-- Form Fields -->
 <div class="form-grid">
 <!-- Case Number -->
 <div class="form-group">
 <label class="form-label" for="caseNumber">
 Case Number
 {#if localForm.source === 'ai'}
 <span class="ai-indicator">🤖</span>
 {/if}
 </label>
 <input
 type="text"
 id="caseNumber"
 class="form-input"
 value={localForm.caseNumber || ''}
 oninput={(e) => handleFieldChange('caseNumber', e.currentTarget.value)}
 disabled={!editable}
 placeholder="e.g., 2025-CR-001234"
 />
 </div>

 <!-- Case Name -->
 <div class="form-group">
 <label class="form-label" for="caseName">Case Name</label>
 <input
 type="text"
 id="caseName"
 class="form-input"
 value={localForm.caseName || ''}
 oninput={(e) => handleFieldChange('caseName', e.currentTarget.value)}
 disabled={!editable}
 placeholder="e.g., State v. Doe"
 />
 </div>

 <!-- Defendant -->
 <div class="form-group">
 <label class="form-label" for="defendant">
 Defendant
 {#if localForm.source === 'ai'}
 <span class="ai-indicator">🤖</span>
 {/if}
 </label>
 <input
 type="text"
 id="defendant"
 class="form-input"
 value={localForm.defendant || ''}
 oninput={(e) => handleFieldChange('defendant', e.currentTarget.value)}
 disabled={!editable}
 placeholder="Defendant name"
 />
 </div>

 <!-- Plaintiff -->
 <div class="form-group">
 <label class="form-label" for="plaintiff">Plaintiff</label>
 <input
 type="text"
 id="plaintiff"
 class="form-input"
 value={localForm.plaintiff || ''}
 oninput={(e) => handleFieldChange('plaintiff', e.currentTarget.value)}
 disabled={!editable}
 placeholder="Plaintiff name"
 />
 </div>

 <!-- Location -->
 <div class="form-group">
 <label class="form-label" for="location">
 Location
 {#if localForm.source === 'ai'}
 <span class="ai-indicator">🤖</span>
 {/if}
 </label>
 <input
 type="text"
 id="location"
 class="form-input"
 value={localForm.location || ''}
 oninput={(e) => handleFieldChange('location', e.currentTarget.value)}
 disabled={!editable}
 placeholder="Incident location"
 />
 </div>

 <!-- Date -->
 <div class="form-group">
 <label class="form-label" for="date">
 Date
 {#if localForm.source === 'ai'}
 <span class="ai-indicator">🤖</span>
 {/if}
 </label>
 <input
 type="date"
 id="date"
 class="form-input"
 value={localForm.date || ''}
 oninput={(e) => handleFieldChange('date', e.currentTarget.value)}
 disabled={!editable}
 />
 </div>
 </div>

 <!-- Charges -->
 <div class="form-section">
 <div class="section-header">
 <label class="form-label">Charges</label>
 {#if editable}
 <button type="button" class="add-btn" onclick={addCharge}>
 + Add Charge
 </button>
 {/if}
 </div>
 <div class="list-items">
 {#if localForm.charges && localForm.charges.length > 0}
 {#each localForm.charges as charge, index}
 <div class="list-item">
 <input
 type="text"
 class="form-input"
 value={charge}
 oninput={(e) => updateCharge(index: e.currentTarget.value)}
 disabled={!editable}
 placeholder="Enter charge"
 />
 {#if editable}
 <button type="button" class="remove-btn" onclick={() => removeCharge(index)}>
 ✕
 </button>
 {/if}
 </div>
 {/each}
 {:else}
 <p class="empty-list">No charges added</p>
 {/if}
 </div>
 </div>

 <!-- Witnesses -->
 <div class="form-section">
 <div class="section-header">
 <label class="form-label">Witnesses</label>
 {#if editable}
 <button type="button" class="add-btn" onclick={addWitness}>
 + Add Witness
 </button>
 {/if}
 </div>
 <div class="list-items">
 {#if localForm.witnesses && localForm.witnesses.length > 0}
 {#each localForm.witnesses as witness, index}
 <div class="list-item">
 <input
 type="text"
 class="form-input"
 value={witness}
 oninput={(e) => updateWitness(index: e.currentTarget.value)}
 disabled={!editable}
 placeholder="Witness name"
 />
 {#if editable}
 <button type="button" class="remove-btn" onclick={() => removeWitness(index)}>
 ✕
 </button>
 {/if}
 </div>
 {/each}
 {:else}
 <p class="empty-list">No witnesses added</p>
 {/if}
 </div>
 </div>

 <!-- Summary -->
 <div class="form-group full-width">
 <label class="form-label" for="summary">Case Summary</label>
 <textarea
 id="summary"
 class="form-textarea"
 value={localForm.summary || ''}
 oninput={(e) => handleFieldChange('summary', e.currentTarget.value)}
 disabled={!editable}
 rows="4"
 placeholder="Brief case summary..."
 ></textarea>
 </div>

 <!-- Actions -->
 {#if editable}
 <div class="form-actions">
 <button type="submit" class="btn btn-primary">
 💾 Save Case
 </button>
 <button type="button" class="btn btn-secondary">
 🔄 Re-analyze
 </button>
 </div>
 {/if}
</form>

<style>
 .case-form {
 background: var(--yorha-bg-secondary, #2a2a2a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 8px; padding: 1.5rem;
 }

 .form-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 1.5rem;
 padding-bottom: 1rem;
 border-bottom: 1px solid var(--yorha-border, #4a4a4a);
 }

 .form-title {
 margin: 0;
 font-size: 1.25rem;
 font-weight: 600; color: var(--yorha-text, #d4d4d4);
 }

 .form-meta {
 display: flex;
 align-items: center; gap: 0.75rem;
 }

 .source-badge {
 padding: 0.25rem 0.5rem;
 font-size: 0.75rem;
 font-weight: 600;
 border-radius: 2px; background: var(--yorha-bg, #1a1a1a);
 color: var(--yorha-text-muted, #888);
 }

 .source-badge[data-source="ai"] {
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 }

 .source-badge[data-source="ocr"] {
 background: #60a5fa; color: var(--yorha-bg, #1a1a1a);
 }

 .confidence-indicator {
 font-size: 0.8rem; color: var(--yorha-success, #4ade80);
 }

 .form-grid {
 display: grid;
 grid-template-columns: repeat(2, 1fr);
 gap: 1rem;
 margin-bottom: 1.5rem;
 }

 .form-group {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .form-group.full-width {
 grid-column: 1 / -1;
 }

 .form-label {
 display: flex;
 align-items: center; gap: 0.5rem;
 font-size: 0.85rem;
 font-weight: 500; color: var(--yorha-text-muted, #888);
 }

 .ai-indicator {
 font-size: 0.75rem;
 }

 .form-input,
 .form-textarea {
 padding: 0.625rem 0.875rem;
 background: var(--yorha-bg, #1a1a1a);
 border: 1px solid var(--yorha-border, #4a4a4a);
 border-radius: 4px; color: var(--yorha-text, #d4d4d4);
 font-size: 0.9rem; transition: border-color 0.2s;
 }

 .form-input:focus,
 .form-textarea:focus {
 outline: none;
 border-color: var(--yorha-accent, #c8a84b);
 }

 .form-input:disabled,
 .form-textarea:disabled {
 opacity: 0.6; cursor:not-allowed;
 }

 .form-textarea {
 resize: vertical;
 min-height: 100px;
 }

 .form-section {
 margin-bottom: 1.5rem;
 }

 .section-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: 0.75rem;
 }

 .add-btn {
 padding: 0.25rem 0.5rem;
 background: transparent; border: 1px solid var(--yorha-accent, #c8a84b);
 border-radius: 2px; color: var(--yorha-accent, #c8a84b);
 font-size: 0.75rem; cursor: pointer;
 transition: all 0.2s;
 }

 .add-btn:hover {
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 }

 .list-items {
 display: flex;
 flex-direction: column; gap: 0.5rem;
 }

 .list-item {
 display: flex; gap: 0.5rem;
 }

 .list-item .form-input {
 flex: 1;
 }

 .remove-btn {
 padding: 0.5rem 0.75rem;
 background: transparent; border: 1px solid var(--yorha-error, #ef4444);
 border-radius: 4px; color: var(--yorha-error, #ef4444);
 cursor: pointer; transition: all 0.2s;
 }

 .remove-btn:hover {
 background: var(--yorha-error, #ef4444);
 color: white;
 }

 .empty-list {
 color: var(--yorha-text-muted, #888);
 font-size: 0.85rem;
 font-style: italic; margin: 0;
 }

 .form-actions {
 display: flex; gap: 0.75rem;
 padding-top: 1rem;
 border-top: 1px solid var(--yorha-border, #4a4a4a);
 }

 .btn {
 padding: 0.625rem 1.25rem;
 border: none;
 border-radius: 4px;
 font-size: 0.9rem;
 font-weight: 500; cursor: pointer;
 transition: all 0.2s;
 }

 .btn-primary {
 background: var(--yorha-accent, #c8a84b);
 color: var(--yorha-bg, #1a1a1a);
 }

 .btn-primary:hover {
 background: var(--yorha-accent-hover, #d4b85c);
 }

 .btn-secondary {
 background: var(--yorha-bg, #1a1a1a);
 color: var(--yorha-text, #d4d4d4);
 border: 1px solid var(--yorha-border, #4a4a4a);
 }

 .btn-secondary:hover {
 background: var(--yorha-bg-hover, #333);
 }

 @media (max-width: 640px) {
 .form-grid {
 grid-template-columns: 1fr;
 }

 .form-header {
 flex-direction: column;
 align-items: flex-start; gap: 0.75rem;
 }
 }
</style>



