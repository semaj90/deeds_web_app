<script lang="ts">
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    caseId?: string;
    evidenceId?: string;
    onAnalysisComplete?: (result: VisionResponse) => void;
  }

  interface VisionBox {
    x: number;
    y: number;
    w: number;
    h: number;
    label: string;
    conf: number;
  }

  interface VisionResponse {
    cacheHit: boolean;
    hash: string;
    boxes: VisionBox[];
    analysis: {
      summary: string;
      keyFindings: string[];
      suggestedTags: string[];
    };
    timingsMs: Record<string, number>;
    minioUrl?: string;
  }

  let { caseId, evidenceId, onAnalysisComplete }: Props = $props();

  let file = $state<File | null>(null);
  let previewUrl = $state<string | null>(null);
  let analyzing = $state(false);
  let result = $state<VisionResponse | null>(null);
  let error = $state<string | null>(null);
  let isDragOver = $state(false);
  let showBoxes = $state(true);
  let imageSize = $state({ width: 0, height: 0 });

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragOver = false;
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped?.type.startsWith('image/')) {
      selectFile(dropped);
    } else {
      error = 'Please drop an image file (JPEG, PNG, WebP)';
    }
  }

  function handleFileSelect(e: Event) {
    const input = e.target as HTMLInputElement;
    const selected = input.files?.[0];
    if (selected) selectFile(selected);
  }

  function selectFile(f: File) {
    file = f;
    error = null;
    result = null;

    // Create preview
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(f);

    // Get image dimensions
    const img = new window.Image();
    img.onload = () => {
      imageSize = { width: img.naturalWidth, height: img.naturalHeight };
    };
    img.src = previewUrl;
  }

  async function analyze() {
    if (!file) return;
    analyzing = true;
    error = null;

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (caseId) {
      formData.append('case_id', caseId);
      formData.append('case_id', caseId);
      formData.append('caseId', caseId);
      }
    formData.append('enableAiAnalysis', 'true');
    formData.append('enableOcr', 'true');
    formData.append('enableEmbeddings', 'true');
    formData.append('enableSummarization', 'true');
      if (evidenceId) formData.append('evidenceId', evidenceId);

      const res = await fetch('/api/vision/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Analysis failed' })) as { error?: string; hint?: string; currentMode?: string };
        const msg = data.error ?? `HTTP ${res.status}`;
        const detail = data.hint ? ` — ${data.hint}` : data.currentMode ? ` (current: ${data.currentMode})` : '';
        throw new Error(msg + detail);
      }

      result = await res.json();
      onAnalysisComplete?.(result!);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Analysis failed';
    } finally {
      analyzing = false;
    }
  }

  function clear() {
    file = null;
    result = null;
    error = null;
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
  }

  // Box color based on label
  function boxColor(label: string): string {
    const colors: Record<string, string> = {
      text: '#4ade80',
      image: '#38bdf8',
      table: '#facc15',
      header: '#a78bfa',
      footer: '#94a3b8',
      signature: '#ef4444',
      checkbox: '#f97316',
      form_field: '#22d3ee',
      stamp: '#e879f9',
    };
    return colors[label] ?? '#4ade80';
  }
</script>

<div class="vision-analyzer">
  {#if !file}
    <!-- Drop Zone -->
    <div
      class="drop-zone"
      class:drag-over={isDragOver}
      ondragover={(e) => { e.preventDefault(); isDragOver = true; }}
      ondragleave={() => { isDragOver = false; }}
      ondrop={handleDrop}
      role="button"
      tabindex="0"
      aria-label="Drop image or click to upload"
      onclick={() => document.getElementById('vision-file-input')?.click()}
      onkeydown={(e) => { if (e.key === 'Enter') document.getElementById('vision-file-input')?.click(); }}
    >
      <input
        id="vision-file-input"
        type="file"
        accept="image/*"
        onchange={handleFileSelect}
        class="hidden"
      />
      <div class="drop-content">
        <span class="i-lucide-upload inline-block w-10 h-10 text-sand/40"></span>
        <p class="text-sand/70 text-sm font-medium mt-3">
          {isDragOver ? 'Drop image here' : 'Drag & drop an evidence image'}
        </p>
        <p class="text-sand/40 text-xs mt-1">or click to browse (JPEG, PNG, WebP — max 50MB)</p>
      </div>
    </div>
  {:else}
    <!-- Image Preview + Analysis -->
    <div class="analysis-layout">
      <!-- Left: Image with overlay boxes -->
      <div class="image-panel">
        <div class="image-container" style="position: relative;">
          <img
            src={previewUrl}
            alt={file.name}
            class="preview-image"
          />

          {#if result && showBoxes && imageSize.width > 0}
            <svg
              class="box-overlay"
              viewBox="0 0 {imageSize.width} {imageSize.height}"
              preserveAspectRatio="xMidYMid meet"
            >
              {#each result.boxes as box}
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.w}
                  height={box.h}
                  fill="none"
                  stroke={boxColor(box.label)}
                  stroke-width="2"
                  opacity="0.8"
                />
                <text
                  x={box.x + 2}
                  y={box.y - 4}
                  fill={boxColor(box.label)}
                  font-size="12"
                  font-family="monospace"
                >
                  {box.label} ({(box.conf * 100).toFixed(0)}%)
                </text>
              {/each}
            </svg>
          {/if}
        </div>

        <!-- Controls -->
        <div class="controls">
          <button class="btn-analyze" onclick={analyze} disabled={analyzing}>
            {#if analyzing}
              <span class="i-lucide-loader inline-block w-4 h-4 animate-spin"></span>
              Analyzing...
            {:else}
              <span class="i-lucide-search inline-block w-4 h-4"></span>
              Analyze Image
            {/if}
          </button>

          {#if result}
            <label class="toggle-boxes">
              <input type="checkbox" bind:checked={showBoxes} />
              <span class="i-lucide-eye inline-block w-3 h-3"></span>
              Boxes
            </label>
          {/if}

          <button class="btn-clear" onclick={clear}>
            <span class="i-lucide-x-circle inline-block w-4 h-4"></span>
            Clear
          </button>
        </div>
      </div>

      <!-- Right: Results -->
      <div class="results-panel">
        {#if analyzing}
          <div class="loading-state">
            <span class="i-lucide-loader w-8 h-8 animate-spin text-accent inline-block"></span>
            <p class="text-sand/60 text-sm mt-2">Running YOLO + Gemma3 VLM pipeline...</p>
          </div>
        {:else if result}
          <!-- Cache indicator -->
          {#if result.cacheHit}
            <div class="cache-badge">
              <span class="i-lucide-database w-3 h-3 inline-block"></span>
              Cached result
            </div>
          {/if}

          <!-- Summary -->
          <div class="result-section">
            <h4 class="section-title">
              <span class="i-lucide-image w-4 h-4 inline-block"></span>
              Summary
            </h4>
            <p class="text-sand/80 text-sm">{result.analysis.summary}</p>
          </div>

          <!-- Key Findings -->
          {#if result.analysis.keyFindings.length > 0}
            <div class="result-section">
              <h4 class="section-title">
                <span class="i-lucide-check-circle w-4 h-4 inline-block"></span>
                Key Findings
              </h4>
              <ul class="findings-list">
                {#each result.analysis.keyFindings as finding}
                  <li class="text-sand/70 text-sm">{finding}</li>
                {/each}
              </ul>
            </div>
          {/if}

          <!-- Tags -->
          {#if result.analysis.suggestedTags.length > 0}
            <div class="result-section">
              <h4 class="section-title">
                <span class="i-lucide-tag w-4 h-4 inline-block"></span>
                Suggested Tags
              </h4>
              <div class="tags-row">
                {#each result.analysis.suggestedTags as tag}
                  <span class="tag-pill">{tag}</span>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Detections -->
          {#if result.boxes.length > 0}
            <div class="result-section">
              <h4 class="section-title">
                <span class="i-lucide-eye w-4 h-4 inline-block"></span>
                Detections ({result.boxes.length})
              </h4>
              <div class="detections-grid">
                {#each result.boxes as box}
                  <div class="detection-item" style="border-left: 3px solid {boxColor(box.label)};">
                    <span class="text-sand/80 text-xs font-mono">{box.label}</span>
                    <span class="text-sand/40 text-xs">{(box.conf * 100).toFixed(0)}%</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Timings -->
          <div class="result-section">
            <h4 class="section-title">
              <span class="i-lucide-clock w-4 h-4 inline-block"></span>
              Pipeline Timings
            </h4>
            <div class="timings-grid">
              {#each Object.entries(result.timingsMs) as [stage, ms]}
                <div class="timing-item">
                  <span class="text-sand/50 text-xs">{stage}</span>
                  <span class="text-accent text-xs font-mono">{ms}ms</span>
                </div>
              {/each}
            </div>
          </div>

          <!-- Hash -->
          <div class="hash-row">
            <span class="text-sand/30 text-xs font-mono">SHA-256: {result.hash.slice(0, 16)}...</span>
            {#if result.minioUrl}
              <span class="text-sand/30 text-xs">Stored in SeaweedFS</span>
            {/if}
          </div>
        {:else if error}
          <div class="error-state">
            <span class="i-lucide-alert-circle w-6 h-6 text-danger inline-block"></span>
            <p class="text-danger text-sm mt-2">{error}</p>
          </div>
        {:else}
          <div class="empty-state">
            <p class="text-sand/40 text-sm">Click "Analyze Image" to run the vision pipeline</p>
            <p class="text-sand/30 text-xs mt-1">YOLO detection + Gemma3 VLM analysis + Redis cache</p>
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .vision-analyzer {
    border: 1px solid var(--border-color, rgba(212, 199, 163, 0.1));
    border-radius: 8px;
    overflow: hidden;
    background: var(--bg-primary, #1a1814);
  }

  .drop-zone {
    padding: 3rem 2rem;
    text-align: center;
    cursor: pointer;
    border: 2px dashed rgba(212, 199, 163, 0.15);
    border-radius: 8px;
    margin: 1rem;
    transition: all 0.2s ease;
  }
  .drop-zone:hover,
  .drop-zone.drag-over {
    border-color: rgba(74, 222, 128, 0.4);
    background: rgba(74, 222, 128, 0.03);
  }
  .drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .hidden { display: none; }

  .analysis-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    min-height: 400px;
  }
  @media (max-width: 768px) {
    .analysis-layout {
      grid-template-columns: 1fr;
    }
  }

  .image-panel {
    border-right: 1px solid rgba(212, 199, 163, 0.1);
    display: flex;
    flex-direction: column;
  }
  .image-container {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0c0a;
    overflow: hidden;
    position: relative;
  }
  .preview-image {
    max-width: 100%;
    max-height: 400px;
    object-fit: contain;
  }
  .box-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .controls {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    align-items: center;
    border-top: 1px solid rgba(212, 199, 163, 0.1);
  }
  .btn-analyze {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.8rem;
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.2s;
  }
  .btn-analyze:hover:not(:disabled) {
    background: rgba(74, 222, 128, 0.25);
  }
  .btn-analyze:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-clear {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.6rem;
    background: transparent;
    color: rgba(212, 199, 163, 0.5);
    border: 1px solid rgba(212, 199, 163, 0.15);
    border-radius: 6px;
    font-size: 0.75rem;
    cursor: pointer;
    margin-left: auto;
  }
  .btn-clear:hover {
    color: #ef4444;
    border-color: rgba(239, 68, 68, 0.3);
  }
  .toggle-boxes {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.75rem;
    color: rgba(212, 199, 163, 0.5);
    cursor: pointer;
  }

  .results-panel {
    padding: 1rem;
    overflow-y: auto;
    max-height: 500px;
  }
  .loading-state,
  .empty-state,
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 200px;
    text-align: center;
  }

  .cache-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.6rem;
    background: rgba(56, 189, 248, 0.1);
    color: #38bdf8;
    border-radius: 99px;
    font-size: 0.7rem;
    margin-bottom: 0.75rem;
  }

  .result-section {
    margin-bottom: 1rem;
  }
  .section-title {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: rgba(212, 199, 163, 0.7);
    font-weight: 600;
    margin-bottom: 0.4rem;
  }

  .findings-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .findings-list li {
    padding: 0.3rem 0;
    padding-left: 1rem;
    position: relative;
  }
  .findings-list li::before {
    content: '\2022';
    color: #4ade80;
    position: absolute;
    left: 0;
  }

  .tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .tag-pill {
    padding: 0.15rem 0.5rem;
    background: rgba(212, 199, 163, 0.08);
    border: 1px solid rgba(212, 199, 163, 0.15);
    border-radius: 99px;
    font-size: 0.7rem;
    color: rgba(212, 199, 163, 0.7);
  }

  .detections-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
    gap: 0.3rem;
  }
  .detection-item {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  .timings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
    gap: 0.3rem;
  }
  .timing-item {
    display: flex;
    flex-direction: column;
    padding: 0.25rem 0.4rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: 4px;
  }

  .hash-row {
    display: flex;
    justify-content: space-between;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(212, 199, 163, 0.05);
    margin-top: 0.5rem;
  }
</style>
