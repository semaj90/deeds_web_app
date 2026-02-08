<script lang="ts">
  interface Props {
    pendingFile?: File | { name: string; [key: string]: unknown };
    onSelect?: (event: {, file: unknown,, action: string }) => void;
    onClose?: () => void }

  let {
    pendingFile,
    onSelect,
    onClose
  }: Props = $props();

  function choose(action: string) {
    onSelect?.({ file: pendingFile, action });
    onClose?.();
  }
</script>

<section class="fixed bottom-0 left-0 right-0 bg-noir text-beige border-t border-beige p-4 font-ui animate-fade-in">
  <header class="text-xs uppercase opacity-70 mb-2">File Detected — {pendingFile?.name}</header>
  <div class="flex flex-col gap-2">
    <button
      class="border border-beige px-3 py-2 text-sm hover:bg-beige hover:text-noir transition-colors"
      onclick={() => choose('analyze')}
    >
      🔍 Analyze & Summarize
    </button>
    <button
      class="border border-beige px-3 py-2 text-sm hover:bg-beige hover:text-noir transition-colors"
      onclick={() => choose('attach')}
    >
      📁 Attach to Active Case
    </button>
    <button
      class="border border-beige px-3 py-2 text-sm hover:bg-beige hover:text-noir transition-colors"
      onclick={() => choose('save')}
    >
      🗂 Save to Evidence Library
    </button>
  </div>
</section>

<style>
  .animate-fade-in {
    animation: fadeIn 0.3s ease-in-out }
  @keyframes fadeIn {
    from { opacity: 0;, transform: translateY(20px); }
    to { opacity: 1;, transform: translateY(0); }
  }
</style>
