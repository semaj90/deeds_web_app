<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https, //svelte.dev/e/js_parse_error -->
<script lang="ts">
 import CrossExaminationAssistant from './CrossExaminationAssistant.svelte';
 import DetectiveEvidenceMap from './DetectiveEvidenceMap.svelte';
 import JudicialAnalysisAgent from './JudicialAnalysisAgent.svelte';
 import PoliceReportGenerator from './PoliceReportGenerator.svelte';
 import TimelineReconstructionEngine from './TimelineReconstructionEngine.svelte';

 interface Evidence { id: string, title: string;
 description?: string;
 content?: string;
 fileName?: string;
 timestamp?: string;
 source?: string;
 }

 interface Witness { id: string, name: string;
 statement?: string;
 credibility?: number;
 }

 interface Case { id: string, title: string;
 description?: string;
	status: 'active' | 'closed' | 'pending';
 createdAt: string;
 }

 let { currentCase = null }: {
	currentCase: Case | null } = $props();

 let activeModule = $state<'map' | 'police' | 'cross-exam' | 'judicial' | 'timeline'>('map');
 let caseEvidence = $state<Evidence[]>([]);
 let witnesses = $state<Witness[]>([]);
 let charges = $state<string[]>([]);
 let selectedWitness = $state<Witness | null>(null);

 // Mock data for demonstration - in real app this would come from database
 $effect(() => {
 if (currentCase) {
 // Load case data
 caseEvidence = [
 {
 id: '1',
 title: 'Victim Statement',
 description: 'Initial police report from victim',
 content: 'I was walking home when I noticed someone following me...',
 timestamp: '2024-01-15T20:30:00Z',
 source: 'Police Report'
 },
	{
 id: '2',
 title: 'Security Camera Footage',
 description: 'Street camera capturing incident',
 fileName: 'camera_footage.mp4',
 timestamp: '2024-01-15T20:45:00Z',
 source: 'Security System'
 },
	{
 id: '3',
 title: 'Witness Testimony',
 description: 'Eyewitness account from neighbor',
 content: 'I heard shouting and saw a person running away...',
 timestamp: '2024-01-15T21:00:00Z',
 source: 'Witness Interview'
 }
 ];

 witnesses = [
 {
 id: 'w1',
 name: 'Jane Doe',
 statement: 'I was the victim in this incident. I reported it to police immediately.',
 credibility: 9
 },
	{
 id: 'w2',
 name: 'John Smith',
 statement: 'I witnessed the suspect fleeing the scene around 8:45 PM.',
 credibility: 7
 }
 ];

 charges = [
 'Assault and Battery',
 'Criminal Threats',
 'Stalking'
 ];
 }
 });

 function handleModuleChange(module: typeof activeModule) {
 activeModule = module;
 }

 function handleEvidenceUpdate(evidence: Evidence[]) {
 caseEvidence = evidence;
 }

 function handleWitnessUpdate(witness: Witness) {
 const index = witnesses.findIndex(w => w.id === witness.id);
 if (index >= 0) {
 witnesses[index] = witness;
 } else {
 witnesses = [...witnesses, witness];
 }
 }

 function getModuleIcon(module: string) {
 switch (module) {
 case 'map': return '🗺️';
 case 'police': return '👮';
 case 'cross-exam': return '⚖️';
 case 'judicial': return '🏛️';
 case 'timeline': return '⏰';
 default:return '🔍';
 }
 }

 function getModuleTitle(module: string) {
 switch (module) {
 case 'map': return 'Evidence Map';
 case 'police': return 'Police Report';
 case 'cross-exam': return 'Cross-Examination';
 case 'judicial': return 'Judicial Analysis';
 case 'timeline': return 'Timeline Reconstruction';
 default:return 'Detective Mode';
 }
 }
</script>

<div class="detective-mode-dashboard min-h-screen bg-slate-950">
 <!-- Header -->
 <div class="bg-gradient-to-r from-slate-900 to-slate-800 border-b border-slate-700 p-6">
 <div class="flex items-center justify-between">
 <div class="flex items-center gap-4">
 <div class="text-3xl">🕵️</div>
 <div>
 <h1 class="text-2xl font-bold text-blue-400">Phase 4: Detective Mode</h1>
 <p class="text-slate-400">Professional Investigative AI System</p>
 </div>
 </div>

 {#if currentCase}
 <div class="bg-slate-800 rounded-lg p-4">
 <h2 class="font-medium text-white">{currentCase.title}</h2>
 <p class="text-sm text-slate-400">Case #{currentCase.id}</p>
 <div class="flex items-center gap-2 mt-2">
 <span class="px-2 py-1 rounded text-xs font-medium
 {currentCase.status === 'active' ? 'bg-green-900/20 text-green-400' :
 currentCase.status === 'pending' ? 'bg-yellow-900/20 text-yellow-400' : 'bg-slate-700 text-slate-400'}">
 {currentCase.status.toUpperCase()}
 </span>
 </div>
 </div>
 {/if}
 </div>
 </div>

 <!-- Module Navigation -->
 <div class="bg-slate-900 border-b border-slate-700 px-6 py-4">
 <div class="flex gap-1 overflow-x-auto">
 {#each (['map', 'police', 'cross-exam', 'judicial', 'timeline'] as const) as module}
 <button
 onclick={() => handleModuleChange(module)}
 class="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors whitespace-nowrap
 {activeModule === module
 ? 'bg-blue-600 text-white'
 : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
 >
 <span class="text-lg">{getModuleIcon(module)}</span>
 <span class="font-medium">{getModuleTitle(module)}</span>
 </button>
 {/each}
 </div>
 </div>

 <!-- Main Content -->
 <div class="p-6">
 {#if activeModule === 'map'}
 <DetectiveEvidenceMap
 {caseEvidence}
 {witnesses}
 onevidenceUpdate={handleEvidenceUpdate}
 />
 {:else if activeModule === 'police'}
 <PoliceReportGenerator
 caseId={currentCase?.id}
 initialEvidence={caseEvidence}
 />
 {:else if activeModule === 'cross-exam'}
 <CrossExaminationAssistant
 witness={selectedWitness}
 evidence={caseEvidence}
 caseContext={currentCase?.description}
 />
 {:else if activeModule === 'judicial'}
 <JudicialAnalysisAgent
 caseId={currentCase?.id}
 evidence={caseEvidence}
 {charges}
 />
 {:else if activeModule === 'timeline'}
 <TimelineReconstructionEngine
 caseId={currentCase?.id}
 evidence={caseEvidence}
 witnessStatements={witnesses.map(w => ({
  name: w.name,
  statement: w.statement || '',
  timestamp: (w as any).timestamp || undefined
 }))}
 />
 {/if}
 </div>

 <!-- Witness Selector (for cross-examination) -->
 {#if activeModule === 'cross-exam' && witnesses.length > 0}
 <div class="fixed bottom-6 right-6 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-lg">
 <h3 class="font-medium text-white mb-3">Select Witness</h3>
 <div class="space-y-2 max-h-48 overflow-y-auto">
 {#each witnesses as witness (witness.id)}
 <button
 onclick={() => selectedWitness = witness}
 class="w-full text-left p-2 rounded hover:bg-slate-700 transition-colors
 {selectedWitness?.id === witness.id ? 'bg-blue-600 text-white' : 'text-slate-300'}"
 >
 <div class="flex items-center justify-between">
 <span class="font-medium">{witness.name}</span>
 {#if witness.credibility}
 <span class="text-xs text-slate-400">{witness.credibility}/10</span>
 {/if}
 </div>
 </button>
 {/each}
 </div>
 </div>
 {/if}

 <!-- Quick Stats -->
 <div class="fixed top-24 right-6 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-lg">
 <h3 class="font-medium text-white mb-3">Case Overview</h3>
 <div class="space-y-2 text-sm">
 <div class="flex justify-between">
 <span class="text-slate-400">Evidence:</span>
 <span class="text-white">{caseEvidence.length}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-slate-400">Witnesses:</span>
 <span class="text-white">{witnesses.length}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-slate-400">Charges:</span>
 <span class="text-white">{charges.length}</span>
 </div>
 </div>
 </div>
</div>

<style>
 /* Custom scrollbar for module navigation */
 .overflow-x-auto::-webkit-scrollbar {
 height: 4px;
 }

 .overflow-x-auto::-webkit-scrollbar-track {
 background: rgba(51, 65, 85, 0.5);
 border-radius: 2px;
 }

 .overflow-x-auto::-webkit-scrollbar-thumb {
 background: rgba(100, 116, 139, 0.8);
 border-radius: 2px;
 }

 .overflow-x-auto::-webkit-scrollbar-thumb:hover {
 background: rgba(148, 163, 184, 0.9);
 }
</style>



