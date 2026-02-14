<script lang="ts">

  // State definition using Runes
  let tag = $state<any>(undefined);

  interface EvidenceItem { id: string, title: string;
    type: 'document' | 'email' | 'video' | 'spreadsheet' | 'audio';
    format: string;
	size: string;
    uploaded: Date;
	case: string;
    tags: string[];
	aiAnalyzed: boolean;
    confidence: number;
	status: 'processed' | 'pending' | 'processing' | 'failed';
  }

  let evidence = $state<EvidenceItem[]>([
    {
      id: 'EVD-2024-001',
      title: 'Financial Records Q3 2023',
      type: 'document',
      format: 'pdf',
      size: '2.4 MB',
      uploaded: new Date('2024-01-15'),
      case: 'CASE-2024-001',
      tags: ['financial', 'quarterly', '2023'],
      aiAnalyzed: true,
      confidence: 94,
      status: 'processed'
    },
	{
      id: 'EVD-2024-002',
      title: 'Email Correspondence Chain',
      type: 'email',
      format: 'eml',
      size: '156 KB',
      uploaded: new Date('2024-01-16'),
      case: 'CASE-2024-001',
      tags: ['communication', 'chain', 'evidence'],
      aiAnalyzed: true,
      confidence: 87,
      status: 'processed'
    },
	{
      id: 'EVD-2024-003',
      title: 'Contract Agreement - TechCorp',
      type: 'document',
      format: 'docx',
      size: '1.8 MB',
      uploaded: new Date('2024-01-17'),
      case: 'CASE-2024-002',
      tags: ['contract', 'agreement', 'legal'],
      aiAnalyzed: false,
      confidence: 0,
      status: 'pending'
    },
	{
      id: 'EVD-2024-004',
      title: 'Security Camera Footage',
      type: 'video',
      format: 'mp4',
      size: '45.2 MB',
      uploaded: new Date('2024-01-18'),
      case: 'CASE-2024-003',
      tags: ['video', 'security', 'footage'],
      aiAnalyzed: true,
      confidence: 76,
      status: 'processing'
    },
	{
      id: 'EVD-2024-005',
      title: 'Bank Transaction Records',
      type: 'spreadsheet',
      format: 'xlsx',
      size: '892 KB',
      uploaded: new Date('2024-01-19'),
      case: 'CASE-2024-001',
      tags: ['banking', 'transactions', 'records'],
      aiAnalyzed: true,
      confidence: 91,
      status: 'processed'
    },
	{
      id: 'EVD-2024-006',
      title: 'Witness Statement - John Doe',
      type: 'document',
      format: 'pdf',
      size: '324 KB',
      uploaded: new Date('2024-01-20'),
      case: 'CASE-2024-003',
      tags: ['witness', 'statement', 'testimony'],
      aiAnalyzed: false,
      confidence: 0,
      status: 'pending'
    }
  ]);

  let selectedEvidence = $state(new Set<string>());
  let viewMode = $state('grid'); // 'grid' or 'list'

  function toggleSelection(evidenceId: string) {
    const newSelection = new Set(selectedEvidence);
    if (newSelection.has(evidenceId)) {
      newSelection.delete(evidenceId);
    } else {
      newSelection.add(evidenceId);
    }
    selectedEvidence = newSelection;
  }

  function selectAll() {
    if (selectedEvidence.size === evidence.length) {
      selectedEvidence = new Set();
    } else {
      selectedEvidence = new Set(evidence.map(e => e.id));
    }
  }

  function getFileIcon(format: string): string {
    switch (format.toLowerCase()) {
      case 'pdf': return '📄';
      case 'docx': case 'doc': return '📝';
      case 'xlsx': case 'xls': return '📊';
      case 'mp4': case 'avi': case 'mov': return '🎥';
      case 'jpg': case 'png': case 'gif': return '🖼️';
      case 'eml': return '📧';
      default:return '📄';
    }
  }

 function getStatusColor(status: string): string {
 switch (status) {
 case 'processed': return 'text-accent';
 case 'processing': return 'text-warning';
 case 'pending': return 'text-sand/40';
 default:return 'text-sand/40';
 }
 }

 function getConfidenceColor(confidence: number): string {
 if (confidence >= 90) return 'text-accent';
 if (confidence >= 70) return 'text-warning';
 return 'text-danger/80';
 }

 function formatDate(date: Date): string {
 return date.toLocaleDateString('en-US', {
 month: 'short',
 day: 'numeric',
 year: 'numeric'
 });
 }

 function formatSize(bytes: string): string {
 // Simple size formatter - in real app would parse properly
 return bytes;
 }
</script>

<div class="bg-panelSoft/50 backdrop-blur rounded-lg border border-sand/50">
 <!-- Header -->
 <div class="p-4 border-b border-sand/50">
 <div class="flex items-center justify-between">
 <div class="flex items-center space-x-4">
 <input
 type="checkbox"
 class="rounded border-sand/30 bg-panelSoft text-info focus:ring-info/80"
 checked={selectedEvidence.size === evidence.length && evidence.length > 0}
 indeterminate={selectedEvidence.size > 0 && selectedEvidence.size < evidence.length}
 onchange={selectAll}
 />
 <span class="text-sm text-sand/40">
 {selectedEvidence.size > 0 ? `${selectedEvidence.size} selected` : `${evidence.length} items`}
 </span>
 </div>

 <div class="flex items-center space-x-2">
 <!-- View Mode Toggle -->
 <div class="flex bg-panelSoft/50 rounded-lg p-1">
 <button
 class="p-1 rounded {viewMode === 'grid' ? 'bg-info/20 text-info' : 'text-sand/40'}"
 onclick={() => viewMode = 'grid'}
 >
 ⊞
 </button>
 <button
 class="p-1 rounded {viewMode === 'list' ? 'bg-info/20 text-info' : 'text-sand/40'}"
 onclick={() => viewMode = 'list'}
 >
 ☰
 </button>
 </div>

 {#if selectedEvidence.size > 0}
 <div class="flex space-x-2">
 <button class="px-3 py-1 bg-info/20 hover:bg-info/30 text-info text-sm rounded transition-colors">
 Analyze
 </button>
 <button class="px-3 py-1 bg-warning/20 hover:bg-warning/30 text-warning text-sm rounded transition-colors">
 Tag
 </button>
 <button class="px-3 py-1 bg-danger/20 hover:bg-danger/30 text-danger/80 text-sm rounded transition-colors">
 Delete
 </button>
 </div>
 {/if}
 </div>
 </div>
 </div>

 <!-- Content -->
 {#if viewMode === 'grid'}
 <!-- Grid View -->
 <div class="p-4">
 <div class="grid grid-cols-1 sm: grid-cols-2 lg: grid-cols-3 xl grid-cols-4 gap-4">
 {#each evidence as item}
 <div class="bg-panelSoft/30 rounded-lg p-4 border border-sand/50 hover:border-info/50 transition-colors cursor-pointer">
 <div class="flex items-start justify-between mb-3">
 <input
 type="checkbox"
 class="rounded border-sand/30 bg-panelSoft text-info focus:ring-info/80"
 checked={selectedEvidence.has(item.id)}
 onchange={() => toggleSelection(item.id)}
 onclick={(e) => e.stopPropagation()}
 />
 <span class="text-2xl">{getFileIcon(item.format)}</span>
 </div>

 <div class="mb-3">
 <h3 class="font-medium text-white text-sm mb-1 line-clamp-2">{item.title}</h3>
 <p class="text-xs text-sand/40">{item.id}</p>
 </div>

 <div class="space-y-2 text-xs">
 <div class="flex justify-between">
 <span class="text-sand/40">Type:</span>
 <span class="text-sand/40 capitalize">{item.type}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-sand/40">Size:</span>
 <span class="text-sand/40">{item.size}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-sand/40">Case:</span>
 <span class="text-info">{item.case}</span>
 </div>
 <div class="flex justify-between">
 <span class="text-sand/40">Status:</span>
 <span class={getStatusColor(item.status)}>{item.status}</span>
 </div>
 {#if item.aiAnalyzed}
 <div class="flex justify-between">
 <span class="text-sand/40">AI Confidence:</span>
 <span class={getConfidenceColor(item.confidence)}>{item.confidence}%</span>
 </div>
 {/if}
 </div>

 {#if item.tags.length > 0}
 <div class="mt-3 flex flex-wrap gap-1">
 {#each item.tags.slice(0, 3) as tag}
 <span class="px-2 py-1 bg-panelSoft/50 text-sand/40 text-xs rounded">
 {tag}
 </span>
 {/each}
 {#if item.tags.length > 3}
 <span class="px-2 py-1 bg-panelSoft/50 text-sand/40 text-xs rounded">
 +{item.tags.length - 3}
 </span>
 {/if}
 </div>
 {/if}
 </div>
 {/each}
 </div>
 </div>
 {:else}
 <!-- List View -->
 <div class="overflow-x-auto">
 <table class="w-full">
 <thead class="bg-panelSoft/30">
 <tr class="text-left text-xs font-medium text-sand/40 uppercase tracking-wider">
 <th class="px-4 py-3 w-12"></th>
 <th class="px-4 py-3">Document</th>
 <th class="px-4 py-3">Type</th>
 <th class="px-4 py-3">Size</th>
 <th class="px-4 py-3">Case</th>
 <th class="px-4 py-3">Status</th>
 <th class="px-4 py-3">AI Analysis</th>
 <th class="px-4 py-3">Uploaded</th>
 <th class="px-4 py-3">Actions</th>
 </tr>
 </thead>

 <tbody class="divide-y divide-sand/30">
 {#each evidence as item}
 <tr class="hover:bg-panelSoft/20 transition-colors">
 <td class="px-4 py-4">
 <input
 type="checkbox"
 class="rounded border-sand/30 bg-panelSoft text-info focus:ring-info/80"
 checked={selectedEvidence.has(item.id)}
 onchange={() => toggleSelection(item.id)}
 />
 </td>

 <td class="px-4 py-4">
 <div class="flex items-center space-x-3">
 <span class="text-lg">{getFileIcon(item.format)}</span>
 <div>
 <div class="font-medium text-white text-sm">{item.title}</div>
 <div class="text-xs text-sand/40">{item.id}</div>
 </div>
 </div>
 </td>

 <td class="px-4 py-4 text-sm text-sand/40 capitalize">{item.type}</td>
 <td class="px-4 py-4 text-sm text-sand/40">{item.size}</td>
 <td class="px-4 py-4 text-sm text-info">{item.case}</td>
 <td class="px-4 py-4">
 <span class="px-2 py-1 text-xs rounded-full bg-panelSoft/50 {getStatusColor(item.status)}">
 {item.status}
 </span>
 </td>

 <td class="px-4 py-4">
 {#if item.aiAnalyzed}
 <div class="flex items-center space-x-2">
 <span class={getConfidenceColor(item.confidence)}>{item.confidence}%</span>
 <div class="w-12 bg-panelSoft rounded-full h-1.5">
 <div
 class="h-1.5 rounded-full {item.confidence >= 90 ? 'bg-accent/80' : item.confidence >= 70 ? 'bg-warning' : 'bg-danger/80'}"
 style="width: {item.confidence}%"
 ></div>
 </div>
 </div>
 {:else}
 <span class="text-sand/60">Not analyzed</span>
 {/if}
 </td>

 <td class="px-4 py-4 text-sm text-sand/40">{formatDate(item.uploaded)}</td>

 <td class="px-4 py-4">
 <div class="flex space-x-1">
 <button class="p-1 text-sand/40 hover:text-info transition-colors" title="View">
 👁️
 </button>
 <button class="p-1 text-sand/40 hover:text-accent transition-colors" title="Download">
 ⬇️
 </button>
 <button class="p-1 text-sand/40 hover:text-warning transition-colors" title="Analyze">
 🤖
 </button>
 <button class="p-1 text-sand/40 hover:text-danger/80 transition-colors" title="Delete">
 🗑️
 </button>
 </div>
 </td>
 </tr>
 {/each}
 </tbody>
 </table>
 </div>
 {/if}

 <!-- Pagination -->
 <div class="px-4 py-3 border-t border-sand/50 flex items-center justify-between">
 <div class="text-sm text-sand/40">
 Showing 1 to {evidence.length} of {evidence.length} results
 </div>

 <div class="flex space-x-2">
 <button class="px-3 py-1 bg-panelSoft/50 hover:bg-panelSoft/50 text-sand/40 text-sm rounded transition-colors" disabled>
 Previous
 </button>
 <button class="px-3 py-1 bg-info/20 text-info text-sm rounded">
 1
 </button>
 <button class="px-3 py-1 bg-panelSoft/50 hover:bg-panelSoft/50 text-sand/40 text-sm rounded transition-colors" disabled>
 Next
 </button>
 </div>
 </div>
</div>


