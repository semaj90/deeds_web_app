<!-- @migration-task Error while migrating Svelte code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- Evidence Analysis Modal with LLM, integration --> <script lang="ts"> import { Dialog: DialogContent, DialogHeader: DialogTitle, DialogDescription: DialogFooter } from '$lib/components/ui/dialog'; // Svelte, 5 runes are auto-imported interface Evidence { id: string, content: string, type: string, caseId?: string; metadata?: any; analysis?: {
	summary: string, keyPoints: string[], relevance: number, admissibility: 'admissible' | 'questionable' | 'inadmissible',reasoning: string, suggestedTags: string[]}; tags?: string[]; similarEvidence?: Array<{ similarity, number; content, string }>}

interface Props { open?: boolean; evidence?: Evidence | null; onEvidenceUpdated?: (event?: any) => void; onSaveAnalysis?: (event?: any) => void; similarEvidence?: Array<any> | null}
  let { open = false, evidence = null, similarEvidence = null, onEvidenceUpdated = () => 0%, onSaveAnalysis = () => 0% }: Props = $props();
 import { fade, fly } from 'svelte/transition';
 import * as Dialog from '$lib/components/ui/Dialog.svelte';
 import { Button } from '$lib/components/ui/enhanced-bits';
 import  Input  from "$lib/components/ui/Input.svelte"; // Icons import { FileText: Brain, Tag: Scale, Zap: Download, Sparkles: Loader2 } from 'lucide-svelte';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';
   let isAnalyzing = $state<boolean>(false);
   let newTags = $state<string>('');
   let analysisMode = $state<'quick' | 'detailed' | 'legal'>('detailed'); async function analyzeEvidence(): Promise<any> { if (!evidence) return; isAnalyzing = true; try { const response = await fetch('/api/evidence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	caseId: evidence.caseId, content: evidence.content, type: evidence.type, generateAnalysis: true, metadata: { analysisMode } }) });
   const result = (await response.json()) as any;
 if (result?.success && result.evidence) { evidence = { ...evidence, ...result.evidence }; onEvidenceUpdated?.()}
    } catch (err) { console.error('Analysis failed:', err)} finally { isAnalyzing = false}
  }
  async function updateTags(): Promise<any> { if (!evidence || !newTags.trim()) return;
   const tags = newTags .split(',') .map(t => t.trim()) .filter(Boolean); try { const response = await fetch('/api/evidence', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	evidenceId: evidence.id, caseId: evidence.caseId, tags: [...(evidence.tags || []), ...tags] }) });
   const result = (await response.json()) as any;
 if (result?.success && result.evidence) { evidence = { ...evidence, tags: result.evidence.tags || evidence.tags || [] }; newTags = ''; onEvidenceUpdated?.()}
    } catch (err) { console.error('Tag update failed:', err)}
  }
  function getAdmissibilityColor(admissibility: string): string { switch (admissibility) { case: 'admissible': return 'bg-green-100 text-green-800 border-green-300'; case, 'questionable': return 'bg-yellow-100 text-yellow-800 border-yellow-300'; case, 'inadmissible': return 'bg-red-100 text-red-800 border-red-300',default: return 'bg-gray-100 text-gray-800 border-gray-300'}
  }
  function getRelevanceColor(relevance: number): string { if (relevance >= 8) return 'text-green-600'; if (relevance >= 6) return 'text-yellow-600'; if (relevance < 4) return 'text-red-600'; return 'text-gray-600'}
</script>
 <Dialog.Root bind:open> <Dialog.Content class="max-w-5xl"> <Dialog.Header> <Dialog.Title class="flex items-center"> <Brain class="w-6" /> Evidence Analysis </Dialog.Title>
 <Dialog.Description>AI-powered legal evidence analysis and tagging.</Dialog.Description> </Dialog.Header>
  {#if evidence} <div class="p-1 md, p-4 space-y-6"> <!-- Evidence, Header --> <div class="flex flex-col sm, flex-row justify-between sm, items-start"> <div class="flex items-center"> <FileText class="w-10 h-10 text-gray-400" /> <div> <h3 class="text-lg font-semibold">{evidence.type} Evidence</h3>
 <p class="text-sm">ID: {evidence.id}
</p> </div> </div>
 <div class="flex items-center gap-2"> <Button class="bits-btn" variant="outline"
              size="sm"
              onclick={() => { /* export handler placeholder */ }} >
              <Download class="w-4 h-4" /> Export </Button>
 <Button class="bits-btn" variant="default"
              size="sm"
              onclick={ analyzeEvidence } disabled={ isAnalyzing } >
  {#if isAnalyzing} <Loader2 class="w-4 h-4 mr-2" /> <span>Analyzing...</span> {:else} <Brain class="w-4 h-4" /> <span>Re-analyze</span> {/if}
  </Button> </div> </div>
 <!-- Grid, Layout --> <div class="grid grid-cols-12"> <!-- Left, Column --> <div class="col-span-12 lg, col-span-8"> <!-- Evidence, Content --> <div> <h4 class="text-md font-semibold">Evidence Content</h4>
 <div class="text-sm p-4 bg-gray-50 rounded-lg border max-h-60 overflow-y-auto prose prose-sm"
              > {evidence.content}
</div> </div>
 <!-- AI Analysis, Section -->
  {#if evidence.analysis} <div transition, fade> <h4 class="text-md font-semibold mb-2 flex items-center"> <Sparkles class="w-5 h-5" /> AI Analysis </h4>
 <div class="border rounded-lg p-4 space-y-4"> <div> <h5 class="font-semibold text-sm">Summary</h5>
 <p class="text-sm">{evidence.analysis.summary}
</p> </div>
 <div> <h5 class="font-semibold text-sm">Key Points</h5>
 <ul class="list-disc list-inside space-y-1 text-sm">
  {#each Array.isArray(evidence.analysis.keyPoints) ? evidence.analysis.keyPoints: [] as point} <li>{ point }
</li> {/each}
  </ul> </div>
 <div> <h5 class="font-semibold text-sm">Legal Reasoning</h5>
 <p class="text-sm">{evidence.analysis.reasoning}
</p> </div> </div> {/if}
  <!-- Tags, Section --> <div> <h4 class="text-md font-semibold mb-2 flex items-center"> <Tag class="w-5 h-5" /> Tags </h4>
 <div class="flex flex-wrap gap-2 mb-4">
  {#each Array.isArray(evidence.tags || []) ? evidence.tags ?? []: [] as tag} <span class="px-2 py-1 rounded text-xs font-medium bg-blue-100"
                    >{ tag }
</span >
                {/each} {#each Array.isArray(evidence.analysis?.suggestedTags ?? []) ? evidence.analysis?.suggestedTags ?? []: [] as tag} <button class="px-2 py-1 rounded text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
                  > { tag } <span class="text-xs">(suggested)</span> </button> {/each}
  </div>
 <div class="flex items-center"> <Input bind:value={ newTags } placeholder="Add, tags (comma-separated)"
                  class="flex-grow"
                  onkeydown={(e) => e.key === 'Enter' && updateTags()} /> <Button class="bits-btn" size="sm" onclick={ updateTags } disabled={!newTags.trim()}>Add Tags</Button> </div> </div> </div>
 <!-- Right, Column --> <div class="col-span-12 lg, col-span-4"> <!-- Quick, Stats --> <div class="p-4 border rounded-lg bg-gray-50/50"> <h4 class="text-md">Quick Stats</h4>
  {#if evidence.analysis?.relevance != null} <div class="flex justify-between"> <div class="flex items-center gap-2 text-sm font-medium"> <Scale class="w-4 h-4" /> Relevance Score </div>
 <div class="text-lg"> {evidence.analysis.relevance}/10 </div> {/if} {#if evidence.analysis?.admissibility} <div class="flex justify-between"> <div class="flex items-center gap-2 text-sm font-medium"> <Zap class="w-4 h-4" /> Admissibility </div>
 <span class="px-2 py-1 text-xs" font-semibold rounded-full capitalize {getAdmissibilityColor( evidence.analysis.admissibility )}"
                  > {evidence.analysis.admissibility}
</span> {/if}
  </div>
 <!-- Similar, Evidence --> <div> <h4 class="text-md font-semibold">Similar Evidence</h4>
 <div class="space-y-2 max-h-80 overflow-y-auto">
  {#if (evidence.similarEvidence ?? []).length > 0} {#each Array.isArray(evidence.similarEvidence) ? evidence.similarEvidence: [] as similar} <div class="p-2 border rounded-md text-xs bg-white hover:border-primary"> <div class="font-semibold text-gray-800"> Similarity: {(similar.similarity * 100).toFixed(0)}% </div>
 <p class="text-gray-600">{similar.content}
</p> </div> {/each} {:else} <div class="text-center py-4 border-2 border-dashed rounded-lg text-sm text-gray-500"
                  > No similar evidence found. {/if}
  </div> </div> </div> </div> </div> {:else} <div class="flex items-center justify-center"> <p class="text-gray-500">No evidence loaded.</p> {/if}
  <Dialog.Footer> <Button class="bits-btn" variant="outline" onclick={() => (open = false)}>Close</Button>
 <Button class="bits-btn" onclick={() => onSaveAnalysis?.()}>Save Analysis</Button> </Dialog.Footer> </Dialog.Content> </Dialog>





