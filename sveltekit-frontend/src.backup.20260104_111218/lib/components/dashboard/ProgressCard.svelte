<script lang="ts">
 import {
 currentPage,
 currentStage,
 documentProgressStore,
 etaSeconds,
 isProcessing,
 overallProgress,
 processingDetails,
 processingStatus,
 totalPages,
 } from '$lib/stores/dashboard/DocumentProgressStore';
 import { formatETA, getStageIcon, getStageLabelLabel } from '$lib/stores/dashboard/GrpcStatusAdapter';
 import { onMount } from 'svelte';

 let documentTitle = $state('');
 let percentage = $state(0);
 let eta = $state('');
 let etaSecondsValue = 0;
 let currentPageNum = $state(0);
 let totalPagesNum = $state(0);
 let stageLabel = $state('');
 let statusMessage = $state('');
 let details = $state('');
 let isProcessingValue = $state(false);
 let stageIcon = $state('');

 onMount(() => {
 // Subscribe to stores
 const unsubscribeProgress = overallProgress.subscribe((value) => {
 percentage = value;
 });

 const unsubscribeStage = currentStage.subscribe((value) => {
 stageLabel = getStageLabelLabel(value);
 stageIcon = getStageIcon(value);
 });

 const unsubscribeEta = etaSeconds.subscribe((value) => {
 etaSecondsValue = value;
 eta = formatETA(value);
 });

 const unsubscribePage = currentPage.subscribe((value) => {
 currentPageNum = value;
 });

 const unsubscribeTotalPages = totalPages.subscribe((value) => {
 totalPagesNum = value;
 });

 const unsubscribeStatus = processingStatus.subscribe((value) => {
 statusMessage = value;
 });

 const unsubscribeDetails = processingDetails.subscribe((value) => {
 details = value;
 });

 const unsubscribeProcessing = isProcessing.subscribe((value) => {
 isProcessingValue = value;
 });

 const unsubscribeDoc = documentProgressStore.subscribe((state) => {
 documentTitle = state.documentTitle;
 });

 return () => {
 unsubscribeProgress();
 unsubscribeStage();
 unsubscribeEta();
 unsubscribePage();
 unsubscribeTotalPages();
 unsubscribeStatus();
 unsubscribeDetails();
 unsubscribeProcessing();
 unsubscribeDoc();
 };
 });
</script>

<div class="progress-card">
 <div class="progress-card-header">
 <div class="progress-card-icon">{stageIcon}</div>
 <h2 class="progress-card-title">{documentTitle || 'Processing Document'}</h2>
 </div>

 <div class="progress-status">
 <p class="progress-status-text">{statusMessage}</p>
 </div>

 <div class="progress-bar-container">
 <div class="progress-bar-fill" style="width: {percentage}%"></div>
 </div>

 <div class="progress-info">
 <div class="progress-percentage">
 <span class="courthouse-metadata">{percentage}%</span>
 </div>
 <div class="progress-eta">
 <span class="courthouse-metadata">ETA: {eta}</span>
 </div>
 </div>

 <div class="progress-stage">
 <div class="stage-info">
 <span class="stage-label">{stageLabel}</span>
 {#if totalPagesNum > 0}
 <span class="stage-page-counter">(Page {currentPageNum}/{totalPagesNum})</span>
 {/if}
 </div>
 </div>

 {#if details}
 <div class="progress-details">
 <span class="courthouse-metadata">{details}</span>
 </div>
 {/if}

 {#if !isProcessingValue && percentage === 100}
 <div class="progress-complete">
 <span class="complete-icon">✓</span>
 <span class="complete-text">Processing Complete</span>
 </div>
 {/if}
</div>

<style>
 .progress-card {
 background: var(--beige);
 border: var(--border-width) solid var(--bronze);
 border-radius: var(--border-radius);
 padding: var(--space-lg);
 box-shadow: var(--shadow-subtle);
 transition: all 0.3s ease;
 }

 .progress-card:hover {
 box-shadow: var(--shadow-medium);
 border-color: var(--navy);
 }

 .progress-card-header {
 display: flex;
 align-items: center;
 gap: var(--space-md);
 margin-bottom: var(--space-lg);
 }

 .progress-card-icon {
 font-size: 1.5rem;
 line-height: 1;
 }

 .progress-card-title {
 font-family: var(--font-serif-heading);
 font-size: 1.125rem;
 font-weight: 600;
 color: var(--noir);
 margin: 0;
 }

 .progress-status {
 margin-bottom: var(--space-md);
 }

 .progress-status-text {
 font-size: 0.875rem;
 color: var(--noir);
 margin: 0;
 opacity: 0.9;
 }

 .progress-bar-container {
 background: var(--progress-background);
 border-radius: 2px;
 height: var(--progress-height);
 overflow: hidden;
 margin: var(--space-md) 0;
 border: var(--border-width) solid var(--navy);
 }

 .progress-bar-fill {
 background: linear-gradient(90deg, var(--bronze), var(--gold-accent));
 height: 100%;
 transition: width 0.3s ease;
 border-radius: 2px;
 }

 .progress-info {
 display: flex;
 justify-content: space-between;
 align-items: center;
 margin-top: var(--space-md);
 font-size: 0.875rem;
 }

 .progress-percentage {
 font-family: var(--font-mono-code);
 font-weight: 600;
 color: var(--noir);
 }

 .progress-eta {
 font-family: var(--font-mono-code);
 color: var(--noir);
 opacity: 0.8;
 }

 .progress-stage {
 font-family: var(--font-serif-heading);
 font-size: 0.875rem;
 color: var(--noir);
 margin-top: var(--space-md);
 padding-top: var(--space-md);
 border-top: var(--border-width) solid var(--bronze);
 }

 .stage-info {
 display: flex;
 gap: var(--space-sm);
 align-items: center;
 }

 .stage-label {
 font-weight: 600;
 }

 .stage-page-counter {
 font-family: var(--font-mono-code);
 font-size: 0.75rem;
 opacity: 0.8;
 }

 .progress-details {
 font-family: var(--font-mono-code);
 font-size: 0.75rem;
 color: var(--noir);
 opacity: 0.7;
 margin-top: var(--space-sm);
 }

 .progress-complete {
 display: flex;
 align-items: center;
 gap: var(--space-sm);
 margin-top: var(--space-lg);
 padding: var(--space-md);
 background: rgba(74, 124, 89, 0.1);
 border: var(--border-width) solid #4a7c59;
 border-radius: var(--border-radius);
 color: #4a7c59;
 font-weight: 600;
 }

 .complete-icon {
 font-size: 1.25rem;
 line-height: 1;
 }

 .complete-text {
 font-family: var(--font-serif-heading);
 }

 @media (max-width: 768px) {
 .progress-card {
 padding: var(--space-md);
 }

 .progress-card-header {
 gap: var(--space-sm);
 }

 .progress-card-title {
 font-size: 1rem;
 }

 .progress-info {
 flex-direction: column;
 gap: var(--space-sm);
 align-items: flex-start;
 }
 }
</style>
