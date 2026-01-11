<script lang="ts">
 import PhoenixProsecutorDashboard from '$lib/components/yorha/PhoenixProsecutorDashboard.svelte';
 import type { PageData } from './$types';

 let { data }: { data: PageData } = $props();

 // Extract caseId from URL params if available
 let caseId = $derived(data?.caseId || null);
</script>

<svelte:head>
 <title>Phoenix Wright Prosecutor Mode - Legal AI Platform</title>
 <meta name="description" content="Professional legal evidence analysis with real-time AI assistance" />
</svelte:head>

<PhoenixProsecutorDashboard {caseId} />
