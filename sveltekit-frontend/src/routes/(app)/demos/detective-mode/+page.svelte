<script lang="ts">
	import DetectiveModeCanvas from '$lib/components/evidence/DetectiveModeCanvas.svelte';

	const caseId = '2007b040-8b33-4613-8fb8-72f90c8c5317';
	const caseTitle = 'State v. Johnson - Fraud Investigation';

	const sampleExhibits = [
		{ id: 'ex-01', title: 'Contract #4029-A (Exculpatory)', type: 'contract' },
		{ id: 'ex-02', title: 'Financial Ledger #981 Wire Spikes', type: 'financial' },
		{ id: 'ex-03', title: 'Crime Scene Telemetry & Splat Cloud', type: 'holographic-3d' },
		{ id: 'ex-04', title: 'Cell Tower 48-B Handover Log', type: 'telemetry' },
		{ id: 'ex-05', title: 'Audio Comm Intercept #04', type: 'audio' },
		{ id: 'ex-06', title: 'CCTV Badge Bypass Still CAM-N-04', type: 'cctv' }
	];
</script>

<svelte:head>
	<title>YoRHa Law // Spatial Legal Intelligence — Detective Mode Canvas</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-[#0d131a]">
	<div class="shrink-0 border-b border-amber-500/40 bg-amber-950 px-4 py-1 text-center font-mono text-[11px] font-semibold tracking-wider text-amber-200">
		DEMONSTRATION DATA — synthetic exhibits and telemetry; not case evidence
	</div>
	<div class="min-h-0 flex-1">
	<DetectiveModeCanvas
		{caseId}
		{caseTitle}
		evidenceItems={sampleExhibits}
		demoMode={true}
	/>
	</div>
</div>
