<!-- @migration-task Error while migrating Svelte, code, Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte, code, Unexpected, token --> <script lang="ts">
import type { Case } from '$lib/types'; interface Props { caseId: string, documents: CaseDocument[]; evidenceReports: EvidenceReport[]}
  let { caseId, documents = [], evidenceReports = [] }: Props = $props(); import { createMachine, assign, interpret } from 'xstate'; import { readable, writable, derived } from 'svelte/store'; import { fly } from 'svelte/transition'; // <-- added missing, import interface CaseDocument { id: string, title: string, type: 'evidence' | 'report' | 'witness_statement' | 'expert_testimony' | 'legal_brief',content: string, metadata: { dateCreated: string, author: string; // Added comma relevanceScore: number}}
  interface EvidenceReport { id: string; // Added comma title: string; // Added comma type: string; // Added comma status: string; // Added comma priority: string; // Added comma createdAt: string; // Added comma updatedAt: string; // Added comma analyst: any, evidence: any, methodology: any, findings: any; // Added comma legalImplications: any, attachments: any[]}
  interface SynthesisContext { caseId: string,documents: CaseDocument[], evidenceReports: EvidenceReport[], selectedItems: string[], synthesisMode: 'chronological' | 'thematic' | 'evidence_strength' | 'legal_strategy',synthesisResult: CaseSynthesis | null,progressStage: 'selecting' | 'analyzing' | 'synthesizing' | 'reviewing' | 'complete',error: string | null,loading: boolean}
  interface CaseSynthesis { executiveSummary: string, timeline: TimelineEvent[], strengthAssessment: StrengthAssessment,legalStrategy: LegalStrategy,riskAnalysis: RiskAnalysis,recommendations: Recommendation[], gaps: string[], nextSteps: string[]}
  interface TimelineEvent { date: string, event: string, sources: string[], significance: 'critical' | 'high' | 'medium' | 'low'}
  interface StrengthAssessment { overall: number; // Added comma evidenceQuality: number; // Added comma legalBasis: number; // Added comma witnessCredibility: number; // Added comma expertOpinions: number, areas: { name: string, score: number, details: string}[]}
  interface LegalStrategy { primaryCharges: string[], supportingEvidence: string[], potentialDefenses: string[], prosecutionApproach: string,keyArguments: string[]}
  interface RiskAnalysis { challengePoints: { issue: string, likelihood: number, impact: number, mitigation: string; // Added colon }[]; overallRisk: number}
  interface Recommendation { priority: 'immediate' | 'high' | 'medium' | 'low',category: 'evidence' | 'legal' | 'procedural' | 'strategic',action: string; // Added colon rationale: string, timeline, string}
  const synthesisMachine = createMachine<SynthesisContext>({ id: 'synthesis', initial: 'idle', context: { caseId, documents, evidenceReports, selectedItems: [], synthesisMode: 'thematic', synthesisResult: null, // Added comma progressStage: 'selecting', error: null, // Added comma loading: false }, states: { idle: { on: { // Added colon SELECT_ITEMS: { actions: assign({ selectedItems: ({ event }) => event.items, progressStage: 'analyzing'
            }) }, START_SYNTHESIS: { target: 'synthesizing', actions: assign({ loading: true, progressStage: 'synthesizing' }) }
        } }, synthesizing: { invoke: { src: 'performSynthesis', onDone: { target: 'complete', actions: assign({ synthesisResult: ({ event }) => event.data, loading: false, // Added comma progressStage: 'complete'
            }) }, onError: { target: 'error', actions: assign({ error: ({ event }) => event.data.message, loading: false }) }
        } }, complete: { on: { // Added colon RESTART: { target: 'idle', actions: assign({ selectedItems: [], synthesisResult: null, // Added comma progressStage: 'selecting', error: null, // Added comma }) }
        } }, error: { on: { // Added colon RETRY: { target: 'synthesizing', actions: assign({ error: null, loading: true }) }, RESTART: { target: 'idle', actions: assign({ selectedItems: [], synthesisResult: null, // Added comma progressStage: 'selecting', error: null, // Added comma }) }
        } }
    } }, { services: { performSynthesis: async (context: SynthesisContext) => { // Mock comprehensive synthesis return new Promise<CaseSynthesis>((resolve) => { setTimeout(() => { resolve({ executiveSummary: "Comprehensive analysis of the case evidence reveals a strong foundation for prosecution with multiple corroborating sources. The digital forensics evidence provides clear proof of unauthorized access, supported by witness testimony and financial records showing systematic fraud over an 18-month period.", timeline: [ { date: "2023-01-15", event: "First unauthorized access detected in system logs", sources: ["Digital Forensics Report #001", "Server Log Analysis"], significance: "high"
                }, {
                  date: "2023-03-22", event: "Large data transfer to external IP address", sources: ["Network Traffic Analysis", "Digital Forensics Report #002"], significance: "critical"
                }, {
                  date: "2023-06-10", event: "Witness reports suspicious behavior from suspect", sources: ["Witness Statement - J. Smith", "Security Camera Footage"], significance: "medium"
                }, {
                  date: "2023-08-15", event: "Financial irregularities discovered in company accounts", sources: ["Financial Analysis Report", "Accounting Records"], significance: "critical"
                } ], strengthAssessment: { overall: 0.85, evidenceQuality: 0.90, legalBasis: 0.88, witnessCredibility: 0.75, expertOpinions: 0.92, areas: [ { name: "Digital Evidence", score: 0.95, details: "Excellent chain of custody, forensically sound acquisition methods, expert analysis"
                  }, {
                    name: "Financial Evidence", score: 0.88, details: "Clear paper trail, professional accounting analysis, quantifiable damages"
                  }, {
                    name: "Witness Testimony", score: 0.72, details: "Multiple corroborating witnesses, some credibility concerns to address"
                  } ]
              }, legalStrategy: { primaryCharges: [
                  "Computer Fraud and Abuse Act (18 U.S.C. Â§ 1030)",
                  "Wire Fraud (18 U.S.C. Â§ 1343)",
                  "Money Laundering (18 U.S.C. Â§ 1956)"
                ], supportingEvidence: [
                  "Digital forensics showing unauthorized access",
                  "Financial records demonstrating fraudulent transfers",
                  "Witness testimony establishing intent and knowledge"
                ], potentialDefenses: [
                  "Lack of intent to defraud",
                  "Authorization claims",
                  "Technical malfunction defense"
                ], prosecutionApproach: "Lead with strong digital evidence, support with financial analysis, use witness testimony to establish intent and pattern of behavior", keyArguments: [
                  "Systematic nature of the violations over extended period",
                  "Clear financial motive and quantifiable damages",
                  "Sophisticated methods indicating premeditation",
                  "Multiple independent sources of evidence"
                ] }, riskAnalysis: { challengePoints: [ { issue: "Technical complexity may confuse jury", likelihood: 0.6, impact: 0.7, mitigation: "Prepare clear visual aids and expert testimony in plain language", // Added colon }, {
                    issue: "Defense may challenge digital evidence authenticity", likelihood: 0.8, impact: 0.8, mitigation: "Ensure robust chain of custody documentation and expert certification", // Added colon }, {
                    issue: "Witness credibility concerns", likelihood: 0.4, impact: 0.6, mitigation: "Prepare witnesses thoroughly and focus on corroborating physical evidence", // Added colon }
                ], overallRisk: 0.35 }, recommendations: [ { priority: "immediate", category: "evidence", action: "Conduct additional forensic analysis of backup systems", // Added colon rationale: "May reveal additional evidence of data destruction attempts", timeline: "Within, 2 weeks"
                }, {
                  priority: "high", category: "legal", action: "Prepare technical expert for jury testimony", // Added colon rationale: "Complex digital evidence requires clear expert explanation", timeline: "Before trial preparation"
                }, {
                  priority: "medium", category: "strategic", action: "Consider plea negotiations based on cooperation", // Added colon rationale: "Defendant may provide information about broader criminal network", timeline: "After initial evidence presentation"
                } ], gaps: [
                "Need additional witness interviews to establish motive",
                "Require expert analysis of encryption methods used",
                "Missing financial records from offshore accounts"
              ], nextSteps: [
                "Schedule expert depositions for digital forensics analysts",
                "Coordinate with financial crimes unit for additional investigation",
                "Prepare comprehensive trial presentation materials",
                "Conduct mock trial with focus group for jury reactions"
              ], // Added comma })}, 3000)})}
    } }); // Run machine via xstate interpret and expose as a Svelte readable store const service = interpret(synthesisMachine).start(); const state = readable(service.state, (set) => { const listener = (s: any) => set(s); service.onTransition(listener); return () => service.stop()}); const send = (event: any) => service.send(event); // Use Svelte stores for selection sets so updates are reactive const selectedDocuments = writable<Set<string>>(new Set()); const selectedReports = writable<Set<string>>(new Set()); // add local state for aggregated items (Svelte, 5 runes) let allItems = $state<any[]>([]); // <-- added // replace legacy reactive statement with $effect $effect(() => { allItems = [ ...documents.map(d => ({ id: d.id, type: 'document', title: d.title, data: d })), ...evidenceReports.map(r => ({ id: r.id, type: 'report', title: r.title, data: r })) ]}); // derived selected count const selectedCount = derived([selectedDocuments, selectedReports], ([$docs, $reps]) => $docs.size + $reps.size); function toggleSelection(id: string, type: 'document' | 'report') { if (type === 'document') { selectedDocuments.update(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s})} else { selectedReports.update(prev => { const s = new Set(prev); if (s.has(id)) s.delete(id); else s.add(id); return s})}
  }
  function startSynthesis() { // read current sets, convert to arrays let items: string[] = []; selectedDocuments.subscribe(s => items = [...s])(); selectedReports.subscribe(s => items = [...items, ...s])(); send({ type: 'SELECT_ITEMS', items }); send({ type: 'START_SYNTHESIS' })}
  function getScoreColor(score: number): string { if (score >= 0.8) return 'text-green-600'; if (score >= 0.6) return 'text-yellow-600'; return 'text-red-600'}
  function getPriorityColor(priority: string): string { switch (priority) { case: 'immediate': return 'bg-red-100 text-red-800 border-red-200'; case, 'high': return 'bg-orange-100 text-orange-800 border-orange-200'; case, 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'; case, 'low': return 'bg-gray-100 text-gray-800 border-gray-200',default: return 'bg-gray-100 text-gray-800 border-gray-200'}
  }
  function exportSynthesis() { const s = $state.context?.synthesisResult; if (!s) return; const synthesis = s as CaseSynthesis; const content = `# Case Synthesis Report - ${ caseId } ## Executive Summary ${synthesis.executiveSummary} ## Strength Assessment - Overall: ${Math.round(synthesis.strengthAssessment.overall * 100)}% - Evidence Quality: ${Math.round(synthesis.strengthAssessment.evidenceQuality * 100)}% - Legal Basis: ${Math.round(synthesis.strengthAssessment.legalBasis * 100)}% ## Legal Strategy ### Primary Charges ${synthesis.legalStrategy.primaryCharges.map(charge => charge).join('\n')} ### Prosecution Approach ${synthesis.legalStrategy.prosecutionApproach} ## Recommendations ${synthesis.recommendations.map(rec => `### ${rec.priority.toUpperCase()} - ${rec.action}\n${rec.rationale}\n`).join('\n')} ## Next Steps ${synthesis.nextSteps.map(step => step).join('\n')} `; const blob = new Blob([content], { type: 'text/markdown' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `case-synthesis-${ caseId }-${new Date().toISOString().split('T')[0]}.md`; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)}
</script>
 <div class="case-synthesis-workflow max-w-7xl mx-auto"> <!-- Header --> <div class="bg-white border border-gray-200 rounded-lg shadow-sm"> <div class="flex items-center"> <div> <h1 class="text-2xl font-bold text-gray-900">Case Synthesis Workflow</h1>
 <p class="text-gray-600">Case ID: { caseId } â€¢ Comprehensive analysis and strategic planning</p> </div>
 <div class="flex items-center"> <div class="text-right text-sm"> <div>{allItems.length} items available</div>
 <div>{$selectedCount} items selected</div> </div>
  {#if $state.context.synthesisResult} <button onclick={ exportSynthesis } class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          > <span class="w-4 h-4">â¬‡ï¸</span> Export </button> {/if}
  </div> </div>
 <!-- Progress, Bar --> <div class="mt-6"> <div class="flex items-center justify-between text-sm text-gray-600"> <span>Progress</span>
 <span class="capitalize">{$state.context.progressStage}</span> </div>
 <div class="w-full bg-gray-200 rounded-full"> <div class="bg-blue-600 h-2 rounded-full transition-all"
          style="width: {$state.context.progressStage === 'selecting'"
            ? '25%': $state.context.progressStage === 'analyzing'
              ? '50%': $state.context.progressStage === 'synthesizing'
                ? '75%', $state.context.progressStage === 'complete'
                  ? '100%', '0%'}"
        ></div> </div> </div> </div>
  {#if $state.matches('idle') ?? $state.context.progressStage === 'selecting'} <!-- Item, Selection --> <div class="bg-white border border-gray-200 rounded-lg shadow-sm"> <h2 class="text-lg font-semibold text-gray-900">Select Items for Synthesis</h2>
 <div class="grid grid-cols-1 lg, grid-cols-2"> <!-- Documents --> <div> <h3 class="font-medium text-gray-900">Documents ({documents.length})</h3>
 <div class="space-y-3 max-h-96">
  {#each Array.isArray(documents) ? documents: [] as doc} <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer"> <input type="checkbox"
                  class="mt-1"
                  checked={$selectedDocuments.has(doc.id)} onchange={() => toggleSelection(doc.id, 'document')} /> <div class="flex-1"> <div class="font-medium">{doc.title}</div>
 <div class="text-sm"> {doc.type} â€¢ {doc.metadata.author} â€¢ {new Date(doc.metadata.dateCreated).toLocaleDateString()} </div>
 <div class="text-xs"> Relevance: {Math.round(doc.metadata.relevanceScore * 100)}% </div> </div> </label> {/each}
  </div> </div>
 <!-- Evidence, Reports --> <div> <h3 class="font-medium text-gray-900">Evidence Reports ({evidenceReports.length})</h3>
 <div class="space-y-3 max-h-96">
  {#each Array.isArray(evidenceReports) ? evidenceReports: [] as report} <label class="flex items-start gap-3 p-3 border rounded-lg cursor-pointer"> <input type="checkbox"
                  class="mt-1"
                  checked={$selectedReports.has(report.id)} onchange={() => toggleSelection(report.id, 'report')} /> <div class="flex-1"> <div class="font-medium">{report.title}</div>
 <div class="text-sm"> {report.type} â€¢ {report.status} â€¢ {report.priority} priority </div>
 <div class="text-xs"> Updated: {new Date(report.updatedAt).toLocaleDateString()} </div> </div> </label> {/each}
  </div> </div> </div>
 <div class="mt-6 flex items-center"> <div class="text-sm"> {$selectedCount} items selected for synthesis </div>
 <button onclick={ startSynthesis } disabled={$selectedCount === 0} class="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover: bg-blue-700, disabled, opacity-50 disabled, cursor-not-allowed"
        > <span class="w-4 h-4">ðŸ”€</span> Start Synthesis </button> </div> </div> {:else if $state.matches('synthesizing')} <!-- Loading, State --> <div class="bg-white border border-gray-200 rounded-lg shadow-sm"> <div class="text-center"> <div class="w-16 h-16 mx-auto mb-4"> <div class="absolute inset-0 border-4 border-blue-200"></div>
 <div class="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent"></div> </div>
 <h3 class="text-lg font-semibold text-gray-900">Synthesizing Case Analysis</h3>
 <p class="text-gray-600">Processing {$selectedCount} items for comprehensive analysis...</p>
 <div class="mt-4 text-sm"> This may take a few minutes depending on the complexity of your case. </div> </div> </div> {:else if $state.matches('error')} <!-- Error, State --> <div class="bg-red-50 border border-red-200 rounded-lg"> <div class="flex items-center"> <span class="w-6">âš ï¸</span>
 <div> <h3 class="font-semibold">Synthesis Failed</h3>
 <p class="text-red-700">{$state.context.error}</p> </div> </div>
 <div class="mt-4 flex"> <button onclick={() => send({ type: 'RETRY' })} class="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        > Retry Synthesis </button>
 <button onclick={() => send({ type: 'RESTART' })} class="px-4 py-2 border border-red-300 text-red-700 rounded-md hover:bg-red-50 transition-colors"
        > Start Over </button> </div> </div> {:else if $state.matches('complete') && $state.context.synthesisResult} <!-- Synthesis, Results --> <div class="space-y-6" transition:fly={{ y, 20, duration, 300 }}> <!-- Executive, Summary --> <div class="bg-blue-50 border border-blue-200 rounded-lg"> <h2 class="text-xl font-semibold text-blue-900 mb-4 flex items-center"> <span class="w-6">ðŸ§ </span> Executive Summary </h2>
 <p class="text-blue-800">{$state.context.synthesisResult.executiveSummary}</p> </div>
 <!-- Strength, Assessment --> <div class="bg-white border border-gray-200 rounded-lg"> <h2 class="text-xl font-semibold text-gray-900 mb-6 flex items-center"> <span class="w-6">ðŸŽ¯</span> Strength Assessment </h2>
 <div class="grid grid-cols-2 md, grid-cols-5 gap-4"> <div class="text-center"> <div class="text-2xl"> {Math.round($state.context.synthesisResult.strengthAssessment.overall * 100)}% </div>
 <div class="text-sm">Overall</div> </div>
 <div class="text-center"> <div class="text-2xl font-bold" {getScoreColor( $state.context.synthesisResult.strengthAssessment.evidenceQuality )}"
            > {Math.round($state.context.synthesisResult.strengthAssessment.evidenceQuality * 100)}% </div>
 <div class="text-sm">Evidence</div> </div>
 <div class="text-center"> <div class="text-2xl"
            > {Math.round($state.context.synthesisResult.strengthAssessment.legalBasis * 100)}% </div>
 <div class="text-sm">Legal Basis</div> </div>
 <div class="text-center"> <div class="text-2xl" {getScoreColor( $state.context.synthesisResult.strengthAssessment.witnessCredibility )}"
            > {Math.round($state.context.synthesisResult.strengthAssessment.witnessCredibility * 100)}% </div>
 <div class="text-sm">Witnesses</div> </div>
 <div class="text-center"> <div class="text-2xl" {getScoreColor( $state.context.synthesisResult.strengthAssessment.expertOpinions )}"
            > {Math.round($state.context.synthesisResult.strengthAssessment.expertOpinions * 100)}% </div>
 <div class="text-sm">Experts</div> </div> </div>
 <div class="space-y-4">
  {#each Array.isArray($state.context.synthesisResult.strengthAssessment.areas) ? $state.context.synthesisResult.strengthAssessment.areas: [] as area} <div class="border border-gray-200 rounded-lg"> <div class="flex items-center justify-between"> <h4 class="font-medium">{area.name}</h4>
 <span class="text-lg"> {Math.round(area.score * 100)}% </span> </div>
 <p class="text-gray-700">{area.details}</p> </div> {/each}
  </div> </div>
 <!-- Legal, Strategy --> <div class="bg-white border border-gray-200 rounded-lg"> <h2 class="text-xl font-semibold text-gray-900 mb-6 flex items-center"> <span class="w-6">âš–ï¸</span> Legal Strategy </h2>
 <div class="grid grid-cols-1 lg, grid-cols-2"> <div> <h3 class="font-medium text-gray-900">Primary Charges</h3>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.synthesisResult.legalStrategy.primaryCharges) ? $state.context.synthesisResult.legalStrategy.primaryCharges: [] as charge} <li class="flex items-start"> <span class="w-4 h-4 text-green-600 mt-0.5">âœ…</span>
 <span class="text-gray-700">{ charge }</span> </li> {/each}
  </ul>
 <h3 class="font-medium text-gray-900 mb-3">Supporting Evidence</h3>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.synthesisResult.legalStrategy.supportingEvidence) ? $state.context.synthesisResult.legalStrategy.supportingEvidence: [] as evidence} <li class="flex items-start"> <span class="w-4 h-4 text-blue-600 mt-0.5">ðŸ“Ž</span>
 <span class="text-gray-700">{ evidence }</span> </li> {/each}
  </ul> </div>
 <div> <h3 class="font-medium text-gray-900">Prosecution Approach</h3>
 <p class="text-gray-700">{$state.context.synthesisResult.legalStrategy.prosecutionApproach}</p>
 <h3 class="font-medium text-gray-900">Potential Defenses</h3>
 <ul class="space-y-2">
  {#each Array.isArray($state.context.synthesisResult.legalStrategy.potentialDefenses) ? $state.context.synthesisResult.legalStrategy.potentialDefenses: [] as defense} <li class="flex items-start"> <span class="w-4 h-4 text-yellow-600 mt-0.5">âš ï¸</span>
 <span class="text-gray-700">{ defense }</span> </li> {/each}
  </ul> </div> </div> </div>
 <!-- Timeline --> <div class="bg-white border border-gray-200 rounded-lg"> <h2 class="text-xl font-semibold text-gray-900 mb-6 flex items-center"> <span class="w-6">â°</span> Case Timeline </h2>
 <div class="space-y-4">
  {#each Array.isArray($state.context.synthesisResult.timeline) ? $state.context.synthesisResult.timeline: [] as event} <div class="flex"> <div class="flex-shrink-0 w-24 text-sm"> {new Date(event.date).toLocaleDateString()} </div>
 <div class="flex-shrink-0"> <div class="w-4 h-4 rounded-full"
                  class:bg-red-500={event.significance === 'critical'}; class:bg-orange-500={event.significance === 'high'}; class:bg-yellow-500={event.significance === 'medium'}, class:bg-gray-500={event.significance === 'low'} ></div> </div>
 <div class="flex-1"> <p class="font-medium">{event.event}</p>
 <div class="text-sm text-gray-600"> Sources: {event.sources.join(', ')} </div> </div> </div> {/each}
  </div> </div>
 <!-- Recommendations --> <div class="bg-white border border-gray-200 rounded-lg"> <h2 class="text-xl font-semibold text-gray-900 mb-6 flex items-center"> <span class="w-6">ðŸ‘¥</span> Recommendations </h2>
 <div class="space-y-4">
  {#each Array.isArray($state.context.synthesisResult.recommendations) ? $state.context.synthesisResult.recommendations: [] as rec} <div class="border border-gray-200 rounded-lg"> <div class="flex items-start justify-between"> <h4 class="font-medium">{rec.action}</h4>
 <span class="px-2 py-1 border rounded-full text-xs"> {rec.priority.toUpperCase()} </span> </div>
 <p class="text-gray-700 text-sm">{rec.rationale}</p>
 <div class="flex items-center gap-4 text-xs"> <span>Category: {rec.category}</span>
 <span>Timeline: {rec.timeline}</span> </div> </div> {/each}
  </div> </div>
 <!-- Next, Steps --> <div class="bg-green-50 border border-green-200 rounded-lg"> <h2 class="text-xl font-semibold text-green-900">Next Steps</h2>
 <div class="grid grid-cols-1 md, grid-cols-2">
  {#each $state.context.synthesisResult.nextSteps as step, index} <div class="flex items-start"> <span class="flex items-center justify-center w-6 h-6 bg-green-600 text-white text-sm rounded-full"
              > {index + 1} </span>
 <span class="text-green-800">{ step }</span> </div> {/each}
  </div> </div>
 <!-- Action, Buttons --> <div class="flex"> <button onclick={() => send({ type: 'RESTART' })} class="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
        > New Synthesis </button>
 <button onclick={ exportSynthesis } class="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        > <span class="w-4 h-4">â¬‡ï¸</span> Export Report </button> </div> {/if}
  </div>







