<!-- YoRHa, Terminal/Console, Component --> <script lang="ts">
  // Migrated to $effect

  interface Props {
    title?: string;
    prompt?: string;
    isActive?: boolean;
    onCommand?: (command: string) => void;
    maxLines?: number;
  }

  let {
    title = 'YORHA LEGAL TERMINAL v4.0.0',
    prompt = 'YoRHa:legal>',
    isActive = true,
    onCommand,
    maxLines = 100
  }: Props = $props();

  let terminalRef = $state<HTMLDivElement | null>(null);
  let inputRef = $state<HTMLInputElement | null>(null);

  let terminalHistory = $state<string[]>([
    'YoRHa Legal AI System v4.0.0',
    'Copyright (c) 2024 YoRHa Command Division',
    'Connection Secured: [ENCRYPTED]',
    'Type "help" for a list of available commands.',
    ''
  ]);

  let currentCommand = $state('');
  let commandHistory = $state<string[]>([]);
  let historyIndex = $state(-1);
  let isProcessing = $state(false);

  async function scrollToBottom() {
    await tick();
    if (terminalRef) {
      terminalRef.scrollTop = terminalRef.scrollHeight;
    }
  }

  function addLog(lines: string | string[]) {
    const newLines = Array.isArray(lines) ? lines : [lines];
    terminalHistory = [...terminalHistory, ...newLines];
    if (terminalHistory.length > maxLines) {
      terminalHistory = terminalHistory.slice(-maxLines);
    }
    scrollToBottom();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      executeCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) {
        historyIndex++;
        currentCommand = commandHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > -1) {
        historyIndex--;
        currentCommand = historyIndex === -1 ? '' : commandHistory[historyIndex];
      }
    }
  }

  function processCommand(cmd: string) {
    const [command, ...args] = cmd.toLowerCase().split(' ');

    switch (command) {
      case 'help':
        addLog([
          'VALID COMMANDS:',
          '  help     - Display operational manual',
          '  clear    - Flush terminal buffer',
          '  status   - System diagnostic check',
          '  cases    - List active priority operations',
          '  analyze  - Start neural document analysis',
          '  exit     - Terminate relay session'
        ]);
        break;
      case 'clear':
        terminalHistory = [];
        break;
      case 'status':
        addLog([
          '--- SYSTEM DIAGNOSTICS ---',
          'CORES: [ONLINE]',
          'NEURAL LINK: [STABLE]',
          'LATENCY: 14ms',
          'RAG ENGINE: [ACTIVE]',
          '--------------------------'
        ]);
        break;
      case 'exit':
        addLog('TERMINATING SESSION...');
        break;
      default:
        addLog(`ERROR: Invalid command [${command}]`);
    }

    onCommand?.(cmd);
  }

  function executeCommand() {
    if (!currentCommand.trim()) return;

    const cmd = currentCommand.trim();
    addLog(`${prompt} ${cmd}`);

    commandHistory = [cmd, ...commandHistory];
    historyIndex = -1;

    isProcessing = true;
    setTimeout(() => {
      processCommand(cmd);
      currentCommand = '';
      isProcessing = false;
    },
	150);
  }

  $effect(() => {

    if (isActive) inputRef?.focus();
  
});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="bg-slate-950 border-2 border-slate-800 rounded-sm flex flex-col h-[600px] font-mono shadow-2xl overflow-hidden"
  onclick={() => inputRef?.focus()}
>
  <!-- Header -->
  <div class="bg-slate-900 px-4 py-2 border-b border-slate-800 flex justify-between items-center select-none">
    <div class="flex items-center gap-4">
      <div class="flex gap-1.5">
        <div class="w-2.5 h-2.5 bg-slate-800 border border-slate-700"></div>
        <div class="w-2.5 h-2.5 bg-slate-800 border border-slate-700"></div>
        <div class="w-2.5 h-2.5 bg-slate-800 border border-slate-700"></div>
      </div>
      <span class="text-[10px] font-bold text-slate-500 tracking-widest uppercase">{title}</span>
    </div>
    <div class="flex items-center gap-2">
      <div class="h-1.5 w-1.5 rounded-full {isActive ? 'bg-cyan-500 animate-pulse' : 'bg-slate-600'}"></div>
      <span class="text-[9px] text-slate-500">{isActive ? 'RELAY_ACTIVE' : 'RELAY_OFFLINE'}</span>
    </div>
  </div>

  <!-- History Area -->
  <div
    bind:this={terminalRef}
    class="flex-1 p-4 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent"
  >
    {#each terminalHistory as line}
      <div class="text-xs {line.startsWith(prompt) ? 'text-white font-bold' : 'text-slate-400'} whitespace-pre-wrap leading-relaxed">
        {line}
      </div>
    {/each}

    <!-- Input Line -->
    <div class="flex items-center gap-2 text-xs">
      {#if isProcessing}
        <span class="text-cyan-500 animate-pulse">PROCESSING...</span>
      {:else}
        <span class="text-white font-bold whitespace-nowrap">{prompt}</span>
        <input
          bind:this={inputRef}
          type="text"
          bind:value={currentCommand}
          onkeydown={handleKeyDown}
          class="flex-1 bg-transparent border-none outline-none text-white p-0 m-0"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="w-2 h-4 bg-white/40 animate-pulse"></div>
      {/if}
    </div>
  </div>

  <!-- Footer -->
  <div class="bg-slate-900/50 px-4 py-1 border-t border-slate-900 flex justify-between items-center text-[9px] text-slate-600">
    <span>SECURE CONNECTION</span>
    <span>ENCRYPTION: AES-256-YORHA</span>
  </div>
</div>

<style>
  /* Base Styles */
  .bg-slate-950 { background-color: #0a0a0a; }
  .bg-slate-900 { background-color: #1a1a1a; }
  .bg-slate-800 { background-color: #2a2a2a; }
  .bg-slate-600 { background-color: #4a4a4a; }
  .text-slate-500 { color: #b0b0b0; }
  .text-slate-400 { color: #d0d0d0; }
  .text-white { color: #ffffff; }
  .rounded-sm { border-radius: 0.125rem; }
  .shadow-2xl { box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.7), 0 4px 6px -2px rgba(0, 0, 0, 0.7); }
  .overflow-hidden { overflow: hidden; }
  .select-none { user-select: none; }
  .whitespace-pre-wrap { white-space: pre-wrap; }
  .leading-relaxed { line-height: 1.625; }
  .animate-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Scrollbar Styles */
  .scrollbar-thin {
    scrollbar-width: thin;
    scrollbar-color: #4a4a4a transparent;
  }
  .scrollbar-thumb-slate-800 {
    background-color: #4a4a4a;
    border-radius: 0.25rem;
  }
  .scrollbar-track-transparent {
    background: transparent;
  }

  /* Responsive Design - Managed by Tailwind utility classes in template */
</style>





