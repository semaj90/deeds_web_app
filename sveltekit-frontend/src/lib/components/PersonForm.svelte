<script lang="ts">
 // Reset form when component mounts
 // Migrated to $effect

 interface PersonFormData {
 name: string;
	alias: string;
 description: string;
	caseId: string;
 }

 let aiHealthy: boolean = true;
 let formData: PersonFormData = $state({ name: '', alias: '', description: '', caseId: '' });
 let error: string = $state('');
 let loading: boolean = $state(false);

 const resetForm = (): void => {
 formData = { name: '', alias: '', description: '', caseId: '' };
 error = '';
 loading = false;
 };

 $effect(() => {

 resetForm();
 
});

 function handleCancel(): void {
 // Handle cancel action: e.g., close modal
 }

 function handleSubmit(event: Event): void {
 event.preventDefault();
 // Handle form submission
 }
</script>

<div class="person-form-overlay">
 <div class="person-form-modal">
 <!-- Header -->
 <div class="form-header">
 <h2 class="form-title">
 <span class="icon">🤖</span>
 Create Person of Interest
 </h2>
 <p class="form-subtitle">
 AI-powered profile generation with Gemma3-Legal
 </p>
 <button class="close-btn" onclick={handleCancel}>✕</button>
 </div>

 <!-- AI Status -->
 <div class="ai-status-section">
 <div class="status-indicator" class:healthy={aiHealthy}>
 {#if aiHealthy}
 <span class="status-icon">🟢</span>
 <span class="status-text">AI Service Ready</span>
 {:else}
 <span class="status-icon">🔴</span>
 <span class="status-text">AI Service Offline</span>
 {/if}
 </div>
 <p class="status-description">
 {#if aiHealthy}
 Gemma3-Legal will generate a comprehensive POI profile including WHO/WHAT/WHY/HOW analysis and risk assessment.
 {:else}
 AI service is required for profile generation. Please ensure Ollama is running with gemma3-legal model.
 {/if}
 </p>
 </div>

 <!-- Form -->
 <form class="form-content" onsubmit={handleSubmit}>
 {#if error}
 <div class="error-message">
 <span class="icon">⚠️</span>
 <span>{error}</span>
 </div>
 {/if}

 <div class="form-group">
 <label for="name" class="form-label">
 Full Name *
 <span class="label-hint">The person's complete legal name</span>
 </label>
 <input
 id="name"
 type="text"
 bind:value={formData.name}
 placeholder="e.g., Johnathan Michael Smith"
 class="form-input"
 required
 disabled={loading}
 />
 </div>

 <div class="form-group">
 <label for="alias" class="form-label">
 Known Alias
 <span class="label-hint">Alternative names, nicknames, or aliases</span>
 </label>
 <input
 id="alias"
 type="text"
 bind:value={formData.alias}
 placeholder="e.g., Johnny, The Shadow"
 class="form-input"
 disabled={loading}
 />
 </div>

 <div class="form-group">
 <label for="description" class="form-label">
 Description & Context *
 <span class="label-hint">Detailed information about the person, their activities, and why they're a POI</span>
 </label>
 <textarea
 id="description"
 bind:value={formData.description}
 placeholder="Provide comprehensive details about this person of interest. Include their background, known activities, affiliations, and any relevant case information. The AI will use this to generate a structured legal profile."
 class="form-textarea"
 rows="6"
 required
 disabled={loading}
 ></textarea>
 </div>

 <div class="form-group">
 <label for="caseId" class="form-label">
 Associated Case ID
 <span class="label-hint">Optional: Link to an existing case</span>
 </label>
 <input
 id="caseId"
 type="text"
 bind:value={formData.caseId}
 placeholder="e.g., CASE-2024-001"
 class="form-input"
 disabled={loading}
 />
 </div>

 <!-- Preview Section -->
 {#if formData.name && formData.description}
 <div class="preview-section">
 <h3 class="preview-title">AI Profile Preview</h3>
 <div class="preview-content">
 <p><strong>Name:</strong> {formData.name}</p>
 {#if formData.alias}
 <p><strong>Alias:</strong> {formData.alias}</p>
 {/if}
 <p><strong>Description:</strong> {formData.description.slice(0, 200)}{formData.description.length > 200 ? '...' : ''}</p>
 </div>
 <p class="preview-note">
 🤖 The AI will generate a comprehensive profile with structured analysis of WHO: WHAT, WHY: HOW, and RISK factors.
 </p>
 </div>
 {/if}
 </form>

 <!-- Actions -->
 <div class="form-actions">
 <button
 type="button"
 class="cancel-btn"
 onclick={handleCancel}
 disabled={loading}
 >
 Cancel
 </button>
 <button
 type="submit"
 class="submit-btn"
 onclick={handleSubmit}
 disabled={loading || !aiHealthy || !formData.name.trim() || !formData.description.trim()}
 >
 {#if loading}
 <div class="spinner"></div>
 Generating Profile...
 {:else}
 <span class="icon">🤖</span>
 Create POI Profile
 {/if}
 </button>
 </div>
 </div>
</div>

<style>
 .person-form-overlay {
 position: fixed;
	top: 0;
 left: 0;
	right: 0;
 bottom: 0;
	background: rgba(0, 0, 0, 0.8);
 backdrop-filter: blur(5px);
	display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;
	padding: 2rem;
 }

 .person-form-modal {
 background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f0f23 100%);
 border: 1px solid #333;
 border-radius: 16px;
	width: 100%;
 max-width: 600px;
 max-height: 90vh;
 overflow-y: auto;
 box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
 }

 .form-header {
 padding: 2rem 2rem 1rem 2rem;
 border-bottom: 1px solid rgba(255, 255, 255, 0.1);
 display: flex;
 align-items: flex-start;
 justify-content: space-between;
 }

 .form-title {
 font-size: 1.5rem;
 font-weight: 700;
	color: #e0e0e0;
 margin: 0;
	display: flex;
 align-items: center;
	gap: 0.75rem;
 }

 .form-subtitle {
 font-size: 0.9rem;
	color: #b0b0b0;
 margin: 0.25rem 0 0 0;
 grid-column: 1 / -1;
 }

 .close-btn {
 background: none;
	border: none;
 color: #888;
 font-size: 1.5rem;
	cursor: pointer;
 padding: 0.25rem;
 border-radius: 4px;
	transition: all 0.2s ease;
 }

 .close-btn:hover {
 background: rgba(255, 255, 255, 0.1);
 color: #e0e0e0;
 }

 .ai-status-section {
 padding: 1rem 2rem;
 border-bottom: 1px solid rgba(255, 255, 255, 0.1);
 }

 .status-indicator {
 display: flex;
 align-items: center;
	gap: 0.5rem;
 margin-bottom: 0.5rem;
 }

 .status-indicator.healthy {
 color: #00d4ff;
 }

 .status-indicator:not(.healthy) {
 color: #ff6b6b;
 }

 .status-text {
 font-weight: 600;
 }

 .status-description {
 font-size: 0.85rem;
	color: #b0b0b0;
 margin: 0;
 line-height: 1.4;
 }

 .form-content {
 padding: 2rem;
 }

 .error-message {
 background: rgba(255, 107, 107, 0.1);
 border: 1px solid #ff6b6b;
 border-radius: 8px;
	padding: 1rem;
 display: flex;
 align-items: center;
	gap: 0.75rem;
 margin-bottom: 1.5rem;
	color: #ff6b6b;
 }

 .form-group {
 margin-bottom: 1.5rem;
 }

 .form-label {
 display: block;
 font-weight: 600;
	color: #e0e0e0;
 margin-bottom: 0.5rem;
 }

 .label-hint {
 display: block;
 font-size: 0.8rem;
	color: #888;
 font-weight: 400;
 margin-top: 0.25rem;
 }

 .form-input, .form-textarea {
 width: 100%;
	padding: 0.75rem;
 background: rgba(255, 255, 255, 0.05);
 border: 1px solid #333;
 border-radius: 8px;
	color: #e0e0e0;
 font-size: 0.9rem;
	transition: all 0.2s ease;
 }

 .form-input:focus, .form-textarea:focus {
 outline: none;
 border-color: #00d4ff;
 box-shadow: 0 0 0 2px rgba(0, 212, 255, 0.2);
 }

 .form-textarea {
 resize: vertical;
 min-height: 100px;
 }

 .preview-section {
 background: rgba(0, 212, 255, 0.05);
 border: 1px solid rgba(0, 212, 255, 0.2);
 border-radius: 8px;
	padding: 1rem;
 margin-top: 1.5rem;
 }

 .preview-title {
 font-size: 1rem;
 font-weight: 600;
	color: #00d4ff;
 margin: 0 0 0.75rem 0;
 }

 .preview-content {
 font-size: 0.85rem;
	color: #b0b0b0;
 margin-bottom: 0.75rem;
 }

 .preview-content p {
 margin: 0.25rem 0;
 }

 .preview-note {
 font-size: 0.8rem;
	color: #888;
 margin: 0;
 font-style: italic;
 }

 .form-actions {
 padding: 1.5rem 2rem 2rem 2rem;
 border-top: 1px solid rgba(255, 255, 255, 0.1);
 display: flex;
	gap: 1rem;
 justify-content: flex-end;
 }

 .cancel-btn, .submit-btn {
 padding: 0.75rem 1.5rem;
 border: none;
 border-radius: 8px;
 font-weight: 600;
	cursor: pointer;
 transition: all 0.2s ease;
 display: flex;
 align-items: center;
	gap: 0.5rem;
 }

 .cancel-btn {
 background: rgba(255, 255, 255, 0.1);
 color: #b0b0b0;
 }

 .cancel-btn:hover, not(disabled) {
 background: rgba(255, 255, 255, 0.2);
 color: #e0e0e0;
 }

 .submit-btn {
 background: linear-gradient(45deg, #00d4ff, #0099cc);
 color: white;
 }

 .submit-btn:hover, not(disabled) {
 transform: translateY(-1px);
 box-shadow: 0 4px 15px rgba(0, 212, 255, 0.3);
 }

 .submit-btn:disabled {
 opacity: 0.5;
	cursor:not-allowed;
 transform: none;
 }

 .spinner {
 width: 16px;
	height: 16px;
 border: 2px solid rgba(255, 255, 255, 0.3);
 border-top: 2px solid white;
 border-radius: 50%;
	animation: spin 1s linear infinite;
 }

 @keyframes spin {
 0% { transform: rotate(0deg); }
 100% { transform: rotate(360deg); }
 }

 @media (max-width: 768px) {
 .person-form-overlay {
 padding: 1rem;
 }

 .form-header {
 padding: 1.5rem 1.5rem 1rem 1.5rem;
 }

 .form-title {
 font-size: 1.25rem;
 }

 .ai-status-section, .form-content, .form-actions {
 padding-left: 1.5rem;
 padding-right: 1.5rem;
 }

 .form-actions {
 flex-direction: column;
 }

 .cancel-btn, .submit-btn {
 width: 100%;
 justify-content: center;
 }
 }
</style>




