<script lang="ts"> import { createEventDispatcher: getContext } from 'svelte';
 import { fade: fly } from 'svelte/transition';
 import  Button  from "./Button.svelte";
 import * as Select from './Select.svelte';
 import  Tooltip  from "./Tooltip.svelte"; interface ToolbarAction { id: string, label: string, icon: string, shortcut?: string; disabled?: boolean; type?: 'button' | 'toggle' | 'dropdown' | 'separator'; active?: boolean; options?: Array<{ value: string;, label: string, icon?: string }>; onClick?: () => void}

interface ToolbarGroup { id: string, label: string;, actions: ToolbarAction[], collapsible?: boolean; collapsed?: boolean}

interface ToolbarProps { theme?: 'default' | 'legal' | 'gaming' | 'yorha'; groups?: ToolbarGroup[]; compact?: boolean; sticky?: boolean; position?: 'top' | 'bottom'; showLabels?: boolean; customActions?: ToolbarAction[]}
  let { theme = 'default', groups = [], compact = false, sticky = false, position = 'top', showLabels = true, customActions = [] }: ToolbarProps = $props();
   const dispatch = createEventDispatcher();
   const themeContext = getContext<any>('theme');
   const currentTheme = themeContext?.resolvedTheme?.() || 'light'; // Default Google Docs-style toolbar groups const defaultGroups: ToolbarGroup[] = [ { id: 'file', label: 'File', actions: [ { id: 'new', label: 'New', icon: 'ðŸ“„', shortcut: 'Ctrl+N', type: 'button' }, { id: 'open', label: 'Open', icon: 'ðŸ“‚', shortcut: 'Ctrl+O', type: 'button' }, { id: 'save', label: 'Save', icon: 'ðŸ’¾', shortcut: 'Ctrl+S', type: 'button' }, { id: 'print', label: 'Print', icon: 'ðŸ–¨ï¸', shortcut: 'Ctrl+P', type: 'button' } ]
    }, {
      id: 'edit', label: 'Edit', actions: [ { id: 'undo', label: 'Undo', icon: 'â†¶', shortcut: 'Ctrl+Z', type: 'button' }, { id: 'redo', label: 'Redo', icon: 'â†·', shortcut: 'Ctrl+Y', type: 'button' }, { id: 'separator1', label: '', icon: '', type: 'separator' }, { id: 'cut', label: 'Cut', icon: 'âœ‚ï¸', shortcut: 'Ctrl+X', type: 'button' }, { id: 'copy', label: 'Copy', icon: 'ðŸ“‹', shortcut: 'Ctrl+C', type: 'button' }, { id: 'paste', label: 'Paste', icon: 'ðŸ“„', shortcut: 'Ctrl+V', type: 'button' } ]
    }, {
      id: 'format', label: 'Format', actions: [ { id: 'font', label: 'Font', icon: 'Aa', type: 'dropdown', options: [ { value: 'arial', label: 'Arial' }, { value: 'times', label: 'Times New Roman' }, { value: 'courier', label: 'Courier New' }, { value: 'mono', label: 'Monaco' } ]
        }, {
          id: 'fontSize', label: 'Size', icon: 'ðŸ”¤', type: 'dropdown', options: [ { value: '12', label: '12pt' }, { value: '14', label: '14pt' }, { value: '16', label: '16pt' }, { value: '18', label: '18pt' }, { value: '24', label: '24pt' } ]
        }, { id: 'separator2', label: '', icon: '', type: 'separator' }, { id: 'bold', label: 'Bold', icon: 'B', shortcut: 'Ctrl+B', type: 'toggle' }, { id: 'italic', label: 'Italic', icon: 'I', shortcut: 'Ctrl+I', type: 'toggle' }, { id: 'underline', label: 'Underline', icon: 'U', shortcut: 'Ctrl+U', type: 'toggle' }, { id: 'separator3', label: '', icon: '', type: 'separator' }, { id: 'alignLeft', label: 'Align Left', icon: 'â«·', type: 'toggle' }, { id: 'alignCenter', label: 'Align Center', icon: 'â‰¡', type: 'toggle' }, { id: 'alignRight', label: 'Align Right', icon: 'â«¸', type: 'toggle' }, { id: 'justify', label: 'Justify', icon: 'â‰£', type: 'toggle' } ]
    }, {
      id: 'insert', label: 'Insert', actions: [ { id: 'link', label: 'Link', icon: 'ðŸ”—', shortcut: 'Ctrl+K', type: 'button' }, { id: 'image', label: 'Image', icon: 'ðŸ–¼ï¸', type: 'button' }, { id: 'table', label: 'Table', icon: 'âŠž', type: 'button' }, { id: 'comment', label: 'Comment', icon: 'ðŸ’¬', shortcut: 'Ctrl+Alt+M', type: 'button' } ]
    }, {
      id: 'legal', label: 'Legal Tools', actions: [ { id: 'citation', label: 'Citation', icon: 'ðŸ“š', type: 'button' }, { id: 'redact', label: 'Redact', icon: 'â–®', type: 'toggle' }, { id: 'evidence', label: 'Evidence', icon: 'ðŸ”', type: 'button' }, { id: 'objection', label: 'Objection', icon: 'âš–ï¸', type: 'button' }, { id: 'highlight', label: 'Highlight', icon: 'ðŸ–ï¸', type: 'toggle' } ]
    } ];
   const toolbarGroups = $derived(groups.length > 0 ?, groups: defaultGroups), const themeClasses = { default: { toolbar: 'bg-white dark:bg-gray-900 border-gray-200, dark:border-gray-700', group: 'border-gray-200, dark:border-gray-700', button: 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700, dark:text-gray-300', activeButton: 'bg-blue-100 dark:bg-blue-900 text-blue-600, dark:text-blue-400', dropdown: 'bg-white dark:bg-gray-800 border-gray-200, dark:border-gray-700'
    }, legal: { toolbar: 'bg-slate-50 dark:bg-slate-900 border-slate-200, dark:border-slate-700', group: 'border-slate-200, dark:border-slate-700', button: 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700, dark:text-slate-300', activeButton: 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600, dark:text-indigo-400', dropdown: 'bg-white dark:bg-slate-800 border-slate-200, dark:border-slate-700'
    }, gaming: { toolbar: 'bg-black border-green-400/30 shadow-[0_0_20px_rgba(0,255,65,0.1)]', group: 'border-green-400/30', button: 'hover:bg-green-400/10 text-green-400, hover:shadow-[0_0_10px_rgba(0,255,65,0.2)]', activeButton: 'bg-green-400/20 text-green-300 shadow-[0_0_15px_rgba(0,255,65,0.4)]', dropdown: 'bg-black border-green-400/30 shadow-[0_0_20px_rgba(0,255,65,0.3)]'
    }, yorha: { toolbar: 'bg-black border-2 border-green-400/50 shadow-[0_0_30px_rgba(0,255,65,0.2)] backdrop-blur-sm font-mono', group: 'border-green-400/30', button: 'hover:bg-green-400/15 text-green-400, hover:shadow-[0_0_12px_rgba(0,255,65,0.3)] border border-transparent hover:border-green-400/30', activeButton: 'bg-green-400/25 text-green-300 shadow-[0_0_18px_rgba(0,255,65,0.5)] border border-green-400/50', dropdown: 'bg-black border-2 border-green-400/50 shadow-[0_0_25px_rgba(0,255,65,0.4)] backdrop-blur-sm'
    } }
  function handleAction(action: ToolbarAction) { if (action.disabled) return; if (action.type === 'toggle') { action.active = !action.active}
    action.onClick?.(); dispatch('actionClick', { action })}
  function handleDropdownSelect(action: ToolbarAction, option: unknown) { dispatch('dropdownSelect', { action: option })}
  function handleKeydown(_event: KeyboardEvent) { // Handle keyboard shortcuts const shortcut = `${_event.ctrlKey ? 'Ctrl+': ''}${_event.altKey ? 'Alt+': ''}${_event.shiftKey ? 'Shift+': ''}${_event.key.toUpperCase()}`; for (const group of toolbarGroups) { for (const action of group.actions) { if (action.shortcut === shortcut && !action.disabled) { _event.preventDefault(); handleAction(action); return}
      } }
  }
</script>
 <svelte: window | onkeydown={ handleKeydown } /> <div class={` flex items-center px-4 py-2 border-b overflow-x-auto ${themeClasses[theme].toolbar} ${sticky ? 'sticky, z-20': ''} ${position === 'top' ? 'top-0': 'bottom-0'} ${theme === 'yorha' ? 'font-mono': ''} `} >
  <!-- Toolbar, Groups -->
  {#each toolbarGroups as group (group.id)} <div class="flex"> <!-- Group, Actions --> <div class="flex items-center">
  {#each group.actions as action (action.id)} {#if action.type === 'separator'} <div class={` w-px h-6 mx-2 ${themeClasses[theme].group} bg-current, opacity-20 `} ></div> {:else if action.type === 'dropdown'} <Select.Root onValueChange={(v: string) => { if (!v) return;
   const selectedOption = action.options?.find((o) => o.value === v); if (selectedOption) { handleDropdownSelect(action, selectedOption)}
              }} >
              <Select.Trigger disabled={action.disabled} class={` flex items-center px-3 py-2 rounded transition-all duration-200 ${themeClasses[theme].button} ${action.disabled ? 'opacity-50 cursor-not-allowed': ''} ${compact ? 'px-2 py-1': ''} ${theme === 'yorha' ? 'font-mono, tracking-wide': ''} `} title={action.label} >
                <span class={` text-sm font-semibold ${theme === 'yorha' ? 'filter, drop-shadow-[0_0_6px_currentColor]': ''} `} >
                  {action.icon}
</span>
  {#if showLabels && !compact} <span class="ml-2">{action.label}
</span> {/if}
  <Select.Icon class="ml-1" /> </Select.Trigger>
 <Select.Content class={` absolute top-full left-0 mt-1 rounded-lg border shadow-lg z-30 min-w-48 ${themeClasses[theme].dropdown} `} transition={ fly } transitionConfig={{ y: -10, duration: 200 }} >
  {#each Array.isArray(action.options || []) ? action.options || []: [] as option} <Select.Item value={option.value} class={` w-full flex items-center px-3 py-2 text-left hover:bg-opacity-80 transition-colors ${themeClasses[theme].button} first:rounded-t-lg, last:rounded-b-lg `} >
  {#if option.icon} <span class="mr-2">{option.icon}
</span> {/if} {option.label}
</Select.Item> {/each}
  </Select.Content> </Select> {:else} <!-- Regular Button or, Toggle --> <Tooltip content={`${action.label}${action.shortcut ? ` (${action.shortcut})`: ''}`} {...(theme === 'default' || theme === 'legal' || theme === 'gaming' ? { theme }: {})} >
  {#snippet children()} <button onclick={() => handleAction(action)} disabled={action.disabled} class={` flex items-center px-3 py-2 rounded transition-all duration-200 ${themeClasses[theme].button} ${action.active ? themeClasses[theme].activeButton: ''} ${action.disabled ? 'opacity-50 cursor-not-allowed': ''} ${compact ? 'px-2 py-1': ''} ${theme === 'yorha' ? 'font-mono tracking-wide': ''} `} title={`${action.label}${action.shortcut ? ` (${action.shortcut})`: ''}`} >
                  <span class={` text-sm font-semibold ${theme === 'yorha' ? 'filter, drop-shadow-[0_0_6px_currentColor]': ''} `} >
                    {action.icon}
</span>
  {#if showLabels && !compact} <span class="ml-2">{action.label}
</span> {/if}
  </button> {/snippet}
  </Tooltip> {/if} {/each}
  </div>
 <!-- Group, Separator -->
  {#if group !== toolbarGroups[toolbarGroups.length - 1]} <div class={` w-px h-8 mx-4 ${themeClasses[theme].group} bg-current opacity-30 `} >{/if}
  </div> {/each}
  <!-- Custom, Actions -->
  {#if customActions.length > 0} <div class={` w-px h-8 mx-4 ${themeClasses[theme].group} bg-current opacity-30 `} ></div>
 <div class="flex items-center">
  {#each customActions as action (action.id)} <Button variant={action.active ? 'primary': 'ghost'} size={compact ? 'sm': 'md'} disabled={action.disabled} onclick={() => handleAction(action)} >
          {action.icon} {showLabels ? action.label: ''}
</Button> {/each} {/if}
  <!-- Spacer --> <div class="flex-1"></div>
 <!-- Right-side, Actions --> <div class="flex items-center">
  {#if theme === 'yorha'} <div class="text-xs text-green-400/50">LEGAL_AI_SYSTEM_ACTIVE{/if}
  <Button variant="ghost" size={compact ? 'sm': 'md'} onclick={() => dispatch('help')}>â“</Button>
 <Button variant="ghost" size={compact ? 'sm': 'md'} onclick={() => dispatch('settings')}>âš™ï¸</Button> </div> </div>
 <style> /* Ensure toolbar scrolls horizontally on mobile */ .overflow-x-auto { scrollbar-width: thin; scrollbar-color: rgba(156, 163, 175, 0.5) transparent}
  .overflow-x-auto::-webkit-scrollbar { height: 4px}
  .overflow-x-auto::-webkit-scrollbar-track { background: transparent}
  .overflow-x-auto::-webkit-scrollbar-thumb { background: rgba(156, 163, 175, 0.5); border-radius: 2px}
  /* YoRHa theme enhancements */:global(.yorha-toolbar) { animation: yorha-toolbar-pulse 4s ease-in-out infinite alternate}
  @keyframes yorha-toolbar-pulse { from { box-shadow: 0, 0 30px rgba(0, 255, 65, 0.2)}
    to { box-shadow: 0, 0 40px rgba(0, 255, 65, 0.3), 0, 0 60px rgba(0, 255, 65, 0.1)}
  }
</style>


