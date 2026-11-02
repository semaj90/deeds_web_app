<script lang="ts">
  import SnesBookLoader from '$lib/components/ui/SnesBookLoader.svelte';

  // Demo only: a fake 0-100 sweep so the determinate bar is visible. Real callers pass their own value.
  let progress = $state(0);
  $effect(() => {
    const id = setInterval(() => { progress = progress >= 100 ? 0 : progress + 5; }, 400);
    return () => clearInterval(id);
  });
</script>

<svelte:head>
  <title>16-Bit SNES Book Loader</title>
  <meta name="description" content="A read-only SNES-inspired loading animation demo." />
</svelte:head>

<main class="min-h-screen bg-[#0b0614] p-4 sm:p-8">
  <SnesBookLoader
    label="NOW LOADING"
    sublabel="READ-ONLY PRESENTATION DEMO"
    telemetry={undefined}
    {progress}
  />
</main>
