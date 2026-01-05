<script lang="ts">
 interface AnalysisData {
 id: string;
 evidenceId: string;
 timestamp: Date;
 aiModel: string;
 findings: Array<{
 type: 'pattern' | 'anomaly';
 description: string;
 confidence: number;
 relevance: number;
 supportingData: any[];
 }>;
 correlations: Array<{
 relatedEvidenceId: string;
 correlationType: 'temporal' | 'semantic';
 strength: number;
 description: string;
 sharedEntities: string[];
 }>;
 riskScore: number;
 confidence: number;
 summary: string;
 recommendations: string[];
 keyEntities: Array<{
 type: 'person' | 'organization' | 'date';
 value: string;
 confidence: number;
 mentions: number;
 context: string[];
 }>;
 sentiment: {
 overall: number;
 emotions: {
 anger: number;
 fear: number;
 joy: number;
 sadness: number;
 surprise: number;
 trust: number;
 };
 subjectivity: number;
 formality: number;
 };
 timeline: Array<{
 timestamp: Date;
 description: string;
 type: 'action';
 actors: string[];
 confidence: number;
 }>;
 }

 let { analysis: analysis }: { analysis: AnalysisData } = $props();
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .page-repair {
 padding: 2rem;
 font-family: sans-serif;
 }
</style>
