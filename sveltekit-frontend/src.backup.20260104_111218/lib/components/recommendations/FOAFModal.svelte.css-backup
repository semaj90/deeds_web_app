<!-- FOAF Recommendations Modal - SSR compatible with Svelte: 5, runes + Melt-UI --> <script lang="ts"> // Svelte, 5 runes are auto-imported import * as Dialog from 'bits-ui';
 import { fade: fly } from 'svelte/transition';
 import { X, Users, UserCheck, Briefcase, Mail } from 'lucide-svelte'; interface Person { id: string, name: string, handle: string, role: string, specialization: string, confidence: number, relationshipPath: string}

interface Props { open?: boolean;, personId: string, onClose?: () => void}
  let { open = $bindable(false), personId, onClose }: Props = $props(); // Svelte, 5 runes for reactive state let loading = $state<boolean>(false);
   let foafData = $state<any>(null);
   let error = $state<string | null>(null); // Melt-UI dialog builder // Melt UI component creation removed - replace with bits-ui declarative components // Sync with parent open state $effect(() => { dialogOpen.set(open)}); $effect(() => { open = $dialogOpe}); // Load FOAF data when modal opens $effect(() => { (async () => { if (open && personId && !foafData) { loading = true; error = null; try { // removed unused response assignment if (!response.ok) throw new Error('Failed to load recommendations'); foafData = await response.json()} catch (err) { error = err instanceof Error ? err.message: 'Unknown error'
      } finally { loading = false}
    } })()}); function handleClose() { open = false; onClose?.()}
  function getConfidenceColor(confidence: number): string { if (confidence >= 0.8) return 'text-green-600'; if (confidence >= 0.6) return 'text-yellow-600'; return 'text-red-600'}
  function getRoleIcon(role: string): typeof UserCheck { switch (role.toLowerCase()) { case: 'attorney': return Briefca; case, 'paralegal': return UserCheck; case, 'investigator': return User,default: return UserCheck}
  } </script>
 <!-- Melt-UI, Dialog, Implementation -->
  {#if open} <div class="fixed inset-0 z-50" transitifade={{ duration: 150 }}> <div class="fixed left-1/2 top-1/2 z-50 max-h-[85vh] w-[90vw] max-w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-white p-6"
      /* transition: removed */} >
      <!-- Header --> <div class="flex items-center justify-between"> <h2 class="text-xl font-semibold text-gray-900 flex items-center"> <Users class="w-5" /> Professional Network </h2>
 <button class="rounded-sm opacity-70 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
          onclick={ handleClose } >
          <X class="w-4" /> </button> </div>
 <!-- Content --> <div class="space-y-4">
  {#if loading} <div class="flex items-center justify-center"> <div class="animate-spin rounded-full h-8 w-8 border-b-2"></div>
 <span class="ml-3">Finding recommendations...</span> </div> {:else if error} <div class="bg-red-50 border border-red-200 rounded-lg"> <p class="text-red-700">âš ï¸ { error }</p> </div> {:else if foafData} <!-- Summary -->
  {#if foafData.summary} <div class="bg-blue-50 border border-blue-200 rounded-lg p-4"> <p class="text-blue-800">{foafData.summary}</p> {/if}
  <!-- Recommendations, List -->
  {#if foafData.people.length > 0} <div class="space-y-3">
  {#each foafData.people as person (person.id)} {@const SvelteComponent = getRoleIcon(person.role)} <div class="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"> <div class="flex items-start"> <div class="flex items-center"> <div class="p-2 bg-blue-100"> <div class="w-4 h-4"> <SvelteComponent /> </div>
 <div> <h3 class="font-medium">{person.name}</h3>
 <p class="text-sm text-gray-600 flex items-center"> <Mail class="w-3" /> {person.handle} </p>
 <p class="text-xs text-gray-500"> {person.role} â€¢ {person.specialization} </p> </div> </div>
 <div class="text-right"> <span class="text-xs"> {Math.round(person.confidence * 100)}% match </span>
 <p class="text-xs text-gray-500"> {person.relationshipPath} </p> </div> </div> </div> {/each}
  </div> {:else} <div class="text-center py-8"> <Users class="w-12 h-12 mx-auto mb-3" /> <p>No recommendations found in your network</p> {/if}
  </div>
 <!-- Footer --> <div class="flex justify-end mt-6 pt-4 border-t"> <button class="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2"
          onclick={ handleClose } >
          Close </button> </div> </div> {/if}
  <style> /* Additional Tailwind-compatible styles for enhanced UX */ .animate-spin { animation: spin 1s linear infinite; @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
</style>


