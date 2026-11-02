<!-- src/lib/components/yorha/dashboard/InferenceRouterStatus.svelte -->
<script lang="ts">
  type BackendTab = 'turboquant' | 'tensorrt' | 'vlm-hf' | 'onnx-webgpu' | 'litert-mtp';

  interface Props {
    selected?: BackendTab;
    ornithLoaded?: boolean;
    onSelect?: (tab: BackendTab) => void;
  }

  let {
    selected = $bindable('turboquant'),
    ornithLoaded = true,
    onSelect
  }: Props = $props();

  const BACKENDS: Array<{
    id: BackendTab;
    label: string;
    scope: 'SERVER :8090' | 'SERVER WSL2' | 'BROWSER WEBGPU';
    note: string;
  }> = [
    {
      id: 'turboquant',
      label: 'turboquant',
      scope: 'SERVER :8090',
      note: 'Ornith 1.5 9B GGUF (Vision + Synthesis) or RotorQuant E2B IQ4_XS (-ctk q8_0)'
    },
    {
      id: 'tensorrt',
      label: 'tensorrt',
      scope: 'SERVER WSL2',
      note: 'Not deployed; engine size not established (host-locked sm_86)'
    },
    {
      id: 'vlm-hf',
      label: 'vlm-hf',
      scope: 'SERVER :8090',
      note: 'Bounded Vision/Depth Proposal Lane (atlas.evidence-visual-analysis.v1)'
    },
    {
      id: 'onnx-webgpu',
      label: 'onnx-webgpu',
      scope: 'BROWSER WEBGPU',
      note: 'On-disk static/gemma4_e2b_onnx/onnx/decoder_model_merged_q4f16.onnx (~3.1 GB with embed data)'
    },
    {
      id: 'litert-mtp',
      label: 'litert-mtp',
      scope: 'BROWSER WEBGPU',
      note: 'LiteRT-LM web .litertlm (2.01 GB published). Browser MTP speculative decoding is not documented: UNVERIFIED'
    }
  ];

  function selectTab(id: BackendTab) {
    selected = id;
    onSelect?.(id);
  }
</script>

<div class="rounded-lg border border-slate-700/70 bg-slate-900/80 p-4 space-y-3">
  <div class="flex items-center justify-between">
    <span class="text-xs font-mono uppercase tracking-wider text-slate-400">
      Inference Router Backend
    </span>
    <span class="bg-slate-800 border border-slate-700/70 text-xs px-2 py-0.5 rounded font-mono text-slate-400">
      404 PROBES: NOT RECORDED
    </span>
  </div>

  <!-- Normalized Backend Selector Tabs -->
  <div class="flex flex-wrap gap-1.5" role="tablist" aria-label="Inference backend">
    {#each BACKENDS as b (b.id)}
      <button
        type="button"
        role="tab"
        aria-selected={selected === b.id}
        onclick={() => selectTab(b.id)}
        class="px-2.5 py-1 rounded text-xs font-mono border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 {selected === b.id
          ? 'bg-slate-800 border-cyan-400/60 text-slate-100'
          : 'bg-transparent border-slate-700/70 text-slate-400 hover:text-slate-100'}"
      >
        {b.label}
      </button>
    {/each}
  </div>

  <!-- Active Backend Details & VRAM Contention Guard -->
  {#each BACKENDS.filter((b) => b.id === selected) as active (active.id)}
    <div class="rounded bg-slate-800 border border-slate-700/70 p-2.5 text-xs font-mono text-slate-400 space-y-1">
      <div class="flex items-center justify-between text-slate-100">
        <span>{active.scope}</span>
        {#if active.scope === 'BROWSER WEBGPU' && ornithLoaded}
          <span class="text-amber-400">VRAM Guard: Unload :8090 before loading 3GB WebGPU</span>
        {/if}
      </div>
      <p class="leading-relaxed">{active.note}</p>
    </div>
  {/each}
</div>
