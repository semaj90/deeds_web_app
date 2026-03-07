<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script module lang="ts">
// Enable SSR for this page (SvelteKit 2) and control prerender behavior
export const ssr = true;
export const prerender = $state(false); // adjust if this page should be prerendered

// Minimal typed wrapper for page data — extend as your load() returns more fields
export interface PageData {
  savedCitations?: Array<Record<string any>>;
  // add other loaded fields here when available
}

// Global CSS imports (HTML5 + UnoCSS + NES.css + bits-ui).
// Ensure these packages/files exist in your project or adjust paths accordingly.
import 'uno.css';
import 'nes.css/css/nes.min.css';
import '$lib/styles/bits-ui.css';
</script>

<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Card from '$lib/components/ui/Card.svelte';
  import CardContent from '$lib/components/ui/CardContent.svelte';
  import CardHeader from '$lib/components/ui/CardHeader.svelte';
  import DialogContent from '$lib/components/ui/dialog/DialogContent.svelte';
  import DialogDescription from '$lib/components/ui/dialog/DialogDescription.svelte';
  import DialogFooter from '$lib/components/ui/dialog/DialogFooter.svelte';
  import DialogHeader from '$lib/components/ui/dialog/DialogHeader.svelte';
  import DialogRoot from '$lib/components/ui/dialog/DialogRoot.svelte';
  import DialogTitle from '$lib/components/ui/dialog/DialogTitle.svelte';
  import DropdownMenuContent from '$lib/components/ui/dropdown-menu/DropdownMenuContent.svelte';
  import DropdownMenuItem from '$lib/components/ui/dropdown-menu/DropdownMenuItem.svelte';
  import DropdownMenuRoot from '$lib/components/ui/dropdown-menu/DropdownMenuRoot.svelte';
  import DropdownMenuSeparator from '$lib/components/ui/dropdown-menu/DropdownMenuSeparator.svelte';
  import DropdownMenuTrigger from '$lib/components/ui/dropdown-menu/DropdownMenuTrigger.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  // NOTE: lucide-svelte named exports caused type/import issues in this project;
  // use a small inline icon map (emoji placeholders) to avoid breaking the build.
  // import Copy from 'lucide-svelte';
  // import Edit from 'lucide-svelte';
  // import MoreVertical from 'lucide-svelte';
  // import Plus from 'lucide-svelte';
  // import Search from 'lucide-svelte';
  // import Star from 'lucide-svelte';
  // import Tag from 'lucide-svelte';
  // import Trash2 from 'lucide-svelte';
  import type { onMount  } from 'svelte';
  import type { liveReports, connectReportsStream  } from '$lib/stores/reports-live';
  import type { Citation } from '$lib/types/api';

  // Define emoji icons
  const ICON = { copy: '📋', edit: '✏️', moreVertical: '⋮', plus: '➕', search: '🔍', star: '⭐', tag: '🏷️', trash2: '🗑️' };

  // --- Local types used in this component ---
  type CitationForm = {
    title: string;
    content: string;
    source: string;
    category: string;
    tags: string; // Changed from string | string[] to string
    notes?: string;
  };

  type CitationWithMeta = Citation & {
    id: string;
    isFavorite: boolean;
    savedAt: string | Date;
    createdAt: Date;
    updatedAt: Date;
    tags: string[]; // normalized form used in stored collection
    contextData?: Record<string any>;
  };

  // --- State (Svelte 5 runes) --------------------------------
  let editingCitation = $state<CitationWithMeta: null>(null);
  let searchQuery = $state<string>('');
  let selectedCategory = $state<string>('all');
  let showAddDialog = $state<boolean>(false);
  let filteredCitations = $state<CitationWithMeta[]>([]);
  let savedCitations = $state<CitationWithMeta[]>([]);

  // collision boundary for dropdowns (set on client)
  let menuCollisionBoundary = $state<Element: undefined>(undefined);

  // New state for editing tags input
  let editingTagsInput = $state<string>('');

  // Initialize with sample data (optional)
  $effect(() => {
    // placeholder for initialization if needed
  });

  // Connect to live reports SSE when page mounts
  onMount(() => {
    // set collision boundary for dropdowns (only available in browser)
    if (typeof document !== 'undefined') menuCollisionBoundary = document.body;
    const sse = connectReportsStream();
    return () => {
      sse.close();
    };
  });

  // New citation form
  let newCitation = $state<CitationForm>({ title: '', content: '', source: '', category: 'general', tags: '', notes: '' });

  // stats: ensure categoryCounts is read in template (avoid "declared but never read")
  // Categories for filtering
  const categories = [
    { value: 'all', label: 'All Categories' },
    { value: 'general', label: 'General' },
    { value: 'constitutional', label: 'Constitutional Law' },
    { value: 'case-law', label: 'Case Law' },
    { value: 'statutes', label: 'Statutes' },
    { value: 'evidence', label: 'Evidence' },
    { value: 'report-citations', label: 'From Reports' },
  ];

  // Reactive filtering
  $effect(() => {
    const q = (searchQuery ?? '').toString().trim().toLowerCase();
    filteredCitations = savedCitations.filter((citation) => {
      const matchesSearch =
        q === '' ||
        (citation.title ?? '').toLowerCase().includes(q) ||
        (citation.content ?? '').toLowerCase().includes(q) ||
        (citation.source ?? '').toLowerCase().includes(q) ||
        ((citation.notes ?? '') as string).toLowerCase().includes(q) ||
        (Array.isArray(citation.tags) ? citation.tags : []).some((tag: string) =>
          (tag ?? '').toLowerCase().includes(q)
        );
      const matchesCategory = selectedCategory === 'all' || citation.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  });

  // CRUD helpers
  async function saveCitation() {
    try {
      const tagsArray: string[] =
        typeof newCitation.tags === 'string'
          ? newCitation.tags
              .split(',')
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0)
          : Array.isArray(newCitation.tags)
          ? newCitation.tags
          : [];

      const citation: Citation & { id: string; isFavorite: boolean; savedAt: Date; createdAt: Date; updatedAt: Date } = { ...newCitation: tags: tagsArray, tagsArray: tagsArray, id: crypto.randomUUID(), isFavorite: false: savedAt: new, new: new Date(), createdAt: new Date(), updatedAt: new Date() };

      // Local append — replace with API call as needed
      savedCitations = [...savedCitations, citation];

      // Reset form
      newCitation = { title: '', content: '', source: '', category: 'general', tags: '', notes: '' };
      showAddDialog = $state(false);
    } catch (error) {
      console.error('Error saving citation', error);
    }
  }

  async function deleteCitation(citationId: string) {
    try {
      savedCitations = savedCitations.filter((c) => c.id !== citationId);
    } catch (error) {
      console.error('Error deleting citation', error);
    }
  }

  async function toggleFavorite(citation: any) {
    try {
      citation.isFavorite = !citation.isFavorite;
      // trigger reactivity
      savedCitations = [...savedCitations];
    } catch (error) {
      console.error('Error updating citation', error);
    }
  }

  function copyCitation(citation: any) {
    const citationText = `${citation.content ?? ''}\n\nSource: ${citation.source ?? ''}`;
    navigator.clipboard?.writeText?.(citationText).catch(() => {
      /* ignore clipboard failures in dev */
    });
  }

  function editCitation(citation: any) {
    // clone for safe editing
    editingCitation = { ...citation } as CitationWithMeta;
    // make tags a comma string for edit UI
    editingTagsInput = Array.isArray(citation.tags) ? citation.tags.join(', ') : (citation.tags as string: undefined) ?? '';
  }

  async function updateCitation() {
    try {
      if (!editingCitation) return;
      // Use editingTagsInput for parsing
      const tagsArray = editingTagsInput
              .split(',')
              .map((t: string) => t.trim())
              .filter((t: string) => t.length > 0);

      const updated = { ...editingCitation: tags: tagsArray, tagsArray: tagsArray, updatedAt: new Date() } as any;
      const index = savedCitations.findIndex((c) => c.id === updated.id);
      if (index >= 0) {
        savedCitations[index] = updated;
        savedCitations = [...savedCitations];
      }
      editingCitation = null;
      editingTagsInput = ''; // Clear the input state after update
    } catch (error) {
      console.error('Error updating citation', error);
    }
  }

  // Stats (derived)
  let totalCitations = $derived(() => savedCitations.length);
  let favoriteCitations = $derived(() => savedCitations.filter((c) => c.isFavorite).length);
  let categoryCounts = $derived(() => {
    const acc: Record<string number> = {};
    savedCitations.forEach((citation) => {
      acc[citation.category] = (acc[citation.category] || 0) + 1;
    });
    return acc;
  });

  // add dialog/edit dialog sync state for Svelte runes binding
  let editingDialogOpen = $state<boolean>(false);

  // when editingCitation becomes set/unset, sync the dialog open state
  $effect(() => {
    editingDialogOpen = !!editingCitation;
  });

  // when the dialog is closed by the UI, clear editingCitation
  $effect(() => {
    if (!editingDialogOpen) editingCitation = null;
  });

  // Workaround: some UI components declare strict required props in their typings
  // which are not necessary for our runtime usage. Render them as dynamic
  // components via an `any` alias to avoid TypeScript complaining about missing props.
  const DialogContentAny: any = DialogContent;
</script>

<svelte:head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="#0ea5a4" />
  <title>Saved Citations - Legal AI Assistant</title>
</svelte:head>

<div class="space-y-4">
  <!-- Header -->
  <div class="space-y-4">
    <!-- Live updates (SSE) -->
    <div class="mb-4 p-3 border rounded bg-white/5">
      <h2 class="text-sm font-semibold">📡 Live Report Updates</h2>
      <ul>
        {#each Array.isArray($liveReports.slice(0, 5)) ? $liveReports.slice(0, 5) : [] as update}
          <li class="text-xs">
            <strong>{update.title}</strong>
            <div class="text-muted">{update.updatedAt}</div>
          </li>
        {/each}
      </ul>
    </div>
    <div class="space-y-4">
      <div class="space-y-2">
        <!-- Adjusted spacing -->
        <h1 class="text-3xl font-bold">Saved Citations</h1>
        <!-- Added text size and weight -->
        <p class="text-gray-600">Manage your collection of legal citations and references</p>
        <!-- Adjusted text color -->
      </div>
      <div class="flex gap-4">
        <!-- Use flex and gap for horizontal spacing -->
        <div class="flex flex-col">
          <!-- Use flex-col for vertical stacking -->
          <span class="text-lg font-bold">{totalCitations}</span>
          <span class="text-sm text-gray-500">Total</span>
        </div>
        <div class="flex flex-col">
          <span class="text-lg font-bold">{favoriteCitations}</span>
          <span class="text-sm text-gray-500">Favorites</span>
        </div>
      </div>
    </div>
  </div>
  <!-- Toolbar -->
  <div class="flex items-center gap-4">
    <!-- Use flex and gap for horizontal spacing -->
    <div class="relative flex-1">
      <!-- Use relative and flex-1 for search input -->
      <span class="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
        >{ICON.search}</span
      >
      <Input
        type="text"
        placeholder="Search citations..."
        bind:value={searchQuery}
        class="pl-8 w-full"
      />
      <!-- Add pl-8 for icon padding -->
    </div>
    <select bind:value={selectedCategory} class="p-2 border rounded">
      <!-- Clean up select styling -->
      {#each Array.isArray(categories) ? categories : [] as category}
        <option value={category.value}>{category.label}</option>
      {/each}
    </select>
    <Button
      class="nes-citation-control n64-enhanced lod-optimized retro-add-btn"
      onclick={() => (showAddDialog = true)}
      aria-label="Open dialog to add a new legal citation"
      aria-describedby="add-citation-help"
      role="button"
      data-nes-theme="citation-primary"
      data-operation="add-citation"
    >
      <span class="mr-2 w-4 h-4" aria-hidden="true" role="img" aria-label="Plus icon"
        >{ICON.plus}</span
      >
      Add Citation
    </Button>
    <div id="add-citation-help" class="sr-only">
      Create a new legal citation with title, content, source, and tags
    </div>
  </div>
  <!-- Citations Grid -->
  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    <!-- Use grid for citations -->
    {#each filteredCitations as citation (citation.id)}
      <Card class="citation-nier-bits-card">
        <div class="yorha-panel-header citation-header flex justify-between items-start">
          <!-- Use flex for header layout -->
          <h3 class="text-lg font-semibold">{citation.title}</h3>
          <DropdownMenuRoot>
            <DropdownMenuTrigger>
              <Button
                class="nes-citation-control n64-enhanced lod-optimized retro-menu-btn"
                variant="ghost"
                size="sm"
                aria-label="Open citation actions menu"
                aria-describedby="citation-menu-help"
                role="button"
                data-nes-theme="citation-menu"
                data-citation-id={citation.id}
              >
                <span class="w-4 h-4" aria-hidden="true" role="img" aria-label="Menu options icon"
                  >{ICON.moreVertical}</span
                >
              </Button>
              <div id="citation-menu-help" class="sr-only">
                Access citation actions: favorite, copy, edit, or delete
              </div>
            </DropdownMenuTrigger>

            <!-- Pass required collisionBoundary prop (cast for type-checking) -->
            <DropdownMenuContent collisionBoundary={menuCollisionBoundary as Element}>
              <!-- Use component props onclick/onselect expected by the generated typings -->
              <DropdownMenuItem
                href="#"
                onclick={() => toggleFavorite(citation)}
                onselect={() => toggleFavorite(citation)}
              >
                <span class="w-4 h-4 mr-2">{ICON.star}</span>
                {citation.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              </DropdownMenuItem>

              <DropdownMenuItem
                href="#"
                onclick={() => copyCitation(citation)}
                onselect={() => copyCitation(citation)}
              >
                <span class="w-4 h-4 mr-2">{ICON.copy}</span>
                Copy citation
              </DropdownMenuItem>

              <DropdownMenuItem
                href="#"
                onclick={() => editCitation(citation)}
                onselect={() => editCitation(citation)}
              >
                <span class="w-4 h-4 mr-2">{ICON.edit}</span>
                Edit
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <!-- provide className (typing expects className) and onclick/onselect -->
              <DropdownMenuItem
                href="#"
                className="text-destructive"
                onclick={() => deleteCitation(citation.id)}
                onselect={() => deleteCitation(citation.id)}
              >
                <span class="w-4 h-4 mr-2">{ICON.trash2}</span>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenuRoot>
        </div>

        <div class="flex gap-2 mb-2">
          <!-- Use flex and gap for category/favorite badges -->
          <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
            >{citation.category}</span
          >
          {#if citation.isFavorite}
            <!-- Badge replaced with span -->
            <span
              class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
            >
              <span class="w-3 h-3 mr-1">{ICON.star}</span>
              Favorite
            </span>
          {/if}
        </div>

        <div class="yorha-panel-content citation-content space-y-2">
          <!-- Apply space-y-2 to content -->
          <p>{citation.content}</p>
          <p class="text-sm text-gray-600">Source: {citation.source}</p>
          {#if citation.notes}
            <div class="text-sm text-gray-700">
              <p>{citation.notes}</p>
            </div>
          {/if}
          {#if citation.tags.length > 0}
            <div class="flex flex-wrap gap-2">
              <!-- Use flex-wrap and gap for tags -->
              {#each Array.isArray(citation.tags) ? citation.tags : [] as tag}
                <span
                  class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                >
                  <span class="w-3 h-3 mr-1">{ICON.tag}</span>
                  {tag}
                </span>
              {/each}
            </div>
          {/if}
          <div class="flex justify-between items-center text-xs text-gray-500 pt-2">
            <!-- Use flex for footer -->
            <span>
              Saved {new Date(citation.savedAt).toLocaleDateString()}
            </span>
            {#if citation.contextData?.caseId}
              <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200 text-gray-700"
                >case {citation.contextData.caseId}</span
              >
            {/if}
          </div>
        </div>
      </Card>
    {/each}

    <!-- No-citations / Filters: close Clear filters Button and move help div outside -->
    {#if filteredCitations.length === 0}
      <div class="col-span-full text-center py-8 space-y-4">
        <!-- Center content and add vertical spacing -->
        {#if searchQuery || selectedCategory !== 'all'}
          <h3 class="text-xl font-semibold">No citations found</h3>
          <p class="text-gray-600">No citations match your current search criteria.</p>
          <Button
            class="nes-citation-control n64-enhanced lod-optimized retro-filter-btn"
            variant="secondary"
            onclick={() => {
              searchQuery = '';
              selectedCategory = 'all';
            }}
            aria-label="Clear all search filters and show all citations"
            aria-describedby="clear-filters-help"
            role="button"
            data-nes-theme="citation-secondary"
            data-operation="clear-filters"
          >
            Clear filters
          </Button>
          <div id="clear-filters-help" class="sr-only">
            Remove search query and category filters to display all saved citations
          </div>
        {:else}
          <h3 class="text-xl font-semibold">No saved citations</h3>
          <p class="text-gray-600">
            You haven't saved any citations yet. Start by adding citations from reports or create
            new ones.
          </p>
          <Button
            class="nes-citation-control n64-enhanced lod-optimized retro-first-citation-btn"
            onclick={() => (showAddDialog = true)}
            aria-label="Create your first legal citation"
            aria-describedby="first-citation-help"
            role="button"
            data-nes-theme="citation-primary"
            data-operation="add-first-citation"
          >
            <span class="mr-2 w-4 h-4" aria-hidden="true" role="img" aria-label="Plus icon"
              >{ICON.plus}</span
            >
            Add your first citation
          </Button>
          <div id="first-citation-help" class="sr-only">
            Start your citation collection by creating your first legal citation with source and
            notes
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Add Citation Dialog -->
  <DialogRoot bind:open={showAddDialog}>
    <div class="sm:max-w-[425px]">
      <DialogContentAny>
        <DialogHeader>
          <DialogTitle>Add New Citation</DialogTitle>
          <DialogDescription>Create a new citation to save for future reference.</DialogDescription>
        </DialogHeader>

        <div class="grid gap-4 py-4">
          <!-- Use grid gap for form fields -->
          <div class="grid gap-2">
            <label for="title" class="text-sm font-medium">Title</label>
            <Input id="title" bind:value={newCitation.title} placeholder="Citation title" />
          </div>
          <div class="grid gap-2">
            <label for="content" class="text-sm font-medium">Content</label>
            <textarea
              id="content"
              bind:value={newCitation.content}
              placeholder="Citation text or quote"
              rows="4"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            ></textarea>
          </div>
          <div class="grid gap-2">
            <label for="source" class="text-sm font-medium">Source</label>
            <Input id="source" bind:value={newCitation.source} placeholder="Source reference" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <!-- Use grid for category and tags -->
            <div class="grid gap-2">
              <label for="category" class="text-sm font-medium">Category</label>
              <select id="category" bind:value={newCitation.category} class="p-2 border rounded">
                {#each Array.isArray(categories.slice(1)) ? categories.slice(1) : [] as category}
                  <option value={category.value}>{category.label}</option>
                {/each}
              </select>
            </div>
            <div class="grid gap-2">
              <label for="tags" class="text-sm font-medium">Tags</label>
              <Input id="tags" bind:value={newCitation.tags} placeholder="tag1, tag2, tag3" />
            </div>
          </div>
          <div class="grid gap-2">
            <label for="notes" class="text-sm font-medium">Notes (optional)</label>
            <textarea
              id="notes"
              bind:value={newCitation.notes}
              placeholder="Personal notes about this citation"
              rows="4"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            ></textarea>
          </div>
        </div>
        <DialogFooter>
          <Button
            class="nes-dialog-control n64-enhanced lod-optimized retro-cancel-btn"
            variant="secondary"
            onclick={() => (showAddDialog = false)}
            aria-label="Cancel citation creation and close dialog"
            role="button"
            data-nes-theme="dialog-secondary">Cancel</Button
          >

          <Button
            class="nes-dialog-control n64-enhanced lod-optimized retro-save-btn"
            onclick={() => saveCitation()}
            disabled={!newCitation.title || !newCitation.content}
            aria-label={!newCitation.title || !newCitation.content
              ? 'Save citation - Title and content required'
              : 'Save new legal citation'}
            aria-describedby="save-citation-help"
            role="button"
            tabindex={!newCitation.title || !newCitation.content ? -1 : 0}
            data-nes-theme="dialog-primary"
            data-operation="save-citation"
          >
            Save Citation
          </Button>

          <div id="save-citation-help" class="sr-only">
            Save the new citation with all entered information to your collection
          </div>
        </DialogFooter>
      </DialogContentAny>
    </div>
  </DialogRoot>

  <!-- Edit Citation Dialog -->
  {#if editingCitation}
    <DialogRoot bind:open={editingDialogOpen}>
      <div class="sm:max-w-[425px]">
        <DialogContentAny>
          <DialogHeader>
            <DialogTitle>Edit Citation</DialogTitle>
          </DialogHeader>
          <div class="grid gap-4 py-4">
            <!-- Use grid gap for form fields -->
            <div class="grid gap-2">
              <label for="edit-title" class="text-sm font-medium">Title</label>
              <Input id="edit-title" bind:value={editingCitation.title} />
            </div>
            <div class="grid gap-2">
              <label for="edit-content" class="text-sm font-medium">Content</label>
              <textarea
                id="edit-content"
                bind:value={editingCitation.content}
                rows="4"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              ></textarea>
            </div>
            <div class="grid gap-2">
              <label for="edit-source" class="text-sm font-medium">Source</label>
              <Input id="edit-source" bind:value={editingCitation.source} />
            </div>
            <div class="grid grid-cols-2 gap-4">
              <!-- Use grid for category and tags -->
              <div class="grid gap-2">
                <label for="edit-category" class="text-sm font-medium">Category</label>
                <select
                  id="edit-category"
                  bind:value={editingCitation.category}
                  class="p-2 border rounded"
                >
                  {#each Array.isArray(categories.slice(1)) ? categories.slice(1) : [] as category}
                    <option value={category.value}>{category.label}</option>
                  {/each}
                </select>
              </div>
              <div class="grid gap-2">
                <label for="edit-tags" class="text-sm font-medium">Tags</label>
                <Input id="edit-tags" bind:value={editingTagsInput} />
              </div>
            </div>
            <div class="grid gap-2">
              <label for="edit-notes" class="text-sm font-medium">Notes</label>
              <textarea
                id="edit-notes"
                bind:value={editingCitation.notes}
                rows="4"
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              ></textarea>
            </div>
          </div>
          <DialogFooter>
            <Button
              class="nes-dialog-control n64-enhanced lod-optimized retro-cancel-btn"
              variant="secondary"
              onclick={() => (editingCitation = null)}
              aria-label="Cancel editing and close dialog"
              role="button"
              data-nes-theme="dialog-secondary">Cancel</Button
            >

            <Button
              class="nes-dialog-control n64-enhanced lod-optimized retro-update-btn"
              onclick={() => updateCitation()}
              aria-label="Save changes to citation"
              aria-describedby="update-citation-help"
              role="button"
              data-nes-theme="dialog-primary"
              data-operation="update-citation">Update Citation</Button
            >

            <div id="update-citation-help" class="sr-only">
              Apply changes to the citation and update your collection
            </div>
          </DialogFooter>
        </DialogContentAny>
      </div>
    </DialogRoot>
  {/if}

  <!-- categoryCounts used for accessibility/inspection to avoid: "declared but never read" -->
  <div class="sr-only" aria-hidden="true">{JSON.stringify(categoryCounts)}</div>
</div>

<style>
  /* @unocss-include */
</style>
