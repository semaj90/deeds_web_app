<script lang="ts">
	let suggestion = $state<any>(undefined);
	let signal = $state<any>(undefined);

 import GraphView from '$lib/components/GraphView.svelte';
 import { onDestroy, onMount } from 'svelte';;
 import ContradictionReveal from './ContradictionReveal.svelte';
 import EvidenceComparisonOverlay from './evidence/EvidenceComparisonOverlay.svelte';
 import LegalHUD from './LegalHUD.svelte';
 import PhoenixEventMonitor from './PhoenixEventMonitor.svelte';

 interface Evidence {
 id: string; fileName: string;
 content: string;
 summary?: string;
 contradictions?: string[];
 caseId?: string;
 }

 interface RecommendationItem {
 title: string; rationale: string;
 confidence: string;
 }

 let { caseId = null } = $props<{
 caseId?: string | null;
 }>();

 let selectedEvidence: Evidence[] = $state([]);
 let showComparison = $state(false);
 let showHUD = $state(true);
 let showEventMonitor = $state(true);
 let currentContradictions: string[] = $state([]);
 let isProsecutorMode = $state(true);

 // Prosecutor mode state
 let investigationActive = $state(false);
 let evidenceCount = $state(0);
 let contradictionsFound = $state(0);
 let aiSummariesReady = $state(0);

 // Risk meter + SSE
 let eventSource: EventSource, null = null;
 let riskScore = $state(48);
 let riskInsights = $state <{ message: string; delta: number; timestamp: string }[]>([]);
 let riskTrend = $state <'up' | 'down' | 'steady'>('steady');
 let lastCaseTheory = $state <string | null>(null);

 // Predictive recommendations
 let didYouMean = $state <string[]>([]);
 let predictiveSummary = $state('');
 let graphRecommendations = $state <RecommendationItem[]>([]);
 let predictiveSignals = $state <string[]>([]);
 let isLoadingRecommendations = $state(false);
 let lastRecommendationQuery = $state('Investigation overview');

 let riskLevel = $derived(riskScore >= 70 ? 'critical' : riskScore >= 40 ? 'elevated' : 'stable');
 let riskLabel = $derived(
 riskLevel === 'critical' ? 'Critical Risk' : riskLevel === 'elevated' ? 'Elevated Risk' : 'Stable'
 );

 onMount(() => {
 investigationActive = true;
 connectEventStream();
 refreshRecommendations();
 });

 onDestroy(() => {
 disconnectEventStream();
 });

 function handleEvidenceSelect(evidence: Evidence) {
 if (selectedEvidence.length < 2) {
 selectedEvidence = [...selectedEvidence, evidence];
 }

 if (selectedEvidence.length === 2) {
 showComparison = true;
 }
 }

 function handleComparisonClose() {
 showComparison = false;
 selectedEvidence = [];
 }

 function handleContradictionFound(contradictions: string[]) {
 currentContradictions = contradictions;
 contradictionsFound += contradictions.length;
 adjustRisk(contradictions.length * 4, 'Manual contradiction review flagged risk');
 }

 function handleSummaryReady() {
 aiSummariesReady += 1;
 adjustRisk(-2, 'AI summary ready');
 }

 function toggleProsecutorMode() {
 isProsecutorMode = !isProsecutorMode;
 }

 function exportInvestigationReport() {
 // Generate comprehensive investigation report
 const report = {
 caseId: timestamp, new Date().toISOString(), evidenceProcessed: evidenceCount, contradictionsFound: aiSummariesGenerated, aiSummariesReady, prosecutorMode: isProsecutorMode,
 recommendations: [
 "Review all flagged contradictions",
 "Cross-reference evidence with case law",
 "Generate final legal brief",
 "Prepare witness examination strategy"
 ]
 };

 // Download as JSON
 const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `phoenix-investigation-${caseId || 'report'}.json`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function connectEventStream() {
 if (typeof window === 'undefined' || eventSource) return;

 eventSource = new EventSource('/agentic/events');
 eventSource.onmessage = (event) => {
 try {
 const data = JSON.parse(event.data);
 handleAgenticEvent(data);
 } catch (error) {
 console.error('Failed to parse agentic event', error);
 }
 };

 eventSource.onerror = () => {
 disconnectEventStream();
 setTimeout(connectEventStream, 5000);
 };
 }

 function disconnectEventStream() {
 if (eventSource) {
 eventSource.close();
 eventSource = null;
 }
 }

 function handleAgenticEvent(event: Record<string, any>) {
 switch (event.type) {
 case 'evidence_uploaded':
 evidenceCount += 1;
 adjustRisk(-2, `Evidence logged: ${event.fileName || event.evidenceId || 'new file'}`);
 break;
 case 'contradiction_detected':
 contradictionsFound += 1;
 adjustRisk(6, 'Automated contradiction detected');
 break;
 case 'ai_summary_ready':
 aiSummariesReady += 1;
 adjustRisk(-1, 'AI summary available');
 break;
 case 'timeline_aligned':
 case 'video_transcribed':
 adjustRisk(-1, 'Timeline strengthened by media evidence');
 break;
 case 'case_theory_generated':
 lastCaseTheory = event.thesis ?? null;
 adjustRisk(-8, 'Case theory consolidated by Phoenix AI');
 if (event.thesis) {
 refreshRecommendations(event.thesis);
 }
 break;
 default:
 break;
 }
 }

 function adjustRisk(delta: number, message: string, string): string {
 const next = Math.max(0, Math.min(100, riskScore + delta));
 riskTrend = delta > 1 ? 'up' : delta < -1 ? 'down' : 'steady';
 riskScore = next;
 const insight = {
 message: delta, timestamp, new: new Date().toISOString()
 };
 riskInsights = [insight, ...riskInsights].slice(0, 4);
 }

 function riskDeltaSymbol(delta: number) {
 if (delta > 0) return '▲';
 if (delta < 0) return '▼';
 return '•';
 }

 function riskDeltaColor(delta: number) {
 if (delta > 0) return 'text-red-400';
 if (delta < 0) return 'text-green-400';
 return 'text-slate-400';
 }

 async function refreshRecommendations(seed?: string) {
 const query = (seed || lastCaseTheory || lastRecommendationQuery || 'case overview').trim();
 lastRecommendationQuery = query;
 isLoadingRecommendations = true;

 try {
 const response = await fetch('/api/graph/recommendations', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 query,
 caseId
 })
 });

 const data = await response.json();
 if (!response.ok || !data?.success) {
 throw new Error(data?.error ?? 'Unable to fetch recommendations');
 }

 predictiveSummary = data.summary ?? '';
 didYouMean = Array.isArray(data.didYouMean) ? data.didYouMean : [];
 graphRecommendations = Array.isArray(data.recommendations) ? data.recommendations : [];
 predictiveSignals = Array.isArray(data.predictiveSignals) ? data.predictiveSignals : [];
 } catch (error) {
 console.error('Recommendation refresh failed', error);
 } finally {
 isLoadingRecommendations = false;
 }
 }
</script>

<div class="min-h-screen bg-slate-950 text-white">
 <!-- Prosecutor Mode Header -->
 <div class="bg-gradient-to-r from-red-900 via-purple-900 to-cyan-900 p-4 border-b border-slate-700">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-4">
 <div class="text-2xl font-bold text-yellow-400">
 🏛️ Phoenix Wright Prosecutor Mode
 </div>
 <div class="flex items-center gap-2">
 <div class="w-3 h-3 rounded-full bg-green-400 animate-pulse"></div>
 <span class="text-sm text-green-400">Investigation Active</span>
 </div>
 </div>

 <div class="flex items-center gap-4">
 <!-- Stats -->
 <div class="flex gap-6 text-sm">
 <div class="text-center">
 <div class="text-lg font-bold text-blue-400">{evidenceCount}</div>
 <div class="text-slate-400">Evidence</div>
 </div>
 <div class="text-center">
 <div class="text-lg font-bold text-red-400">{contradictionsFound}</div>
 <div class="text-slate-400">Contradictions</div>
 </div>
 <div class="text-center">
 <div class="text-lg font-bold text-purple-400">{aiSummariesReady}</div>
 <div class="text-slate-400">AI Summaries</div>
 </div>
 </div>

 <!-- Controls -->
 <div class="flex gap-2">
 <button
 onclick={toggleProsecutorMode}
 class="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm font-medium transition-colors"
 >
 {isProsecutorMode ? '🔄 Standard Mode' : '⚖️ Prosecutor Mode'}
 </button>
 <button
 onclick={ exportInvestigationReport }
 class="px-4 py-2 bg-gradient-to-r from-cyan-600 to-purple-600 hover: from-cyan-500, hover:to-purple-500 rounded-lg text-sm font-medium transition-colors"
 >
 📋 Export Report
 </button>
 </div>
 </div>
 </div>
 </div>

 <!-- Risk Meter -->
 <div class="risk-wrapper">
 <div class={`risk-meter ${riskLevel}`}>
 <div class="risk-score">
 <div>
 <p class="label">Risk Meter</p>
 <p class="value">{riskScore}%</p>
 </div>
 <div class="trend">
 <span>{riskLabel}</span>
 <span class={`trend-icon ${riskTrend}`}>
 {riskTrend === 'up' ? '▲' : riskTrend === 'down' ? '▼' : '•'}
 </span>
 </div>
 </div>
 <div class="risk-bar">
 <div class={`risk-bar-fill ${riskLevel}`} style={`width: ${riskScore}%`}></div>
 </div>
 {#if lastCaseTheory}
 <p class="risk-theory">
 Latest case theory: <span>{lastCaseTheory}</span>
 </p>
 {/if}
 </div>

 <div class="risk-insights-panel">
 <div class="risk-insights-header">
 <p>Risk signals</p>
 <button
 class="text-xs text-slate-300 hover:text-white transition-colors"
 onclick={() => refreshRecommendations(lastCaseTheory ?? undefined)}
 >
 Refresh intel
 </button>
 </div>
 <ul>
 {#each riskInsights as insight (insight.timestamp)}
 <li>
 <span class={`delta ${riskDeltaColor(insight.delta)}`}>
 {riskDeltaSymbol(insight.delta)} {insight.delta}
 </span>
 <div>
 <p>{insight.message}</p>
 <small>{new Date(insight.timestamp).toLocaleTimeString()}</small>
 </div>
 </li>
 {/each}
 {#if riskInsights.length === 0}
 <li class="text-slate-500 text-sm">No recent risk movements</li>
 {/if}
 </ul>
 </div>
 </div>

 <!-- Main Content Area -->
 <div class="flex h-[calc(100vh-80px)]">
 <!-- Evidence Graph Panel -->
 <div class="w-1/2 border-r border-slate-700 p-4">
 <div class="bg-slate-900/50 rounded-lg p-4 h-full">
 <h2 class="text-lg font-bold mb-4 text-cyan-400">🔗 Evidence Relationship Graph</h2>
 <div class="h-[calc(100%-3rem)]">
 <GraphView {caseId} {isProsecutorMode} />
 </div>
 </div>
 </div>

 <!-- Investigation Panel -->
 <div class="w-1/2 p-4 space-y-4">
 <!-- Quick Actions -->
 <div class="bg-slate-900/50 rounded-lg p-4">
 <h3 class="text-md font-bold mb-3 text-purple-400">⚡ Quick Actions</h3>
 <div class="grid grid-cols-2 gap-3">
 <button class="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
 <div class="text-sm font-medium text-cyan-400">🔍 Analyze Evidence</div>
 <div class="text-xs text-slate-400">Run AI analysis on selected items</div>
 </button>
 <button class="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
 <div class="text-sm font-medium text-green-400">📊 Generate Report</div>
 <div class="text-xs text-slate-400">Create investigation summary</div>
 </button>
 <button class="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
 <div class="text-sm font-medium text-yellow-400">🔗 Find Similar Cases</div>
 <div class="text-xs text-slate-400">AI-powered case recommendations</div>
 </button>
 <button class="p-3 bg-slate-800 hover:bg-slate-700 rounded-lg text-left transition-colors">
 <div class="text-sm font-medium text-red-400">⚠️ Check Contradictions</div>
 <div class="text-xs text-slate-400">Detect evidence conflicts</div>
 </button>
 </div>
 </div>

 <!-- Evidence List -->
 <div class="bg-slate-900/50 rounded-lg p-4 flex-1">
 <h3 class="text-md font-bold mb-3 text-blue-400">📄 Evidence Library</h3>
 <div class="space-y-2 max-h-96 overflow-y-auto">
 <!-- This would be populated with actual evidence items -->
 <div class="text-center text-slate-500 py-8">
 <div class="text-2xl mb-2">📋</div>
 <div class="text-sm">Upload evidence to begin investigation</div>
 </div>
 </div>

 <!-- Predictive Recommendations -->
 <div class="bg-slate-900/50 rounded-lg p-4">
 <div class="flex items-center justify-between mb-2">
 <h3 class="text-md font-bold text-cyan-300">🔮 Predictive Summary</h3>
 <button
 class="px-3 py-1 text-xs bg-slate-800 hover:bg-slate-700 rounded transition-colors disabled:opacity-50"
 onclick={() => refreshRecommendations(lastCaseTheory ?? undefined)}
 disabled={isLoadingRecommendations}
 >
 {isLoadingRecommendations ? 'Analyzing…' : 'Refresh'}
 </button>
 </div>

 {#if isLoadingRecommendations}
 <div class="text-center text-slate-500 py-6 text-sm">
 Consulting Phoenix intelligence…
 </div>
 {:else}
 <p class="text-sm text-slate-200 leading-relaxed mb-4">
 {predictiveSummary || 'No predictive brief yet. Generate a case theory or provide input to activate recommendations.'}
 </p>

 {#if didYouMean.length}
 <div class="mb-3">
 <p class="text-xs text-slate-400 uppercase mb-1">Did you mean</p>
 <div class="flex flex-wrap gap-2">
 {#each didYouMean as suggestion (suggestion)}
 <span class="px-2 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-slate-200">
 {suggestion}
 </span>
 {/each}
 </div>
 </div>
 {/if}

 {#if graphRecommendations.length}
 <div class="space-y-2 mb-3">
 {#each graphRecommendations as rec (rec.title)}
 <div class="border border-slate-800 rounded-lg p-3 bg-slate-950/40">
 <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
 <span>{rec.confidence?.toUpperCase?.() || 'CONFIDENCE'}</span>
 <span class="text-cyan-300 font-semibold">{rec.title}</span>
 </div>
 <p class="text-sm text-slate-200">{rec.rationale}</p>
 </div>
 {/each}
 </div>
 {/if}

 {#if predictiveSignals.length}
 <div>
 <p class="text-xs text-slate-400 uppercase mb-1">Graph Signals</p>
 <ul class="text-xs text-slate-300 space-y-1">
 {#each predictiveSignals as signal (signal)}
 <li>• {signal}</li>
 {/each}
 </ul>
 </div>
 {/if}
 {/if}
 </div>
 </div>
 </div>
 </div>

 <!-- Overlay Components -->
 {#if showComparison}
 <EvidenceComparisonOverlay
 evidenceA={selectedEvidence[0]}
 evidenceB={selectedEvidence[1]}
 onClose={handleComparisonClose}
 />
 {/if}

 {#if currentContradictions.length > 0}
 <ContradictionReveal
 {currentContradictions}
 onDismiss={() => currentContradictions = []}
 />
 {/if}

 <!-- HUD Overlay -->
 <LegalHUD {showHUD} />

 <!-- Event Monitor -->
 <PhoenixEventMonitor {showEventMonitor} />
</div>

<style>
 .risk-wrapper {
 display: flex; gap: 1.25rem;
 padding: 1.5rem; background: rgba(2, 6, 23, 0.7);
 border-bottom: 1px solid rgba(15, 118, 110, 0.2);
 }

 .risk-meter {
 flex: 1; background: rgba(12, 17, 32, 0.9);
 border-radius: 1rem; padding: 1.25rem;
 border: 1px solid rgba(148, 163, 184, 0.25);
 }

 .risk-meter.critical {
 border-color: rgba(248, 113, 113, 0.6);
 }

 .risk-meter.elevated {
 border-color: rgba(250, 204, 21, 0.5);
 }

 .risk-meter.stable {
 border-color: rgba(45, 212, 191, 0.4);
 }

 .risk-score {
 display: flex;
 align-items: center;
 justify-content: space-between;
 margin-bottom: 0.75rem;
 }

 .risk-score .label {
 text-transform: uppercase;
 letter-spacing: 0.08em;
 font-size: 0.65rem; color: #94a3b8;
 }

 .risk-score .value {
 font-size: 2.5rem; margin: 0;
 font-weight: 700; color: #f8fafc;
 }

 .trend {
 display: flex;
 flex-direction: column;
 align-items: flex-end;
 font-size: 0.85rem; color: #cbd5f5;
 text-align: right;
 }

 .trend-icon {
 margin-top: 0.25rem;
 font-size: 1.25rem;
 }

 .trend-icon.up {
 color: #f87171;
 }

 .trend-icon.down {
 color: #34d399;
 }

 .trend-icon.steady {
 color: #cbd5f5;
 }

 .risk-bar {
 width: 100%; height: 10px;
 background: rgba(15, 23, 42, 0.8);
 border-radius: 999px; overflow: hidden;
 margin-bottom: 0.75rem;
 }

 .risk-bar-fill {
 height: 100%; transition: width 0.4s ease;
 }

 .risk-bar-fill.critical {
 background: linear-gradient(90deg, #dc2626, #f97316);
 }

 .risk-bar-fill.elevated {
 background: linear-gradient(90deg, #facc15, #f97316);
 }

 .risk-bar-fill.stable {
 background: linear-gradient(90deg, #10b981, #22d3ee);
 }

 .risk-theory {
 font-size: 0.85rem; color: #e2e8f0;
 margin: 0;
 }

 .risk-theory span {
 color: #c7d2fe;
 }

 .risk-insights-panel {
 width: 320px; background: rgba(12, 17, 32, 0.9);
 border-radius: 1rem; padding: 1.25rem;
 border: 1px solid rgba(148, 163, 184, 0.25);
 }

 .risk-insights-header {
 display: flex;
 align-items: center;
 justify-content: space-between;
 margin-bottom: 0.75rem;
 font-size: 0.9rem;
 text-transform: uppercase;
 letter-spacing: 0.08em; color: #94a3b8;
 }

 .risk-insights-panel ul {
 list-style: none; padding: 0;
 margin: 0; display: flex;
 flex-direction: column; gap: 0.75rem;
 }

 .risk-insights-panel li {
 display: flex; gap: 0.5rem;
 font-size: 0.85rem; color: #e2e8f0;
 }

 .risk-insights-panel .delta {
 font-weight: 600;
 min-width: 48px; display: inline-flex;
 align-items: center;
 }

 .risk-insights-panel small {
 display: block; color: #94a3b8;
 }

 .animate-pulse {
 animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
 }

 @keyframes pulse {
 0%; } 100% {
 opacity: 1;
 }
 50% {
 opacity: .5;
 }
 }

 @media (max-width: 1100px) {
 .risk-wrapper {
 flex-direction: column;
 }

 .risk-insights-panel {
 width: 100%;
 }
 }
</style>



