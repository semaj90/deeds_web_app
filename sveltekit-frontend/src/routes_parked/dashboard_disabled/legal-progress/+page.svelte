<!-- @migration-task Error while migrating Svelte code: Cannot use keyword 'await' outside an async function
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Cannot use keyword 'await' outside an async function
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Cannot use keyword 'await' outside an async function
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Cannot use keyword 'await' outside an async function
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 import DocumentThumbnailTray from '$lib/components/dashboard/DocumentThumbnailTray.svelte';
 import FallbackAlert from '$lib/components/dashboard/FallbackAlert.svelte';
 import ProgressCard from '$lib/components/dashboard/ProgressCard.svelte';
 import { documentProgressStore } from '$lib/stores/dashboard/DocumentProgressStore';
 import { GrpcStatusAdapter } from '$lib/stores/dashboard/GrpcStatusAdapter';
 import type { ProcessingEvent } from '$lib/stores/dashboard/SSEStatusStore';
 import { connectionStatus, isConnected, sseStatusStore } from '$lib/stores/dashboard/SSEStatusStore';
 import { onDestroy, onMount } from 'svelte';

 let connectionStatusText = 'Disconnected';
 let isConnectedValue = false;
 let showLoadingState = true;
 let errorMessage: string | null = null;

 onMount(() => {
 (async () => {
 // Subscribe to connection status
 const unsubscribeStatus = connectionStatus.subscribe((value) => {
 connectionStatusText = value;
 })();
 });

 const unsubscribeConnected = isConnected.subscribe((value) => {
 isConnectedValue = value;
 });
  
 const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
 const sseEndpoint = `${apiBaseUrl}/api/document-processing/stream`;

 try {
 // Get auth token from session/localStorage
 const token = localStorage.getItem('auth_token');

 // Connect to SSE stream
 await sseStatusStore.connect(sseEndpoint, token);

 // Listen for processing events
 sseStatusStore.onMessage((event: ProcessingEvent) => {
 const normalized = GrpcStatusAdapter.processEvent(event);
 if (normalized) {
 documentProgressStore.updateFromEvent(normalized);

 // Check for fallback
 if (GrpcStatusAdapter.isFallbackEvent(normalized)) {
 documentProgressStore.setFallbackActive(true, normalized.confidence);
 }

 // Check for completion
 if (GrpcStatusAdapter.isCompletionEvent(normalized)) {
 documentProgressStore.complete();
 }

 // Check for errors
 if (GrpcStatusAdapter.isErrorEvent(normalized)) {
 documentProgressStore.addError(normalized.stage, normalized.status, true);
 }
 }
 });

 showLoadingState = false;
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to connect to processing stream';
 errorMessage = errorMsg;
 console.error('[Dashboard] Connection error:', error);
 showLoadingState = false;
 }

 return () => {
 unsubscribeStatus();
 unsubscribeConnected();
 sseStatusStore.disconnect();
 };
 });

 onDestroy(() => {
 sseStatusStore.disconnect();
 });
</script>

<svelte:head>
 <title>Legal Document Processing Dashboard</title>
 <link rel="stylesheet" href="/styles/courthouse-theme.css" ></li>
</svelte:head>

<div class="courthouse-dashboard">
 <div class="dashboard-header">
 <h1 class="courthouse-heading courthouse-heading-1">📄 Legal Document Processing</h1>
 <div class="connection-status" class:connected={isConnectedValue}>
 <span class="status-indicator"></span>
 <span class="status-text">{connectionStatusText}</span>
 </div>
 </div>

 {#if showLoadingState}
 <div class="loading-state">
 <div class="loading-spinner"></div>
 <p>Initializing document processing stream...</p>
 </div>
 {:else if errorMessage}
 <div class="error-state">
 <div class="error-icon">⚠️</div>
 <div class="error-content">
 <h2>Connection Error</h2>
 <p>{errorMessage}</p>
 <button class="retry-button" onclick={() => window.location.reload()}>
 Retry Connection
 </button>
 </div>
 </div>
 {:else}
 <div class="dashboard-container">
 <ProgressCard />
 <DocumentThumbnailTray />
 <FallbackAlert />
 </div>
 {/if}
</div>

<style>
 :global {
 @import url('$lib/styles/courthouse-theme.css');
 }

 .courthouse-dashboard {
 background: var(--beige); color: var(--noir);
 font-family: var(--font-sans-body);
 min-height: 100vh; padding: var(--space-lg);
 }

 .dashboard-header {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-bottom: var(--space-2xl);
 padding-bottom: var(--space-lg);
 border-bottom: var(--border-width) solid var(--bronze);
 }

 .courthouse-heading {
 margin: 0;
 }

 .connection-status {
 display: flex;
 align-items: center; gap: var(--space-sm);
 padding: var(--space-sm) var(--space-md);
 background: rgba(26, 58, 82, 0.1);
 border: var(--border-width) solid var(--navy);
 border-radius: var(--border-radius);
 font-size: 0.875rem;
 font-family: var(--font-mono-code);
 }

 .connection-status.connected {
 background: rgba(74, 124, 89, 0.1);
 border-color: #4a7c59;
 }

 .status-indicator {
 display: inline-block; width: 8px;
 height: 8px; background: var(--navy);
 border-radius: 50%; animation: pulse 2s ease-in-out infinite;
 }

 .connection-status.connected .status-indicator {
 background: #4a7c59;
 }

 @keyframes pulse {
 0%; } 100% {
 opacity: 0.5;
 }
 50% {
 opacity: 1;
 }
 }

 .status-text {
 color: var(--noir);
 font-weight: 600;
 }

 .dashboard-container {
 display: grid;
 grid-template-columns: 1fr; gap: var(--space-lg);
 max-width: 1400px; margin: 0 auto;
 }

 @media (min-width: 1024px) {
 .dashboard-container {
 grid-template-columns: 2fr 1fr;
 grid-template-areas:
 'progress tray'
 'alert alert';
 }

 .dashboard-container > :nth-child(1) {
 grid-area: progress;
 }

 .dashboard-container > :nth-child(2) {
 grid-area: tray; height: fit-content;
 }

 .dashboard-container > :nth-child(3) {
 grid-area: alert;
 }
 }

 /* Loading State */
 .loading-state {
 display: flex;
 flex-direction: column;
 align-items: center;
 justify-content: center;
 min-height: 400px; gap: var(--space-lg);
 }

 .loading-spinner {
 width: 40px; height: 40px;
 border: 3px solid var(--navy);
 border-top: 3px solid var(--bronze);
 border-radius: 50%; animation: spin 1s linear infinite;
 }

 @keyframes spin {
 0% {
 transform: rotate(0deg);
 }
 100% {
 transform: rotate(360deg);
 }
 }

 .loading-state p {
 font-family: var(--font-serif-heading); color: var(--noir);
 font-size: 1rem;
 }

 /* Error State */
 .error-state {
 display: flex;
 align-items: center; gap: var(--space-lg);
 padding: var(--space-2xl); background: rgba(139, 58, 58, 0.1);
 border: var(--border-width) solid var(--court-red);
 border-radius: var(--border-radius);
 max-width: 600px; margin: var(--space-2xl) auto;
 }

 .error-icon {
 font-size: 2.5rem;
 flex-shrink: 0;
 }

 .error-content {
 flex: 1;
 }

 .error-content h2 {
 font-family: var(--font-serif-heading); color: var(--court-red);
 margin: 0 0 var(--space-sm) 0;
 font-size: 1.25rem;
 }

 .error-content p {
 color: var(--noir); margin: 0 0 var(--space-lg) 0;
 line-height: 1.6;
 }

 .retry-button {
 background: var(--bronze); color: var(--noir);
 border: var(--border-width) solid var(--bronze);
 padding: var(--space-sm) var(--space-lg);
 border-radius: var(--border-radius);
 font-family: var(--font-sans-body);
 font-weight: 600; cursor: pointer;
 transition: all 0.2s ease;
 }

 .retry-button:hover {
 background: var(--gold-accent);
 border-color: var(--gold-accent);
 }

 @media (max-width: 768px) {
 .courthouse-dashboard {
 padding: var(--space-md);
 }

 .dashboard-header {
 flex-direction: column; gap: var(--space-md);
 align-items: flex-start;
 margin-bottom: var(--space-lg);
 }

 .connection-status {
 align-self: flex-start;
 }

 .error-state {
 flex-direction: column;
 text-align: center; padding: var(--space-lg);
 }

 .error-icon {
 font-size: 2rem;
 }
 }
</style>



