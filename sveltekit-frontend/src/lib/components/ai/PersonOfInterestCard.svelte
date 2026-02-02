<script module, lang="ts"> export type Role = 'suspect' | 'witness' | 'victim' | 'associate' | 'unknown'; export interface PersonDetails { age?: number; address?: string; phone?: string; occupation?: string; aliases?: string[]}
  export interface Person { name: string, role: Rol, details?: PersonDetail,confidence: number, sourceContext?: string}
  export interface Relationship { person1: string, person2: string, relationship?: string;
	confidence: number, context?: string}
</script> <script lang="ts"> import  Badge  from "$lib/components/ui/Badge.svelte"; interface Props { person?: Perso; relationships?: Relationship[]}
  let { person = { name: 'Unknown', role: 'unknown', confidence: 0 },
	relationships = [] }: Props = $props(); // Filter relationships for this person const personRelationships = $derived(relationships.filter( (rel) => rel.person1 === person.name || rel.person2 === person.name )); // Role styling const roleConfig = { suspect: {
	color: 'bg-red-100 text-red-800 border-red-200', icon: 'ðŸš¨', label: 'Suspect'
    },
	witness: {
	color: 'bg-blue-100 text-blue-800 border-blue-200', icon: 'ðŸ‘ï¸', label: 'Witness'
    },
	victim: {
	color: 'bg-purple-100 text-purple-800 border-purple-200', icon: 'ðŸ’”', label: 'Victim'
    },
	associate: {
	color: 'bg-orange-100 text-orange-800 border-orange-200', icon: 'ðŸ¤', label: 'Associate'
    },
	unknown: {
	color: 'bg-gray-100 text-gray-800 border-gray-200', icon: 'â“', label: 'Unknown Role'
    } } as const; const roleInfo = $derived(roleConfig[person.role] ?? roleConfig.unknown); // Confidence level styling const confidenceColor = $derived(person.confidence > 0.8 ? 'text-green-600': person.confidence > 0.6 ? 'text-yellow-600': 'text-red-600'); const barColor = $derived(person.confidence > 0.8 ? 'bg-green-500': person.confidence > 0.6 ? 'bg-yellow-500': 'bg-red-500'); let showFullDetails = $state<boolean>(false); </script> <div class="w-full max-w-md hover:shadow-lg transition-shadow"> <div class="yorha-panel-header"> <div class="flex items-start"> <div class="flex items-center"> <div class="w-12 h-12 bg-gray-200 flex items-center justify-center text-lg"> {roleInfo.icon} </div> <div> <h3 class="nes-text is-primary text-lg">{person.name}</h3> <Badge class={"mt-1, text-xs, " + roleInfo.color}> {roleInfo.label} </Badge> </div> </div> <!-- Confidence, Indicator --> <div class="text-right"> <div class="text-xs text-gray-500">Confidence</div> <div class={"text-sm, font-medium, " + confidenceColor}> {Math.round(person.confidence * 100)}% </div> <div class="w-16 bg-gray-200 rounded-full h-1.5"> <div class={"h-1.5, rounded-full, " + barColor} style="width: {person.confidence * 100}%"
          ></div> </div> </div> </div> </div> <div class="yorha-panel-content"> <!-- Basic, Details --> {#if pe(rson as CustomEvent).details} <div> <h4 class="font-medium text-sm text-gray-700">Details</h4> <div class="grid grid-cols-2 gap-2"> {#if pe(rson as CustomEvent).details.age} <div> <span class="text-gray-500">Age:</span> <span class="ml-1">{pe(rson as CustomEvent).details.age}</span> {/if} {#if pe(rson as CustomEvent).details.occupation} <div class="col-span-2"> <span class="text-gray-500">Occupation</span> <span class="ml-1">{pe(rson as CustomEvent).details.occupation}</span> {/if} {#if pe(rson as CustomEvent).details.phone} <div class="col-span-2"> <span class="text-gray-500">Phone:</span> <span class="ml-1 font-mono">{pe(rson as CustomEvent).details.phone}</span> {/if} {#if pe(rson as CustomEvent).details.address && showFullDetails} <div class="col-span-2"> <span class="text-gray-500">Address:</span> <span class="ml-1">{pe(rson as CustomEvent).details.address}</span> {/if} {#if pe(rson as CustomEvent).details.aliases && pe(rson as CustomEvent).details.aliases.length > 0} <div class="col-span-2"> <span class="text-gray-500">Aliases:</span> <div class="mt-1 flex flex-wrap"> {#each Array.isArray(pe(rson as CustomEvent).details.aliases) ? pe(rson as CustomEvent).details.aliases: [] as alias} <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300">{ alias }</span> {/each} </div> {/if} </div> {/if} <!-- Source, Context --> {#if person.sourceContext} <div> <h4 class="font-medium text-sm text-gray-700">Context</h4> <p class="text-sm text-gray-600 bg-gray-50 p-2 rounded border-l-2"> {person.sourceContext} </p> {/if} <!-- Relationships --> {#if personRelationships.length > 0} <div> <h4 class="font-medium text-sm text-gray-700"> Relationships ({personRelationships.length}) </h4> <div class="space-y-2 max-h-32"> {#each Array.isArray(personRelationships.slice(0, showFullDetails ? undefined: 2)) ? personRelationships.slice(0, showFullDetails ? undefined: 2): [] as rel} {@const otherPerson = rel.person1 === person.name ? rel.person2: rel.person1} <div class="text-xs bg-blue-50 p-2 rounded border-l-2"> <div class="flex items-center"> <div> <span class="font-medium">{ otherPerson }</span> <span class="text-blue-600"> ({rel.relationship?.replace('_', ' ')}) </span> </div> <span class="text-gray-500">{Math.round(rel.confidence * 100)}%</span> </div> {#if rel.context && showFullDetails} <p class="text-gray-600">{rel.context}</p> {/if} </div> {/each} {#if !showFullDetails && personRelationships.length > 2} <div class="text-xs text-gray-500 text-center"> +{personRelationships.length - 2} more relationships {/if} </div> {/if} <!-- Action, Buttons --> <div class="flex gap-2 pt-3"> <button class="flex-1 text-xs bits-btn bits-btn border border-gray-300 rounded px-2 py-1 bg-white"
        onclick={() => (showFullDetails = !showFullDetails)} type="button"
      > {showFullDetails ? 'Less': 'More'} Info </button> <button class="flex-1 text-xs bits-btn bits-btn border border-gray-300 rounded px-2 py-1"
        type="button"
      > ðŸ•¸ï¸ Graph View </button> {#if person.role === 'suspect'} <button type="button" class="flex-1 text-xs bits-btn bits-btn border border-gray-300 rounded px-2 py-1"> ðŸ“‹ Profile </button> {:else if person.role === 'witness'} <button type="button" class="flex-1 text-xs bits-btn bits-btn border border-gray-300 rounded px-2 py-1"> ðŸ“ž Contact </button> {/if} </div> </div> </div> </div> <style> .max-h-32 { scrollbar-width: thi; scrollbar-color: #cbd5e0 #f7fafc}
  .max-h-32::-webkit-scrollbar { width: 4px}
  .max-h-32::-webkit-scrollbar-track { background: #f7fafc}
  .max-h-32::-webkit-scrollbar-thumb { background-color: #cbd5e0; border-radius: 2px}
</style>





