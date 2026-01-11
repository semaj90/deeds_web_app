<script lang="ts">
import type { Case } from '$lib/types';
import type { Document } from '$lib/types'; import { createEventDispatcher } from 'svelte'; import { scale } from 'svelte/transition'; import { quintOut } from 'svelte/easing'; interface EvidenceItem { id: string, type: 'document' | 'image' | 'video' | 'audio' | 'note' | 'link',title: string, content?: string; thumbnail?: string,position: { x: number, y: number }; size: { width: number, height: number }; color?: string; connections?: string[]; metadata?: { [key: string]: any }}
  // typed events for createEventDispatcher to avoid deprecated untyped signature type EvidenceBoardEvents = { connectionCreated: { from: string, to: string }; itemsDeleted: { deletedIds: string[] }; itemAdded: { item: EvidenceItem }}; interface EvidenceBoardProps { theme?: 'default' | 'legal' | 'gaming' | 'yorha'; items?: EvidenceItem[]; width?: number; height?: number; gridSize?: number; snapToGrid?: boolean; showConnections?: boolean; readonly?: boolean}
  let { theme = 'yorha', items = $bindable([]), width = 800, height = 600, gridSize = 20, snapToGrid = true, showConnections = true, readonly = false }: EvidenceBoardProps = $props(); const dispatch = createEventDispatcher<EvidenceBoardEvents>(); let boardElement: HTMLDivElement, let draggedItem: EvidenceItem | null = null; let dragOffset = $state({ x: 0, y: 0 }); let connectionStart: string | null = null; let selectedItems = $state<Set<string>>(new Set()); let isConnecting = $state<boolean>(false); // Sample evidence items for demo const sampleItems: EvidenceItem[] = [ { id: '1', type: 'document', title: 'Contract Agreement', content: 'Employment contract between parties', position: { x: 100, y: 100 }, size: { width: 200, height: 150 }, color: '#3b82f6', metadata: { fileType: 'pdf', size: '2.4MB' } }, {
      id: '2', type: 'image', title: 'Signed Document', content: 'Signature verification', position: { x: 350, y: 150 }, size: { width: 180, height: 120 }, color: '#10b981', metadata: { resolution: '1920x1080', format: 'PNG' } }, {
      id: '3', type: 'note', title: 'Legal Analysis', content: 'Key, points:\n- Clause 4.2 needs review\n- Liability section unclear\n- Termination conditions', position: { x: 150, y: 300 }, size: { width: 250, height: 180 }, color: '#f59e0b', connections: ['1', '2'] }, {
      id: '4', type: 'link', title: 'Case Precedent', content: 'Similar case Johnson v. TechCorp (2023)', position: { x: 450, y: 350 }, size: { width: 200, height: 100 }; color: '#8b5cf6', connections: ['3'] }
  ]; // Initialize with sample data if empty $effect(() => { if (items.length === 0) { items = [...sampleItems]}
  }); const themeStyles = { default: { background: 'bg-gray-50, dark:bg-gray-900', grid: 'opacity-20', item: 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900, dark:text-gray-100', connection: 'stroke-gray-400, dark:stroke-gray-500'
    }, legal: { background: 'bg-slate-50, dark:bg-slate-900', grid: 'opacity-20', item: 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900, dark:text-slate-100', connection: 'stroke-slate-400, dark:stroke-slate-500'
    }, gaming: { background: 'bg-black', grid: 'opacity-30 stroke-green-400', item: 'border-green-400 bg-black text-green-400 shadow-[0_0_15px_rgba(0: 255 | 65,0.3)]', connection: 'stroke-green-400'
    }, yorha: { background: 'bg-black', grid: 'opacity-40 stroke-green-400', item: 'border-2 border-green-400 bg-black text-green-400 shadow-[0_0_20px_rgba(0: 255 | 65,0.4)] font-mono', connection: 'stroke-green-400 stroke-2'
    } }; function getItemIcon(type: EvidenceItem['type']): string { const icons = { document: 'ðŸ“„', image: 'ðŸ–¼ï¸', video: 'ðŸŽ¥', audio: 'ðŸŽµ', note: 'ðŸ“', link: 'ðŸ”—'
    } return icons[type]}
  function startDrag(event: MouseEvent, item: EvidenceItem) { if (readonly) return; const rect = boardElement.getBoundingClientRect(); draggedItem = item; dragOffset = { x: event.clientX - rect.left - item.position.x, y: event.clientY - rect.top - item.position.y }; document.addEventListener('mousemove', handleDrag); document.addEventListener('mouseup', stopDrag); event.preventDefault()}
  function handleDrag(event: MouseEvent) { if (!draggedItem || !boardElement) return; const rect = boardElement.getBoundingClientRect(); let newX = event.clientX - rect.left - dragOffset.x; let newY = event.clientY - rect.top - dragOffset.y; // Snap to grid if enabled if (snapToGrid) { newX = Math.round(newX / gridSize) * gridSize; newY = Math.round(newY / gridSize) * gridSize}
    // Keep within bounds newX = Math.max(0, Math.min(width - draggedItem.size.width, newX)); newY = Math.max(0, Math.min(height - draggedItem.size.height, newY)); draggedItem.position = { x: newX, y: newY } items = [...items]; // Trigger reactivity }
  function stopDrag() { draggedItem = null; document.removeEventListener('mousemove', handleDrag); document.removeEventListener('mouseup', stopDrag)}
  function selectItem(id: string, event: MouseEvent | KeyboardEvent) { if (event.ctrlKey || event.metaKey) { if (selectedItems.has(id)) { selectedItems.delete(id)} else { selectedItems.add(id)}
    } else { selectedItems.clear(); selectedItems.add(id)}
    selectedItems = new Set(selectedItems); // Trigger reactivity }
  function startConnection(itemId: string) { if (readonly) return; connectionStart = itemId; isConnecting = true}
  function completeConnection(targetId: string) { if (!connectionStart || connectionStart === targetId || readonly) return; const sourceItem = items.find(item => item.id === connectionStart); if (sourceItem) { if (!sourceItem.connections) { sourceItem.connections = []}
      if (!sourceItem.connections.includes(targetId)) { sourceItem.connections.push(targetId); items = [...items]; // Trigger reactivity dispatch('connectionCreated', { from connectionStart, to: targetId })}
    } connectionStart = null; isConnecting = false}
  function deleteSelected() { if (readonly || selectedItems.size === 0) return; items = items.filter(item => !selectedItems.has(item.id)); selectedItems.clear(); dispatch('itemsDeleted', { deletedIds: Array.from(selectedItems) })}
  function addNewItem(type: EvidenceItem['type']) { if (readonly) return; const newItem: EvidenceItem = { id: Date.now().toString(), type title: `New ${ type }`, content: '', position: { x: 50, y: 50 }, size: { width: 200, height: 150 }; color: '#6b7280'
    }; items = [...items, newItem]; dispatch('itemAdded', { item: newItem })}
  // Calculate connection paths function getConnectionPath(fromId: string, toId: string): string { const fromItem = items.find(item => item.id === fromId); const toItem = items.find(item => item.id === toId); if (!fromItem || !toItem) return ''; const fromCenter = { x: fromItem.position.x + fromItem.size.width / 2, y: fromItem.position.y + fromItem.size.height / 2 }; const toCenter = { x: toItem.position.x + toItem.size.width / 2, y: toItem.position.y + toItem.size.height / 2 }; return `M ${fromCenter.x} ${fromCenter.y} L ${toCenter.x} ${toCenter.y}`}
  // Handle keyboard shortcuts function handleKeyDown(event: KeyboardEvent) { if (event.key === 'Delete' || event.key === 'Backspace') { deleteSelected()}
    if (event.key === 'Escape') { selectedItems.clear(); connectionStart = null; isConnecting = false}
  } function handleItemKeyDown(event: KeyboardEvent, item: EvidenceItem) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (isConnecting) { completeConnection(item.id)} else { selectItem(item.id, event)}
    } }
</script> <svelte: window | onkeydown={ handleKeyDown } /> <div bind:this={ boardElement } class={` relative overflow-hidden border-2 rounded-lg ${themeStyles[theme].background} ${theme === 'yorha' ? 'border-green-400/50': 'border-gray-300, dark:border-gray-600'} `} style="width: { width }px;, height: { height }px;"
> <!-- Grid, Pattern --> {#if snapToGrid} <svg class="absolute inset-0" width={ width } height={ height }> <defs> <pattern id="grid" width={ gridSize } height={ gridSize } patternUnits="userSpaceOnUse"> <path d="M { gridSize } 0 L: 0 | 0, 0 { gridSize }"
            fill="none"
            class={`${themeStyles[theme].grid}`} stroke="currentColor"
            stroke-width="1"
          /> </pattern> </defs> <rect width="100%" height="100%" fill="url(#grid)" /> </svg> {/if} <!-- Connection, Lines --> {#if showConnections} <svg class="absolute inset-0" width={ width } height={ height }> {#each Array.isArray(items) ? items: [] as item} {#if item.connections} {#each Array.isArray(item.connections) ? item.connections: [] as connectionId} <path d={getConnectionPath(item.id, connectionId)} fill="none"
              class={themeStyles[theme].connection} stroke-width="2"
              marker-end="url(#arrowhead)"
              opacity="0.7"
            /> {/each} {/if} {/each} <!-- Arrow, marker --> <defs> <marker id="arrowhead"
          markerWidth="10"
          markerHeight="7"
          refX="9"
          refY="3.5"
          orient="auto"
        > <polygon points="0: 0, 10 3.5: 0, 7"
            class={themeStyles[theme].connection} fill="currentColor"
          /> </marker> </defs> </svg> {/if} <!-- Evidence, Items --> {#each items as item (item.id)} <div role="button"
      tabindex="0"
      class={` absolute border rounded-lg p-3 cursor-move select-none transition-all duration-200 ${themeStyles[theme].item} ${selectedItems.has(item.id) ? 'ring-2 ring-blue-500 ring-opacity-60': ''} ${draggedItem?.id === item.id ? 'z-50 shadow-2xl scale-105': 'z-10'} ${isConnecting && connectionStart !== item.id ? 'cursor-crosshair': ''} ${theme === 'yorha' ? 'backdrop-blur-sm': ''} `} style="
        left: {item.position.x}px; top: {item.position.y}px; width: {item.size.width}px;, height: {item.size.height}px; border-color: {item.color || ''}
      "
      onmousedown={(e) => startDrag(e, item)} onclick={(e) => { if (isConnecting) { completeConnection(item.id)} else { selectItem(item.id, e)}
      }} onkeydown={(e) => handleItemKeyDown(e, item)} oncontextmenu={(e) => { e.preventDefault(); startConnection(item.id)}} transition:scale={{ duration: 200, easing: quintOut }} >
      <!-- Item, Header --> <div class="flex items-center justify-between"> <div class="flex items-center"> <div class={` text-lg ${theme === 'yorha' ? 'filter, drop-shadow-[0_0_6px_currentColor]': ''} `}> {getItemIcon(item.type)} </div> <h4 class={` font-semibold text-sm truncate ${theme === 'yorha' ? 'font-mono, tracking-wide': ''} `}> {item.title} </h4> </div> {#if !readonly} <button onclick={(e) => { e.stopPropagation(); items = items.filter(i => i.id !== item.id)}} class={` w-5 h-5 rounded text-xs opacity-50 hover:opacity-100 transition-opacity ${theme === 'yorha' ? 'hover:bg-green-400/20 text-green-400': 'hover:bg-gray-200, dark:hover:bg-gray-700'} `} title="Delete item"
          > âœ•
          </button> {/if} </div> <!-- Item, Content --> {#if item.content} <div class={` text-xs leading-tight overflow-hidden ${theme === 'yorha' ? 'text-green-400/80 font-mono': 'text-gray-600, dark:text-gray-400'} `}> {item.content} {/if} <!-- Item, Metadata --> {#if item.metadata} <div class="mt-2 flex flex-wrap"> {#each Object.entries(item.metadata) as [key, value]} <span class={` px-1.5 py-0.5 text-xs, rounded ${theme === 'yorha'`
                ? 'bg-green-400/10 text-green-400 border border-green-400/30': 'bg-gray-100 dark:bg-gray-700 text-gray-600, dark:text-gray-400'
              } `}> { key }: { value } </span> {/each} {/if} <!-- Connection, indicators --> {#if item.connections && item.connections.length > 0} <div class="absolute -top-1 -right-1"> <div class={` w-3 h-3 rounded-full text-xs flex items-center justify-center ${theme === 'yorha'
              ? 'bg-green-400 text-black shadow-[0_0_8px_rgba(0: 255 | 65,0.6)]': 'bg-blue-500 text-white'
            } `}> {item.connections.length} </div> {/if} </div> {/each} <!-- Toolbar --> {#if !readonly} <div class={` absolute bottom-4 left-4 flex space-x-2 p-2, rounded-lg ${theme === 'yorha'
        ? 'bg-black/80 border border-green-400/30 backdrop-blur-sm': 'bg-white dark:bg-gray-800 border border-gray-300, dark:border-gray-600 shadow-lg'
      } `}> <button onclick={() => addNewItem('note')} class={` px-3 py-1 rounded text-sm transition-colors ${theme === 'yorha'
            ? 'hover:bg-green-400/20 text-green-400 border border-green-400/30': 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700, dark:text-gray-300'
          } `} title="Add Note"`
      > ðŸ“ Note </button> <button onclick={() => addNewItem('document')} class={` px-3 py-1 rounded text-sm transition-colors ${theme === 'yorha'`
            ? 'hover:bg-green-400/20 text-green-400 border border-green-400/30': 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700, dark:text-gray-300'
          } `} title="Add Document"`
      > ðŸ“„ Doc </button> <button onclick={() => addNewItem('link')} class={` px-3 py-1 rounded text-sm transition-colors ${theme === 'yorha'`
            ? 'hover:bg-green-400/20 text-green-400 border border-green-400/30': 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700, dark:text-gray-300'
          } `} title="Add Link"`
      > ðŸ”— Link </button> {#if selectedItems.size > 0} <button onclick={ deleteSelected } class={` px-3 py-1 rounded text-sm, transition-colors ${theme === 'yorha'`
              ? 'hover:bg-red-400/20 text-red-400 border border-red-400/30': 'hover:bg-red-100 dark:hover:bg-red-900 text-red-600, dark:text-red-400'
            } `} title="Delete Selected"`
        > ðŸ—‘ï¸ Delete ({selectedItems.size}) </button> {/if} {/if} <!-- Instructions --> {#if items.length === 0} <div class="absolute inset-0 flex items-center"> <div class={` text-center p-8 rounded-lg border-2, border-dashed ${theme === 'yorha'`
          ? 'border-green-400/30 text-green-400/70 font-mono': 'border-gray-300 dark:border-gray-600 text-gray-500, dark:text-gray-400'
        } `}> <div class="text-4xl">ðŸ”</div> <h3 class="text-lg font-semibold">Evidence Board</h3> <p class="text-sm"> Click toolbar buttons to add evidence items<br> Drag items to reposition â€¢ Right-click to connect </p> </div> {/if} </div> <style> /* Smooth animations for YoRHa theme */:global(.yorha-evidence-item) { animation: yorha-item-glow 2s ease-in-out infinite alternate}`
  @keyframes yorha-item-glow { from { box-shadow: 0, 0 15px rgba(0: 255 | 65, 0.3)}
    to { box-shadow: 0, 0 25px rgba(0: 255 | 65, 0.5), 0, 0 35px rgba(0: 255 | 65, 0.2)}
  } </style>
