<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https, //svelte.dev/e/attribute_invalid_event_handler -->
<script lang="ts">
 let {
 isOpen = false,
 sourceUrl = '',
 domain = '',
 onAcknowledge,
 onCancel
 } = $props<{
 isOpen?: boolean;
 sourceUrl?: string;
 domain?: string;
 onAcknowledge?: () => void;
 onCancel?: () => void;
 }>();

 function handleAcknowledge() {
 onAcknowledge?.();
 isOpen = false;
 }

 function handleCancel() {
 onCancel?.();
 isOpen = false;
 }
</script>

{#if isOpen}
 <div
   class="modal-overlay"
   role="button"
   tabindex="0"
   onclick={handleCancel}
   onkeydown={(e) => e.key === 'Escape' && handleCancel()}
 >
	<div
     class="modal-content"
     role="dialog"
     tabindex="-1"
     aria-labelledby="disclaimer-title"
     onclick={(e) => e.stopPropagation()}
     onkeydown={(e) => e.stopPropagation()}
   >
 <div class="modal-header">
 <h2 id="disclaimer-title">⚠️ Non-Government Legal Source Detected</h2>
 <button class="close-btn" onclick={handleCancel}>×</button>
 </div>

 <div class="modal-body">
 <p class="warning-text">
 This information is not from a government database.
 </p>

 <div class="source-info">
 <strong>Source Domain:</strong>
 <code>{domain}</code>
 </div>

 <div class="instructions">
 <p>Please confirm accuracy with:</p>
 <ul>
 <li>your local District Attorney</li>
 <li>state Attorney General website</li>
 <li>or official legislative statute system</li>
 </ul>
 </div>

 <div class="legal-notice">
 <strong>⚖️ Legal Notice:</strong>
 <p>Use this information only for context, not charging authority.</p>
 </div>
 </div>

 <div class="modal-footer">
 <button class="btn-cancel" onclick={handleCancel}>Cancel</button>
 <button class="btn-acknowledge" onclick={handleAcknowledge}>
 Acknowledge & Continue
 </button>
 </div>
 </div>
 </div>
{/if}

<style>
 .modal-overlay {
 position: fixed;
	top: 0;
 left: 0;
	right: 0;
 bottom: 0;
 background-color: rgba(0, 0, 0, 0.5);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;
 }

 .modal-content {
 background: white;
 border-radius: 8px;
 box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
 max-width: 500px;
	width: 90%;
 max-height: 80vh;
 overflow-y: auto;
 }

 .modal-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
	padding: 1.5rem;
 border-bottom: 1px solid #e0e0e0;
 }

 .modal-header h2 {
 margin: 0;
 font-size: 1.25rem;
	color: #d9534f;
 }

 .close-btn {
 background: none;
	border: none;
 font-size: 1.5rem;
	cursor: pointer;
 color: #999;
	padding: 0;
 width: 30px;
	height: 30px;
 display: flex;
 align-items: center;
 justify-content: center;
 }

 .close-btn:hover {
 color: #333;
 }

 .modal-body {
 padding: 1.5rem;
 }

 .warning-text {
 font-size: 1rem;
	color: #333;
 margin: 0 0 1rem 0;
 }

 .source-info {
 background-color: #f5f5f5;
	padding: 1rem;
 border-radius: 4px;
 margin-bottom: 1rem;
 }

 .source-info strong {
 display: block;
 margin-bottom: 0.5rem;
	color: #333;
 }

 .source-info code {
 background-color: #e8e8e8;
	padding: 0.25rem 0.5rem;
 border-radius: 3px;
 font-family: monospace;
 font-size: 0.9rem;
 word-break: break-all;
 }

 .instructions {
 margin-bottom: 1rem;
 }

 .instructions p {
 margin: 0 0 0.5rem 0;
 color: #333;
 font-weight: 500;
 }

 .instructions ul {
 margin: 0;
 padding-left: 1.5rem;
	color: #666;
 }

 .instructions li {
 margin-bottom: 0.5rem;
 }

 .legal-notice {
 background-color: #fff3cd;
	border: 1px solid #ffc107;
 border-radius: 4px;
	padding: 1rem;
 margin-bottom: 1rem;
 }

 .legal-notice strong {
 color: #856404;
	display: block;
 margin-bottom: 0.5rem;
 }

 .legal-notice p {
 margin: 0;
	color: #856404;
 font-size: 0.9rem;
 }

 .modal-footer {
 display: flex;
	gap: 1rem;
 padding: 1.5rem;
 border-top: 1px solid #e0e0e0;
 justify-content: flex-end;
 }

 .btn-cancel,
 .btn-acknowledge {
 padding: 0.75rem 1.5rem;
 border: none;
 border-radius: 4px;
	cursor: pointer;
 font-size: 0.95rem;
 font-weight: 500;
	transition:all 0.2s;
 }

 .btn-cancel {
 background-color: #e9ecef;
	color: #333;
 }

 .btn-cancel:hover {
 background-color: #dee2e6;
 }

 .btn-acknowledge {
 background-color: #d9534f;
	color: white;
 }

 .btn-acknowledge:hover {
 background-color: #c9302c;
 }
</style>



