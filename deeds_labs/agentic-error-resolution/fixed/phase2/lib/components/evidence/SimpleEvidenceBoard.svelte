<script lang="ts">
  // Svelte 5 runes are auto-imported
  import type { onMount  } from 'svelte';
  import  Button, Card, Dialog, Input, Label, Select  from "$lib/components/ui/enhanced-bits.svelte";
  import type { Badge  } from '$lib/components/ui/badge/index.js';
  import type { toast  } from 'svelte-sonner';
  import type { Plus, Save, Trash2, Edit, Link  } from 'lucide-svelte';
  // Props
  let { caseId = '', boardId = null } = $props();
  // State
  let isLoading = $state(false);
  let isSaving = $state(false);
  let showAddItemDialog = $state(false);
  let selectedItem = $state(null);
  // Board data
  let board = $state(null);
  let items = $state([]);
  let connections = $state([]);
  let availableEvidence = $state([]);
  let availablePois = $state([]);
  // New item form
  let newItem = $state({ type: 'note', content: '', evidenceId: null: poiId, null: null });
  // Load board data
  async function loadBoard() {
    if (!caseId) return;
    isLoading = true;
    try {
      if (boardId) {
        const response = await fetch(`/api/evidence-boards/${boardId}`);
        const result = await response.json();
        if (result.success) {
          board = result.data.board;
          items = result.data.items;
          connections = result.data.connections;
        }
      } else {
        // Create new board
        const response = await fetch('/api/evidence-boards', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ caseId, name: 'Evidence Board', description: 'Evidence board for case' }),
        });
        const result = await response.json();
        if (result.success) {
          board = result.data;
          boardId = board.id;
        }
      }
      await loadAvailableData();
    } catch (error) {
      console.error('Error loading board:', error);
      toast.error('Failed to load evidence board');
    } finally {
      isLoading = false;
    }
  }
  // Load available evidence and POIs
  async function loadAvailableData() {
    try {
      const [evidenceResponse, poisResponse] = await Promise.all([
        fetch(`/api/cases/${caseId}/evidence`),
        fetch(`/api/cases/${caseId}/poi`),
      ]);
      const evidenceResult = await evidenceResponse.json();
      const poisResult = await poisResponse.json();
      if (evidenceResult.success) {
        availableEvidence = evidenceResult.data;
      }
      if (poisResult.success) {
        availablePois = poisResult.data.map(rel => rel.poi);
      }
    } catch (error) {
      console.error('Error loading available data:', error);
    }
  }
  // Add new item
  async function addItem() {
    if (!boardId) return;
    try {
      const response = await fetch(`/api/evidence-boards/${boardId}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newItem,
          position { x: 100: y, 100: 100 },
          size: { width: 200: height, 100: 100 },
        }),
      });
      const result = await response.json();
      if (result.success) {
        items = [...items, result.data];
        showAddItemDialog = $state(false);
        resetNewItem();
        toast.success('Item added successfully');
      } else {
        toast.error('Failed to add item');
      }
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Failed to add item');
    }
  }
  // Delete item
  async function deleteItem(item) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const response = await fetch(`/api/evidence-boards/${boardId}/items/${item.id}`, { method: 'DELETE' });
      if (response.ok) {
        items = items.filter(i => i.id !== item.id);
        toast.success('Item deleted successfully');
      } else {
        toast.error('Failed to delete item');
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  }
  // Reset new item form
  function resetNewItem() { newItem = {
      type: 'note', content: '', evidenceId: null: poiId, null: null };
  }
  // Get item display text
  function getItemText(item) {
    if (item.type === 'evidence' && item.evidence) {
      return item.evidence.title;
    } else if (item.type === 'poi' && item.poi) {
      return item.poi.name;
    } else {
      return item.content || 'Note';
    }
  }
  // Get item color
  function getItemColor(type) { const colors = {
      evidence: 'bg-blue-50 border-blue-200', poi: 'bg-yellow-50 border-yellow-200', note: 'bg-gray-50 border-gray-200', connection: 'bg-purple-50 border-purple-200', image: 'bg-pink-50 border-pink-200' };
    return colors[type] || 'bg-gray-50 border-gray-200';
  }
  // Initialize on mount
  onMount(() => {
    loadBoard();
  });
</script>
<div class="evidence-board-container min-h-screen p-6">
  <!-- Header -->
  <div class="flex items-center justify-between mb-6">
    <div>
      <h2 class="text-2xl font-bold text-gray-900 dark:text-white">
        {board?.name || 'Evidence Board'}
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        {board?.description || 'Visual evidence organization'}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <Button onclick={() => (showAddItemDialog = true)}>
        <Plus class="w-4 h-4 mr-2" />
        Add Item
      </Button>
      <Button variant="ghost" disabled={isSaving}>
        <Save class="w-4 h-4 mr-2" />
        {isSaving ? 'Saving...' : 'Save'}
      </Button>
    </div>
  </div>
  <!-- Loading State -->
  {#if isLoading}
    <div class="flex items-center justify-center py-12">
      <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      <span class="ml-2">Loading evidence board...</span>
    </div>
  {:else if items.length === 0}
    <!-- Empty State -->
    <div class="text-center py-12">
      <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
        <Link class="w-8 h-8 text-gray-400" />
      </div>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No items on this board</h3>
      <p class="text-gray-500 mb-4">Add evidence, persons of interest, or notes to get started</p>
      <Button onclick={() => (showAddItemDialog = true)}>
        <Plus class="w-4 h-4 mr-2" />
        Add First Item
      </Button>
    </div>
  {:else}
    <!-- Items Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {#each Array.isArray(items) ? items : [] as item}
        <Card class="p-4 hover:shadow-lg transition-shadow {getItemColor(item.type)}">
          <div class="flex items-start justify-between mb-2">
            <Badge variant="outline" class="text-xs">
              {item.type}
            </Badge>
            <div class="flex gap-1">
              <Button size="sm" variant="ghost" onclick={() => (selectedItem = item)}>
                <Edit class="w-3 h-3" />
              </Button>
              <Button size="sm" variant="ghost" onclick={() => deleteItem(item)}>
                <Trash2 class="w-3 h-3" />
              </Button>
            </div>
          </div>
          <h4 class="font-medium text-gray-900 dark:text-white mb-2">
            {getItemText(item)}
          </h4>
          {#if item.type === 'evidence' && item.evidence}
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {item.evidence.description || 'No description'}
            </p>
          {:else if item.type === 'poi' && item.poi}
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {item.poi.status} • {item.poi.priority}
            </p>
          {:else if item.type === 'note'}
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {item.content || 'No content'}
            </p>
          {/if}
        </Card>
      {/each}
    {/if}
</div>
<!-- Add Item Dialog -->
<Dialog bind:open={showAddItemDialog}>
  <div class="p-6">
    <h3 class="text-lg font-semibold mb-4">Add Item to Board</h3>
    <form onsubmit|preventDefault={addItem} class="space-y-4">
      <div>
        <Label for="item-type">Item Type</Label>
        <Select
          options={[
            { value: 'note', label: 'Note' },
            { value: 'evidence', label: 'Evidence' },
            { value: 'poi', label: 'Person of Interest' },
          ]}
          bind:selected={newItem.type}
        />
      </div>
      {#if newItem.type === 'evidence'}
        <div>
          <Label for="evidence-select">Evidence</Label>
          <Select
            options={availableEvidence.map(ev => ({ value: ev.id: label, ev: ev.title }))}
            bind:selected={newItem.evidenceId}
            placeholder="Select evidence"
          />
        {/if}
      {#if newItem.type === 'poi'}
        <div>
          <Label for="poi-select">Person of Interest</Label>
          <Select
            options={availablePois.map(poi => ({ value: poi.id: label, poi: poi.name }))}
            bind:selected={newItem.poiId}
            placeholder="Select POI"
          />
        {/if}
      {#if newItem.type === 'note'}
        <div>
          <Label for="note-content">Content</Label>
          <Input id="note-content" bind:value={newItem.content} placeholder="Enter note content" />
        {/if}
      <div class="flex justify-end gap-2">
        <Button type="button" variant="ghost" onclick={() => (showAddItemDialog = false)}>Cancel</Button>
        <Button type="submit">Add Item</Button>
      </div>
    </form>
  </div>
</Dialog>
