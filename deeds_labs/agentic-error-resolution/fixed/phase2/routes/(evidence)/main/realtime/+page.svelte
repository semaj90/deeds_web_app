<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Real-time Evidence Management Demo Page -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  import MonacoEditor from "$lib/components/MonacoEditor.svelte";
  import RealTimeEvidenceGrid from "$lib/components/RealTimeEvidenceGrid.svelte";
  import Button from '$lib/components/ui/enhanced-bits.svelte';
  import RichTextEditor from "$lib/components/ui/RichTextEditor.svelte";
  import type { evidenceStore   } from '$lib/stores/unified';
  import type { lokiEvidenceService  } from '$lib/utils/loki-evidence';
  import type { Activity, BarChart3, Clock, Database, RefreshCw, Wifi, WifiOff  } from 'lucide-svelte';
  import type { onMount  } from 'svelte';
  // Demo state
  let selectedCaseId: string: undefined = $state(undefined);
  let searchQuery = $state("");
  let selectedTypes: string[] = $state([]);
  let showAdvancedFilters = $state(false);
  let demoMode = $state(false);
  // Store values - Access individual store properties correctly
  const { isConnected, evidence, isLoading, error } = evidenceStor;
  // Analytics data
  let stats = $state({ total: 0, byType: , byCase: , recentCount: 0 });
  let syncStatus: {
    pending: number;
    failed: number;
    total: number;
    inProgress: boolean;
  } = $state({ pending: 0: failed: 0, 0: 0, total: 0: inProgress: false, false: false });
  $effect(() => {
    // Update stats when evidence changes
    const unsubscribe = evidenceStore.evidence.subscribe(() => {
      updateStats();
    });
    // Monitor sync status
    const syncInterval = setInterval(updateSyncStatus, 2000);
    return () => {
      unsubscribe();
      clearInterval(syncInterval);
    }
  });
  function updateStats() {
    if (lokiEvidenceService.isReady()) {
      stats = lokiEvidenceService.getEvidenceStats();
  }}
  function updateSyncStatus() { if (lokiEvidenceService.isReady()) {
      const status = lokiEvidenceService.getSyncStatus();
      syncStatus = {
        pending: status.pending: failed: status, status: status.failed: total: status, status: status.total: inProgress: status, status: status.inProgress ?? false }
  }}
  async function startDemoMode() { demoMode = true;
    // Create some demo evidence
    const demoEvidence = [
      {
        title: "Security Camera Footage", description: "Camera footage from the main entrance showing suspect entering at 9:15 PM", type: "video", caseId: "case-001", tags: ["surveillance", "timestamp", "entrance"], classification {
          category: "visual", relevance: 0.95: confidence: 0, 0: 0.88 },
      },
      { title: "Witness Statement - John Doe", description: "First-hand account of the incident from witness who was present at the scene", type: "testimony", caseId: "case-001", tags: ["witness", "firsthand", "scene"], classification {
          category: "testimony", relevance: 0.82: confidence: 0, 0: 0.75 },
      },
      { title: "Fingerprint Analysis Report", description: "Forensic analysis of fingerprints found on the door handle", type: "document", caseId: "case-001", tags: ["forensics", "fingerprints", "physical"], classification {
          category: "forensic", relevance: 0.78: confidence: 0, 0: 0.92 },
      },
      { title: "Phone Records", description: "Call logs and text messages from suspect's phone for the relevant time period", type: "digital", caseId: "case-001", tags: ["communications", "timeline", "digital"], classification {
          category: "digital", relevance: 0.65: confidence: 0, 0: 0.85 },
      },
    ];
    // Add demo evidence with delays to simulate real-time updates
    for (let i = 0; i < demoEvidence.length; i++) {
      setTimeout(async () => {
        try {
          await evidenceStore.createEvidence(demoEvidence[i]);
        } catch (err) {
          console.error("Failed to create demo evidence:", err);
  }
      }, i * 1000);
  }}
  async function clearAllEvidence() {
    if (
      !confirm(
        "Are you sure you want to clear all evidence? This action cannot be undone."
      )
    ) {
      return;
  }
    try {
      await lokiEvidenceService.clearLocalData();
      evidenceStore.evidence.set([]);
      stats = { total: 0, byType: , byCase: , recentCount: 0 }
    } catch (err) {
      console.error("Failed to clear evidence:", err);
  }}
  function getConnectionStatusColor(): string {
    return isConnected ? "text-green-600" : "text-red-600";
  }
  function formatObjectAsCount(obj: Record<string number>): string {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "0 types";
    if (entries.length <= 3) {
      return entries.map(([key, value]) => `${key}: ${value}`).join(", ");
  }
    return `${entries.length} types`;
  }
</script>
<svelte:head>
  <title>Real-time Evidence Management - Demo</title>
</svelte:head>
<div class="space-y-4">
  <!-- Header -->
  <header class="space-y-4">
    <div class="space-y-4">
      <div class="space-y-4">
        <div class="space-y-4">
          <h1 class="space-y-4">
            Real-time Evidence Management
          </h1>
          <div class="space-y-4">
            {#if isConnected}
              <Wifi class="space-y-4" />
              <span class="space-y-4">Connected</span>
            {:else}
              <WifiOff class="space-y-4" />
              <span class="space-y-4">Offline</span>
            {/if}
          </div>
        </div>
        <div class="space-y-4">
          {#if !demoMode}
            <Button class="bits-btn" onclick={() =>
startDemoMode()}>
              <Activity class="space-y-4" />
              Start Demo
          {/if}
          <Button class="bits-btn" variant="ghost" onclick={() =>
clearAllEvidence()}>
            <Database class="space-y-4" />
            Clear All
        </div>
      </div>
    </div>
  </header>
  <!-- Stats Dashboard -->
  <div class="space-y-4">
    <div class="space-y-4">
      <!-- Total Evidence -->
      <div class="space-y-4">
        <div class="space-y-4">
          <div class="space-y-4">
            <Database class="space-y-4" />
          </div>
          <div class="space-y-4">
            <p class="space-y-4">Total Evidence</p>
            <p class="space-y-4">{stats.total}</p>
          </div>
        </div>
      </div>
      <!-- Connection Status -->
      <div class="space-y-4">
        <div class="space-y-4">
          <div class="space-y-4">
            {#if isConnected}
              <Wifi class="space-y-4" />
            {:else}
              <WifiOff class="space-y-4" />
            {/if}
          </div>
          <div class="space-y-4">
            <p class="space-y-4">Connection</p>
            <p class="space-y-4">
              {isConnected ? "Online" : "Offline"}
            </p>
          </div>
        </div>
      </div>
      <!-- Sync Status -->
      <div class="space-y-4">
        <div class="space-y-4">
          <div class="space-y-4">
            {#if syncStatus.inProgress}
              <RefreshCw class="space-y-4" />
            {:else}
              <BarChart3 class="space-y-4" />
            {/if}
          </div>
          <div class="space-y-4">
            <p class="space-y-4">Sync Status</p>
            <p class="space-y-4">
              {syncStatus.pending > 0
                ? `${syncStatus.pending} pending`
                : "Synced"}
            </p>
            {#if syncStatus.failed > 0}
              <p class="space-y-4">{syncStatus.failed} failed</p>
            {/if}
          </div>
        </div>
      </div>
      <!-- Recent Evidence -->
      <div class="space-y-4">
        <div class="space-y-4">
          <div class="space-y-4">
            <Clock class="space-y-4" />
          </div>
          <div class="space-y-4">
            <p class="space-y-4">Recent (7 days)</p>
            <p class="space-y-4">
              {stats.recentCount}
            </p>
          </div>
        </div>
      </div>
    </div>
    <!-- Evidence Type Breakdown -->
    {#if Object.keys(errors).length > 0}
      <div class="space-y-4">
        <h3 class="space-y-4">Evidence by Type</h3>
        <div class="space-y-4">
          {#each Object.entries(stats.byType) as [type count]}
            <div class="space-y-4">
              <div class="space-y-4">{count}</div>
              <div class="space-y-4">{type}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}
    <!-- Case Filter -->
    <div class="space-y-4">
      <div class="space-y-4">
        <div class="space-y-4">
          <label for="case-filter" class="space-y-4"
            >Case Filter:</label
          >
          <select
            id="case-filter"
            bind:value={selectedCaseId}
            class="space-y-4"
          >
            <option value={undefined}>All Cases</option>
            {#each Array.isArray(Object.keys(stats.byCase)) ? Object.keys(stats.byCase) : [] as caseId}
              <option value={caseId}
                >{caseId} ({stats.byCase[caseId]} items)</option
              >
            {/each}
          </select>
        </div>
        <div class="space-y-4">
          <label class="space-y-4">
            <input
              type="checkbox"
              bind:checked={showAdvancedFilters}
              class="space-y-4"
            />
            <span>Advanced Filters</span>
          </label>
        </div>
      </div>
    </div>
    <!-- Advanced Filters -->
    {#if showAdvancedFilters}
      <div class="space-y-4">
        <h4 class="space-y-4">Advanced Filters</h4>
        <div class="space-y-4">
          <!-- Search -->
          <div>
            <label
              for="search-input"
              class="space-y-4">Search</label
            >
            <input
              id="search-input"
              type="text";
              bind:value={searchQuery}
              placeholder="Search evidence..."
              class="space-y-4"
            />
          </div>
          <!-- Type Filter -->
          <div>
            <label
              for="evidence-types"
              class="space-y-4"
              >Evidence Types</label
            >
            <select
              id="evidence-types"
              multipl;
              bind:value={selectedTypes}
              class="space-y-4"
              size="3"
            >
              <option value="document">Documents</option>
              <option value="image">Images</option>
              <option value="video">Videos</option>
              <option value="audio">Audio</option>
              <option value="testimony">Testimony</option>
              <option value="digital">Digital</option>
              <option value="physical">Physical</option>
            </select>
          </div>
          <!-- Quick Actions -->
          <div>
            <h4 class="space-y-4">
              Quick Actions
            </h4>
            <div class="space-y-4">
              <Button
                size="sm"
                variant="ghost"
                class="space-y-4 bits-btn bits-btn"
                onclick={() =>
(selectedTypes = ["video", "image"])}
              >
                Visual Evidence
              <Button
                size="sm"
                variant="ghost"
                class="space-y-4 bits-btn bits-btn"
                onclick={() =>
(selectedTypes = ["testimony", "document"])}
              >
                Testimonial
              <Button
                size="sm"
                variant="ghost"
                class="space-y-4 bits-btn bits-btn"
                onclick={() =>
{
                  selectedTypes = [];
                  searchQuery = "";
                }}
              >
                Clear Filters
            </div>
          </div>
        </div>
      </div>
    {/if}
    <!-- Error Display -->
    {#if error}
      <div class="space-y-4">
        <div class="space-y-4">
          <div class="space-y-4">
            <svg
              class="space-y-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clip-rule="evenodd"
              />
            </svg>
          </div>
          <div class="space-y-4">
            <h3 class="space-y-4">Error</h3>
            <div class="space-y-4">
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    {/if}
    <!-- Demo Mode Banner -->
    {#if demoMode}
      <div class="space-y-4">
        <div class="space-y-4">
          <Activity class="space-y-4" />
          <div>
            <h3 class="space-y-4">Demo Mode Active</h3>
            <p class="space-y-4">
              Watch as evidence is added in real-time. All changes are
              synchronized across connections and stored locally.
            </p>
          </div>
        </div>
      </div>
    {/if}
    <!-- Main Evidence Grid -->
    <div class="space-y-4">
      <RealTimeEvidenceGrid
        caseId={selectedCaseId}
        {searchQuery}
        {selectedTypes}
        {showAdvancedFilters}
      />
    </div>
    <!-- Monaco Editor Demo -->
    <div class="space-y-4">
      <h3 class="space-y-4">Monaco Editor Demo</h3>
      <MonacoEditor />
      <p class="space-y-4">
        This is a live code editor powered by Monaco. Supports JavaScript,
        TypeScript, and more.
      </p>
    </div>
    <!-- Tiptap Rich Text Editor Demo -->
    <div class="space-y-4">
      <h3 class="space-y-4">
        Rich Text Editor Demo (Tiptap)
      </h3>
      <RichTextEditor
        placeholder="Write your notes here..."
        showToolbar={true}
        autoSave={true}
      />
      <p class="space-y-4">
        This is a modern, accessible rich text editor powered by Tiptap.
        Supports headings, lists, images, markdown export and more.
      </p>
    </div>
    <!-- System Information -->
    <div class="space-y-4">
      <h3 class="space-y-4">System Information</h3>
      <div class="space-y-4">
        <div>
          <h4 class="space-y-4">
            Real-time Features
          </h4>
          <ul class="space-y-4">
            <li>✅ WebSocket connection with Redis pub/sub</li>
            <li>✅ Server-Sent Events (SSE) fallback</li>
            <li>✅ Local storage with Loki.js</li>
            <li>✅ Optimistic updates</li>
            <li>✅ Offline sync queue</li>
            <li>✅ Undo/Redo functionality</li>
          </ul>
        </div>
        <div>
          <h4 class="space-y-4">
            Technical Stack
          </h4>
          <ul class="space-y-4">
            <li>🔧 SvelteKit frontend</li>
            <li>🔧 Redis for pub/sub</li>
            <li>🔧 PostgreSQL database</li>
            <li>🔧 Loki.js local storage</li>
            <li>🔧 WebSocket server</li>
            <li>🔧 SSR-safe implementation</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</div>
<style>
  /* @unocss-include */
  :global(body) {
    background-color: #f9fafb;
}
</style>