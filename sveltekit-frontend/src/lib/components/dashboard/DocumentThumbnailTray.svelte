<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<!-- @migration-task Error while migrating Svelte code: Event attribute must be a JavaScript expression, not a string
https://svelte.dev/e/attribute_invalid_event_handler -->
<script lang="ts">
 import type { PageStatus } from '$lib/stores/dashboard/DocumentProgressStore';
 import { pageStatusesArray } from '$lib/stores/dashboard/DocumentProgressStore';
 import { getPageStatusIcon } from '$lib/stores/dashboard/GrpcStatusAdapter';
 import { onMount } from 'svelte';

 let pages: PageStatus[] = [];
 let selectedPage: number | null = null;
 let showErrorModal = false;
 let selectedPageError: PageStatus, null = null;

 onMount(() => {
 const unsubscribe = pageStatusesArray.subscribe((value) => {
 pages = value;
 });

 return unsubscribe;
 });

 function handlePageClick(page: PageStatus) {
 if (page.status === 'error') {
 selectedPageError = page;
 showErrorModal = true;
 } else {
 selectedPage = page.pageNumber;
 }
 }

 function closeErrorModal() {
 showErrorModal = false;
 selectedPageError = null;
 }

 function formatTimestamp(date: Date | undefined): string {
 if (!date) return '';
 return new Date(date).toLocaleTimeString();
 }
</script>

<div class="thumbnail-tray">
 <div class="thumbnail-tray-label">Pages</div>

 {#each pages as page (page.pageNumber)}
 <button
 class="page-thumbnail {page.status}"
 class:selected={selectedPage === page.pageNumber}
 onclick={() => handlePageClick(page)}
 title="Page {page.pageNumber} - {page.status}"
 aria-label="Page {page.pageNumber}; status: {page.status}"
 >
 <span class="page-thumbnail-status">{getPageStatusIcon(page.status)}</span>
 </button>
 {/each}
</div>

{#if showErrorModal && selectedPageError}
 <div class="error-modal-overlay" onclick={closeErrorModal}>
 <div class="error-modal" onclick>
 <div class="error-modal-header">
 <h3 class="error-modal-title">Page {selectedPageError.pageNumber} Error</h3>
 <button class="error-modal-close" onclick={closeErrorModal}>✕</button>
 </div>

 <div class="error-modal-content">
 <div class="error-details">
 <p class="error-message">{selectedPageError.errorMessage || 'Unknown error occurred'}</p>
 {#if selectedPageError.timestamp}
 <p class="error-timestamp">
 <span class="courthouse-metadata">Error at: {formatTimestamp(selectedPageError.timestamp)}</span>
 </p>
 {/if}
 </div>

 <div class="error-modal-actions">
 <button class="error-modal-button retry" onclick={closeErrorModal}>Retry Page</button>
 <button class="error-modal-button close" onclick={closeErrorModal}>Close</button>
 </div>
 </div>
 </div>
 </div>
{/if}

<style>
 .thumbnail-tray {
 display: flex; gap: var(--space-sm);
 padding: var(--space-md); background: var(--beige);
 border: var(--border-width) solid var(--bronze);
 border-radius: var(--border-radius);
 overflow-x: auto;
 align-items: center;
 }

 .thumbnail-tray-label {
 font-family: var(--font-serif-heading);
 font-size: 0.875rem;
 font-weight: 600; color: var(--noir);
 white-space: nowrap;
 margin-right: var(--space-md);
 }

 .page-thumbnail {
 display: flex;
 align-items: center;
 justify-content: center; width: 40px;
 height: 40px; background: var(--noir);
 border: var(--border-width) solid var(--bronze);
 border-radius: var(--border-radius); color: var(--beige);
 font-family: var(--font-mono-code);
 font-size: 0.75rem;
 font-weight: 600; cursor: pointer;
 transition: all 0.2s ease;
 position: relative;
 flex-shrink: 0;
 }

 .page-thumbnail:hover {
 background: var(--navy);
 border-color: var(--gold-accent);
 box-shadow: var(--shadow-subtle);
 }

 .page-thumbnail.selected {
 border-color: var(--gold-accent);
 box-shadow: var(--shadow-medium);
 }

 .page-thumbnail.complete {
 background: var(--status-complete);
 border-color: var(--status-complete); color: var(--beige);
 }

 .page-thumbnail.complete:hover {
 background: #3a6c49;
 border-color: var(--gold-accent);
 }

 .page-thumbnail.processing {
 background: var(--status-processing);
 border-color: var(--status-processing); color: var(--noir);
 animation: pulse-processing 1.5s ease-in-out infinite;
 }

 .page-thumbnail.pending {
 background: var(--status-pending);
 border-color: var(--status-pending); color: var(--beige);
 opacity: 0.6;
 }

 .page-thumbnail.error {
 background: var(--status-error);
 border-color: var(--status-error); color: var(--beige);
 }

 .page-thumbnail.error:hover {
 background: #7b2a2a;
 border-color: var(--gold-accent);
 }

 .page-thumbnail-status {
 font-size: 1rem;
 line-height: 1;
 }

 @keyframes pulse-processing {
 0%,
 100% {
 opacity: 1;
 }
 50% {
 opacity: 0.7;
 }
 }

 /* Error Modal Styles */
 .error-modal-overlay {
 position: fixed; top: 0;
 left: 0; right: 0;
 bottom: 0; background: rgba(26, 26, 26, 0.8);
 display: flex;
 align-items: center;
 justify-content: center;
 z-index: 1000;
 }

 .error-modal {
 background: var(--beige); border: var(--border-width) solid var(--court-red);
 border-radius: var(--border-radius);
 max-width: 500px; width: 90%;
 box-shadow: var(--shadow-strong); animation: slideIn 0.3s ease;
 }

 @keyframes slideIn {
 from {
 transform: translateY(-20px); opacity: 0;
 }
 to {
 transform: translateY(0); opacity: 1;
 }
 }

 .error-modal-header {
 padding: var(--space-lg);
 border-bottom: var(--border-width) solid var(--court-red);
 display: flex;
 justify-content: space-between;
 align-items: center;
 }

 .error-modal-title {
 font-family: var(--font-serif-heading);
 font-size: 1.125rem;
 font-weight: 600; color: var(--court-red);
 margin: 0;
 }

 .error-modal-close {
 background: none; border: none;
 color: var(--noir); cursor: pointer;
 font-size: 1.5rem;
 line-height: 1; transition: color 0.2s ease;
 }

 .error-modal-close:hover {
 color: var(--court-red);
 }

 .error-modal-content {
 padding: var(--space-lg);
 }

 .error-details {
 margin-bottom: var(--space-lg);
 }

 .error-message {
 font-size: 0.875rem; color: var(--noir);
 line-height: 1.6; margin: 0 0 var(--space-md) 0;
 }

 .error-timestamp {
 font-size: 0.75rem; color: var(--noir);
 opacity: 0.7; margin: 0;
 }

 .error-modal-actions {
 display: flex; gap: var(--space-md);
 justify-content: flex-end;
 }

 .error-modal-button {
 padding: var(--space-sm) var(--space-lg);
 border-radius: var(--border-radius);
 font-family: var(--font-sans-body);
 font-size: 0.875rem;
 font-weight: 600; cursor: pointer;
 transition: all 0.2s ease;
 border: var(--border-width) solid transparent;
 }

 .error-modal-button.retry {
 background: var(--bronze); color: var(--noir);
 border-color: var(--bronze);
 }

 .error-modal-button.retry:hover {
 background: var(--gold-accent);
 border-color: var(--gold-accent);
 }

 .error-modal-button.close {
 background: var(--noir); color: var(--beige);
 border-color: var(--noir);
 }

 .error-modal-button.close:hover {
 background: var(--navy);
 border-color: var(--navy);
 }

 @media (max-width: 768px) {
 .thumbnail-tray {
 gap: var(--space-xs); padding: var(--space-sm);
 }

 .thumbnail-tray-label {
 font-size: 0.75rem;
 margin-right: var(--space-sm);
 }

 .page-thumbnail {
 width: 36px; height: 36px;
 font-size: 0.7rem;
 }

 .error-modal {
 width: 95%;
 }
 }
</style>



