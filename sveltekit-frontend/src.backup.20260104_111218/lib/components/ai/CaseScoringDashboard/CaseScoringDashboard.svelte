<script lang="ts">
 // Minimal props / state for the dashboard placeholder
 let { title = 'Case Scoring Dashboard' } = $props<{
 title?: string;
 }>();
</script>

<main class="case-scoring-dashboard">
 <header class="dashboard-header">
 <h2>{title}</h2>
 <p class="muted">Overview and scoring tools for case prioritization.</p>
 </header>

 <section class="dashboard-body">
 <!-- Placeholder content: your real dashboard can replace this -->
 <div class="placeholder-card">
 <p>Components, charts and controls will be rendered here.</p>
 </div>
 </section>
</main>

<style>
 .page-container {
 min-height: 100vh;
 background: #f8fafc;
 }
 .case-scoring-dashboard {
 padding: 1rem;
 background: var(--surface, #fff);
 border-radius: 8px;
 }
 .dashboard-header h2 {
 margin: 0 0 0.25rem 0;
 color: var(--text-primary, #0b74de);
 }
 .muted {
 color: var(--text-secondary, #666);
 font-size: 0.9rem;
 }
 .placeholder-card {
 border: 1px dashed rgba(0, 0, 0, 0.08);
 padding: 1.25rem;
 border-radius: 6px;
 color: #444;
 }
</style>
