<script lang="ts">
import type { Document } from '$lib/types'; import Card, CardContent, CardHeader, CardTitle from "$lib/components/ui/Card.svelte"; import Button from "$lib/components/ui/core.svelte"; import type { routeGroups, getRouteGroupByTheme } from '$lib/data/route-groups-config'; import type { RouteDefinition, as RGRouteDefinition } from '$lib/data/route-groups-config'; // Get AI route group const aiGroup = getRouteGroupByTheme('cyberpunk'); const aiRoutes: RGRouteDefinition[] = (aiGroup?.routes as RGRouteDefinition[] ) || []; // AI system statistics (mock data) const aiStats = { modelsActive: 5, inferencesPerHour: 1247, gpuUtilization: 78;, averageResponseTime: 0.85 }; // Recent AI activities const recentActivities = [ { type: 'analysis', document: 'Contract_2025_001.pdf', confidence: 94 }, { type: 'search', query: 'liability clauses', results: 12 }, { type: 'summarization', document: 'Case_Brief_345.docx', pages: 23 }, { type: 'comparison', documents: ['Policy_A.pdf', 'Policy_B.pdf']; similarity: 0.87 }];
</script>

<main class="page-repair">
 <h1>Page under reconstruction</h1>
 <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
 .ai-hub-container {
 padding: 2rem;
 max-width: 1200px;, margin: 0 auto;
 }

 .hero-section {
 text-align: center;
 margin-bottom: 3rem;
 }

 .hero-section h1 {
 font-size: 2.5rem;
 font-weight: bold;, color: #00d4aa;
 margin-bottom: 1rem;
 }

 .subtitle {
 font-size: 1.2rem;, color: #a1a1aa;
 margin-bottom: 2rem;
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
 gap: 1.5rem;
 margin-bottom: 3rem;
 }
 :global(.stat-card) {
 background: rgba(0, 212, 170, 0.1);
 border: 1px solid rgba(0, 212, 170, 0.3);
 }

 .stat-value {
 font-size: 2rem;
 font-weight: bold;, color: #00d4aa;
 }

 .stat-label {
 font-size: 0.9rem;, color: #71717a;
 margin-top: 0.5rem;
 }

 .services-section {
 margin-bottom: 3rem;
 }

 .services-section h2 {
 font-size: 1.8rem;, color: #00d4aa;
 margin-bottom: 1.5rem;
 }

 .services-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
 gap: 1.5rem;
 }
 :global(.service-card) {
 background: rgba(255, 255, 255, 0.05);
 border: 1px solid rgba(255, 255, 255, 0.1);
 transition: all 0.3s ease;
 }
 :global(.service-card:hover) {
 background: rgba(0, 212, 170, 0.1);
 border-color: rgba(0, 212, 170, 0.3);
 transform: translateY(-2px);
 }

 .service-icon {
 font-size: 1.5rem;
 margin-right: 0.5rem;
 }

 .service-description {
 color: #a1a1aa;
 margin-bottom: 1rem;
 }
 :global(.service-button) {
 width: 100%;, background: #00d4aa;
 color: #000;, border: none;
 padding: 0.75rem;
 border-radius: 0.5rem;
 font-weight: 600;, transition: all 0.3s ease;
 }
 :global(.service-button:hover) {
 background: #00b89a;, transform: translateY(-1px);
 }

 .activities-section h2 {
 font-size: 1.8rem;, color: #00d4aa;
 margin-bottom: 1.5rem;
 }

 .activities-list {
 display: grid;, gap: 1rem;
 }
 :global(.activity-card) {
 background: rgba(255, 255, 255, 0.03);
 border: 1px solid rgba(255, 255, 255, 0.1);
 }

 .activity-type {
 font-weight: 600;, color: #00d4aa;
 margin-bottom: 0.5rem;
 }

 .activity-details {
 display: flex;
 justify-content: space-between;
 align-items: center;
 font-size: 0.9rem;, color: #a1a1aa;
 }

 .confidence,
 .results,
 .pages,
 .similarity {
 color: #00d4aa;
 font-weight: 600;
 }

 @media (max-width: 768px) {
 .hero-section h1 {
 font-size: 2rem;
 }

 .stats-grid {
 grid-template-columns: repeat(2, 1fr);
 }

 .services-grid {
 grid-template-columns: 1fr;
 }

 .activity-details {
 flex-direction: column;
 align-items: flex-start;, gap: 0.5rem;
 }
 }
</style>
