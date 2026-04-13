<!--
  AudioUploadWidget - Real-time audio upload progress tracker
  Integrates with XState v5 machine and SSE progress streaming
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import DocumentChip from './DocumentChip.svelte';

  interface ProgressEvent {
    stage: 'upload' | 'transcription' | 'analysis' | 'indexing' | 'complete' | 'error';
    progress: number; // 0-100
    message: string;
    details?: {
      duration?: number;
      language?: string;
      entities?: number;
      tags?: string[];
    };
  }

  interface Props {
    file: File;
    caseId?: string;
    onprogress?: (event: ProgressEvent) => void;
    oncomplete?: (result: { evidenceId: string; transcription: string; tags: string[] }) => void;
    onerror?: (error: string) => void;
  }

  let {
    file,
    caseId = undefined,
    onprogress = () => {},
    oncomplete = () => {},
    onerror = () => {}
  }: Props = $props();

  let currentStage = $state<ProgressEvent['stage']>('upload');
  let overallProgress = $state(0);
  let stageMessage = $state('Initializing upload...');
  let stageDetails = $state<ProgressEvent['details']>({});
  let isComplete = $state(false);
  let hasError = $state(false);
  let errorMessage = $state('');

  const stageLabels: Record<ProgressEvent['stage'], string> = {
    upload: 'Uploading audio file',
    transcription: 'Transcribing audio',
    analysis: 'Analyzing content',
    indexing: 'Indexing for search',
    complete: 'Processing complete',
    error: 'Error occurred'
  };

  const stageIcons: Record<ProgressEvent['stage'], string> = {
    upload: 'upload',
    transcription: 'mic',
    analysis: 'brain',
    indexing: 'database',
    complete: 'check-circle',
    error: 'alert-circle'
  };

  async function uploadFile() {
    try {
      // Step 1: Upload to server
      const formData = new FormData();
      formData.append('audio', file);
      if (caseId) formData.append('caseId', caseId);

      const uploadResponse = await fetch('/api/audio/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadResponse.ok) {
        throw new Error('Upload failed');
      }

      const { evidenceId } = await uploadResponse.json() as { evidenceId: string };

      // Step 2: Listen to SSE progress stream
      const eventSource = new EventSource(`/api/audio/progress/${evidenceId}`);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ProgressEvent;
          currentStage = data.stage;
          overallProgress = data.progress;
          stageMessage = data.message;
          stageDetails = data.details || {};

          onprogress(data);

          if (data.stage === 'complete') {
            isComplete = true;
            eventSource.close();
            oncomplete({
              evidenceId,
              transcription: data.message,
              tags: data.details?.tags || []
            });
          } else if (data.stage === 'error') {
            hasError = true;
            errorMessage = data.message;
            eventSource.close();
            onerror(data.message);
          }
        } catch (err) {
          console.error('Failed to parse progress event:', err);
        }
      };

      eventSource.onerror = () => {
        hasError = true;
        errorMessage = 'Connection to server lost';
        eventSource.close();
        onerror(errorMessage);
      };

      // Cleanup on unmount
      return () => {
        eventSource.close();
      };
    } catch (err) {
      hasError = true;
      errorMessage = err instanceof Error ? err.message : 'Upload failed';
      onerror(errorMessage);
    }
  }

  onMount(() => {
    const cleanup = uploadFile();
    return async () => {
      const fn = await cleanup;
      fn?.();
    };
  });
</script>

<div class="border border-sand/20 rounded-lg bg-panel p-4 space-y-4">
  <!-- File Info -->
  <div class="flex items-start justify-between">
    <DocumentChip
      fileName={file.name}
      fileSize={file.size}
      fileType={file.type}
      disabled
    />

    {#if isComplete}
      <div class="flex items-center gap-1 text-sm text-green-600">
        <Icon name="check-circle" class="w-4 h-4" />
        <span>Complete</span>
      </div>
    {:else if hasError}
      <div class="flex items-center gap-1 text-sm text-danger">
        <Icon name="alert-circle" class="w-4 h-4" />
        <span>Error</span>
      </div>
    {/if}
  </div>

  <!-- Progress Stages -->
  <div class="space-y-3">
    {#each ['upload', 'transcription', 'analysis', 'indexing'] as stage}
      {@const isCurrentStage = currentStage === stage}
      {@const isPastStage = ['upload', 'transcription', 'analysis', 'indexing'].indexOf(currentStage) > ['upload', 'transcription', 'analysis', 'indexing'].indexOf(stage)}
      {@const isFutureStage = !isCurrentStage && !isPastStage}

      <div class="flex items-center gap-3">
        <!-- Icon -->
        <div
          class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center transition-all"
          class:bg-info={isCurrentStage}
          class:bg-green-500={isPastStage}
          class:bg-sand/10={isFutureStage}
          class:text-white={isCurrentStage || isPastStage}
          class:text-sand/40={isFutureStage}
        >
          {#if isCurrentStage}
            <Icon name="loader-2" class="w-4 h-4 animate-spin" />
          {:else if isPastStage}
            <Icon name="check" class="w-4 h-4" />
          {:else}
            <Icon name={stageIcons[stage as ProgressEvent['stage']]} class="w-4 h-4" />
          {/if}
        </div>

        <!-- Label -->
        <div class="flex-1">
          <p
            class="text-sm font-medium transition-colors"
            class:text-info={isCurrentStage}
            class:text-sand={isPastStage}
            class:text-sand/60={isFutureStage}
          >
            {stageLabels[stage as ProgressEvent['stage']]}
          </p>
          {#if isCurrentStage && stageMessage}
            <p class="text-xs text-sand/60 mt-0.5">{stageMessage}</p>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <!-- Overall Progress Bar -->
  {#if !isComplete && !hasError}
    <div class="space-y-2">
      <div class="w-full h-2 bg-sand/10 rounded-full overflow-hidden">
        <div
          class="h-full bg-info transition-all duration-300"
          style="width: {overallProgress}%"
        ></div>
      </div>
      <p class="text-xs text-sand/60 text-center">
        {Math.round(overallProgress)}% complete
      </p>
    </div>
  {/if}

  <!-- Stage Details -->
  {#if stageDetails && Object.keys(stageDetails).length > 0}
    <div class="border-t border-sand/10 pt-3 space-y-2">
      {#if stageDetails.duration}
        <div class="text-sm">
          <span class="text-sand/60">Duration:</span>
          <span class="ml-2 font-medium">{Math.round(stageDetails.duration)}s</span>
        </div>
      {/if}
      {#if stageDetails.language}
        <div class="text-sm">
          <span class="text-sand/60">Language:</span>
          <span class="ml-2 font-medium">{stageDetails.language}</span>
        </div>
      {/if}
      {#if stageDetails.entities}
        <div class="text-sm">
          <span class="text-sand/60">Entities Found:</span>
          <span class="ml-2 font-medium">{stageDetails.entities}</span>
        </div>
      {/if}
      {#if stageDetails.tags && stageDetails.tags.length > 0}
        <div class="text-sm">
          <span class="text-sand/60">Tags:</span>
          <div class="mt-1 flex flex-wrap gap-1">
            {#each stageDetails.tags as tag}
              <span class="px-2 py-0.5 bg-sand/10 rounded text-xs">{tag}</span>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Error Message -->
  {#if hasError}
    <div class="border border-danger/30 bg-danger/5 rounded p-3 flex items-start gap-2">
      <Icon name="alert-circle" class="w-4 h-4 text-danger flex-shrink-0 mt-0.5" />
      <div class="text-sm text-danger">
        <p class="font-medium">Processing failed</p>
        <p class="mt-1 text-danger/80">{errorMessage}</p>
      </div>
    </div>
  {/if}
</div>