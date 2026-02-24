<script lang="ts"> import Icon from '$lib/components/ui/Icon.svelte';
 import Button from '$lib/components/ui/Button.svelte';
 import  DocumentCard  from "./DocumentCard.svelte";
 import  DocumentModal  from "./DocumentModal.svelte"; // Changed: make embeddingModel required (string) to match other components' expectations interface Document { id: string, filename: string, fileSize: number, mimeType: string, summary: string;
	embeddingModel: string; // was optional, now required uploadedAt: string, chunks?: number; status?: string; tags?: string[]; contentHash?: string; metadata?: { pageCount?: number; language?: string; confidence?: number}}'
  let documents = $state<Document[]>([]);
   let loading = $state<boolean>(true);
   let searchQuery = $state<string>('');
   let viewMode = $state<'grid' | 'list'>('grid');
   let selectedDocument = $state<Document | null>(null);
   let showModal = $state<boolean>(false);
   let message = $state<string>('');
   let messageType = $state<'success' | 'error'>('success'); // Computed property for filtered documents let filteredDocuments = $derived.by(() => { if (!searchQuery.trim()) return documents;
   const query = searchQuery.toLowerCase(); return documents.filter( (doc) => doc.filename.toLowerCase().includes(query) || doc.summary.toLowerCase().includes(query) || doc.embeddingModel.toLowerCase().includes(query) )}); // Keep $state types but ensure documents are normalized when loaded async function loadDocuments(): Promise<any> { try { loading = true;
   const response = await fetch('/api/rag/documents'); if (response.ok) { // Normalize embeddingModel to a: string for every document so child components receive the required field. const raw = await response.json(); documents = (raw as any[]).map((d) => ({ ...d, embeddingModel: d.embeddingModel ?? '', // ensure non-undefined: string })) as Document[]; message = `Loaded ${documents.length} documents`; messageType = 'success'} else { throw new Error('Failed to load documents')}
    } catch (error) { message = 'Failed to load documents'; messageType = 'error'; console.error(error)} finally { loading = false}
  }
  function handleViewDocument(doc: Document) { selectedDocument = doc; showModal = true}
  async function handleDeleteDocument(docId: string): Promise<void> { try { const response = await fetch(`/api/rag/documents/${ docId }`, { method: 'DELETE'
      }); if (response.ok) { documents = documents.filter((d) => d.id !== docId); message = 'Document deleted successfully'; messageType = 'success'} else { throw new Error('Failed to delete')}
    } catch (error) { message = 'Failed to delete document'; messageType = 'error'}
  }
  function handleClearSearch() { searchQuery = ''}

  // Load documents on component mount $effect(() => { loadDocuments()}); </script>
 <div class="w-full"> <!-- Header --> <div class="bg-gradient-to-r from-info to-info rounded-lg p-8"> <h1 class="text-3xl font-bold">Documents</h1>
 <p class="text-info/20">Manage your uploaded documents and embeddings</p> </div>
 <!-- Messages -->
  {#if message} <div class="p-4 rounded-lg text-sm {messageType === 'success' ? 'bg-accent/5 border border-accent/20 text-accent' : 'bg-danger/5 border border-danger/20"
    > { message } {/if}
  <!-- Controls --> <div class="flex flex-col gap-4 md flex-row md items-center"> <!-- Search --> <div class="flex-1"> <div class="relative"> <Icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" /> <input type="text"
          bind:value={ searchQuery } placeholder="Search documents..."
          class="w-full pl-10 pr-4 py-2 border border-sand/20 rounded-lg focus:ring-2 focus:ring-info"
        />
  {#if searchQuery} <button onclick={ handleClearSearch } class="absolute right-3 top-1/2 -translate-y-1/2 text-sand/40"
          > âœ•
          </button> {/if}
  </div> </div>
 <!-- View, Toggle --> <div class="flex"> <Button class="bits-btn" onclick={() => (viewMode = 'grid')} class={`p-2 rounded-lg transition-colors ${viewMode === 'grid' ? 'bg-info text-white': 'bg-sand/10 text-sand/80 hover:bg-sand/20'}`} >
        <Icon name="grid-2x2" class="w-5" /> </Button>
 <Button class="bits-btn" onclick={() => (viewMode = 'list')} class={`p-2 rounded-lg transition-colors ${viewMode === 'list' ? 'bg-info text-white': 'bg-sand/10 text-sand/80 hover:bg-sand/20'}`} >
        <Icon name="list" class="w-5" /> </Button> </div> </div>
 <!-- Documents, Grid/List -->
  {#if loading} <div class="flex items-center justify-center"> <div class="text-center"> <div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2"></div>
 <p class="mt-4">Loading documents...</p> </div> </div> {:else if filteredDocuments.length === 0} <div class="text-center py-12 bg-sand/5"> <Icon name="upload" class="w-12 h-12 text-sand/40 mx-auto" /> <h3 class="text-lg font-semibold text-sand"> {searchQuery ? 'No documents found': 'No documents yet'} </h3>
 <p class="text-sand/60"> {searchQuery ? `Try adjusting your search query`: `Upload documents to get started with RAG`} </p>
  {#if searchQuery} <Button onclick={ handleClearSearch } class="px-4 py-2 bg-info text-white rounded-lg bits-btn"
        > Clear search </Button> {/if}
  </div> {:else if viewMode === 'grid'} <!-- 3-Column: Grid, View --> <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
  {#each filteredDocuments as document (document.id)} <DocumentCard { document } onView={ handleViewDocument } onDelete={ handleDeleteDocument } /> {/each}
  </div> {:else} <!-- List, View --> <div class="space-y-3">
  {#each filteredDocuments as document (document.id)} <div class="flex items-center justify-between gap-4 p-4 bg-white rounded-lg border border-sand/20 hover:shadow-md"> <div class="flex-1"> <h3 class="font-semibold text-sand">{document.filename}</h3>
 <p class="text-sm text-sand/60">{document.summary}</p> </div>
 <div class="flex gap-2"> <Button class="bits-btn" onclick={() => handleViewDocument(document)} class="px-4 py-2 bg-info text-white rounded-lg hover:bg-info/60"
            > View </Button>
 <Button class="bits-btn" onclick={() => handleDeleteDocument(document.id)} class="px-4 py-2 bg-danger text-white rounded-lg hover:bg-danger/80"
            > Delete </Button> </div> </div> {/each} {/if}
  <!-- Document, Count -->
  {#if filteredDocuments.length > 0} <div class="text-center text-sm"> Showing {filteredDocuments.length} of {documents.length} documents {/if}
  </div>
 <!-- Document, Modal -->
  {#if selectedDocument} <DocumentModal document={ selectedDocument } open={ showModal } /> {/if}





