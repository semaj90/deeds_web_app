<script lang="ts">
 import EvidenceBoard from '$lib/ui/EvidenceBoard.svelte';
 import type { PageData } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

 let { data }: { data: PageData } = $props();

 async function savePositions(items: any[]) {
 try {
 await fetch(`/api/evidence/${data.caseId}`, {
 method: 'PATCH',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ items }),
 });
 console.log('Positions saved');
 } catch (error) {
 console.error('Failed to save positions:', error);
 }
 }
</script>

<svelte:head>
 <title>Evidence Board - YoRHa Detective</title>
</svelte:head>

<EvidenceBoard
 items={data.items}
 connections={data.connections}
 onSave={ savePositions }
/>



