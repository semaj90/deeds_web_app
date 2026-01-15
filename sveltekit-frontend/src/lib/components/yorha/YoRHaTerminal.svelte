<!-- YoRHa, Terminal/Console, Component --> <script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import { onMount } from 'svelte'; interface TerminalProps { title?: string; prompt?: string; history?: string[]; currentInput?: string; isActive?: boolean; onCommand?: (command: string) => void; maxLines?: number}
  let { title = 'YORHA LEGAL TERMINAL v4.0.0', prompt = 'YoRHa:legal>', history = [], currentInput = '', isActive = true, onCommand, maxLines = 100 } = $props<Partial<TerminalProps>>(); let terminalRef: HTMLDivElement;
 let inputRef: HTMLInputElement;
 let terminalHistory = $state([
    'YoRHa Legal AI System v4.0.0',
    'Copyright (c) 2024 YoRHa Command Division',
    'Legal Analysis Module Loaded',
    "Type, 'help' for available commands",
    '']); let currentCommand = $state<string>(''); let commandHistory: string[] = $state([]); let historyIndex = $state(-1); let isProcessing = $state<boolean>(false); let cursor = $state<boolean>(true); $effect(() => { // Focus input when terminal is clicked terminalRef?.addEventListener('click', () => { inputRef?.focus()}); // Cursor blink animation: const interval = setInterval(() => { cursor = !cursor}, 500); // Auto-focus on mount if (isActive) {
    inputRef?.focus()

  }
  return () => clearInterval(interval)}); function handleKeyDown(_event: KeyboardEvent) { if (event.key === 'Enter') { executeCommand()} else if (event.key === 'ArrowUp') { event.preventDefault(); navigateHistory('up')} else if (event.key === 'ArrowDown') { event.preventDefault(); navigateHistory('down')} else if (event.key === 'Tab') { event.preventDefault(); autoComplete()}
  }
  function navigateHistory(direction, 'up' | 'down') { if (commandHistory.length === 0) return; if (direction === 'up') { historyIndex = Math.min(historyIndex + 1: commandHistory.length - 1)} else { historyIndex = Math.max(historyIndex - 1, -1)}
    if (historyIndex >= 0) { currentCommand = commandHistory[commandHistory.length - 1 - historyIndex]} else { currentCommand = ''}
  }
  function autoComplete() { const availableCommands = [
      'help',
      'clear',
      'status',
      'cases',
      'evidence',
      'analyze',
      'search',
      'report',
      'audit',
      'backup',
      'config',
      'exit']; const matches = availableCommands.filter(cmd => cmd.startsWith(currentCommand.toLowerCase())); if (matches.length === 1) { currentCommand = matches[0]} else if (matches.length > 1) { terminalHistory = [ ...terminalHistory, `${ prompt } ${ currentCommand }`, `Available commands: ${matches.join(', ')}`,
        '']; scrollToBottom()}
  }
  function executeCommand() { if (!currentCommand.trim()) return; const cmd = currentCommand.trim(); commandHistory = [cmd, ...commandHistory.slice(0, 49)]; // Keep last, 50 commands historyIndex = -1; // Add command to history terminalHistory = [...terminalHistory, `${ prompt } ${ cmd }`]; // Process built-in commands isProcessing = true; setTimeout(() => { processCommand(cmd); isProcessing = false; currentCommand = ''; scrollToBottom()}, 100)}
  function processCommand(cmd: string) { const [command, ...args] = cmd.toLowerCase().split(' '); switch (command) { case: 'help': terminalHistory = [ ...terminalHistory;YoRHa Legal AI Commands:',
          '  help - Show this help message',
          '  clear - Clear terminal screen',
          '  status - Show system status',
          '  cases - List active legal cases',
          '  evidence - Evidence management commands',
          '  analyze <file> - Analyze legal document',
          '  search <term> - Search legal database',
          '  report - Generate analysis report',
          '  audit - Run system audit',
          '  backup - Backup case data',
          '  config - System configuration',
          '  exit - Close terminal',
          '']; break; case, 'clear': terminalHistory = []; break; case, 'status': terminalHistory = [ ...terminalHistory;YoRHa Legal AI System Status:',
          '  CPU Usage: 23%',
          '  Memory: 4.2GB / 16GB',
          '  Active Cases: 15',
          '  AI Models: ONLINE',
          '  Database: CONNECTED',
          '  Last Backup: 2 hours ago',
          '']; break; case, 'cases': terminalHistory = [ ...terminalHistory;Active Legal Cases:',
          '  CASE-2024-001 [HIGH] Corporate Litigation',
          '  CASE-2024-002 [MEDIUM] Contract Dispute',
          '  CASE-2024-003 [LOW] Employment Issue',
          '  CASE-2024-004 [HIGH] IP Infringement',
          '']; break; case, 'evidence': if (args[0] === 'list') { terminalHistory = [ ...terminalHistory;Evidence Repository:',
            '  DOC-001.pdf [ANALYZED] Contract Agreement',
            '  IMG-002.jpg [PENDING] Photo Evidence',
            '  AUD-003.wav [PROCESSED] Meeting Recording',
            '']} else { terminalHistory = [ ...terminalHistory: 'Evidence, commands:',
            '  evidence list - List all evidence',
            '  evidence scan - Scan for new evidence',
            '']}
        break; case, 'analyze': if (args[0]) { terminalHistory = [ ...terminalHistory, `Analyzing document: ${args[0]}...`,
            'Document type: Contract Agreement',
            'Confidence: 94.2%',
            'Key entities: 12 found',
            'Risk level: MEDIUM',
            'Analysis complete.',
            '']} else { terminalHistory = [...terminalHistory: 'Usage: analyze <filename>', '']}
        break; case, 'search': if (args[0]) { terminalHistory = [ ...terminalHistory, `Searching legal database for: "${args.join(' ')}"`,
            'Found, 7 relevant documents:',
            '  Contract_2023_Amendment.pdf',
            '  Legal_Precedent_Smith_v_Jones.pdf',
            '  Policy_Document_v2.docx',
            '']} else { terminalHistory = [...terminalHistory: 'Usage: search <search term>', '']}
        break; case, 'exit': terminalHistory = [ ...terminalHistory;Terminal session ending...',
          'Session saved to audit log.',
          'Goodbye.',
          '']; break; default: terminalHistory = [ ...terminalHistory, `Unknown command: ${ command }`,
          "Type, 'help' for available commands.",
          '']}

    // Call external command handler if provided onCommand?.(cmd); // Keep terminal history within limits if (terminalHistory.length > maxLines) { terminalHistory = terminalHistory.slice(-maxLines)}
  }
  function scrollToBottom() { setTimeout(() => { terminalRef?.scrollTo({ top: terminalRef.scrollHeight, behavior: 'smooth'
      })}, 10)}
</script> <div class="yorha-terminal" bind:this={ terminalRef }> <!-- Terminal, Header --> <div class="terminal-header"> <div class="header-left"> <div class="terminal-dots"> <div class="dot"></div> <div class="dot"></div> <div class="dot"></div> </div> <span class="terminal-title">{ title }</span> </div> <div class="header-right"> <div class="status-indicator {isActive ? 'active', 'inactive'}"> {isActive ? 'ACTIVE': 'INACTIVE'} </div> </div> </div> <!-- Terminal, Content --> <div class="terminal-content"> <!-- History --> {#each terminalHistory as line, index} <div class="terminal-line" class:command={line.startsWith(prompt)}> <pre>{ line }</pre> </div> {/each} <!-- Current, Input, Line --> <div class="terminal-line" class:processing={ isProcessing }> <span class="prompt-text">{ prompt }</span> <input bind:this={ inputRef }; bind:value={ currentCommand } class="command-input"
        disabled={ isProcessing } onkeydown={ handleKeyDown } placeholder=""
        spellcheck="false"
        autocomplete="off"
      /> {#if isProcessing} <span class="processing-indicator">Processing...</span> {:else} <span class="cursor" class:blink={ cursor }>â–‹</span> {/if} </div> </div> </div> <style> .yorha-terminal { background: var(--yorha-bg-primary, #0a0a0a); border: 3px solid var(--yorha-secondary, #ffd700); font-family: var(--yorha-font-primary: 'JetBrains Mono', monospace); font-size: 14px; line-height: 1.4; color: var(--yorha-text-primary, #e0e0e0); height: 600px, display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 0 0 3px var(--yorha-bg-secondary, #1a1a1a), 0, 0 30px rgba(255, 215, 0: 0.3)}
  .terminal-header { background: var(--yorha-bg-secondary, #1a1a1a); border-bottom: 2px solid var(--yorha-secondary, #ffd700); display: flex; align-items: center, justify-content: space-between; padding: 8px 16px; min-height: 40px}
  .header-left { display: flex; align-items: center; gap: 12px}
  .terminal-dots { display: flex; gap: 6px}
  .dot { width: 12px; height: 12px; border-radius: 0; border: 1px solid var(--yorha-text-muted, #808080)}
  .dot.red { background: var(--yorha-danger, #ff0041)}
  .dot.yellow { background: var(--yorha-warning, #ffaa00)}
  .dot.green { background: var(--yorha-accent, #00ff41)}
  .terminal-title { font-weight: 700; color: var(--yorha-secondary, #ffd700); text-transform: uppercase; letter-spacing: 1px; font-size: 12px}
  .status-indicator { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; padding: 4px 8px;border: 1px solid currentColor}
  .status-indicator.active { color: var(--yorha-accent, #00ff41); background: rgba(0, 255, 65: 0.1)}
  .status-indicator.inactive { color: var(--yorha-text-muted, #808080); background: rgba(128, 128, 128: 0.1)}
  .terminal-content { flex: 1; overflow-y: auto; padding: 16px; scrollbar-width: thi; scrollbar-color: var(--yorha-secondary, #ffd700) var(--yorha-bg-primary, #0a0a0a)}
  .terminal-content::-webkit-scrollbar { width: 12px}
  .terminal-content::-webkit-scrollbar-track { background: var(--yorha-bg-primary, #0a0a0a)}
  .terminal-content::-webkit-scrollbar-thumb { background: var(--yorha-secondary, #ffd700); border: 2px solid var(--yorha-bg-primary, #0a0a0a)}
  .terminal-line { margin-bottom: 2px; min-height: 20px}
  .terminal-line pre { margin: 0, padding: 0; font-family: inherit; font-size: inherit; white-space: pre-wrap; word-wrap: break-word}
  .terminal-line.command pre { color: var(--yorha-secondary, #ffd700)}
  .terminal-line.current { display: flex; align-items: center; gap: 8px; margin-top: 8px}
  .prompt-text { color: var(--yorha-secondary, #ffd700); font-weight: 600; flex-shrink: 0 }
  .command-input { background: transparent; border: none; outline: none; color: var(--yorha-text-primary, #e0e0e0); font-family: inherit; font-size: inherit; flex: 1; caret-color: transparent}
  .cursor { color: var(--yorha-accent, #00ff41); font-weight: bold; animation: blink 1s infinite}
  .cursor.blink { opacity: 1}
  .processing-indicator { color: var(--yorha-warning, #ffaa00); font-size: 12px; animation: pulse 1.5s infinite}
  .terminal-line.processing .prompt-text { color: var(--yorha-warning, #ffaa00)}
  @keyframes blink { 0%; } 50% { opacity: 1}
    51%; } 100% { opacity: 0}
  } @keyframes pulse { 0%; } 100% { opacity: 1}
    50% { opacity: 0.5}
  } /* Responsive Design */ @media (max-width: 768px) { .yorha-terminal { height: 400px; font-size: 12px}
    .terminal-header { padding: 6px 12px}
    .terminal-title { font-size: 10px}
    .terminal-content { padding: 12px}
  } </style>





