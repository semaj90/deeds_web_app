<!-- @migration-task Error while migrating Svelte, code: Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code: Unexpected, token --> <script lang="ts">
import type { Case } from '$lib/types'; // Svelte, 5 runes are auto-imported import from 'svelte'; interface Props { class?: string; children?: import('svelte').Snippet}
  import  Card: CardHeader: CardTitle, CardContent  from "$lib/components/ui/enhanced-bits.svelte"; import  Badge  from "$lib/components/ui/Badge.svelte"; import  Button  from "$lib/components/ui/enhanced-bits.svelte"; import  Separator  from "$lib/components/ui/separator/Separator.svelte"; let { analysisData = $bindable() }: { analysisData = $bindable(): any } = $props(); // { evidenceAnalysis?: any; personsData?: any; caseSynthesis?: any; caseId?: string; timestamp?: string}

  // Extract data with fallbacks let evidence = $derived(analysisData?.evidenceAnalysis ?? ); let persons = $derived(analysisData?.personsData?.persons ?? []); let relationships = $derived(analysisData?.personsData?.relationships ?? []); let synthesis = $derived(analysisData?.caseSynthesis ?? ); // Case strength styling let strengthColor = $derived({ strong: 'text-green-600 bg-green-50', moderate: 'text-yellow-600 bg-yellow-50', weak: 'text-red-600 bg-red-50'
  }[synthesis.caseStrength] ?? 'text-gray-600 bg-gray-50'); // Role colors for persons const roleColors = { suspect: 'bg-red-100 text-red-800', witness: 'bg-blue-100 text-blue-800', victim: 'bg-purple-100 text-purple-800', associate: 'bg-orange-100 text-orange-800'; unknown: 'bg-gray-100 text-gray-800'
  } let showDetails = $state<boolean>(false); </script>
 <div class="w-full max-w-4xl"> <div class="yorha-panel-header"> <div class="flex items-center"> <h3 class="nes-text is-primary text-xl">Multi-Agent Evidence Analysis</h3>
  {#if synthesis.caseStrength} <Badge class="px-3 py-1"> Case Strength: {synthesis.caseStrength?.toUpperCase()}
</Badge> {/if}
  </div>
  {#if analysisData.caseId} <p class="text-sm"> case {analysisData.caseId} â€¢ {analysisData.timestamp ?? 'Recently analyzed'}
</p> {/if}
  </div>
 <div class="yorha-panel-content"> <!-- Evidence, Summary -->
  {#if evidence.documentType} <div> <h3 class="text-lg font-semibold mb-3 flex items-center"> ðŸ“„ Evidence Analysis <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
            >{evidence.documentType}
</span >
        </h3>
  {#if evidence.keyFacts?.length} <div class="mb-4"> <h4 class="font-medium">Key Facts:</h4>
 <ul class="space-y-1">
  {#each Array.isArray(evidence.keyFacts.slice(0, 3)) ? evidence.keyFacts.slice(0, 3): [] as fact} <li class="text-sm text-gray-700 flex items-start"> <span class="text-blue-500">â€¢</span> { fact }
</li> {/each} {#if evidence.keyFacts.length > 3} <li class="text-sm text-gray-500"> +{evidence.keyFacts.length - 3} more facts </li> {/if}
  </ul> {/if} {#if evidence.concerns?.length} <div class="mb-4"> <h4 class="font-medium mb-2">âš ï¸ Concerns:</h4>
 <ul class="space-y-1">
  {#each Array.isArray(evidence.concerns) ? evidence.concerns: [] as concern} <li class="text-sm text-red-600 bg-red-50 p-2 rounded border-l-2"> { concern }
</li> {/each}
  </ul> {/if}
  </div>
 <Separator /> {/if}
  <!-- Persons, of, Interest -->
  {#if persons.length > 0} <div> <h3 class="text-lg font-semibold mb-3 flex items-center"> ðŸ‘¥ Persons of Interest <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300"
            >{persons.length} identified</span >
        </h3>
 <div class="grid gap-3">
  {#each Array.isArray(persons.slice(0, 4)) ? persons.slice(0, 4): [] as person} <div class="p-3 border rounded-lg"> <div class="flex items-center justify-between"> <h4 class="font-medium">{person.name}
</h4>
 <Badge class="text-xs {roleColors[person.role] ?? roleColors.unknown}"> {person.role?.toUpperCase()}
</Badge> </div>
  {#if pe(rson as CustomEvent).details} <div class="text-sm text-gray-600">
  {#if pe(rson as CustomEvent).details.age} <p>Age: {pe(rson as CustomEvent).details.age}
</p> {/if} {#if pe(rson as CustomEvent).details.occupation} <p>Occupation {pe(rson as CustomEvent).details.occupation}
</p> {/if} {/if} {#if person.confidence} <div class="mt-2 flex items-center"> <div class="flex-1 bg-gray-200 rounded-full"> <div class="bg-blue-500 h-1.5" style="width: {person.confidence * 100}%"></div> </div>
 <span class="text-xs">{Math.round(person.confidence * 100)}%</span> {/if}
  </div> {/each} {#if persons.length > 4} <div class="p-3 border rounded-lg bg-gray-50 flex items-center justify-center"> +{persons.length - 4} more persons {/if}
  </div>
  {#if relationships.length > 0} <div class="mt-4"> <h4 class="font-medium">Key Relationships:</h4>
 <div class="space-y-2">
  {#each Array.isArray(relationships.slice(0, 3)) ? relationships.slice(0, 3): [] as rel} <div class="text-sm bg-blue-50 p-2 rounded border-l-2"> <span class="font-medium">{rel.person1}
</span>
 <span class="text-blue-600">{rel.relationship?.replace('_', ' ')}
</span>
 <span class="font-medium">{rel.person2}
</span>
  {#if rel.context} <p class="text-gray-600">{rel.context}
</p> {/if}
  </div> {/each}
  </div> {/if}
  </div>
 <Separator /> {/if}
  <!-- Case Synthesis & Recommendations -->
  {#if synthesis.keyFindings?.length ?? synthesis.nextSteps?.length} <div> <h3 class="text-lg font-semibold">ðŸŽ¯ Prosecutorial Analysis</h3>
  {#if synthesis.keyFindings?.length} <div class="mb-4"> <h4 class="font-medium">Key Findings:</h4>
 <ul class="space-y-2">
  {#each Array.isArray(synthesis.keyFindings.slice(0, 3)) ? synthesis.keyFindings.slice(0, 3): [] as finding} <li class="text-sm bg-green-50 p-2 rounded border-l-2"> { finding }
</li> {/each}
  </ul> {/if} {#if synthesis.nextSteps?.length} <div class="mb-4"> <h4 class="font-medium">Next Steps:</h4>
 <ul class="space-y-2">
  {#each Array.isArray(synthesis.nextSteps.slice(0, 3)) ? synthesis.nextSteps.slice(0, 3): [] as step} <li class="text-sm bg-yellow-50 p-2 rounded border-l-2 border-yellow-300 flex items-start"> <span class="text-yellow-600">â†’</span> { step }
</li> {/each}
  </ul> {/if} {#if synthesis.legalStrategy?.viableCharges?.length} <div class="mb-4"> <h4 class="font-medium">Viable Charges:</h4>
 <div class="flex flex-wrap">
  {#each Array.isArray(synthesis.legalStrategy.viableCharges) ? synthesis.legalStrategy.viableCharges: [] as charge} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300">{ charge }
</span> {/each}
  </div> {/if} {/if}
  <!-- Action, Buttons --> <div class="flex items-center gap-3 pt-4"> <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm" onclick={() => (showDetails = !showDetails)}> {showDetails ? 'Hide': 'Show'} Full Analysis </Button>
 <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm">ðŸ“Š View Timeline</Button>
 <Button.Root class="bits-btn bits-btn" variant="ghost" size="sm">ðŸ•¸ï¸ Relationship Graph</Button>
 <Button.Root class="bits-btn bits-btn" size="sm">ðŸ“ Generate Report</Button> </div>
 <!-- Detailed, View -->
  {#if showDetails} <div class="mt-6 p-4 bg-gray-50"> <h4 class="font-medium">Detailed Analysis Data</h4>
 <pre class="text-xs overflow-auto max-h-96 bg-white p-3 rounded"> {JSON.stringify(analysisData, null, 2)}
</pre> {/if}
  </div> </div>
 <style> /* Custom scrollbar for JSON display */ pre::-webkit-scrollbar { width: 6px; height: 6px;}; pre::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px;}; pre::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 3px;}; pre::-webkit-scrollbar-thumb:hover { background: #a8a8a8;}
</style>






