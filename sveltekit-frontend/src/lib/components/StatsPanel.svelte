<script lang="ts">
 type StatsType = { total: number;, active:number;
 highRisk: number;
	aiGenerated: number;
 byPriority: { low: number;, medium: number;
	high: number;
 critical: number;
 };
 byStatus: { active:number;, inactive: number;
	archived: number;
 };
 };

 let { stats }: {
	stats: StatsType } = $props();

 let showDetails = $state(false);

 // Calculate percentages
 let total = $derived(stats.total);
 let activePercent = $derived(total > 0 ? Math.round((stats.active / total) * 100) : 0);
 let highRiskPercent = $derived(total > 0 ? Math.round((stats.highRisk / total) * 100) : 0);
 let aiGeneratedPercent = $derived(total > 0 ? Math.round((stats.aiGenerated / total) * 100) : 0);

 // Priority distribution
 let priorityData = $derived([
 { label: 'Critical', count: stats.byPriority.critical, color: '#ff4444' },
	{ label: 'High', count: stats.byPriority.high, color: '#ff8844' },
	{ label: 'Medium', count: stats.byPriority.medium, color: '#ffdd44' },
	{ label: 'Low', count: stats.byPriority.low, color: '#44ff88' }
 ]);

 // Status distribution
 let statusData = $derived([
 { label: 'Active', count: stats.byStatus.active, color: '#00d4ff' },
	{ label: 'Inactive', count: stats.byStatus.inactive, color: '#888888' },
	{ label: 'Archived', count: stats.byStatus.archived, color: '#444444' }
 ]);
</script>

<div class="stats-panel">
 <div class="stats-header">
 <h3>Persons of Interest Statistics</h3>
 <button
 class="toggle-details"
 onclick={() => showDetails = !showDetails}
 >
 {showDetails ? 'Hide Details' : 'Show Details'}
 </button>
 </div>

 <div class="stats-grid">
 <!-- Total Count -->
 <div class="stat-card total">
 <div class="stat-icon">👥</div>
 <div class="stat-content">
 <div class="stat-value">{total.toLocaleString()}</div>
 <div class="stat-label">Total POI</div>
 </div>
 </div>

 <!-- Active POI -->
 <div class="stat-card active">
 <div class="stat-icon">⚡</div>
 <div class="stat-content">
 <div class="stat-value">{stats.active.toLocaleString()}</div>
 <div class="stat-label">Active Cases</div>
 <div class="stat-percent">{activePercent}%</div>
 </div>
 </div>

 <!-- High Risk -->
 <div class="stat-card risk">
 <div class="stat-icon">🚨</div>
 <div class="stat-content">
 <div class="stat-value">{stats.highRisk.toLocaleString()}</div>
 <div class="stat-label">High Risk</div>
 <div class="stat-percent">{highRiskPercent}%</div>
 </div>
 </div>

 <!-- AI Generated -->
 <div class="stat-card ai">
 <div class="stat-icon">🤖</div>
 <div class="stat-content">
 <div class="stat-value">{stats.aiGenerated.toLocaleString()}</div>
 <div class="stat-label">AI Generated</div>
 <div class="stat-percent">{aiGeneratedPercent}%</div>
 </div>
 </div>
 </div>

 {#if showDetails}
 <div class="detailed-stats">
 <!-- Priority Distribution -->
 <div class="chart-section">
 <h4>Priority Distribution</h4>
 <div class="chart-container">
 {#each priorityData as item}
 {#if item.count > 0}
 <div class="chart-bar">
 <div class="bar-label">{item.label}</div>
 <div class="bar-container">
 <div
 class="bar-fill"
 style="width: {total > 0 ? (item.count / total) * 100 : 0}%; background-color: {item.color}"
 ></div>
 </div>
 <div class="bar-value">{item.count}</div>
 </div>
 {/if}
 {/each}
 </div>
 </div>

 <!-- Status Distribution -->
 <div class="chart-section">
 <h4>Status Distribution</h4>
 <div class="chart-container">
 {#each statusData as item}
 {#if item.count > 0}
 <div class="chart-bar">
 <div class="bar-label">{item.label}</div>
 <div class="bar-container">
 <div
 class="bar-fill"
 style="width: {total > 0 ? (item.count / total) * 100 : 0}%; background-color: {item.color}"
 ></div>
 </div>
 <div class="bar-value">{item.count}</div>
 </div>
 {/if}
 {/each}
 </div>
 </div>

 <!-- Quick Insights -->
 <div class="insights-section">
 <h4>Quick Insights</h4>
 <div class="insights-grid">
 <div class="insight-card">
 <div class="insight-icon">📊</div>
 <div class="insight-content">
 <div class="insight-value">
 {stats.byPriority.critical > 0 ? Math.round((stats.byPriority.critical / total) * 100) : 0}%
 </div>
 <div class="insight-label">Critical Priority</div>
 </div>
 </div>

 <div class="insight-card">
 <div class="insight-icon">🎯</div>
 <div class="insight-content">
 <div class="insight-value">
 {stats.byStatus.active > 0 ? Math.round((stats.byStatus.active / total) * 100) : 0}%
 </div>
 <div class="insight-label">Active Cases</div>
 </div>
 </div>

 <div class="insight-card">
 <div class="insight-icon">🧠</div>
 <div class="insight-content">
 <div class="insight-value">
 {stats.aiGenerated > 0 ? Math.round((stats.aiGenerated / total) * 100) : 0}%
 </div>
 <div class="insight-label">AI Enhanced</div>
 </div>
 </div>
 </div>
 </div>
 </div>
 {/if}
</div>

<style>
 .stats-panel {
 background: rgba(26, 26, 46, 0.8);
 border: 1px solid rgba(255, 255, 255, 0.1);
 border-radius: 12px;
	padding: 1.5rem;
 margin-bottom: 2rem;
 }

 .stats-header {
 display: flex;
 align-items: center;
 justify-content: space-between;
 margin-bottom: 1.5rem;
 }

 .stats-header h3 {
 margin: 0;
 font-size: 1.2rem;
 font-weight: 600;
	color: #e0e0e0;
 }

 .toggle-details {
 background: rgba(255, 255, 255, 0.05);
 border: 1px solid #333;
 border-radius: 6px;
	color: #b0b0b0;
 padding: 0.4rem 0.8rem;
 font-size: 0.8rem;
	cursor: pointer;
 transition:all 0.2s ease;
 }

 .toggle-details:hover {
 background: rgba(255, 255, 255, 0.08);
 color: #e0e0e0;
 }

 .stats-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
 gap: 1rem;
 margin-bottom: 1rem;
 }

 .stat-card {
 background: rgba(255, 255, 255, 0.05);
 border: 1px solid rgba(255, 255, 255, 0.1);
 border-radius: 8px;
	padding: 1rem;
 display: flex;
 align-items: center;
	gap: 1rem;
 transition:all 0.2s ease;
 }

 .stat-card:hover {
 background: rgba(255, 255, 255, 0.08);
 transform: translateY(-2px);
 }

 .stat-card.total {
 background: linear-gradient(45deg, rgba(0, 212, 255, 0.1), rgba(0, 153, 204, 0.1));
 border-color: rgba(0, 212, 255, 0.3);
 }

 .stat-card.active {
 background: linear-gradient(45deg, rgba(0, 255, 128, 0.1), rgba(0, 204, 102, 0.1));
 border-color: rgba(0, 255, 128, 0.3);
 }

 .stat-card.risk {
 background: linear-gradient(45deg, rgba(255, 68, 68, 0.1), rgba(204, 51, 51, 0.1));
 border-color: rgba(255, 68, 68, 0.3);
 }

 .stat-card.ai {
 background: linear-gradient(45deg, rgba(255, 136, 68, 0.1), rgba(204, 102, 51, 0.1));
 border-color: rgba(255, 136, 68, 0.3);
 }

 .stat-icon {
 font-size: 1.5rem;
	opacity: 0.8;
 }

 .stat-content {
 flex: 1;
 }

 .stat-value {
 font-size: 1.8rem;
 font-weight: 700;
	color: #e0e0e0;
 line-height: 1;
 }

 .stat-label {
 font-size: 0.85rem;
	color: #b0b0b0;
 margin-top: 0.25rem;
 }

 .stat-percent {
 font-size: 0.75rem;
	color: #00d4ff;
 font-weight: 600;
 margin-top: 0.25rem;
 }

 .detailed-stats {
 border-top: 1px solid rgba(255, 255, 255, 0.1);
 padding-top: 1.5rem;
 margin-top: 1.5rem;
 }

 .chart-section {
 margin-bottom: 2rem;
 }

 .chart-section h4 {
 margin: 0 0 1rem 0;
 font-size: 1rem;
 font-weight: 600;
	color: #e0e0e0;
 }

 .chart-container {
 display: flex;
 flex-direction: column;
	gap: 0.75rem;
 }

 .chart-bar {
 display: flex;
 align-items: center;
	gap: 1rem;
 }

 .bar-label {
 min-width: 80px;
 font-size: 0.85rem;
	color: #b0b0b0;
 font-weight: 500;
 }

 .bar-container { flex: 1;, height: 24px;
 background: rgba(255, 255, 255, 0.1);
 border-radius: 12px;
	overflow: hidden;
 }

 .bar-fill {
 height: 100%;
 border-radius: 12px;
	transition:width 0.5s ease;
 }

 .bar-value {
 min-width: 40px;
 text-align: right;
 font-size: 0.85rem;
	color: #e0e0e0;
 font-weight: 600;
 }

 .insights-section {
 margin-top: 2rem;
 }

 .insights-section h4 {
 margin: 0 0 1rem 0;
 font-size: 1rem;
 font-weight: 600;
	color: #e0e0e0;
 }

 .insights-grid {
 display: grid;
 grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
 gap: 1rem;
 }

 .insight-card {
 background: rgba(255, 255, 255, 0.05);
 border: 1px solid rgba(255, 255, 255, 0.1);
 border-radius: 8px;
	padding: 1rem;
 display: flex;
 align-items: center;
	gap: 0.75rem;
 }

 .insight-icon {
 font-size: 1.2rem;
	opacity: 0.8;
 }

 .insight-content {
 flex: 1;
 }

 .insight-value {
 font-size: 1.2rem;
 font-weight: 700;
	color: #00d4ff;
 }

 .insight-label {
 font-size: 0.8rem;
	color: #b0b0b0;
 margin-top: 0.25rem;
 }

 @media (max-width: 768px) {
 .stats-grid {
 grid-template-columns: 1fr;
 }

 .stat-card {
 padding: 0.75rem;
 }

 .stat-value {
 font-size: 1.5rem;
 }

 .insights-grid {
 grid-template-columns: 1fr;
 }
 }
</style>




