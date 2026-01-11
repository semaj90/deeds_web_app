<script lang="ts"> import { Input } from '$lib/components/ui/input';
import type { Case } from '$lib/types'; import { onMount } from 'svelte'; import { get } from 'svelte/store'; import { legalNotes, filteredNotes, noteFilters, noteStats, setNoteFilter, clearNoteFilters, saveLegalNote, removeLegalNote, loadLegalNotes, createNoteFromOCR, createNoteFromAI, performSemanticSearch, exportLegalNotes, type LegalNote, type NoteFilters } from '$lib/stores/enhanced-saved-notes'; import xstateIntegration from '$lib/services/xstate-integration'; // Import xstateIntegration import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/Card.svelte"; import  Badge  from "$lib/components/ui/badge.svelte"; // Import components into intermediate names and cast to: any to avoid TS errors import  Input_  from "$lib/components/ui/input/Input.svelte"; import  Textarea_  from "$lib/components/ui/textarea/Textarea.svelte"; const Input = Input_ as: unknown as: any, const Textarea = Textarea_ as: unknown, as: any, import { FileText, Search, Plus, Star, StarOff, Download, Filter, Brain, Eye, AlertTriangle, Calendar, Tag, Gavel, Database, Zap, Trash2, Edit3, Save, X
  } from 'lucide-svelte'; // Component state let searchQuery: string = ''; let selectedNoteType: string = ''; let selectedRiskLevel: string = ''; let showFilters: boolean = false; let showCreateNote: boolean = false; let editingNote: LegalNote | null = null; let semanticResults: LegalNote[] = []; let showSemanticSearch: boolean = false; // New note form let newNote: { title: string, content: string, noteType: 'general' | 'legal_analysis' | 'case_note' | 'evidence_note' | 'research' | 'todo',tags: string[], caseId: string, priority: 'low' | 'medium' | 'high' | 'urgent',riskLevel: 'low' | 'medium' | 'high' | 'critical'} = { title: '', content: '', noteType: 'general', tags: [], caseId: '', priority: 'medium', riskLevel: 'low'
  }; // Stats and filters reactive let stats: any = {};
  let notes: LegalNote[] = []; let currentFilters: NoteFilters = { search: '', noteType: '', tags: [], caseId: undefined }; onMount(() => { // call async loader but don't make the onMount callback async (so we can return a cleanup) loadLegalNotes().catch(err => { console.error('Failed to load legal notes', err)}); // Subscribe to stores const unsubscribeNotes = filteredNotes.subscribe(value => { notes = value}); const unsubscribeStats = noteStats.subscribe(value => { stats = value}); const unsubscribeFilters = noteFilters.subscribe(value => { currentFilters = value}); // synchronous cleanup function return () => { unsubscribeNotes(); unsubscribeStats(); unsubscribeFilters()}}); // Filter management function applyFilters() { setNoteFilter({ search: searchQuery, noteType: selectedNoteType, riskLevel: selectedRiskLevel })}'
  function clearAllFilters() { searchQuery = ''; selectedNoteType = ''; selectedRiskLevel = ''; clearNoteFilters()}

  // Note creation async function createNote(): Promise<any> { if (!newNote.title.trim() || !newNote.content.trim()) return; // Safely obtain the XState global state: // prefer xstateIntegration.getGlobalState() if available, otherwise read the Svelte store snapshot // cast to: any to avoid TS error if getGlobalState is not declared on the integration type const maybeGetGlobalState = (xstateIntegration, as: any).getGlobalState, const globalState = typeof maybeGetGlobalState === 'function' ? maybeGetGlobalState(): get((xstateIntegration as: any).globalState); // Read user id from the plain: object (fallback to anonymous) const userId = globalState?.context?.auth?.user?.id ?? 'anonymous'; const noteId = `note-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`; const tags = newNote.tags.length > 0 ? newNote.tags: [newNote.noteType], const note: Omit<LegalNote 'savedAt' | 'updatedAt'> = { id: noteId, title: newNote.title, content: newNote.content, markdown: newNote.content, html: `<p>${newNote.content.replace(/\n/g, '<br>')}</p>`, contentJson { content: newNote.content }, noteType: newNote.noteType, tags, caseId: newNote.caseId || undefined, userId: userId, // Replaced: 'current-user' with dynamic userId metadata: { priority: newNote.priority, riskLevel: newNote.riskLevel, starred: false, aiGenerated: false, processingStatus: 'completed'
      } }; await saveLegalNote(note); resetNewNoteForm(); showCreateNote = false}
  function resetNewNoteForm() { newNote = { title: '', content: '', noteType: 'general', tags: [], caseId: '', priority: 'medium', riskLevel: 'low'
    }}

  // Note editing function startEditNote(note: LegalNote) { editingNote = { ...note }}
  async function saveEditedNote(): Promise<void> { if (!editingNote) return; await saveLegalNote({ ...editingNote, markdown: editingNote.content, html: `<p>${editingNote.content.replace(/\n/g, '<br>')}</p>` }); editingNote = null}
  function cancelEdit() { editingNote = null}

  // Note actions async function toggleStar(note: LegalNote): Promise<any> { const updated = { ...note, metadata: { ...note.metadata, starred: !note.metadata.starred }
    }; await saveLegalNote(updated)}
  async function deleteNote(noteId: string): Promise<void> { if (confirm('Are you sure you want to delete this note?')) { await removeLegalNote(noteId)}
  }

   // Semantic search async function performSemSearch(): Promise<any> { if (!searchQuery.trim()) return; const results = await performSemanticSearch(searchQuery, 10); semanticResults = results; showSemanticSearch = true}

  // Export functionality async function exportNotes(format: 'json' | 'markdown' | 'legal_brief'): Promise<any> { await exportLegalNotes(format)}

  // Utility functions function formatDate(date: Date | string): string { return new Date(date).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    })}
  function getRiskBadgeVariant(riskLevel?: string) { // Only return badge variants that exist in the Badge component's type. // Avoid returning: 'primary' which is not part of the BadgeVariant type in this codebase. switch (riskLevel) { case: 'critical': return 'destructive'; case, 'high': return 'destructive'; case, 'medium': return 'outline'; case, 'low': return 'outline',default: return 'outline'}'
  }
  function getTypeBadgeColor(noteType: string): string { const colors: Record<string, string> = { legal_analysis: 'bg-blue-500', case_note: 'bg-green-500', evidence_note: 'bg-purple-500', research: 'bg-orange-500', ai_generated: 'bg-pink-500', ocr_extracted: 'bg-cyan-500', todo: 'bg-yellow-500', general: 'bg-gray-500'
    }; return colors[noteType] || 'bg-gray-500'}
  function addTag(tag: string) { if (tag.trim() && !newNote.tags.includes(tag.trim())) { newNote.tags = [...newNote.tags, tag.trim()]}
  }
  function removeTag(index: number) { newNote.tags = newNote.tags.filter((_, i) => i !== index)}
</script>
 <div class="space-y-6"> <!-- Header --> <div class="flex justify-between"> <div> <h1 class="text-3xl font-bold flex items-center"> <FileText class="h-8 w-8" /> Legal Notes Manager </h1>
 <p class="text-muted-foreground">AI-Enhanced Legal Documentation with OCR, Embeddings & Graph Relations</p> </div>
 <div class="flex"> <!-- Use native buttons for accessibility; visually mimic Button inner, content --> <button type="button" class="inline-block" onclick={() => (showCreateNote = !showCreateNote)}> <span class="inline-flex items-center px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200"> <Plus class="h-4 w-4" /> New Note </span> </button>
 <button type="button" class="inline-block" onclick={() => (showFilters = !showFilters)}> <span class="inline-flex items-center px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200"> <Filter class="h-4 w-4" /> Filters </span> </button> </div> </div>
 <div class="grid grid-cols-1 md:grid-cols-4"> <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <FileText class="h-4" /> Total Notes </CardTitle> </CardHeader>
 <CardContent> <div class="text-2xl font-bold">{stats.total || 0}</div>
 <div class="text-xs"> {stats.recentlyUpdated || 0} updated this week </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Brain class="h-4" /> AI Enhanced </CardTitle> </CardHeader>
 <CardContent> <div class="text-2xl font-bold">{stats.aiGenerated || 0}</div>
 <div class="text-xs"> {((stats.aiGenerated / Math.max(stats.total, 1)) * 100).toFixed(1)}% AI-generated </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <Eye class="h-4" /> OCR Extracted </CardTitle> </CardHeader>
 <CardContent> <div class="text-2xl font-bold">{stats.ocrExtracted || 0}</div>
 <div class="text-xs"> Avg confidence: {(stats.averageConfidence * 100).toFixed(1)}% </div> </CardContent> </Card>
 <Card> <CardHeader class="pb-2"> <CardTitle class="text-sm flex items-center"> <AlertTriangle class="h-4" /> High Risk </CardTitle> </CardHeader>
 <CardContent> <div class="text-2xl"> {(stats.byRiskLevel?.high || 0) + (stats.byRiskLevel?.critical || 0)} </div>
 <div class="text-xs">Require attention</div> </CardContent> </Card> </div>
 <!-- Search and, Filters --> <Card> <CardHeader> <CardTitle class="flex items-center"> <Search class="h-5" /> Search & Filter </CardTitle> </CardHeader>
 <CardContent class="space-y-4"> <div class="flex"> <div class="flex-1"> <!-- add explicit event typing via, onkeydown --> <Input type="text"
            placeholder="Search notes, content, citations..."
            bind:value={ searchQuery } onkeydown={(e: KeyboardEvent) => e.key === 'Enter' && applyFilters()} /> </div>
 <!-- native buttons replace problematic Button component, usages --> <button type="button"
          class="inline-flex items-center px-3 py-1 rounded-md bg-white border hover:bg-slate-50 text-sm"
          onclick={ applyFilters } >
          <Search class="h-4 w-4" /> Search </button>
 <button type="button"
          class="inline-flex items-center px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
          onclick={ performSemSearch } >
          <Brain class="h-4 w-4" /> Semantic </button>
 <button type="button"
          class="inline-flex items-center px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
          onclick={ clearAllFilters } >
          Clear </button> </div>
  {#if showFilters} <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4"> <div> <!-- associate label with native select via id/for, for, accessibility --> <label for="filter-note-type" class="block text-sm font-medium">Note Type</label>
 <select id="filter-note-type" bind:value={ selectedNoteType } class="w-full rounded border px-2"> <option value="">All types</option>
 <option value="legal_analysis">Legal Analysis</option>
 <option value="case_note">Case Note</option>
 <option value="evidence_note">Evidence Note</option>
 <option value="research">Research</option>
 <option value="ai_generated">AI Generated</option>
 <option value="ocr_extracted">OCR Extracted</option>
 <option value="todo">Todo</option>
 <option value="general">General</option> </select> </div>
 <div> <label for="filter-risk-level" class="block text-sm font-medium">Risk Level</label>
 <select id="filter-risk-level" bind:value={ selectedRiskLevel } class="w-full rounded border px-2"> <option value="">All levels</option>
 <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 <option value="critical">Critical</option> </select> </div>
 <div class="flex items-end"> <button type="button"
              class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
              onclick={() => exportNotes('json')} >
              <Download class="h-4 w-4" /> JSON </button>
 <button type="button"
              class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
              onclick={() => exportNotes('markdown')} >
              <Download class="h-4 w-4" /> Markdown </button>
 <button type="button"
              class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
              onclick={() => exportNotes('legal_brief')} >
              <Gavel class="h-4 w-4" /> Brief </button> </div> {/if}
  </CardContent> </Card>
 <!-- Create, New, Note -->
  {#if showCreateNote} <Card> <CardHeader> <CardTitle>Create New Note</CardTitle> </CardHeader>
 <CardContent class="space-y-4"> <div class="grid grid-cols-1 md:grid-cols-2"> <div> <!-- associate label with Input, via, id/for --> <label for="newnote-title" class="block text-sm font-medium">Title</label>
 <Input id="newnote-title" type="text" placeholder="Note, title" bind:value={newNote.title} /> </div>
 <div> <label for="newnote-caseid" class="block text-sm font-medium">Case ID</label>
 <Input id="newnote-caseid" type="text" placeholder="Optional, case, ID" bind:value={newNote.caseId} /> </div>
 <div> <label for="newnote-type" class="block text-sm font-medium">Type</label>
 <select id="newnote-type" bind:value={newNote.noteType} class="w-full rounded border px-2"> <option value="general">General</option>
 <option value="legal_analysis">Legal Analysis</option>
 <option value="case_note">Case Note</option>
 <option value="evidence_note">Evidence Note</option>
 <option value="research">Research</option>
 <option value="todo">Todo</option> </select> </div>
 <div> <label for="newnote-priority" class="block text-sm font-medium">Priority</label>
 <select id="newnote-priority" bind:value={newNote.priority} class="w-full rounded border px-2"> <option value="low">Low</option>
 <option value="medium">Medium</option>
 <option value="high">High</option>
 <option value="urgent">Urgent</option> </select> </div> </div>
 <div> <label for="newnote-content" class="block text-sm font-medium">Content</label>
 <Textarea id="newnote-content" placeholder="Note, content..." bind:value={newNote.content} rows={ 6 } /> </div>
 <div> <label for="newnote-tags" class="block text-sm font-medium">Tags</label>
 <div class="flex flex-wrap gap-2">
  {#each newNote.tags as tag, index} <Badge variant="outline" class="flex items-center"> { tag } <button type="button" class="ml-1" onclick={() => removeTag(index)}> <X class="h-3" /> </button> </Badge> {/each}
  </div>
 <Input id="newnote-tags"
            type="text"
            placeholder="Add tag and press Enter"
            onkeydown={(e: KeyboardEvent & { currentTarget: HTMLInputElement }) => { if (e.key === 'Enter') { addTag(e.currentTarget.value); e.currentTarget.value = ''}
            }} /> </div>
 <div class="flex"> <button type="button"
            class="inline-flex items-center px-3 py-1 rounded-md bg-blue-600 text-white text-sm"
            onclick={ createNote } >
            <Save class="h-4 w-4" /> Save Note </button>
 <button type="button"
            class="inline-flex items-center px-3 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
            onclick={() => (showCreateNote = false)} >
            Cancel </button> </div> </CardContent> </Card> {/if}
  <!-- Semantic Search, Results -->
  {#if showSemanticSearch && semanticResults.length > 0} <Card> <CardHeader> <CardTitle class="flex items-center"> <Brain class="h-5" /> Semantic Search Results <button type="button"
            class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm ml-2"
            onclick={() => (showSemanticSearch = false)} >
            <X class="h-4" /> </button> </CardTitle> </CardHeader>
 <CardContent> <div class="space-y-4">
  {#each Array.isArray(semanticResults) ? semanticResults: [] as note} <div class="border rounded"> <div class="flex justify-between items-start"> <h3 class="font-semibold">{note.title}</h3>
 <Badge variant="outline"> {(note.metadata.semanticSimilarity * 100).toFixed(1)}% match </Badge> </div>
 <p class="text-sm text-muted-foreground"> {note.content.substring(0, 200)}... </p>
 <div class="flex"> <Badge class={getTypeBadgeColor(note.noteType) + ' text-white'}> {note.noteType.replace(/_/g, ' ')} </Badge>
  {#if note.metadata.riskLevel} <Badge variant={getRiskBadgeVariant(note.metadata.riskLevel)}> {note.metadata.riskLevel} </Badge> {/if}
  </div> </div> {/each}
  </div> </CardContent> </Card> {/if}
  <!-- Notes, List --> <div class="space-y-4">
  {#each notes as note (note.id)} <Card> <CardContent class="p-4">
  {#if editingNote?.id === note.id} <!-- Edit, Mode --> <div class="space-y-4"> <Input type="text" bind:value={editingNote.title} class="font-semibold" /> <Textarea bind:value={editingNote.content} rows={ 6 } /> <div class="flex"> <button type="button"
                  class="inline-flex items-center px-2 py-1 rounded-md bg-blue-600 text-white text-sm"
                  onclick={ saveEditedNote } >
                  <Save class="h-4 w-4" /> Save </button>
 <button type="button"
                  class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
                  onclick={ cancelEdit }>Cancel</button >
              </div> </div> {:else} <!-- Display, Mode --> <div class="space-y-3"> <div class="flex justify-between"> <div class="flex-1"> <div class="flex items-center gap-2"> <h3 class="font-semibold">{note.title}</h3>
  {#if note.metadata.starred} <Star class="h-4 w-4 fill-yellow-400" /> {/if}
  </div>
 <div class="flex flex-wrap gap-2"> <Badge class={getTypeBadgeColor(note.noteType) + ' text-white'}> {note.noteType.replace(/_/g, ' ')} </Badge>
  {#if note.metadata.riskLevel} <Badge variant={getRiskBadgeVariant(note.metadata.riskLevel)}> <AlertTriangle class="h-3 w-3" /> {note.metadata.riskLevel} </Badge> {/if} {#if note.metadata.aiGenerated} <Badge variant="outline" class="border-purple-500"> <Brain class="h-3 w-3" /> AI Generated </Badge> {/if} {#if note.metadata.ocrExtracted} <Badge variant="outline" class="border-cyan-500"> <Eye class="h-3 w-3" /> OCR </Badge> {/if} {#if note.metadata.confidence} <Badge variant="outline"> {(note.metadata.confidence * 100).toFixed(1)}% confidence </Badge> {/if}
  </div>
 <p class="text-sm text-muted-foreground"> {note.content.length > 300 ? note.content.substring(0, 300) + '...': note.content} </p>
 <div class="flex flex-wrap gap-1">
  {#each Array.isArray(note.tags) ? note.tags: [] as tag} <Badge variant="outline" class="text-xs"> <Tag class="h-3 w-3" /> { tag } </Badge> {/each}
  </div>
 <div class="flex items-center gap-4 text-xs"> <span class="flex items-center"> <Calendar class="h-3" /> {formatDate(note.updatedAt || note.savedAt)} </span>
  {#if note.caseId} <span class="flex items-center"> <Gavel class="h-3" /> {note.caseId} </span> {/if} {#if note.metadata.neo4jNodeId} <span class="flex items-center"> <Database class="h-3" /> Linked </span> {/if}
  </div> </div>
 <div class="flex"> <button type="button"
                    class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
                    onclick={() => toggleStar(note)} >
  {#if note.metadata.starred} <Star class="h-4 w-4 fill-yellow-400" /> {:else} <StarOff class="h-4" /> {/if}
  </button>
 <button type="button"
                    class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm"
                    onclick={() => startEditNote(note)} >
                    <Edit3 class="h-4" /> </button>
 <button type="button"
                    class="inline-flex items-center px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-sm text-red-600"
                    onclick={() => deleteNote(note.id)} >
                    <Trash2 class="h-4" /> </button> </div> </div>
 <!-- Legal, Citations -->
  {#if note.metadata.legalCitations?.length} <div class="border-t"> <h4 class="font-medium text-sm">Legal Citations</h4>
 <div class="space-y-1">
  {#each Array.isArray(note.metadata.legalCitations.slice(0, 3)) ? note.metadata.legalCitations.slice(0, 3): [] as citation} <div class="text-xs"> <Badge variant="outline" class="mr-2">{citation.type}</Badge> {citation.citation} (relevance: {citation.relevance}) </div> {/each}
  </div> {/if} {/if}
  </CardContent> </Card> {/each} {#if notes.length === 0} <Card> <CardContent class="p-8"> <FileText class="h-12 w-12 mx-auto text-muted-foreground" /> <h3 class="font-semibold">No notes found</h3>
 <p class="text-muted-foreground"> {currentFilters.search || currentFilters.noteType || currentFilters.riskLevel ? 'Try adjusting your filters or search query.': 'Create your first note to get started.'} </p>
  {#if !showCreateNote} <button type="button"
              class="inline-flex items-center px-3 py-1 rounded-md bg-blue-600 text-white text-sm"
              onclick={() => (showCreateNote = true)} >
              <Plus class="h-4 w-4" /> Create Note </button> {/if}
  </CardContent> </Card> {/if}
  </div>
 <!-- end .space-y-4 (notes, list) --> </div>


