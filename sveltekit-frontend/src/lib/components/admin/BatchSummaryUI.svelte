<script lang="ts">
  import { onMount } from 'svelte';
  import { batchSummarizer } from '$lib/client/batch-summarizer';

  interface SummaryJob {
    job_id: string;
    feature_label: string;
    tuple_count: number;
    status: 'idle' | 'processing' | 'complete' | 'error';
    progress: number;
    error?: string;
  }

  let jobs: SummaryJob[] = [];
  let selectedJob: SummaryJob | null = null;
  let isProcessing = false;
  let totalProcessed = 0;
  let totalJobs = 0;
  let status = $state('Ready');
  let startTime: number | null = null;

  onMount(async () => {
    // Load bounded summary job manifest
    await loadJobs();
  });

  async function loadJobs() {
    try {
      const response = await fetch('/api/batch-summary/jobs');
      const data = await response.json();

      jobs = data.jobs.slice(0, 20).map((job: any) => ({
        job_id: job.job_id,
        feature_label: job.feature_label,
        tuple_count: job.tuple_count,
        status: 'idle' as const,
        progress: 0
      }));

      totalJobs = jobs.length;
      status = `Loaded ${totalJobs} jobs`;
    } catch (error) {
      status = `Error loading jobs: ${(error as Error).message}`;
    }
  }

  async function processAllJobs() {
    if (isProcessing) return;

    isProcessing = true;
    startTime = Date.now();
    totalProcessed = 0;

    try {
      await batchSummarizer.initialize();
      status = '✅ Browser ONNX initialized';

      for (const job of jobs) {
        if (job.status !== 'idle') continue;

        selectedJob = job;
        job.status = 'processing';

        try {
          // Simulate tuple data (in production, fetch from API)
          const tuples = Array.from({ length: Math.min(job.tuple_count, 20) }, (_, i) => ({
            id: `${job.job_id}-tuple-${i}`,
            content: `${job.feature_label} - tuple ${i} of ${job.tuple_count}`
          }));

          // Process with browser ONNX
          status = `Processing ${job.feature_label}...`;
          const hints = await batchSummarizer.processBatch(
            job.job_id,
            tuples,
            (completed, total) => {
              job.progress = Math.round((completed / total) * 100);
              status = `${job.feature_label}: ${job.progress}%`;
            }
          );

          // Cache locally
          await batchSummarizer.cacheHints(hints);

          // Submit to server for validation + queueing
          await batchSummarizer.submitHints(hints);

          job.status = 'complete';
          totalProcessed++;
        } catch (error) {
          job.status = 'error';
          job.error = (error as Error).message;
          status = `Error: ${job.error}`;
        }

        // Small delay between jobs
        await new Promise(r => setTimeout(r, 500));
      }

      const elapsed = Date.now() - (startTime || 0);
      status = `✅ Completed ${totalProcessed}/${totalJobs} jobs in ${(elapsed / 1000).toFixed(1)}s`;
    } catch (error) {
      status = `Fatal error: ${(error as Error).message}`;
    } finally {
      isProcessing = false;
    }
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'complete': return 'bg-green-100 text-green-900';
      case 'processing': return 'bg-blue-100 text-blue-900';
      case 'error': return 'bg-red-100 text-red-900';
      default: return 'bg-gray-100 text-gray-900';
    }
  }
</script>

<div class="space-y-6 p-6">
  <div class="rounded-lg border border-gray-300 bg-white p-6 shadow-sm">
    <h2 class="mb-4 text-2xl font-bold">Batch Summary Pipeline</h2>

    <div class="mb-6 rounded bg-blue-50 p-4">
      <p class="text-sm text-gray-700">
        <strong>Browser ONNX + WebGPU</strong> classifies tuples client-side to reduce server load.
        Server Gemma4 validates hints and produces canonical summaries.
      </p>
    </div>

    <div class="mb-6 space-y-2">
      <div class="flex justify-between text-sm">
        <span class="font-medium">Status:</span>
        <span class="text-gray-600">{status}</span>
      </div>
      <div class="flex justify-between text-sm">
        <span class="font-medium">Progress:</span>
        <span class="text-gray-600">{totalProcessed}/{totalJobs}</span>
      </div>
      {#if startTime}
        <div class="flex justify-between text-sm">
          <span class="font-medium">Elapsed:</span>
          <span class="text-gray-600">
            {((Date.now() - startTime) / 1000).toFixed(1)}s
          </span>
        </div>
      {/if}
    </div>

    <button
      on:click={processAllJobs}
      disabled={isProcessing}
      class="w-full rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
    >
      {isProcessing ? '⏳ Processing...' : '▶️ Start Batch Processing'}
    </button>
  </div>

  {#if selectedJob}
    <div class="rounded-lg border border-gray-300 bg-white p-6 shadow-sm">
      <h3 class="mb-4 font-bold">Current Job: {selectedJob.feature_label}</h3>
      <div class="mb-4 space-y-2">
        <div class="flex justify-between text-sm">
          <span>Progress:</span>
          <span>{selectedJob.progress}%</span>
        </div>
        <div class="h-2 w-full bg-gray-200 rounded">
          <div
            class="h-full bg-blue-600 rounded transition-all"
            style="width: {selectedJob.progress}%"
          />
        </div>
      </div>
    </div>
  {/if}

  <div class="rounded-lg border border-gray-300 bg-white shadow-sm">
    <div class="border-b border-gray-300 px-6 py-4">
      <h3 class="font-bold">Jobs ({jobs.length})</h3>
    </div>
    <div class="divide-y divide-gray-200">
      {#each jobs as job}
        <div class="flex items-center justify-between px-6 py-3">
          <div class="flex-1">
            <div class="text-sm font-medium">{job.feature_label}</div>
            <div class="text-xs text-gray-600">{job.tuple_count} tuples</div>
          </div>
          <div class="flex items-center space-x-3">
            <div class="w-24 text-right">
              <div class="text-xs font-medium">{job.progress}%</div>
            </div>
            <div class={`rounded px-2 py-1 text-xs font-medium ${getStatusColor(job.status)}`}>
              {job.status}
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  :global(body) {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>
