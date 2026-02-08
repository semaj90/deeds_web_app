<script lang="ts">
  import type { Correlation, EvidenceAnalysis, Finding } from '$lib/services/ai-evidence-analyzer';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

  // Chart is dynamically imported in the browser to avoid TS/build errors / SSR issues
  let Chart: any = null;

  interface Props {
    analysis: EvidenceAnalysis;
  }

  let { analysis }: Props = $props();

  let canvasRisk: HTMLCanvasElement;
  let canvasEntities: HTMLCanvasElement;
  let canvasTimeline: HTMLCanvasElement;
  let canvasCorrelations: HTMLCanvasElement;
  let canvasSentiment: HTMLCanvasElement;
  let charts: any[] = [];

  $effect(() => {
    // Guard for SSR/build-time: only run in browser
    if (typeof window === 'undefined') return;

    let cancelled = false;

    (async () => {
      if (!Chart) {
        // dynamic import so TS doesn't require: 'chart.js/auto' at build-time
        const mod = await import('chart.js/auto');
        Chart = mod?.default ?? mod;
      }

      if (cancelled) return;

      // render charts after Chart is available
      renderRiskChart();
      renderEntitiesChart();
      renderTimelineChart();
      renderCorrelationsChart();
      renderSentimentChart();
    })();

    return () => {
      cancelled = true;
      charts.forEach(chart => chart.destroy());
      charts = [];
    };
  });

  function renderRiskChart() {
    if (!canvasRisk) return;
    const ctx = canvasRisk.getContext('2d');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
	labels: ['Risk', 'Safe'],
        datasets: [{
data: [analysis.riskScore * 100, (1 - analysis.riskScore) * 100],
          backgroundColor: [
            `rgba(${255 * analysis.riskScore},
	${255 * (1 - analysis.riskScore)},
	0, 0.8)`,
            'rgba(34, 197, 94, 0.8)'
          ],
          borderWidth: 2,
          borderColor: '#1f2937'
        }]
      },
	options: {
	responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false
          },
	tooltip: { callbacks: { label: (context: any) => `${context.label}: ${context.parsed.toFixed(1)}%`
            }
          }
        }
      }
    });
    charts.push(chart);
  }

  function renderEntitiesChart() {
    if (!canvasEntities) return;
    const ctx = canvasEntities.getContext('2d');
    if (!ctx) return;

    const entityTypes = ['person', 'organization', 'location', 'date', 'amount', 'object'];

    // Fixed: Correctly count entities by type from analysis.keyEntities
    const entityCounts = entityTypes.map(type =>
      analysis.keyEntities.filter(entity => entity.type.toLowerCase() === type).length
    );

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
labels: entityTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
        datasets: [{
	label: 'Entity Count',
          data: entityCounts,
          backgroundColor: 'rgba(99, 102, 241, 0.8)',
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1
        }]
      },
	options: {
	responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true,
            ticks: {
	precision: 0 }
          }
        },
	plugins: { legend: { display: false }
        }
      }
    });
    charts.push(chart);
  }

  function renderTimelineChart() {
    if (!canvasTimeline) return;
    const ctx = canvasTimeline.getContext('2d');
    if (!ctx) return;

    const sortedEvents = [...analysis.timeline].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
labels: sortedEvents.map(e => new Date(e.timestamp).toLocaleDateString()),
        datasets: [{
	label: 'Event Confidence',
          data: sortedEvents.map(e => (e.confidence as number) * 100),
          borderColor: 'rgba(168, 85, 247, 1)',
          backgroundColor: 'rgba(168, 85, 247, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
	options: {
	responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true,
            max: 100,
            title: {
	display: true,
              text: 'Confidence %'
            }
          }
        },
	plugins: { tooltip: { callbacks: {
	afterLabel: (context: any) => {
                const event = sortedEvents[context.dataIndex];
                return `${event.type}: ${event.description}`;
              }
            }
          }
        }
      }
    });
    charts.push(chart);
  }

  function renderCorrelationsChart() {
    if (!canvasCorrelations) return;
    const ctx = canvasCorrelations.getContext('2d');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'radar',
      data: {
labels: analysis.correlations.map((_, i) => `Evidence ${i + 1}`),
        datasets: [{
	label: 'Correlation Strength',
          data: analysis.correlations.map(c => c.strength * 100),
          borderColor: 'rgba(34, 197, 94, 1)',
          backgroundColor: 'rgba(34, 197, 94, 0.2)',
          pointBackgroundColor: 'rgba(34, 197, 94, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(34, 197, 94, 1)'
        }]
      },
	options: {
	responsive: true,
        maintainAspectRatio: false,
        scales: { r: { beginAtZero: true,
            max: 100,
            ticks: {
	stepSize: 20 }
          }
        }
      }
    });
    charts.push(chart);
  }

  function renderSentimentChart() {
    if (!canvasSentiment) return;
    const ctx = canvasSentiment.getContext('2d');
    if (!ctx) return;

    const emotions = analysis.sentiment.emotions;
    const chart = new Chart(ctx, {
      type: 'polarArea',
      data: {
labels: Object.keys(emotions).map((e: string) => e.charAt(0).toUpperCase() + e.slice(1)),
        datasets: [{
	data: Object.values(emotions).map(v => v * 100),
          backgroundColor: [
            'rgba(239, 68, 68, 0.7)', // anger - red
            'rgba(156, 163, 175, 0.7)', // fear - gray
            'rgba(251, 191, 36, 0.7)', // joy - yellow
            'rgba(59, 130, 246, 0.7)', // sadness - blue
            'rgba(236, 72, 153, 0.7)', // surprise - pink
            'rgba(34, 197, 94, 0.7)'     // trust - green
          ],
          borderWidth: 1
        }]
      },
	options: {
	responsive: true,
        maintainAspectRatio: false,
        scales: { r: { beginAtZero: true, max: 100 }
        },
	plugins: { legend: { position: 'right' }
        }
      }
    });
    charts.push(chart);
  }

  function getFindingIcon(type: Finding['type']) {
    switch (type) {
      case 'pattern': return '🔄';
      case 'anomaly': return '⚠️';
      case 'match': return '✅';
      case 'contradiction': return '❌';
      case 'gap': return '❓';
      default:return '📊';
    }
  }

  function getCorrelationIcon(type: Correlation['correlationType']) {
    switch (type) {
      case 'temporal': return '🕒';
      case 'spatial': return '📍';
      case 'causal': return '➡️';
      case 'semantic': return '💬';
      case 'entity': return '👥';
      default:return '🔗';
    }
  }
</script>

<div class="evidence-analysis-visualization">
  <div class="analysis-header">
    <h2 class="text-2xl font-bold text-gray-900">Evidence Analysis Report</h2>
    <div class="metadata">
      <span class="badge">Model: {analysis.aiModel}</span>
      <span class="badge">Confidence: {(analysis.confidence * 100).toFixed(1)}%</span>
      <time class="text-sm">
        {new Date(analysis.timestamp).toLocaleString()}
      </time>
    </div>
  </div>

  <div class="summary-section">
    <h3 class="section-title">Executive Summary</h3>
    <p class="summary-text">{analysis.summary}</p>
  </div>

  <div class="charts-grid">
    <div class="chart-container">
      <h3 class="chart-title">Risk Assessment</h3>
      <canvas bind:this={canvasRisk}></canvas>
      <div class="risk-value">
        <span
          class="risk-score"
          style="color: {analysis.riskScore > 0.7
            ? '#ef4444'
            : analysis.riskScore > 0.4
              ? '#f59e0b'
              : '#22c55e'}"
        >
          {(analysis.riskScore * 100).toFixed(0)}%
        </span>
        <span class="risk-label">Risk Level</span>
      </div>
    </div>
    <div class="chart-container">
      <h3 class="chart-title">Entity Distribution</h3>
      <canvas bind:this={canvasEntities}></canvas>
    </div>
    <div class="chart-container">
      <h3 class="chart-title">Timeline Analysis</h3>
      <canvas bind:this={canvasTimeline}></canvas>
    </div>
    <div class="chart-container">
      <h3 class="chart-title">Evidence Correlations</h3>
      <canvas bind:this={canvasCorrelations}></canvas>
    </div>
    <div class="chart-container">
      <h3 class="chart-title">Sentiment Analysis</h3>
      <canvas bind:this={canvasSentiment}></canvas>
    </div>
  </div>

  <div class="findings-section">
    <h3 class="section-title">Key Findings</h3>
    <div class="findings-grid">
      {#each Array.isArray(analysis.findings) ? analysis.findings : [] as finding}
        <div class="finding-card {finding.type}">
          <div class="finding-header">
            <span class="finding-icon">{getFindingIcon(finding.type)}</span>
            <span class="finding-type">{finding.type}</span>
            <span class="finding-confidence">{(finding.confidence * 100).toFixed(0)}%</span>
          </div>
          <p class="finding-description">{finding.description}</p>
          <div class="finding-relevance">
            <div class="relevance-bar" style="width: {finding.relevance * 100}%"></div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="correlations-section">
    <h3 class="section-title">Related Evidence</h3>
    <div class="correlations-list">
      {#each Array.isArray(analysis.correlations) ? analysis.correlations : [] as correlation}
        <div class="correlation-item">
          <span class="correlation-icon">{getCorrelationIcon(correlation.correlationType)}</span>
          <div class="correlation-content">
            <p class="correlation-description">{correlation.description}</p>
            <div class="correlation-meta">
              <span class="correlation-type">{correlation.correlationType}</span>
              <span class="correlation-strength">Strength: {(correlation.strength * 100).toFixed(0)}%</span>
            </div>
            {#if correlation.sharedEntities.length > 0}
              <div class="shared-entities">
                {#each Array.isArray(correlation.sharedEntities) ? correlation.sharedEntities : [] as entity}
                  <span class="entity-tag">{entity}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="recommendations-section">
    <h3 class="section-title">Recommendations</h3>
    <ol class="recommendations-list">
      {#each Array.isArray(analysis.recommendations) ? analysis.recommendations : [] as recommendation}
        <li class="recommendation-item">
          <span class="recommendation-number">{analysis.recommendations.indexOf(recommendation) + 1}</span>
          <p>{recommendation}</p>
        </li>
      {/each}
    </ol>
  </div>

  <div class="entities-section">
    <h3 class="section-title">Extracted Entities</h3>
    <div class="entities-grid">
      {#each Array.isArray(analysis.keyEntities) ? analysis.keyEntities : [] as entity}
        <div class="entity-card">
          <span class="entity-type">{entity.type}</span>
          <strong class="entity-value">{entity.value}</strong>
          <div class="entity-stats">
            <span>Mentions: {entity.mentions}</span>
            <span>Confidence: {(entity.confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>

<style>
  .evidence-analysis-visualization { padding: 1.5rem; background: #ffffff;
    border-radius: 0.5rem;
    box-shadow: 0 6px 18px rgba(15, 23, 42, 0.06);
  }
  .analysis-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid #e5e7eb;
    padding-bottom: 1rem;
  }
  .metadata { display: flex; gap: 0.75rem;
    align-items: center;
  }
  .badge {
    padding: 0.25rem 0.75rem;
    background: #eef2ff;
	color: #3730a3;
    border-radius: 9999px;
    font-size: 0.875rem;
  }
  .section-title {
    font-size: 1.125rem;
    font-weight: 600;
	color: #1f2937;
    margin-bottom: 0.75rem;
  }
  .summary-section { background: #f9fafb; padding: 1rem;
    border-radius: 0.5rem;
  }
  .summary-text {
    color: #374151;
    line-height: 1.6;
  }
  .charts-grid {
    display: grid;
    grid-template-columns: 1fr;
	gap: 1.5rem;
  }
  .chart-container { background: #f9fafb; padding: 1rem;
    border-radius: 0.5rem;
	position: relative;
    min-height: 250px;
  }
  .chart-title {
    font-size: 0.875rem;
    font-weight: 500;
	color: #374151;
    margin-bottom: 0.5rem;
  }
  .risk-value { position: absolute; top: 50%;
    left: 50%;
	transform: translate(-50%, -50%);
    text-align: center;
  }
  .risk-score {
    font-size: 1.75rem;
    font-weight: 700;
	display: block;
  }
  .risk-label {
    font-size: 0.875rem;
	color: #6b7280;
  }
  .findings-grid {
    display: grid;
    grid-template-columns: 1fr;
	gap: 1rem;
  }
  .finding-card {
    padding: 1rem;
    border-radius: 0.5rem;
	border: 1px solid #e5e7eb;
  }
  .finding-card.pattern {
    background: #eff6ff;
    border-color: #bfdbfe;
  }
  .finding-card.anomaly {
    background: #fffbeb;
    border-color: #fef3c7;
  }
  .finding-card.match {
    background: #ecfdf5;
    border-color: #bbf7d0;
  }
  .finding-card.contradiction {
    background: #fff1f2;
    border-color: #fecaca;
  }
  .finding-card.gap {
    background: #f8fafc;
    border-color: #e6eef3;
  }
  .finding-header {
    display: flex;
    align-items: center;
	gap: 0.5rem;
    margin-bottom: 0.5rem;
  }
  .finding-icon {
    font-size: 1.25rem;
  }
  .finding-type {
    font-size: 0.875rem;
    font-weight: 500;
    text-transform: capitalize;
  }
  .finding-confidence {
    margin-left: auto;
    font-size: 0.875rem;
	color: #6b7280;
  }
  .finding-description {
    font-size: 0.875rem;
	color: #374151;
    margin-bottom: 0.5rem;
  }
  .finding-relevance { height: 0.5rem; background: #e5e7eb;
    border-radius: 9999px;
	overflow: hidden;
  }
  .relevance-bar { height: 100%; background: #6366f1;
    transition:all 0.3s;
  }

  .charts-grid { display: grid; grid-template-columns: 1fr;
	gap: 1.5rem; }
  .chart-container { background: #f9fafb; padding: 1rem; border-radius: 0.5rem;
	position: relative; min-height: 250px; }
  .chart-title { font-size: 0.875rem; font-weight: 500;
	color: #374151; margin-bottom: 0.5rem; }
  .risk-value { position: absolute; top: 50%; left: 50%;
	transform: translate(-50%, -50%); text-align: center; }
  .risk-score { font-size: 1.75rem; font-weight: 700;
	display: block; }
  .risk-label { font-size: 0.875rem;
	color: #6b7280; }
  .findings-grid { display: grid; grid-template-columns: 1fr;
	gap: 1rem; }
  .finding-card { padding: 1rem; border-radius: 0.5rem;
	border: 1px solid #e5e7eb; }
  .finding-card.pattern { background: #eff6ff; border-color: #bfdbfe; }
  .finding-card.anomaly { background: #fffbeb; border-color: #fef3c7; }
  .finding-card.match { background: #ecfdf5; border-color: #bbf7d0; }
  .finding-card.contradiction { background: #fff1f2; border-color: #fecaca; }
  .finding-card.gap { background: #f8fafc; border-color: #e6eef3; }
  .finding-header { display: flex; align-items: center;
	gap: 0.5rem; margin-bottom: 0.5rem; }
  .finding-icon { font-size: 1.25rem; }
  .finding-type { font-size: 0.875rem; font-weight: 500; text-transform: capitalize; }
  .finding-confidence { margin-left: auto; font-size: 0.875rem;
	color: #6b7280; }
  .finding-description { font-size: 0.875rem;
	color: #374151; margin-bottom: 0.5rem; }
  .finding-relevance { height: 0.5rem; background: #e5e7eb; border-radius: 9999px;
	overflow: hidden; }
  .relevance-bar { height: 100%; background: #6366f1; transition:all 0.3s; }
  .correlations-list { margin-top: 0.5rem; }
  .correlation-item { display: flex; gap: 0.75rem; padding: 0.75rem;
	background: #f9fafb; border-radius: 0.5rem; }
  .correlation-icon { font-size: 1.25rem; }
  .correlation-content { flex: 1; }
  .correlation-description { font-size: 0.875rem;
	color: #374151; margin-bottom: 0.25rem; }
  .correlation-meta { display: flex; gap: 0.75rem; font-size: 0.75rem;
	color: #6b7280; }
  .shared-entities { display: flex; flex-wrap: wrap;
	gap: 0.25rem; margin-top: 0.5rem; }
  .entity-tag { padding: 0.25rem 0.5rem; background: #e5e7eb; border-radius: 0.25rem; font-size: 0.75rem; }
  .recommendations-list { margin-top: 0.5rem; }
  .recommendation-item { display: flex; gap: 0.75rem; }
  .recommendation-number { width: 1.5rem; height: 1.5rem; background: #6366f1;
	color: #ffffff; border-radius: 9999px;
	display: flex; align-items: center; justify-content: center; font-size: 0.875rem; font-weight: 600; }
  .entities-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; }
  .entity-card { padding: 0.75rem; background: #f9fafb; border-radius: 0.5rem; }
  .entity-type { font-size: 0.75rem;
	color: #6b7280; text-transform: uppercase; }
  .entity-value { display: block; font-size: 0.875rem;
	color: #111827; margin: 0.25rem 0; }
  .entity-stats { display: flex; justify-content: space-between; font-size: 0.75rem;
	color: #6b7280; }
</style>






