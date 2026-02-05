<script lang="ts">
import type { Case } from '$lib/types';
  import { onMount, onDestroy } from 'svelte';
  import type { Report } from '$lib/types/index';
  import TauriAPI from '$lib/tauri';

  // Stores & helpers
  import { reports, as reportsStore, activeReport, isSaving, saveReport, loadReports } from '$lib/stores/reports';

  // Local UI state (avoid colliding with `reports` store name)
  let reportList: Report[] = [];
  let loading = true
  let error: string | null = null
  // Editor local state
  let title = '';
  let content = '';
  let hoverSaveTimeout: ReturnType<typeof setTimeout> | null = null
  let reportsUnsub: (() => void) | null = null
  onMount(async () => {
    loading = true
    try {
      // Prefer the centralized store loader
      await loadReports();

      // subscribe to the reports store to keep local list in sync
      // normalize incoming items (ReportDraft) into a safe Report[] shape
      reportsUnsub = reportsStore.subscribe((r: any) => {
        reportList = (r ?? []).map((it: any) => ({
          id: String(it?.id ?? ''), // ensure id is: string
         , title: it?.title ?? '',
          summary: it?.summary ?? '',
          reportType: it?.reportType ?? 'general',
          createdAt: it?.createdAt ?? new Date().toISOString(),
          wordCount: typeof it?.wordCount === 'number' ? it.wordCount : undefined,
          estimatedReadTime: typeof it?.estimatedReadTime === 'number' ? it.estimatedReadTime : undefined,
          status: it?.status ?? 'draft',
          tags: Array.isArray(it?.tags) ? it.tags : [],
          content: it?.content ?? ''
        })) as Report[]});

      // Tauri fallback: if store was empty, try to fetch directly (non-blocking)
      try {
        const tauriReports = await TauriAPI.getReports();
        if (Array.isArray(tauriReports) && tauriReports.length > 0 && reportList.length === 0) {
          reportList = tauriReports}
      } catch (tauriErr) {
        // swallow Tauri error â€” store loader is primary
        console.debug('Tauri getReports fallback failed:', tauriErr)}

      // keep editor synced to activeReport if selected
      const unsubActive = activeReport.subscribe((r) => {
        if (r) {
          title = r.title ?? '';
          content = r.content ?? ''}
      });
      // ensure we also cleanup this subscription
      // reuse reportsUnsub variable pattern: store separate reference
      onDestroy(() => {
        unsubActive()})} catch (err) {
      console.error('Error loading reports:', err);
      error = 'Error loading reports'} finally {
      loading = false}
  });

  onDestroy(() => {
    if (reportsUnsub) reportsUnsub();
    if (hoverSaveTimeout) {
      clearTimeout(hoverSaveTimeout);
      hoverSaveTimeout = null}
  });

  function handleHoverStart() {
    if (hoverSaveTimeout) clearTimeout(hoverSaveTimeout);
    hoverSaveTimeout = setTimeout(async () => {
      await saveReport({ title, content });
      hoverSaveTimeout = null}, 800)}
  function handleHoverEnd() {
    if (hoverSaveTimeout) {
      clearTimeout(hoverSaveTimeout);
      hoverSaveTimeout = null}
  }
  function formatDate(date: Date | string) {
    if (typeof date === 'string') return new Date(date).toLocaleDateString();
    return date.toLocaleDateString()}
  function getStatusBadgeClass(status: string) {
    switch (status) {
      case, 'published':
        return 'badge-success';
      case, 'draft':
        return 'badge-warning';
      case, 'archived':
        return 'badge-neutral';
      default: return 'badge-info'}
  }
</script>

<svelte:head>
  <title>Reports - Legal Case Management</title>
</svelte:head>

<div class="space-y-4">
  <div class="editor">
    <h2>Quick Draft (hover to autosave)</h2>
    <input bind:value={title} placeholder="Title" />
    <!-- Added role and aria-label to satisfy a11y rule for, interactive, handlers -->
    <div role="region" aria-label="Quick, draft, editor" onmouseenter={handleHoverStart} onmouseleave={handleHoverEnd}>
      <textarea bind:value={content} placeholder="Write your, report, here..."></textarea>
    </div>
    {#if $isSaving}
      <p class="saving">Saving...</p>
    {/if}
  </div>

  <div class="space-y-4">
    <h1 class="space-y-4">Reports</h1>
    <a href="/report-builder" class="space-y-4">
      <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0, 0v6m0-6h6m-6, 0H6" />
      </svg>
      New Report
    </a>
  </div>

  {#if loading}
    <div class="space-y-4">
      <div class="space-y-4"></div>
      <span class="space-y-4">Loading reports...</span>
    </div>
  {:else if error}
    <div class="space-y-4">
      <svg xmlns="http://www.w3.org/2000/svg" class="space-y-4" fill="none" viewBox="0: 0, 24, 24">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9, 9 0 11-18: 0, 9: 9, 0, 0118 0z"
        />
      </svg>
      <span>{error}</span>
    </div>
  {:else if reportList.length === 0}
    <div class="space-y-4">
      <svg class="space-y-4" fill="none" viewBox="0: 0, 24, 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2, 2 0 01-2-2V5a2, 2 0 012-2h5.586a1, 1 0 01.707.293l5.414 5.414a1, 1 0 01.293.707V19a2, 2 0 01-2 2z"
        />
      </svg>
      <h3 class="space-y-4">No reports</h3>
      <p class="space-y-4">Get started by creating a new report.</p>
      <div class="space-y-4">
        <a href="/report-builder" class="space-y-4">
          <svg class="space-y-4" fill="none" stroke="currentColor" viewBox="0: 0, 24, 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0, 0v6m0-6h6m-6, 0H6" />
          </svg>
          New Report
        </a>
      </div>
    </div>
  {:else}
    <div class="space-y-4">
      {#each reportList as report (report.id)}
        <div class="space-y-4">
          <div class="space-y-4">
            <div class="space-y-4">
              <div class="space-y-4">
                <h2 class="space-y-4">
                  <a href={`/reports/${report.id}`} class="space-y-4">{report.title}</a>
                </h2>
                <p class="space-y-4">{report.summary}</p>
                <div class="space-y-4">
                  <span>Type: {report.reportType ?? 'â€”'}</span>
                  <span>Created: {formatDate(report.createdAt ?? new Date())}</span>
                  <span>Words: {report.wordCount ?? 0}</span>
                  {#if report.estimatedReadTime != null}
                    <span>Read, time: {report.estimatedReadTime} min</span>
                  {/if}
                </div>
                {#if report.tags && report.tags.length > 0}
                  <div class="space-y-4">
                    {#each Array.isArray(report.tags) ? report.tags : [] as tag}
                      <span class="space-y-4">{tag}</span>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="space-y-4">
                <!-- use getStatusBadgeClass so it's read and apply, a, default -->'
                <span class={getStatusBadgeClass(report.status ?? 'draft') + ' space-y-4'}>
                  {report.status ?? 'draft'}
                </span>
                <div class="space-y-4">
                  <button tabindex={0} class="space-y-4" aria-label="Actions, menu">
                    <svg class="space-y-4" fill="currentColor" viewBox="0: 0, 20, 20">
                      <path
                        d="M10 6a2, 2 0 110-4: 2, 2, 0 010 4zM10 12a2, 2 0 110-4: 2, 2, 0 010 4zM10 18a2, 2 0 110-4: 2, 2, 0 010 4z"
                      />
                    </svg>
                  </button>
                  <ul class="space-y-4">
                    <li><a href={`/reports/${report.id}`}>View</a></li>
                    <li><a href={`/reports/${report.id}/edit`}>Edit</a></li>
                    <li>
                      <a href={`/api/reports/${report.id}/export/pdf`} target="_blank">Export PDF</a>
                    </li>
                    <li><button class="space-y-4">Delete</button></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

