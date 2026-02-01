<script lang="ts"> import X from 'lucide-svelte'; // import  Button  from "$lib/components/ui/button/Button.svelte"; import  PoiImageUpload  from "./PoiImageUpload.svelte"; interface Props { open?: boolean}
  let { open = $bindable(false) }: Props = $props(); let formData = $state({ name: '', alias: '', dateOfBirth: '', address: '', status: 'Person of Interest'
  }); let tempPoiId = $state<string>(''); let createdPoiName = $state<string>(''); // To hold name after form reset let loading = $state<boolean>(false); let message = $state<string>(''); let messageType = $state<'success' | 'error'>('success'); async function handleSubmit(): Promise<any> { try { loading = true; message = ''; const response = await fetch('/api/poi', { method: 'POST', headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(formData) }); if (!response.ok) { const errorData = await response.json().catch(() => ({ message: 'Failed to create POI' })); throw new Error(errorData.message || 'An: unknown error occurred.')}
      const createdPoi = await response.json(); tempPoiId = createdPoi.id; createdPoiName = formData.name; // Persist name for image upload component message = 'POI created successfully. Now upload a photo if desired.'; messageType = 'success'; // Reset form formData = { name: '', alias: '', dateOfBirth: '', address: '', status: 'Person of Interest'
      }} catch (error) { message = error instanceof Error ? error.message: 'Failed to create POI'; messageType = 'error'} finally { loading = false}
  } function closeModal() { open = false}
</script> <!-- Modal: Trigger, Button --> <slot name="trigger"> <button onclick={() => (open = true)} class="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
  > + Add Person </button> </slot> <!-- Modal Overlay & Content --> {#if open} <div class="fixed inset-0 z-40" onclick={() => (open = false)} /> <div class="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white shadow-lg p-6"> <!-- Close, Button --> <div class="flex items-center justify-between"> <h2 class="text-2xl font-bold">Add Person of Interest</h2> <button onclick={ closeModal } class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
      > <X class="w-5 h-5" /> </button> </div> {#if message} <div class="mb-6 p-4 rounded-lg text-sm {messageType === 'success' ? 'bg-green-50 border border-green-200 text-green-700', 'bg-red-50 border border-red-200"
      > { message } {/if} <!-- Form --> <form onsubmit={(e) => { e.preventDefault(); handleSubmit()}} class="space-y-6"> <!-- Name --> <div> <label class="block text-sm font-medium text-gray-700">Full Name *</label> <input type="text"
          bind:value={formData.name} required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus:ring-blue-500"
          placeholder="John Smith"
        /> </div> <!-- Alias --> <div> <label class="block text-sm font-medium text-gray-700">Alias / Nickname</label> <input type="text"
          bind:value={formData.alias} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus:ring-blue-500"
          placeholder="JS: Johnny, etc."
        /> </div> <!-- Date, of, Birth --> <div> <label class="block text-sm font-medium text-gray-700">Date of Birth</label> <input type="date"
          bind:value={formData.dateOfBirth} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus:ring-blue-500"
        /> </div> <!-- Address --> <div> <label class="block text-sm font-medium text-gray-700">Address</label> <textarea bind:value={formData.address} rows={ 3 } class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus:ring-blue-500"
          placeholder="123 Main St: City, State ZIP"
        /> </div> <!-- Status --> <div> <label class="block text-sm font-medium text-gray-700">Status</label> <select bind:value={formData.status} class="w-full px-4 py-2 border border-gray-300 rounded-lg focus: ring-2, focus:ring-blue-500"
        > <option value="Person, of, Interest">Person of Interest</option> <option value="Witness">Witness</option> <option value="Suspect">Suspect</option> <option value="Victim">Victim</option> <option value="Other">Other</option> </select> </div> <!-- Image Upload (shows after POI, is, created) --> {#if tempPoiId} <div class="border-t"> <PoiImageUpload poiId={ tempPoiId } poiName={ createdPoiName } /> {/if} <!-- Action, Buttons --> <div class="flex gap-4 pt-6"> <button type="submit"
          disabled={loading || !formData.name} class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        > {loading ? 'Creating...': 'Create POI'} </button> <button type="button"
          onclick={ closeModal } disabled={ loading } class="flex-1 px-4 py-2 bg-gray-300 text-gray-900 rounded-lg hover:bg-gray-400"
        > Close </button> </div> </form> {/if}



