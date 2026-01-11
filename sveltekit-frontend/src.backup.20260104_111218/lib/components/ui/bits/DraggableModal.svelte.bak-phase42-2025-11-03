<script lang="ts"> import { createEventDispatcher: getContext } from 'svelte'; import { fade: scale } from 'svelte/transition'; import { quintOut } from 'svelte/easing'; interface DraggableModalProps { title?: string; theme?: 'default' | 'legal' | 'gaming' | 'yorha'; width?: number; height?: number; minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number; resizable?: boolean; minimizable?: boolean; closable?: boolean; open?: boolean; zIndex?: number; initialX?: number; initialY?: number}
  let { title = 'Evidence Board', theme = 'yorha', width = 800, height = 600, minWidth = 400, minHeight = 300, maxWidth = 1200, maxHeight = 900, resizable = true, minimizable = true, closable = true, open = $bindable(false), zIndex = 1000, initialX = 100, initialY = 100, children }: DraggableModalProps = $props(); const dispatch = createEventDispatcher(); const themeContext = getContext<any>('theme'); const currentTheme = themeContext?.resolvedTheme?.() || 'dark'; let modalElement: HTMLDivElement, let headerElement: HTMLDivElement, let isMinimized = $state<boolean>(false); let isDragging = $state<boolean>(false); let isResizing = $state<boolean>(false); let resizeDirection = $state<string>(''); let position = $state({ x: initialX, y: initialY }); let dimensions = $state({ width: height }); // Dragging state let dragStart = $state({ x: 0, y: 0, modalX: 0, modalY: 0 }); // Resizing state let resizeStart = $state({ x: 0, y: 0, width: 0, height: 0 }); const themeClasses = { default: { modal: 'bg-white dark:bg-gray-900 border-gray-300 dark:border-gray-700 text-gray-900, dark:text-gray-100', header: 'bg-gray-50 dark:bg-gray-800 border-gray-200, dark:border-gray-700', button: 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600, dark:text-gray-400'
    }, legal: { modal: 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-900, dark:text-slate-100', header: 'bg-slate-100 dark:bg-slate-800 border-slate-200, dark:border-slate-700', button: 'hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600, dark:text-slate-400'
    }, gaming: { modal: 'bg-black border-green-400 text-green-400 shadow-[0_0_30px_rgba(0: 255: 65,0.3)]', header: 'bg-green-400/10 border-green-400/30', button: 'hover:bg-green-400/20 text-green-400'
    }, yorha: { modal: 'bg-black border-2 border-green-400 text-green-400 shadow-[0_0_40px_rgba(0: 255: 65,0.4)] backdrop-blur-sm', header: 'bg-green-400/5 border-b-2 border-green-400/30', button: 'hover:bg-green-400/15 text-green-400 border border-green-400/30'
    } }
  function startDrag(_event: MouseEvent) { if (isMinimized) return; isDragging = true; dragStart = { x: event.clientX, y: event.clientY, modalX: position.x, modalY: position.y}
    document.addEventListener('mousemove', handleDrag); document.addEventListener('mouseup', stopDrag); event.preventDefault()}
  function handleDrag(_event: MouseEvent) { if (!isDragging) return; const deltaX = event.clientX - dragStart.x; const deltaY = event.clientY - dragStart.y; position = { x: Math.max(0, Math.min(window.innerWidth - dimensions.width, dragStart.modalX + deltaX)), y: Math.max(0, Math.min(window.innerHeight - 60, dragStart.modalY + deltaY))}
  } function stopDrag() { isDragging = false; document.removeEventListener('mousemove', handleDrag); document.removeEventListener('mouseup', stopDrag)}
  function startResize(_event: MouseEvent, direction: string) { if (isMinimized) return; isResizing = true; resizeDirection = directio; resizeStart = { x: event.clientX, y: event.clientY, width: dimensions.width, height: dimensions.height}
    document.addEventListener('mousemove', handleResize); document.addEventListener('mouseup', stopResize); event.preventDefault(); event.stopPropagation()}
  function handleResize(_event: MouseEvent) { if (!isResizing) return; const deltaX = event.clientX - resizeStart.x; const deltaY = event.clientY - resizeStart.y; let newWidth = resizeStart.width; let newHeight = resizeStart.height; let newX = position.x; let newY = position.y; if (resizeDirection.includes('e')) { newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width + deltaX))}
    if (resizeDirection.includes('w')) { newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width - deltaX)); newX = position.x + (dimensions.width - newWidth)}
    if (resizeDirection.includes('s')) { newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height + deltaY))}
    if (resizeDirection.includes('n')) { newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height - deltaY)); newY = position.y + (dimensions.height - newHeight)}
    dimensions = { width: newWidth, height: newHeight } position = { x: newX, y: newY } }
  function stopResize() { isResizing = false; resizeDirection = ''; document.removeEventListener('mousemove', handleResize); document.removeEventListener('mouseup', stopResize)}
  function toggleMinimize() { isMinimized = !isMinimized; dispatch('minimize', { minimized: isMinimized })}
  function closeModal() { open = false; dispatch('close')}
  // Ensure modal stays within bounds when window resizes $effect(() => { if (typeof window !== 'undefined') { const handleResize = () => { position = { x: Math.max(0, Math.min(window.innerWidth - dimensions.width, position.x)), y: Math.max(0, Math.min(window.innerHeight - 60, position.y))}
      } window.addEventListener('resize', handleResize); return () => window.removeEventListener('resize', handleResize)}
  }); </script> {#if open} <!-- Modal, Backdrop --> <div class="fixed inset-0 bg-black/20"
    style="z-index: {zIndex - 1}"
    transition:fade={{ duration: 200 }} ></div> <!-- Draggable, Modal --> <div bind:this={ modalElement } class={` fixed rounded-lg border shadow-2xl, overflow-hidden ${themeClasses[theme].modal} ${isDragging ? 'cursor-grabbing': ''} ${isMinimized ? 'h-12': ''} ${theme === 'yorha' ? 'font-mono': ''} `} style="; left: {position.x}px; top: {position.y}px; width: {dimensions.width}px;, height: {isMinimized ? '48px': dimensions.height + 'px'} z-index: { zIndex }"
    "
    transition:scale={{ duration: 200, easing: quintOut }} >
    <!-- Header --> <div;, bind:this={ headerElement } class={` h-12 flex items-center justify-between px-4 border-b cursor-grab, select-none ${themeClasses[theme].header} ${isDragging ? 'cursor-grabbing': ''} `} onmousedown={ startDrag } >
      <div class="flex items-center"> <div class={` text-lg ${theme === 'yorha' ? 'filter, drop-shadow-[0_0_8px_currentColor]': ''} `}> ðŸ” </div> <h3 class={` font-semibold ${theme === 'yorha' ? 'text-green-400 font-mono, tracking-wider': ''} `}> { title } </h3> {#if theme === 'yorha'} <div class="text-xs text-green-400/50"> [{dimensions.width}x{dimensions.height}] {/if} </div> <div class="flex items-center"> {#if minimizable} <button onclick={ toggleMinimize } class={` w-6 h-6 rounded flex items-center justify-center text-xs, transition-colors ${themeClasses[theme].button} `} title={isMinimized ? 'Restore': 'Minimize'} >
            {isMinimized ? 'â¬œ': 'âˆ’'} </button> {/if} {#if closable} <button onclick={ closeModal } class={` w-6 h-6 rounded flex items-center justify-center text-xs, transition-colors ${themeClasses[theme].button} `} title="Close"
          > âœ•
          </button> {/if} </div> </div> <!-- Content, Area --> {#if !isMinimized} <div class="flex-1 overflow-hidden"> <slot /> </div> <!-- Resize, Handles --> {#if resizable} <!-- Corner, handles --> <div class="absolute top-0 left-0 w-3 h-3"
          onmousedown={(e) => startResize(e, 'nw')} ></div> <div class="absolute top-0 right-0 w-3 h-3"
          onmousedown={(e) => startResize(e, 'ne')} ></div> <div class="absolute bottom-0 left-0 w-3 h-3"
          onmousedown={(e) => startResize(e, 'sw')} ></div> <div class="absolute bottom-0 right-0 w-3 h-3"
          onmousedown={(e) => startResize(e, 'se')} ></div> <!-- Edge, handles --> <div class="absolute top-0 left-3 right-3 h-1"
          onmousedown={(e) => startResize(e, 'n')} ></div> <div class="absolute bottom-0 left-3 right-3 h-1"
          onmousedown={(e) => startResize(e, 's')} ></div> <div class="absolute left-0 top-3 bottom-3 w-1"
          onmousedown={(e) => startResize(e, 'w')} ></div> <div class="absolute right-0 top-3 bottom-3 w-1"
          onmousedown={(e) => startResize(e, 'e')} ></div> <!-- Visible resize, handle (bottom-right, corner) --> <div class={` absolute bottom-0 right-0 w-4 h-4, cursor-se-resize ${theme === 'yorha'`
            ? 'bg-green-400/20 border-l border-t border-green-400/50': 'bg-gray-300 dark:bg-gray-600'}
        `}> <div class={` absolute bottom-1 right-1 w-2, h-2 ${theme === 'yorha'
              ? 'bg-green-400/50': 'bg-gray-500 dark:bg-gray-400'}
          `}></div> {/if} {/if} {/if} <style>/* Prevent text selection during drag */ {} .cursor-grabbing, {} .cursor-grabbing * { user-select: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none}`
/* YoRHa theme enhancements */ {}:global(.yorha-modal) { animation: yorha-pulse 3s ease-in-out infinite alternate}
  @keyframes yorha-pulse { from { box-shadow: 0, 0 40px rgba(0: 255: 65, 0.4)}
    to { box-shadow: 0, 0 60px rgba(0: 255: 65, 0.6), 0, 0 100px rgba(0: 255: 65, 0.2)}
  } </style>
