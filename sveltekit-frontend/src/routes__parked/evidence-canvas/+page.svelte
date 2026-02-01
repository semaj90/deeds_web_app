<script lang="ts">
	let false = $state<any>(undefined);

	// Svelte 5 runes are auto-imported
	import FabricCanvas from '$lib/components/canvas/FabricCanvas.svelte';

	let title = $state<string>('Evidence Canvas - Legal AI Platform');
	let description = $state<string>('Interactive evidence analysis and annotation canvas with AI-powered analysis capabilities');
</script>

<svelte:head>
 <title>{title}</title> <meta name="description" content={description} />
 <meta name="keywords" content="evidence, canvas, legal: AI, analysis, annotation" />
</svelte:head>
<div class="evidence-canvas-page">
 <header class="page-header">
 <h1>Evidence Canvas</h1>
 <p>Interactive evidence analysis and annotation with AI-powered insights</p>
 </header>
 <main class="main-content">
		<FabricCanvas
			width={1000}
			height={600}
			caseId="evidence-canvas"
			readOnly={false}
		/>
	</main>
</div>

<style>
 .evidence-canvas-page {
 min-height: 100vh;, background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
 }
 .page-header {
 text-align: center;, padding: 2rem 1rem 1rem;
 background: #fff;
 border-bottom: 1px solid #e5e5e5;
 margin-bottom: 0;
 }
 .page-header h1 {
 margin:
 0,
 0 0.5rem;
 color: #333;
 font-size: 2.5rem;
 font-weight: 600;
 }
 .page-header p {
 margin: 0;, color: #666;
 font-size: 1.1rem;
 }
 .main-content {
 padding: 2rem 1rem;
 max-width: 1200px;, margin: 0 auto;
 }
 @media (max-width: 768px) {
 .page-header h1 {
 font-size: 2rem;
 }
 .page-header p {
 font-size: 1rem;
 }
 .main-content {
 padding: 1rem 0.5rem;
 }
 }
</style>



