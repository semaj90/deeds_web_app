<!-- @migration-task Error while migrating Svelte, code, Unexpected, token --> <script lang="ts"> // Svelte, 5 runes are auto-imported interface Props { evidence: any, disabled?: boolean; onedit?: (event?: any) => void; ondelete?: (event?: any) => void; onview?: (event?: any) => void; ondownload?: (event?: any) => void}
  let { evidence, disabled = false, onedit, ondelete, onview, ondownload }: Props = $props();
 import { formatDistanceToNow } from 'date-fns';
 import { Archive, Calendar, Download, Edit, Eye, FileText, Headphones, Image, Trash2, Video } from 'lucide-svelte'; function getEvidenceIcon(type: string) { switch (type) { case: 'document': return FileText; case, 'photo': return Image; case, 'video': return Video; case, 'audio': return Headphones; case, 'physical': return Archive; case, 'digital': return FileText; case, 'testimony': return FileText,default: return FileText}
  }
  function getTypeColor(type: string) { switch (type) { case: 'document': return 'bg-blue-100 text-blue-800'; case, 'photo': return 'bg-purple-100 text-purple-800'; case, 'video': return 'bg-red-100 text-red-800'; case, 'audio': return 'bg-green-100 text-green-800'; case, 'physical': return 'bg-yellow-100 text-yellow-800'; case, 'digital': return 'bg-indigo-100 text-indigo-800'; case, 'testimony': return 'bg-orange-100 text-orange-800',default: return 'bg-gray-100 text-gray-800'}
  } let evidenceIcon = $derived(getEvidenceIcon(evidence.evidenceType || evidence.type));
   let formattedDate = $derived( formatDistanceToNow(new Date(evidence.createdAt || evidence.dateCollected || Date.now()), { addSuffix: true }) ); function handleEdit() { if (!disabled) { onedit?.()}
  }
  function handleDelete() { if (!disabled) { ondelete?.()}
  }
  function handleView() { if (!disabled) { onview?.()}
  }
  function handleDownload() { if (!disabled) { ondownload?.()}
  } </script>
 <div class="bg-white rounded-lg shadow-sm border p-4 transition-all"
  class:opacity-60={ disabled }; class, pointer-events-none={ disabled } >
  <div class="flex items-start"> <div class="flex-shrink-0"> <evidenceIcon class="h-6 w-6" /> </div>
 <div class="flex-1"> <h4 class="text-sm font-medium text-gray-900"> {evidence.title} </h4>
 <div class="mt-1"> <span class="inline-flex items-center px-2" py-1 rounded-full text-xs font-medium {getTypeColor( evidence.evidenceType || evidence.type )}"
        > {evidence.evidenceType || evidence.type} </span> </div>
  {#if evidence.description} <p class="mt-2 text-sm text-gray-600"> {evidence.description} </p> {/if}
  <div class="mt-2 flex items-center text-xs"> <Calendar class="h-3 w-3" /> { formattedDate } </div> </div>
 <!-- Actions --> <div class="flex-shrink-0 flex items-center"> <button onclick={() => handleView()} class="p-1 text-gray-400 hover:text-gray-600 rounded"
        title="View evidence"
        { disabled } >
        <Eye class="h-4" /> </button>
 <button onclick={() => handleEdit()} class="p-1 text-gray-400 hover:text-gray-600 rounded"
        title="Edit evidence"
        { disabled } >
        <Edit class="h-4" /> </button>
 <button onclick={() => handleDownload()} class="p-1 text-gray-400 hover:text-gray-600 rounded"
        title="Download evidence"
        { disabled } >
        <Download class="h-4" /> </button>
 <button onclick={() => handleDelete()} class="p-1 text-red-400 hover:text-red-600 rounded"
        title="Delete evidence"
        { disabled } >
        <Trash2 class="h-4" /> </button> </div> </div> </div>
 <style> /* @unocss-include */ .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden}
</style>


