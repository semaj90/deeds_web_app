<script lang="ts">
  import SnesBookLoader from '$lib/components/ui/SnesBookLoader.svelte';

  // DEMO ONLY. /api/indexing has no progress feed (the codebase action is synchronous and the
  // status GET returns only Qdrant point counts), so this sweep is simulated. Real callers must
  // pass real progress from an indexing job record.
  const stages = [
    'SCANNING FILES',
    'PARSING CST / AST',
    'EMBEDDING CHUNKS (768-D)',
    'UPSERTING QDRANT',
    'VERIFYING POINT COUNT'
  ];

  let progress = $state<number | null>(null);
  $effect(() => {
    progress = 0;
    const id = setInterval(() => {
      progress = (progress ?? 0) >= 100 ? 0 : (progress ?? 0) + 2;
    }, 300);
    return () => clearInterval(id);
  });

  const stage = $derived(stages[Math.min(stages.length - 1, Math.floor((progress ?? 0) / 20))]);
</script>

<svelte:head>
  <title>Codebase Indexer Loader (demo)</title>
  <meta name="description" content="Simulated codebase indexing loader demo. No real indexing progress." />
</svelte:head>

<main class="min-h-screen bg-[#0b0614] p-4 sm:p-8">
  <SnesBookLoader
    label="INDEXING CODEBASE"
    sublabel="SIMULATED PROGRESS — DEMO ONLY"
    telemetry={undefined}
    {progress}
    stage={progress === null ? null : stage}
  />
</main>
