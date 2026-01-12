<script lang="ts">
  import { fade } from 'svelte/transition';
  import type { PageData } from './$types';

  // Svelte 5 Props (Runes)
  let { data }: { data: PageData } = $props();

  // Svelte 5 State (Runes)
  let activeTab = $state('overview');
  let isScanning = $state(false);
  let uploadFiles = $state<FileList | null>(null);
  let processingLog = $state<string[]>([]);
  let processingStatus = $state<'idle' | 'uploading' | 'processing' | 'complete'>('idle');

  // Svelte 5 Derived State
  // Using simple derivation here
  let userName = $derived(data.user?.username?.toUpperCase() ?? 'UNKNOWN');

  function runScan() {
    isScanning = true;
    setTimeout(() => isScanning = false, 2000);
  }

  async function handleUpload(e: Event) {
    e.preventDefault();
    if (!uploadFiles || uploadFiles.length === 0) return;

    processingStatus = 'uploading';
    processingLog = [...processingLog, '> INITIATING SECURE UPLOAD PROTOCOL...'];

    const formData = new FormData();
    for (let i = 0; i < uploadFiles.length; i++) {
      formData.append('files', uploadFiles[i]);
      processingLog = [...processingLog, `> BUFFERING: ${uploadFiles[i].name.toUpperCase()}...`];
    }

    try {
      // Simulate processing steps for UI demo
      await new Promise(r => setTimeout(r, 1000));
      processingStatus = 'processing';

      processingLog = [...processingLog, '> UPLOAD COMPLETE. ENGAGING DOCLING-258M...'];
      await new Promise(r => setTimeout(r, 1500));

      processingLog = [...processingLog, '> OCR/VLM EXTRACTION SUCCESSFUL.'];
      processingLog = [...processingLog, '> DETECTING LANGUAGE (LANGEXTRACT)... EN-US DETECTED.'];
      await new Promise(r => setTimeout(r, 1000));

      processingLog = [...processingLog, '> CHUNKING & STREAMING TO VECTOR INDEX...'];
      processingLog = [...processingLog, '> CALCULATING COSINE RANKINGS...'];
      await new Promise(r => setTimeout(r, 1000));

      processingLog = [...processingLog, '> GENERATING TOPOLOGICAL TOPIC MAP...'];
      processingLog = [...processingLog, '> BATCHING TO GEMMA3-LEGAL...'];

      processingStatus = 'complete';
      processingLog = [...processingLog, '> INGESTION SEQUENCE COMPLETE. ARTIFACTS INDEXED.'];

      // In a real implementation, we would fetch('/api/ingest', { method: 'POST', body: formData })
    } catch (err) {
      processingLog = [...processingLog, `> ERROR: ${ err }`];
      processingStatus = 'idle';
    }
  }
</script>

<!-- "Project Odin" / NES Command Center Layout -->
<div class="screen-nes h-screen overflow-hidden">

  <!-- HEADER -->
  <header class="screen-nes-header border-b-4 border-nes-border pb-4">
    <div>
      <h1 class="screen-nes-title text-nes-accent2">PROJECT: ODIN</h1>
      <div class="screen-nes-subtitle">SUBJECT #8842-XC // {userName}</div>
    </div>

    <!-- NES Status Indicators -->
    <div class="flex gap-4">
      <div class="nes-status text-nes-success">
        <div class="nes-status-dot nes-status-online"></div> SYSTEM ONLINE
      </div>
      <div class="nes-badge-ace">SECURE CONNECTION</div>
    </div>
  </header>

  <!-- MAIN GRID LAYOUT -->
  <main class="grid grid-cols-12 gap-4 h-full pt-4">

    <!-- LEFT SIDEBAR (Subject Profile) -->
    <aside class="col-span-3 flex flex-col gap-4">
      <div class="nes-panel p-0">
        <div class="nes-panel-header">
          <span>ID</span>
          <span>SUBJ_PROFILE</span>
          <span>V1.2</span>
          <span>[X]</span>
        </div>
        <div class="p-4 flex flex-col items-center gap-4">
          <div class="w-32 h-32 border-2 border-nes-muted bg-black/50 flex items-center justify-center">
            <span class="text-4xl">👤</span>
          </div>
          <div class="w-full space-y-2">
            <div class="nes-row px-0 py-1 grid-cols-[1fr_auto]">
              <span class="text-nes-muted">THREAT LVL</span>
              <span class="text-nes-danger animate-pulse">CRITICAL</span>
            </div>
            <div class="nes-row px-0 py-1 grid-cols-[1fr_auto]">
              <span class="text-nes-muted">CLEARANCE</span>
              <span class="text-nes-accent">LEVEL 5</span>
            </div>
            <div class="nes-row px-0 py-1 grid-cols-[1fr_auto]">
              <span class="text-nes-muted">ROLE</span>
              <span class="text-nes-text">{data.user?.role ?? 'INVESTIGATOR'}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <button
        class="nes-btn nes-btn-primary w-full"
        onclick={runScan}
        disabled={isScanning}
      >
        {isScanning ? 'SCANNING...' : 'INITIATE DEEP SCAN'}
      </button>

      <div class="nes-panel p-4 flex-1">
        <div class="text-[10px] text-nes-muted mb-2">SCAN LOGS</div>
        <div class="font-mono text-[9px] text-nes-success space-y-1">
          <div>> CONNECTING TO GRID... OK</div>
          <div>> VERIFYING HASH... OK</div>
          <div>> LOADING MODULES... 100%</div>
          {#if isScanning}
            <div in, fade>> ENCRYPTING DATA STREAM...</div>
            <div in, fade class="animate-pulse">> UPLOADING TO AI CORE...</div>
          {/if}
          {#each processingLog as log}
            <div in, fade>{log}</div>
          {/each}
        </div>
      </div>
    </aside>

    <!-- CENTER DASHBOARD (Evidence Board) -->
    <section class="col-span-9 flex flex-col gap-4">

      <!-- TABS (UnoCSS Grid) -->
      <div class="grid grid-cols-5 gap-2">
        {#each ['overview', 'evidence', 'intercepts', 'terminal', 'ingest'] as tab}
          <button
            class="nes-btn {activeTab === tab ? 'nes-btn-primary' , 'nes-btn-ghost'} uppercase"
            onclick={() => activeTab = tab}
          >
            { tab }
          </button>
        {/each}
      </div>

      <!-- DATA GRID (SSR Data) -->
      <div class="nes-panel flex-1 flex flex-col">
        {#if activeTab === 'ingest'}
          <div class="nes-panel-header bg-nes-accent2/10 text-nes-accent2">
            <span>SECURE INGESTION PROTOCOL</span>
            <span>DOCLING-258M</span>
            <span>GEMMA3-LEGAL</span>
          </div>

          <div class="p-8 flex flex-col gap-8 h-full">
            <!-- Upload Zone -->
            <div class="border-4 border-dashed border-nes-muted rounded-lg p-12 flex flex-col items-center justify-center gap-4 hover, border-nes-accent transition-colors bg-black/20">
              <span class="text-6xl">📂</span>
              <div class="text-center">
                <h3 class="text-xl text-nes-text mb-2">DROP CLASSIFIED MATERIALS HERE</h3>
                <p class="text-nes-muted text-sm">SUPPORTED: PDF, DOCX, MP3, PNG, JPG</p>
              </div>
              <input
                type="file"
                multiple
                class="hidden"
                id="file-upload"
                onchange={(e) => uploadFiles = (e.target as HTMLInputElement).files}
              />
              <label for="file-upload" class="nes-btn nes-btn-primary cursor-pointer">
                SELECT FILES
              </label>
              {#if uploadFiles && uploadFiles.length > 0}
                <div class="text-nes-success mt-4">
                  SELECTED {uploadFiles.length} FILES
                </div>
              {/if}
            </div>

            <!-- Pipeline Configuration -->
            <div class="grid grid-cols-2 gap-8">
              <div class="space-y-4">
                <h4 class="text-nes-accent border-b-2 border-nes-accent pb-2">PIPELINE CONFIGURATION</h4>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover, border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">ENABLE DOCLING-258M (OCR/VLM)</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover, border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">LANGEXTRACT + TRANSLATION</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover, border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">WHISPER AUDIO TRANSCRIPTION</span>
                </label>
              </div>

              <div class="space-y-4">
                <h4 class="text-nes-accent border-b-2 border-nes-accent pb-2">INDEXING STRATEGY</h4>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover, border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">COSINE RANKING + DEDUPLICATION</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover, border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">TOPOLOGICAL TOPIC MAPPING</span>
                </label>

                <label class="flex items-center gap-3 cursor-pointer group">
                  <div class="w-6 h-6 border-2 border-nes-text flex items-center justify-center group-hover, border-nes-accent">
                    <div class="w-3 h-3 bg-nes-accent"></div>
                  </div>
                  <span class="text-nes-text">ACE CONTEXTUAL RETRIEVAL</span>
                </label>
              </div>
            </div>

            <!-- Action Bar -->
            <div class="mt-auto flex justify-end">
              <button
                class="nes-btn nes-btn-success text-xl px-8 py-4"
                onclick={handleUpload}
                disabled={processingStatus !== 'idle' || !uploadFiles}
              >
                {processingStatus === 'idle' ? 'INITIATE INGESTION SEQUENCE' : 'PROCESSING...'}
              </button>
            </div>
          </div>

        {:else}
          <div class="nes-panel-header bg-nes-accent2/10 text-nes-accent2">
            <span>TIMESTAMP</span>
            <span>DATA_SOURCE (ERROR CODE)</span>
            <span>INTEGRITY</span>
            <span>STATUS</span>
          </div>

          <div class="nes-panel-body">
            {#if data.stats.length === 0}
              <div class="p-8 text-center text-nes-muted">NO ANOMALIES DETECTED. SYSTEM STABLE.</div>
            {:else}
              {#each data.stats as stat}
                <div class="nes-row group cursor-pointer hover, bg-white/5">
                  <span class="font-mono text-nes-muted">2025-12-24 04:20</span>
                  <span class="text-nes-text group-hover, text-nes-accent truncate pr-2">{stat.error_code}: {stat.message?.substring(0, 40)}...</span>
                  <div class="w-24">
                    <div class="nes-progress h-2">
                      <div class="nes-progress-bar w-[85%] bg-nes-warning"></div>
                    </div>
                  </div>
                  <span class="nes-badge-warning ml-auto">FLAGGED ({stat.count})</span>
                </div>
              {/each}
            {/if}
          </div>

          <div class="p-2 border-t-4 border-nes-border bg-nes-bg text-[10px] flex justify-between">
            <span>TOTAL RECORDS: {data.stats.length}</span>
            <span class="animate-pulse">LIVE FEED ACTIVE</span>
          </div>
        {/if}
      </div>
    </section>
  </main>
</div>



