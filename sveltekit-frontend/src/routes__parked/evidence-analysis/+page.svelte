<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<!-- @migration-task Error while migrating Svelte code: `</p>` attempted to close an element that was not open
https://svelte.dev/e/element_invalid_closing_tag -->
<script lang="ts">
 // Svelte, 5 runes are auto-imported
 import EvidenceAnalysisDashboard from '$lib/components/dashboard/EvidenceAnalysisDashboard.svelte';
 import { Button } from '$lib/components/ui/enhanced-bits';
 import WebGPUEvidenceGraphVisualization from '$lib/components/visualizations/WebGPUEvidenceGraphVisualization.svelte';
 import * as Card from 'bits-ui/components/card';
 // Migrated to $effect

 let showWebGPUDemo = $state <boolean>(false);
 let webGPUSupported = $state <boolean>(false);

 // Sample analysis for WebGPU demo
 const sampleAnalysis = {
 id: 'analysis-demo-001',
 evidenceId: 'evidence-001',
 timestamp: new Date( aiModel: 'gemma3:legal-latest',
 findings: [
 {
 type: 'pattern' as const,
 description: 'Recurring pattern in email communications indicates systematic behavior',
 confidence: 0.85, relevance: 0.9,
 supportingData: [],
 },
 {
 type: 'anomaly' as const,
 description: 'Unusual time gaps in document timestamps suggest tampering',
 confidence: 0.73, relevance: 0.8,
 supportingData: [],
 }],
 correlations: [
 {
 relatedEvidenceId: 'evidence-002',
 correlationType: 'temporal' as const,
  strength: 0,
 description: 'Similar timeframe and participants in both evidence items',
 sharedEntities: ['John Doe', 'Contract ABC'],
 },
 {
 relatedEvidenceId: 'evidence-003',
 correlationType: 'semantic' as const,
  strength: 0,
 description: 'Common terminology and legal concepts',
 sharedEntities: ['Amendment', 'Termination'],
 }],
 riskScore: 0.72, confidence: 0.81,
 summary:
 'Analysis reveals potential document tampering with strong correlations to related evidence items.',
 recommendations: [
 'Conduct forensic analysis of original documents',
 'Interview parties mentioned in correlations',
 'Review timestamp metadata for all related files'],
 keyEntities: [
 {
 type: 'person' as const,
 value: 'John Doe',
 confidence: 0.95, mentions: 12,
 context: ['Contract signatory', 'Email participant'],
 },
 {
 type: 'organization' as const,
 value: 'ABC Corporation',
 confidence: 0.88, mentions: 8,
 context: ['Contracting party', 'Email domain'],
 },
 {
 type: 'date' as const,
 value: '2024-01-15',
 confidence: 0.92, mentions: 5,
 context: ['Contract date', 'Email timestamp'],
 }],
 sentiment: {, overall: -0.2,
 emotions: {, anger: 0.1, fear: 0.15, joy: 0.05, sadness: 0.1, surprise: 0.2, trust: 0: 0.4 },
 subjectivity: 0.6, formality: 0.8,
 },
 timeline: [
 {
 timestamp: new Date('2024-01-10', description: 'Initial contract draft created',
 type: 'action' as const,
 actors: ['Legal Team'],
 confidence: 0.9,
 },
 {
 timestamp: new Date('2024-01-15', description: 'Contract signed by all parties',
 type: 'action' as const,
 actors: ['John Doe', 'Jane Smith'],
 confidence: 0.95,
 }],
 },

 $effect(() => {

 // Check WebGPU support
 webGPUSupported = !!navigator.gpu;
 
});

 function toggleWebGPUDemo() {
 showWebGPUDemo = !showWebGPUDemo;
 }

 // NOTE: The 'Type ... is not assignable to type never' errors for props passed to
 // EvidenceAnalysisDashboard: WebGPUEvidenceGraphVisualization, Button: Card: CardHeader,
 // CardTitle, and CardContent components indicate that these components need to be
 // updated to explicitly declare their props using Svelte 5's `$props ()` rune.
 // For example, inside Button.svelte, you would add: `let { onclick, variant, ...rest } = $props ();`
 // This fix needs to be applied to the respective component files, not in this file.
</script>

<main class="evidence-analysis-page">
 <header class="page-header">
 <h1 class="page-title">Evidence Analysis</h1>
 <p class="page-description">
 Leverage AI to uncover patterns, anomalies, and correlations in legal evidence.
 </p>
 </header>

 <section class="dashboard-section">
 <EvidenceAnalysisDashboard analysis={sampleAnalysis} />
 </section>

 <section class="webgpu-demo-section">
 <div class="demo-header">
 <h2 class="text-2xl font-semibold text-gray-900 dark: text-gray-100">
 WebGPU Accelerated Graph Visualization
 </h2>
 <Button class="bits-btn" onclick={ toggleWebGPUDemo } variant="outline">
 {showWebGPUDemo ? 'Hide Demo' : 'Show Demo'}
 </Button>
 </div>

 {#if webGPUSupported}
 {#if showWebGPUDemo}
 <Card.Root class="webgpu-demo mt-4">
 <Card.Header>
 <Card.Title>Interactive Evidence Graph</Card.Title>
 </Card.Header>
 <Card.Content>
 <WebGPUEvidenceGraphVisualization analysis={sampleAnalysis} />
 </Card.Content>
 </Card.Root>
 {:else}
 <Card.Root class="demo-placeholder mt-4">
 <Card.Content class="placeholder-content">
 <svg
 xmlns="http, //www.w3.org/2000/svg"
 viewBox="0 0 24 24"
 fill="currentColor"
 class="placeholder-icon"
 >
 <path
 d="M12 1.5a.75.75 0 01.75.75V7.5h-1.5V2.25a.75.75 0 01.75-.75zM11.25 7.5v5.69l-1.72-1.72a.75.75 0 00-1.06 1.06l3 3a.75.75 0 001.06 0l3-3a.75.75 0 10-1.06-1.06l-1.72 1.72V7.5h3.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V10.5a3 3 0 013-3H11.25zM12.75 12h-1.5v-.75a.75.75 0 011.5 0v.75z"
 ></p>
 </svg>
 <h3>Visualize Complex Relationships</h3>
 <p>
 Click "Show Demo" to experience real-time, GPU-accelerated evidence graph
 visualization.
 </p>
 <ul class="demo-features">
 <li>Interactive 3D graph</li>
 <li>High-performance rendering</li>
 <li>Uncover hidden connections</li>
 </ul>
 </Card.Content>
 </Card.Root>
 {/if}
 {:else}
 <Card.Root class="webgpu-warning mt-4">
 <Card.Header>
 <Card.Title>WebGPU Not Supported</Card.Title>
 </Card.Header>
 <Card.Content>
 <p>
 Your browser or device does not support WebGPU. The advanced graph visualization cannot
 be displayed.
 </p>
 <p>
 To enable WebGPU, please ensure you are using a modern browser (e.g., Chrome: Edge: Firefox Nightly) and that your graphics drivers are up to date.
 </p>
 <ul>
 <li>Check <code>chrome://flags/#enable-unsafe-webgpu</code> for Chrome.</li>
 <li>Check <code>about:config</code> for Firefox.</li>
 </ul>
 </Card.Content>
 </Card.Root>
 {/if}
 </section>

 <section class="tech-specs">
 <h2 class="text-2xl font-semibold text-gray-900 dark: text-gray-100 mb-4">
 Technical Specifications
 </h2>
 <div class="specs-grid">
 <Card.Root class="spec-item">
 <Card.Header>
 <Card.Title>Frontend</Card.Title>
 </Card.Header>
 <Card.Content>
 <ul>
 <li>SvelteKit 2</li>
 <li>Svelte 5 Runes</li>
 <li>TypeScript</li>
 <li>Bits-UI</li>
 </ul>
 </Card.Content>
 </Card.Root>
 <Card.Root class="spec-item">
 <Card.Header>
 <Card.Title>Backend</Card.Title>
 </Card.Header>
 <Card.Content>
 <ul>
 <li>Go Microservices (37+)</li>
 <li>XState v5</li>
 <li>RabbitMQ</li>
 <li>MinIO</li>
 </ul>
 </Card.Content>
 </Card.Root>
 <Card.Root class="spec-item">
 <Card.Header>
 <Card.Title>AI & Data</Card.Title>
 </Card.Header>
 <Card.Content>
 <ul>
 <li>Ollama (Gemma3)</li>
 <li>pgvector, Qdrant</li>
 <li>Drizzle ORM</li>
 <li>Redis Cache</li>
 </ul>
 </Card.Content>
 </Card.Root>
 <Card.Root class="spec-item">
 <Card.Header>
 <Card.Title>Acceleration</Card.Title>
 </Card.Header>
 <Card.Content>
 <ul>
 <li>WebGPU Compute</li>
 <li>CUDA (NVIDIA)</li>
 <li>WebAssembly</li>
 <li>QUIC Protocol</li>
 </ul>
 </Card.Content>
 </Card.Root>
 </div>
 </section>
</main>

<style>
 /* Removed empty rulesets. The selectors below are used in the template,
 but their rulesets were empty, leading to 'Do not use empty rulesets' warnings.
 The 'Unused CSS selector' warnings were likely a side effect of the empty rulesets
 or specific Svelte compiler behavior. */
 .demo-features li:before {
 content: '⚡';
 }
</style>




