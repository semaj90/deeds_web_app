<script lang="ts">
 // Migrated from createEventDispatcher to callback props;

 interface Evidence {
 id: string;
 title: string;
 description?: string;
 content?: string;
 fileName?: string;
 timestamp?: string;
 source?: string;
 }

 interface TimelineEvent {
 id: string;
 timestamp: string;
 title: string;
 description: string;
 source: string;
 confidence: number; // 0-100
 category: 'incident' | 'evidence' | 'witness' | 'action' | 'communication';
 verified: boolean;
 }

 interface TimelineGap {
 id: string;
 startTime: string;
 endTime: string;
 duration: string;
 significance: 'critical' | 'important' | 'minor';
 possibleExplanation: string;
 investigationPriority: 'high' | 'medium' | 'low';
 }

 interface Contradiction {
 id: string;
 description: string;
 events: string[]; // Event IDs
 severity: 'critical' | 'moderate' | 'minor';
 resolution: string;
 }

 interface TimelineReconstruction {
 id: string;
 caseId?: string;
 generatedAt: string;
 events: TimelineEvent[];
 gaps: TimelineGap[];
 contradictions: Contradiction[];
 summary: string;
 confidence: number;
 recommendations: string[];
 }

 let { caseId = null, evidence = [], witnessStatements = [] } = $props<{
 caseId?: string | null;
 evidence?: Evidence[];
 witnessStatements?: Array<{ name: string; statement: string; timestamp?: string }>;
 }>();

 const dispatch = createEventDispatcher();

 let isReconstructing = $state(false);
 let reconstruction = $state <TimelineReconstruction | null>(null);
 let activeView = $state <'timeline' | 'gaps' | 'contradictions' | 'summary'>('timeline');
 let selectedEvent = $state <string | null>(null);
 let timelineScale = $state <'hours' | 'days' | 'weeks'>('days');

 async function reconstructTimeline() {
 if (evidence.length === 0 && witnessStatements.length === 0) {
 alert('Please provide evidence or witness statements for timeline reconstruction.');
 return;
 }

 isReconstructing = true;

 try {
 const response = await fetch('/api/timeline/reconstruct', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 caseId,
 evidence,
 witnessStatements
 })
 });

 if (!response.ok) {
 throw new Error(`Failed to reconstruct timeline: ${response.status}`);
 }

 const result = await response.json();
 reconstruction = result.reconstruction;

 dispatch('timelineReconstructed', { reconstruction });
 } catch (error) {
 console.error('Error reconstructing timeline:', error);
 alert('Failed to reconstruct timeline. Please try again.');
 } finally {
 isReconstructing = false;
 }
 }

 function getEventIcon(category: string) {
 switch (category) {
 case 'incident': return '🚨';
 case 'evidence': return '📋';
 case 'witness': return '👤';
 case 'action': return '⚡';
 case 'communication': return '💬';
 default: return '📅';
 }
 }

 function getConfidenceColor(confidence: number) {
 if (confidence >= 80) return 'text-green-400';
 if (confidence >= 60) return 'text-yellow-400';
 if (confidence >= 40) return 'text-orange-400';
 return 'text-red-400';
 }

 function getGapColor(significance: string) {
 switch (significance) {
 case 'critical': return 'bg-red-900/30 border-red-500';
 case 'important': return 'bg-yellow-900/30 border-yellow-500';
 case 'minor': return 'bg-blue-900/30 border-blue-500';
 default: return 'bg-slate-700 border-slate-600';
 }
 }

 function getContradictionColor(severity: string) {
 switch (severity) {
 case 'critical': return 'text-red-400 bg-red-900/20';
 case 'moderate': return 'text-yellow-400 bg-yellow-900/20';
 case 'minor': return 'text-blue-400 bg-blue-900/20';
 default: return 'text-slate-400 bg-slate-900/20';
 }
 }

 function formatTimestamp(timestamp: string) {
 return new Date(timestamp).toLocaleString();
 }

 function sortEventsByTime(events: TimelineEvent[]) {
 return [...events].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
 }

 function exportTimeline() {
 if (!reconstruction) return;

 const content = `Timeline Reconstruction Report
Generated: ${new Date(reconstruction.generatedAt).toLocaleString()}
Case ID: ${reconstruction.caseId || 'N/A'}
Overall Confidence: ${reconstruction.confidence}%

SUMMARY
${reconstruction.summary}

TIMELINE EVENTS
${sortEventsByTime(reconstruction.events).map(event => `
${formatTimestamp(event.timestamp)} - ${event.title}
 Description: ${event.description}
 Source: ${event.source}
 Category: ${event.category}
 Confidence: ${event.confidence}%
 Verified: ${event.verified ? 'Yes' : 'No'}
`).join('\n')}

IDENTIFIED GAPS
${reconstruction.gaps.map(gap => `
Gap: ${formatTimestamp(gap.startTime)} to ${formatTimestamp(gap.endTime)}
 Duration: ${gap.duration}
 Significance: ${gap.significance.toUpperCase()}
 Priority: ${gap.investigationPriority.toUpperCase()}
 Possible Explanation: ${gap.possibleExplanation}
`).join('\n')}

CONTRADICTIONS
${reconstruction.contradictions.map(contradiction => `
${contradiction.severity.toUpperCase()}: ${contradiction.description}
 Involved Events: ${contradiction.events.join(', ')}
 Resolution: ${contradiction.resolution}
`).join('\n')}

RECOMMENDATIONS
${reconstruction.recommendations.map(rec => `• ${rec}`).join('\n')}`;

 const blob = new Blob([content], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `timeline-reconstruction-${reconstruction.id}.txt`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function clearReconstruction() {
 reconstruction = null;
 activeView = 'timeline';
 selectedEvent = null;
 }
</script>

<div class="timeline-reconstruction bg-slate-900 rounded-lg p-6">
 <div class="flex items-center gap-3 mb-6">
 <div class="text-2xl">⏰</div>
 <h2 class="text-xl font-bold text-orange-400">Timeline Reconstruction Engine</h2>
 </div>

 <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
 <!-- Input Section -->
 <div class="lg:col-span-1 space-y-6">
 <!-- Data Sources -->
 <div>
 <label class="block text-sm font-medium text-slate-300 mb-2">
 Data Sources
 </label>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-3 space-y-2">
 <div class="flex justify-between text-sm">
 <span class="text-slate-400">Evidence:</span>
 <span class="text-white">{evidence.length}</span>
 </div>
 <div class="flex justify-between text-sm">
 <span class="text-slate-400">Witness Statements:</span>
 <span class="text-white">{witnessStatements.length}</span>
 </div>
 </div>
 </div>

 <!-- Evidence Preview -->
 {#if evidence.length > 0}
 <div>
 <label class="block text-sm font-medium text-slate-300 mb-2">
 Evidence Items
 </label>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-3 max-h-32 overflow-y-auto">
 <div class="space-y-1">
 {#each evidence as item (item.id)}
 <p class="text-sm text-slate-300 truncate">• {item.title}</p>
 {/each}
 </div>
 </div>
 </div>
 {/if}

 <!-- Witness Preview -->
 {#if witnessStatements.length > 0}
 <div>
 <label class="block text-sm font-medium text-slate-300 mb-2">
 Witness Statements
 </label>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-3 max-h-32 overflow-y-auto">
 <div class="space-y-1">
 {#each witnessStatements as witness (witness.name)}
 <p class="text-sm text-slate-300 truncate">• {witness.name}</p>
 {/each}
 </div>
 </div>
 </div>
 {/if}

 <!-- Reconstruct Button -->
 <button
 onclick={reconstructTimeline}
 disabled={isReconstructing || (evidence.length === 0 && witnessStatements.length === 0)}
 class="w-full bg-gradient-to-r from-orange-600 to-orange-700 hover:from-orange-500 hover:to-orange-600 disabled:from-slate-600 disabled:to-slate-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
 >
 {#if isReconstructing}
 <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
 Reconstructing...
 {:else}
 🕰️ Reconstruct Timeline
 {/if}
 </button>
 </div>

 <!-- Reconstruction Section -->
 <div class="lg:col-span-3">
 {#if reconstruction}
 <!-- View Navigation -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-1 mb-6 flex">
 {#each ['timeline', 'gaps', 'contradictions', 'summary'] as view}
 <button
 onclick={() => activeView = view}
 class="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors {activeView === view ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}"
 >
 {view.charAt(0).toUpperCase() + view.slice(1)}
 </button>
 {/each}
 </div>

 <!-- Reconstruction Header -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 mb-6">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-4">
 <h3 class="text-lg font-bold text-green-400">Timeline Reconstructed</h3>
 <div class="flex items-center gap-2">
 <span class="text-sm text-slate-400">Confidence:</span>
 <span class="font-bold {getConfidenceColor(reconstruction.confidence)}">
 {reconstruction.confidence}%
 </span>
 </div>
 </div>
 <div class="flex gap-2">
 <button
 onclick={exportTimeline}
 class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm"
 title="Export timeline"
 >
 💾
 </button>
 <button
 onclick={clearReconstruction}
 class="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm"
 title="Clear reconstruction"
 >
 🗑️
 </button>
 </div>
 </div>
 <p class="text-sm text-slate-400 mt-2">
 Generated: {new Date(reconstruction.generatedAt).toLocaleString()}
 </p>
 </div>

 <!-- View Content -->
 {#if activeView === 'timeline'}
 <div class="space-y-4">
 <!-- Timeline Scale Selector -->
 <div class="flex justify-end">
 <select
 bind:value={timelineScale}
 class="bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm"
 >
 <option value="hours">Hour View</option>
 <option value="days">Day View</option>
 <option value="weeks">Week View</option>
 </select>
 </div>

 <!-- Timeline Events -->
 <div class="space-y-3 max-h-96 overflow-y-auto">
 {#each sortEventsByTime(reconstruction.events) as event (event.id)}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 hover:bg-slate-700 transition-colors cursor-pointer"
 onclick={() => selectedEvent = selectedEvent === event.id ? null : event.id}>
 <div class="flex items-start gap-3">
 <span class="text-lg">{getEventIcon(event.category)}</span>
 <div class="flex-1 min-w-0">
 <div class="flex items-center gap-2 mb-1">
 <span class="text-sm font-medium text-orange-400">
 {formatTimestamp(event.timestamp)}
 </span>
 {#if event.verified}
 <span class="px-2 py-1 bg-green-900/20 text-green-400 rounded text-xs">VERIFIED</span>
 {:else}
 <span class="px-2 py-1 bg-yellow-900/20 text-yellow-400 rounded text-xs">UNVERIFIED</span>
 {/if}
 <span class="text-xs text-slate-400 {getConfidenceColor(event.confidence)}">
 {event.confidence}%
 </span>
 </div>
 <h4 class="font-medium text-white mb-1">{event.title}</h4>
 <p class="text-sm text-slate-300 mb-2">{event.description}</p>
 <p class="text-xs text-slate-400">Source: {event.source}</p>
 </div>
 <span class="text-slate-400 text-sm">
 {selectedEvent === event.id ? '−' : '+'}
 </span>
 </div>

 {#if selectedEvent === event.id}
 <div class="mt-3 pt-3 border-t border-slate-700">
 <div class="grid grid-cols-2 gap-4 text-sm">
 <div>
 <p class="text-slate-400">Category</p>
 <p class="text-white">{event.category.toUpperCase()}</p>
 </div>
 <div>
 <p class="text-slate-400">Confidence Score</p>
 <p class="text-white">{event.confidence}/100</p>
 </div>
 </div>
 </div>
 {/if}
 </div>
 {/each}
 </div>
 </div>
 {:else if activeView === 'gaps'}
 <div class="space-y-4">
 {#each reconstruction.gaps as gap (gap.id)}
 <div class="border rounded-lg p-4 {getGapColor(gap.significance)}">
 <div class="flex items-start gap-3">
 <span class="text-lg">⏱️</span>
 <div class="flex-1">
 <div class="flex items-center gap-2 mb-2">
 <span class="px-2 py-1 bg-slate-700 rounded text-xs font-medium">
 {gap.significance.toUpperCase()}
 </span>
 <span class="px-2 py-1 bg-slate-700 rounded text-xs">
 {gap.investigationPriority.toUpperCase()} PRIORITY
 </span>
 </div>
 <h4 class="font-medium text-white mb-1">
 Timeline Gap: {gap.duration}
 </h4>
 <p class="text-sm text-slate-300 mb-2">
 {formatTimestamp(gap.startTime)} → {formatTimestamp(gap.endTime)}
 </p>
 <p class="text-sm text-slate-300">
 <span class="text-slate-400">Possible Explanation:</span> {gap.possibleExplanation}
 </p>
 </div>
 </div>
 </div>
 {/each}
 {#if reconstruction.gaps.length === 0}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-8 text-center">
 <div class="text-2xl mb-2">✅</div>
 <p class="text-slate-500">No significant timeline gaps identified</p>
 </div>
 {/if}
 </div>
 {:else if activeView === 'contradictions'}
 <div class="space-y-4">
 {#each reconstruction.contradictions as contradiction (contradiction.id)}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4">
 <div class="flex items-start gap-3">
 <span class="text-lg">⚠️</span>
 <div class="flex-1">
 <div class="flex items-center gap-2 mb-2">
 <span class="px-2 py-1 rounded text-xs font-medium {getContradictionColor(contradiction.severity)}">
 {contradiction.severity.toUpperCase()}
 </span>
 </div>
 <h4 class="font-medium text-white mb-2">{contradiction.description}</h4>
 <div class="space-y-2 text-sm">
 <p><span class="text-slate-400">Involved Events:</span> {contradiction.events.join(', ')}</p>
 <p><span class="text-slate-400">Resolution:</span> {contradiction.resolution}</p>
 </div>
 </div>
 </div>
 </div>
 {/each}
 {#if reconstruction.contradictions.length === 0}
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-8 text-center">
 <div class="text-2xl mb-2">✅</div>
 <p class="text-slate-500">No contradictions identified in timeline</p>
 </div>
 {/if}
 </div>
 {:else if activeView === 'summary'}
 <div class="space-y-6">
 <!-- Summary -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4">
 <h4 class="font-medium text-orange-400 mb-3">Timeline Summary</h4>
 <p class="text-slate-300 leading-relaxed">{reconstruction.summary}</p>
 </div>

 <!-- Statistics -->
 <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 text-center">
 <p class="text-2xl mb-1">📅</p>
 <p class="text-sm text-slate-400">Events</p>
 <p class="text-xl font-bold text-blue-400">{reconstruction.events.length}</p>
 </div>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 text-center">
 <p class="text-2xl mb-1">⏱️</p>
 <p class="text-sm text-slate-400">Gaps</p>
 <p class="text-xl font-bold text-yellow-400">{reconstruction.gaps.length}</p>
 </div>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 text-center">
 <p class="text-2xl mb-1">⚠️</p>
 <p class="text-sm text-slate-400">Contradictions</p>
 <p class="text-xl font-bold text-red-400">{reconstruction.contradictions.length}</p>
 </div>
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4 text-center">
 <p class="text-2xl mb-1">🎯</p>
 <p class="text-sm text-slate-400">Confidence</p>
 <p class="text-xl font-bold {getConfidenceColor(reconstruction.confidence)}">
 {reconstruction.confidence}%
 </p>
 </div>
 </div>

 <!-- Recommendations -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-4">
 <h4 class="font-medium text-green-400 mb-3">Investigation Recommendations</h4>
 <div class="space-y-2">
 {#each reconstruction.recommendations as rec (rec)}
 <div class="flex items-start gap-3">
 <span class="text-green-400 mt-1">→</span>
 <p class="text-slate-300">{rec}</p>
 </div>
 {/each}
 </div>
 </div>
 </div>
 {/if}
 {:else}
 <!-- Placeholder -->
 <div class="bg-slate-800 border border-slate-600 rounded-lg p-12 text-center">
 <div class="text-4xl mb-4">🕰️</div>
 <h3 class="text-lg font-medium text-slate-400 mb-2">Timeline Reconstruction Ready</h3>
 <p class="text-sm text-slate-500">
 Provide evidence and witness statements, then click "Reconstruct Timeline" to analyze temporal relationships, identify gaps, and detect contradictions in the case chronology.
 </p>
 </div>
 {/if}
 </div>
 </div>
</div>

<style>
 .animate-spin {
 animation: spin 1s linear infinite;
 }

 @keyframes spin {
 from { transform: rotate(0deg); }
 to { transform: rotate(360deg); }
 }
</style>
