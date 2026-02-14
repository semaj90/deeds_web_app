<script lang="ts">



 interface Evidence { id: string, title: string;
 description?: string;
 content?: string;
 fileName?: string;
 }

 interface JudicialAnalysis {
 id: string;
 caseId?: string;
	generatedAt: string;
 admissibility: Array<{ evidence: string, ruling: 'admissible' | 'inadmissible' | 'conditional';
 reasoning: string;
	legalBasis: string;
 }>;
 probableCause: {
	assessment: 'strong' | 'moderate' | 'weak' | 'none';
 reasoning: string;
	factors: string[];
 };
 caseStrength: {
	overall: number; // 0-100
 prosecution: number;
	defense: number;
 keyFactors: Array<{ factor: string, impact: 'positive' | 'negative' | 'neutral';
 weight: number;
 }>;
 };
 recommendations: string[];
	risks: string[];
 summary: string;
 }

 interface Props {
  onanalysiscomplete?: (...args: any[]) => void;
  caseId?: string | null;
  evidence?: Evidence[];
  charges?: string[];
  jurisdiction?: 'federal' | 'state' | 'local';
 }

 let { caseId = null, evidence = [], charges = [], jurisdiction = 'federal' , onanalysiscomplete }: Props = $props();
let isAnalyzing = $state(false);
 let analysis = $state<JudicialAnalysis | null>(null);
 let activeTab = $state<'overview' | 'admissibility' | 'probable-cause' | 'case-strength' | 'recommendations'>('overview');

 async function performAnalysis() {
 if (evidence.length === 0) {
 alert('Please provide evidence for judicial analysis.');
 return;
 }

 isAnalyzing = true;

 try {
 const response = await fetch('/api/ai/judge', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
	body: JSON.stringify({
caseId: evidence,
 charges: jurisdiction
 })
 });

 if (!response.ok) {
 throw new Error(`Failed to perform analysis: ${response.status}`);
 }

 const result = await response.json();
 analysis = result.analysis;

 onanalysiscomplete?.({ analysis });
 } catch (error) {
 console.error('Error performing judicial analysis:', error);
 alert('Failed to perform judicial analysis. Please try again.');
 } finally {
 isAnalyzing = false;
 }
 }

 function getAdmissibilityColor(ruling: string) {
 switch (ruling) {
 case 'admissible': return 'text-accent bg-accent/10';
 case 'inadmissible': return 'text-danger/80 bg-danger/10';
 case 'conditional': return 'text-warning bg-warning/20/20';
 default:return 'text-sand/40 bg-panel/20';
 }
 }

 function getProbableCauseColor(assessment: string) {
 switch (assessment) {
 case 'strong': return 'text-accent';
 case 'moderate': return 'text-warning';
 case 'weak': return 'text-warning';
 case 'none': return 'text-danger/80';
 default:return 'text-sand/40';
 }
 }

 function getCaseStrengthColor(score: number) {
 if (score >= 80) return 'text-accent';
 if (score >= 60) return 'text-warning';
 if (score >= 40) return 'text-warning';
 return 'text-danger/80';
 }

 function getFactorIcon(impact: string) {
 switch (impact) {
 case 'positive': return '✅';
 case 'negative': return '❌';
 case 'neutral': return '➖';
 default:return '❓';
 }
 }

 function exportAnalysis() {
 if (!analysis) return;

 const content = `Judicial Analysis Report
Generated: ${new Date(analysis.generatedAt).toLocaleString()}
Case ID: ${analysis.caseId || 'N/A'}

SUMMARY
${analysis.summary}

ADMISSIBILITY RULINGS
${analysis.admissibility.map(item => `
${item.evidence}:
 Ruling: ${item.ruling.toUpperCase()}
 Reasoning: ${item.reasoning}
 Legal Basis: ${item.legalBasis}
`).join('\n')}

PROBABLE CAUSE ASSESSMENT
Assessment: ${analysis.probableCause.assessment.toUpperCase()}
Reasoning: ${analysis.probableCause.reasoning}
Factors: ${analysis.probableCause.factors.join(', ')}

CASE STRENGTH
Overall: ${analysis.caseStrength.overall}/100
Prosecution: ${analysis.caseStrength.prosecution}/100
Defense: ${analysis.caseStrength.defense}/100

Key Factors:
${analysis.caseStrength.keyFactors.map(f => `${getFactorIcon(f.impact)} ${f.factor} (${f.weight}%)`).join('\n')}

RECOMMENDATIONS
${analysis.recommendations.map(r => `• ${r}`).join('\n')}

RISKS
${analysis.risks.map(r => `• ${r}`).join('\n')}`;

 const blob = new Blob([content], { type: 'text/plain' });
 const url = URL.createObjectURL(blob);
 const a = document.createElement('a');
 a.href = url;
 a.download = `judicial-analysis-${analysis.id}.txt`;
 a.click();
 URL.revokeObjectURL(url);
 }

 function clearAnalysis() {
 analysis = null;
 activeTab = 'overview';
 }
</script>

<div class="judicial-analysis bg-panel rounded-lg p-6">
 <div class="flex items-center gap-3 mb-6">
 <div class="text-2xl">⚖️</div>
 <h2 class="text-xl font-bold text-info">Judge-Style Legal Reasoning Agent</h2>
 </div>

 <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
 <!-- Input Section -->
 <div class="lg col-span-1 space-y-6">
 <!-- Case Details -->
 <div>
 <label for="jurisdiction-select" class="block text-sm font-medium text-sand/40 mb-2">
 Jurisdiction
 </label>
 <select id="jurisdiction-select"
 bind:value={ jurisdiction }
 class="w-full bg-panelSoft border border-sand/30 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-info"
 >
 <option value="federal">Federal</option>
 <option value="state">State</option>
 <option value="local">Local</option>
 </select>
 </div>

 <!-- Charges -->
 <div>
 <span class="block text-sm font-medium text-sand/40 mb-2">
 Charges/Allegations
 </span>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-3 min-h-32">
 {#if charges.length === 0}
 <p class="text-sand/60 text-center py-8 text-sm">
 No charges specified. Add charges to get more accurate analysis.
 </p>
 {:else}
 <div class="space-y-2">
 {#each charges as charge (charge)}
 <div class="bg-panelSoft rounded px-3 py-2">
 <p class="text-sm text-white">{charge}</p>
 </div>
 {/each}
 </div>
 {/if}
 </div>
 </div>

 <!-- Evidence Summary -->
 <div>
 <span class="block text-sm font-medium text-sand/40 mb-2">
 Evidence ({evidence.length} items)
 </span>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-3 max-h-40 overflow-y-auto">
 {#if evidence.length === 0}
 <p class="text-sand/60 text-center py-4 text-sm">
 No evidence provided
 </p>
 {:else}
 <div class="space-y-1">
 {#each evidence as item (item.id)}
 <p class="text-sm text-sand/40 truncate">• {item.title}</p>
 {/each}
 </div>
 {/if}
 </div>
 </div>

 <!-- Analyze Button -->
 <button
 onclick={performAnalysis}
 disabled={isAnalyzing || evidence.length === 0}
 class="w-full bg-gradient-to-r from-info to-info hover:from-info hover:to-info disabled:from-panelSoft disabled to-panelSoft text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
 >
 {#if isAnalyzing}
 <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
 Analyzing...
 {:else}
 🏛️ Analyze Case
 {/if}
 </button>
 </div>

 <!-- Analysis Section -->
 <div class="lg col-span-3">
 {#if analysis}
 <!-- Tab Navigation -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-1 mb-6 flex">
 {#each ['overview', 'admissibility', 'probable-cause', 'case-strength', 'recommendations'] as tab}
 <button
 onclick={() => activeTab = tab as any}
 class="flex-1 px-4 py-2 rounded text-sm font-medium transition-colors {activeTab === tab ? 'bg-info text-white' : 'text-sand/40 hover:text-white hover:bg-panelSoft'}"
 >
 {tab.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}
 </button>
 {/each}
 </div>

 <!-- Analysis Header -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 mb-6">
 <div class="flex items-center justify-between">
 <h3 class="text-lg font-bold text-accent">Judicial Analysis Complete</h3>
 <div class="flex gap-2">
 <button
 onclick={exportAnalysis}
 class="px-3 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded text-sm"
 title="Export analysis"
 >
 💾
 </button>
 <button
 onclick={ clearAnalysis }
 class="px-3 py-1 bg-panelSoft hover:bg-panelSoft text-sand/40 rounded text-sm"
 title="Clear analysis"
 >
 🗑️
 </button>
 </div>
 </div>
 <p class="text-sm text-sand/40 mt-2">
 Generated: {new Date(analysis.generatedAt).toLocaleString()}
 </p>
 </div>

 <!-- Tab Content -->
 {#if activeTab === 'overview'}
 <div class="space-y-6">
 <!-- Summary -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <h4 class="font-medium text-info mb-3">Case Summary</h4>
 <p class="text-sand/40 leading-relaxed">{analysis.summary}</p>
 </div>

 <!-- Key Metrics -->
 <div class="grid grid-cols-1 md grid-cols-3 gap-4">
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 text-center">
 <div class="text-2xl mb-2">📊</div>
 <p class="text-sm text-sand/40 mb-1">Overall Strength</p>
 <p class="text-2xl font-bold {getCaseStrengthColor(analysis.caseStrength.overall)}">
 {analysis.caseStrength.overall}/100
 </p>
 </div>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 text-center">
 <div class="text-2xl mb-2">⚖️</div>
 <p class="text-sm text-sand/40 mb-1">Probable Cause</p>
 <p class="text-lg font-bold {getProbableCauseColor(analysis.probableCause.assessment)}">
 {analysis.probableCause.assessment.toUpperCase()}
 </p>
 </div>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 text-center">
 <div class="text-2xl mb-2">📋</div>
 <p class="text-sm text-sand/40 mb-1">Evidence Items</p>
 <p class="text-2xl font-bold text-info/80">{analysis.admissibility.length}</p>
 </div>
 </div>
 </div>
 {:else if activeTab === 'admissibility'}
 <div class="space-y-4">
 {#each analysis.admissibility as item (item.evidence)}
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <div class="flex items-start gap-3">
 <span class="px-2 py-1 rounded text-xs font-medium {getAdmissibilityColor(item.ruling)} mt-1">
 {item.ruling.toUpperCase()}
 </span>
 <div class="flex-1">
 <h4 class="font-medium text-white mb-2">{item.evidence}</h4>
 <div class="space-y-2 text-sm">
 <p><span class="text-sand/40">Reasoning:</span> {item.reasoning}</p>
 <p><span class="text-sand/40">Legal Basis:</span> {item.legalBasis}</p>
 </div>
 </div>
 </div>
 </div>
 {/each}
 </div>
 {:else if activeTab === 'probable-cause'}
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <div class="flex items-center gap-3 mb-4">
 <div class="text-2xl">🔍</div>
 <div>
 <p class="text-lg font-bold {getProbableCauseColor(analysis.probableCause.assessment)}">
 {analysis.probableCause.assessment.toUpperCase()} Probable Cause
 </p>
 </div>
 </div>
 <div class="space-y-4">
 <div>
 <p class="text-sm text-sand/40 mb-1">Assessment Reasoning</p>
 <p class="text-sand/40">{analysis.probableCause.reasoning}</p>
 </div>
 <div>
 <p class="text-sm text-sand/40 mb-2">Contributing Factors</p>
 <div class="flex flex-wrap gap-2">
 {#each analysis.probableCause.factors as factor (factor)}
 <span class="px-3 py-1 bg-panelSoft rounded-full text-sm text-sand/40">
 {factor}
 </span>
 {/each}
 </div>
 </div>
 </div>
 </div>
 {:else if activeTab === 'case-strength'}
 <div class="space-y-6">
 <!-- Strength Scores -->
 <div class="grid grid-cols-1 md grid-cols-3 gap-4">
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 text-center">
 <p class="text-sm text-sand/40 mb-1">Overall</p>
 <p class="text-3xl font-bold {getCaseStrengthColor(analysis.caseStrength.overall)}">
 {analysis.caseStrength.overall}
 </p>
 </div>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 text-center">
 <p class="text-sm text-sand/40 mb-1">Prosecution</p>
 <p class="text-3xl font-bold {getCaseStrengthColor(analysis.caseStrength.prosecution)}">
 {analysis.caseStrength.prosecution}
 </p>
 </div>
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4 text-center">
 <p class="text-sm text-sand/40 mb-1">Defense</p>
 <p class="text-3xl font-bold {getCaseStrengthColor(analysis.caseStrength.defense)}">
 {analysis.caseStrength.defense}
 </p>
 </div>
 </div>

 <!-- Key Factors -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <h4 class="font-medium text-info mb-3">Key Factors</h4>
 <div class="space-y-3">
 {#each analysis.caseStrength.keyFactors as factor (factor.factor)}
 <div class="flex items-center justify-between p-3 bg-panel rounded">
 <div class="flex items-center gap-3">
 <span class="text-lg">{getFactorIcon(factor.impact)}</span>
 <span class="text-sand/40">{factor.factor}</span>
 </div>
 <span class="text-sm text-sand/40">{factor.weight}%</span>
 </div>
 {/each}
 </div>
 </div>
 </div>
 {:else if activeTab === 'recommendations'}
 <div class="space-y-6">
 <!-- Recommendations -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <h4 class="font-medium text-accent mb-3">Strategic Recommendations</h4>
 <div class="space-y-2">
 {#each analysis.recommendations as rec (rec)}
 <div class="flex items-start gap-3">
 <span class="text-accent mt-1">✓</span>
 <p class="text-sand/40">{rec}</p>
 </div>
 {/each}
 </div>
 </div>

 <!-- Risks -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-4">
 <h4 class="font-medium text-danger/80 mb-3">Potential Risks</h4>
 <div class="space-y-2">
 {#each analysis.risks as risk (risk)}
 <div class="flex items-start gap-3">
 <span class="text-danger/80 mt-1">⚠️</span>
 <p class="text-sand/40">{risk}</p>
 </div>
 {/each}
 </div>
 </div>
 </div>
 {/if}
 {:else}
 <!-- Placeholder -->
 <div class="bg-panelSoft border border-sand/30 rounded-lg p-12 text-center">
 <div class="text-4xl mb-4">🏛️</div>
 <h3 class="text-lg font-medium text-sand/40 mb-2">Judicial Analysis Ready</h3>
 <p class="text-sm text-sand/60">
 Provide evidence and charges, then click "Analyze Case" to receive comprehensive judicial evaluation including admissibility rulings, probable cause assessment, and case strength analysis.
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




