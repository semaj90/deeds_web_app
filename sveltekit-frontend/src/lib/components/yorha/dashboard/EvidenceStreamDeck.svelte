<!-- src/lib/components/yorha/dashboard/EvidenceStreamDeck.svelte -->
<script lang="ts">
  interface Props {
    timelineProgress?: number;
    evidenceCount?: number;
    onSeek?: (progress: number) => void;
  }

  let {
    timelineProgress = $bindable(0),
    evidenceCount = 0,
    onSeek
  }: Props = $props();

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    const val = parseFloat(target.value);
    timelineProgress = val;
    onSeek?.(val);
  }
</script>

<div class="rounded-lg border border-slate-700/70 bg-slate-900/80 p-4 space-y-4">
  <!-- Header Row -->
  <div class="flex items-center justify-between">
    <div class="space-y-0.5">
      <h4 class="text-sm font-semibold text-slate-100">Evidence Stream & Timeline Scrubber</h4>
      <p class="text-xs text-slate-400 font-mono">
        Active Items: {evidenceCount}
      </p>
    </div>
    <span class="bg-slate-800 border border-slate-700/70 text-xs px-2 py-0.5 rounded font-mono text-slate-400">
      PG18 vector(768)
    </span>
  </div>

  <!-- Normalized Timeline Scrubber -->
  <div class="space-y-1.5">
    <div class="flex justify-between text-xs font-mono text-slate-400">
      <span>Playback Position</span>
      <span>{Math.round(timelineProgress)}%</span>
    </div>
    <input
      type="range"
      min="0"
      max="100"
      value={timelineProgress}
      oninput={handleInput}
      aria-label="Playback position"
      class="w-full h-1.5 rounded bg-slate-800 accent-cyan-400 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
    />
  </div>

  <!-- Normalized Upload Dropzone -->
  <label class="flex flex-col items-center justify-center rounded-md border border-dashed border-slate-700/70 bg-slate-800/50 px-4 py-6 text-center cursor-pointer hover:border-cyan-400/50 transition-colors">
    <span class="text-xs font-mono text-slate-400">
      Drop Evidence (PDF, PNG, MP4) — SHA-256 + SeaweedFS + PG18 Outbox
    </span>
    <span class="text-[10px] font-mono text-slate-500 mt-1">
      YOLO Bounding Box → SAM 2 Segmentation → Depth Map Mesh Lifting
    </span>
    <input type="file" class="hidden" accept=".pdf,.png,.jpg,.jpeg,.mp4" />
  </label>
</div>
