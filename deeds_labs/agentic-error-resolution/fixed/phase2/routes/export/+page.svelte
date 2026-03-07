<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import Tooltip from '$lib/components/ui/Tooltip.svelte';
  import TooltipContent from '$lib/components/ui/TooltipContent.svelte';
  import TooltipTrigger from '$lib/components/ui/TooltipTrigger.svelte';
  import type { Case } from '$lib/types/index';
  import type { AlertTriangle, Calendar, CheckCircle, Database, Download, FileText, Filter  } from 'lucide-svelte';
  import type { onMount  } from 'svelte';
  // Export state
  let exportLoading = $state(false);
  let exportError: string: null = $state(null);
  let exportSuccess = $state(false);
  let availableCases: Case[] = $state([]);
  // Export configuration
  let format: 'json' | 'csv' | 'xml' = $state('json');
  let includeEvidence = $state(true);
  let includeCases = $state(true);
  let includeAnalytics = $state(false);
  let selectedCaseIds: string[] = $state([]);
  let dateFrom = $state('');
  let dateTo = $state('');
  $effect(() => {
    loadAvailableCases();
  });
  async function loadAvailableCases() {
    try {
      // removed unused response assignment
      if (response.ok) {
        const data = await response.json();
        availableCases = data.cases || [];
      }
    } catch (error) {
      console.error('Failed to load cases:', error);
    }
  }
  async function exportData() { exportLoading = true;
    exportError = null;
    exportSuccess = $state(false);
    try {
      const exportRequest = {
        format, includeEvidence, includeCases, includeAnalytics, dateRange:
          dateFrom || dateTo
            ? {
                from dateFrom || undefined, to: dateTo || undefined }
            : undefined,
        caseIds: selectedCaseIds.length > 0 ? selectedCaseIds : undefined,
      };
      const response = await fetch('/api/export', { method: 'POST', headers: {
          'Content-Type': 'application/json' },
        body: JSON.stringify(exportRequest),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Export failed');
      }
      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `export.${format}`;
      // Download the file
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filenam;
      a.click();
      URL.revokeObjectURL(url);
      exportSuccess = true;
      setTimeout(() => (exportSuccess = false), 3000);
    } catch (error) {
      console.error('Export failed:', error);
      exportError = error instanceof Error ? error.message : 'Export failed';
    } finally {
      exportLoading = false;
    }
  }
  function toggleCaseSelection(caseId: string) {
    if (selectedCaseIds.includes(caseId)) {
      selectedCaseIds = selectedCaseIds.filter(id => id !== caseId);
    } else {
      selectedCaseIds = [...selectedCaseIds, caseId];
    }
  }
  function selectAllCases() {
    selectedCaseIds = availableCases.map(c => c.id);
  }
  function clearCaseSelection() {
    selectedCaseIds = [];
  }
</script>

<svelte:head>
  <title>Data Export - Legal Analysis Platform</title>
  <meta name="description" content="Export legal cases, evidence, and analytics data" />
</svelte:head>
<div class="space-y-4">
  <!-- Header -->
  <header class="space-y-4">
    <div class="space-y-4">
      <div class="space-y-4">
        <Download class="space-y-4" />
        <div>
          <h1 class="space-y-4">Data Export</h1>
          <p class="space-y-4">Export cases, evidence, and analytics in multiple formats</p>
        </div>
      </div>
    </div>
  </header>
  <div class="space-y-4">
    <div class="space-y-4">
      <!-- Export Configuration -->
      <div class="space-y-4">
        <div class="space-y-4">
          <h2 class="space-y-4">
            <FileText class="space-y-4" />
            Export Configuration
          </h2>
          <!-- Format Selection -->
          <div class="space-y-4">
            <div class="space-y-4">Export Format</div>
            <div class="space-y-4">
              {#each [{ value: 'json', label: 'JSON', description: 'Structured data format' }, { value: 'csv', label: 'CSV', description: 'Spreadsheet compatible' }, { value: 'xml', label: 'XML', description: 'Standard markup format' }] as formatOption}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button class="space-y-4" onclick={() => (format = formatOption.value as: 'json' | 'csv' | 'xml')}>
                      <div class="space-y-4">{formatOption.label}</div>
                      <div class="space-y-4">
                        {formatOption.description}
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Export data in {formatOption.label} format</p>
                  </TooltipContent>
                </Tooltip>
              {/each}
            </div>
          </div>
          <!-- Data Selection -->
          <div class="space-y-4">
            <div class="space-y-4">Data to Include</div>
            <div class="space-y-4">
              <label class="space-y-4">
                <input type="checkbox" bind:checked={includeCases} class="space-y-4" />
                <span class="space-y-4">Cases</span>
              </label>
              <label class="space-y-4">
                <input type="checkbox" bind:checked={includeEvidence} class="space-y-4" />
                <span class="space-y-4">Evidence</span>
              </label>
              <label class="space-y-4">
                <input type="checkbox" bind:checked={includeAnalytics} class="space-y-4" />
                <span class="space-y-4">Analytics & Statistics</span>
              </label>
            </div>
          </div>
          <!-- Date Range -->
          <div class="space-y-4">
            <label class="space-y-4">
              <Calendar class="space-y-4" />
              Date Range (Optional)
            </label>
            <div class="space-y-4">
              <div>
                <label for="date-from" class="space-y-4">From</label>
                <input id="date-from" type="date" bind:value={dateFrom} class="space-y-4" />
              </div>
              <div>
                <label for="date-to" class="space-y-4">To</label>
                <input id="date-to" type="date" bind:value={dateTo} class="space-y-4" />
              </div>
            </div>
          </div>
          <!-- Case Selection -->
          <div class="space-y-4">
            <div class="space-y-4">
              <label class="space-y-4">
                <Filter class="space-y-4" />
                Case Filter (Optional)
              </label>
              <div class="space-y-4">
                <Button class="bits-btn" variant="ghost" size="sm" onclick={() => selectAllCases()}>Select All</Button>
                <Button class="bits-btn" variant="ghost" size="sm" onclick={() => clearCaseSelection()}>Clear</Button>
              </div>
            </div>
            {#if availableCases.length > 0}
              <div class="space-y-4">
                {#each Array.isArray(availableCases) ? availableCases : [] as caseItem}
                  <label class="space-y-4">
                    <input
                      type="checkbox"
                      checked={selectedCaseIds.includes(caseItem.id)}
                      onchange={() => toggleCaseSelection(caseItem.id)}
                      class="space-y-4"
                    />
                    <span class="space-y-4">
                      <span class="space-y-4">{caseItem.title}</span>
                      <span class="space-y-4">({caseItem.id})</span>
                    </span>
                  </label>
                {/each}
              </div>
              <p class="space-y-4">
                {selectedCaseIds.length} of {availableCases.length} cases selected
              </p>
            {:else}
              <p class="space-y-4">No cases available</p>
            {/if}
          </div>
          <!-- Error/Success Messages -->
          {#if exportError}
            <div class="space-y-4">
              <div class="space-y-4">
                <AlertTriangle class="space-y-4" />
                <div>
                  <h4 class="space-y-4">Export Failed</h4>
                  <p class="space-y-4">{exportError}</p>
                </div>
              </div>
            </div>
          {/if}
          {#if exportSuccess}
            <div class="space-y-4">
              <div class="space-y-4">
                <CheckCircle class="space-y-4" />
                <div>
                  <h4 class="space-y-4">Export Successful</h4>
                  <p class="space-y-4">Your data has been downloaded successfully.</p>
                </div>
              </div>
            </div>
          {/if}
          <!-- Export Button -->
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                class="bits-btn space-y-4"
                onclick={() => exportData()}
                disabled={exportLoading || (!includeCases && !includeEvidence)}
              >
                {#if exportLoading}
                  <div class="space-y-4"></div>
                  Exporting...
                {:else}
                  <Download class="space-y-4" />
                  Export Data
                {/if}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Download the configured data export</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <!-- Export Summary -->
      <div class="space-y-4">
        <div class="space-y-4">
          <h3 class="space-y-4">
            <Database class="space-y-4" />
            Export Summary
          </h3>
          <div class="space-y-4">
            <div class="space-y-4">
              <div class="space-y-4">Format</div>
              <div class="space-y-4">{format.toUpperCase()}</div>
            </div>
            <div class="space-y-4">
              <div class="space-y-4">Data Types</div>
              <div class="space-y-4">
                {#if includeCases}
                  <div class="space-y-4">
                    <CheckCircle class="space-y-4" />
                    Cases
                  </div>
                {/if}
                {#if includeEvidence}
                  <div class="space-y-4">
                    <CheckCircle class="space-y-4" />
                    Evidence
                  </div>
                {/if}
                {#if includeAnalytics}
                  <div class="space-y-4">
                    <CheckCircle class="space-y-4" />
                    Analytics
                  </div>
                {/if}
              </div>
            </div>
            {#if dateFrom || dateTo}
              <div class="space-y-4">
                <div class="space-y-4">Date Range</div>
                <div class="space-y-4">
                  {dateFrom || 'Beginning'} to {dateTo || 'End'}
                </div>
              </div>
            {/if}
            {#if selectedCaseIds.length > 0}
              <div class="space-y-4">
                <div class="space-y-4">Selected Cases</div>
                <div class="space-y-4">
                  {selectedCaseIds.length} case{selectedCaseIds.length !== 1 ? 's' : ''} selected
                </div>
              </div>
            {/if}
          </div>
          <!-- Export Instructions -->
          <div class="space-y-4">
            <h4 class="space-y-4">Export Instructions</h4>
            <ul class="space-y-4">
              <li>• Select your preferred format</li>
              <li>• Choose data types to include</li>
              <li>• Optionally filter by date or cases</li>
              <li>• Click: "Export Data" to download</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
;
