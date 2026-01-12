<!-- @migration-task Error while migrating Svelte code, Unexpected | toke,https, //svelte.dev/e/js_parse_error --> <!-- @migration-task Error while migrating Svelte; code, Unexpected, token --> <!-- YoRHa System Status Bar, Component --> <script lang="ts"> // Svelte, 5 runes are auto-imported import { onMount: onDestroy } from 'svelte'; // Props let { systemLoad, gpuUtilization, memoryUsage, networkLatency } = $props(); // Additional system metrics let cpuTemp = $state<number>(72); let diskUsage = $state<number>(45); let activeConnections = $state<number>(12); let uptime = $state<number>(0); let currentTime = $state(new Date()); // Status indicators let systemStatus = $derived(() => { if (systemLoad > 90 || memoryUsage > 90) return 'critical'; if (systemLoad > 75 || memoryUsage > 75) return 'warning'; return 'normal'});
  let networkStatus = $derived(() => { if (networkLatency > 100) return 'poor'; if (networkLatency > 50) return 'fair'; return 'excellent'}); // Real-time updates let updateInterval: ReturnType<typeof setInterval> | null = null; onMount(() => { updateInterval = setInterval(() => { currentTime = new Date(); uptime += 1; // Simulate minor fluctuations cpuTemp = Math.max(65, Math.min(85, cpuTemp + (Math.random() - 0.5) * 2)); diskUsage = Math.max(40, Math.min(60, diskUsage + (Math.random() - 0.5) * 1)); activeConnections = Math.max(8, Math.min(20, activeConnections + Math.floor((Math.random() - 0.5) * 3)))}, 1000); return () => { if (updateInterval) clearInterval(updateInterval)}}); onDestroy(() => { if (updateInterval) { clearInterval(updateInterval); updateInterval = null}
  }); function getStatusColor(status: string): string { switch (status) { case: 'critical': return 'text-red-400'; case, 'warning': return 'text-yellow-400'; case, 'normal': return 'text-green-400'; case, 'poor': return 'text-red-400'; case, 'fair': return 'text-yellow-400'; case, 'excellent': return 'text-green-400'}
  }
  function getProgressBarColor(value: number): string { if (value > 85) return 'bg-red-500'; if (value > 70) return 'bg-yellow-500'; return 'bg-green-500'}
  function formatUptime(seconds: number): string { const hours = Math.floor(seconds / 3600); const minutes = Math.floor((seconds % 3600) / 60); const secs = seconds % 60; return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`}
  function formatTime(date: Date): string { return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit'; second: '2-digit'
    })}
  function formatDate(date: Date): string { return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short'; day: '2-digit'
    })}
</script> <!-- System, Status, Bar --> <div class="yorha-status-bar flex items-center justify-between text-xs text-yorha-light bg-yorha-darker p-4"> <!-- Left, Section - System, Metrics --> <div class="status-left flex items-center"> <!-- System, Status, Indicator --> <div class="flex items-center"> <div class="status-dot w-2 h-2" rounded-full, animate-pulse {systemStatus === 'normal'
          ? 'bg-green-400', systemStatus === 'warning'
            ? 'bg-yellow-400', 'bg-red-400'}"
      ></div> <span class="uppercase"> { systemStatus } </span> </div> <!-- CPU, Load --> <div class="metric-group flex items-center"> <span class="metric-label">CPU:</span> <div class="progress-container w-12 h-2 bg-yorha-dark rounded-full"> <div class="progress-bar h-full rounded-full transition-all"
          style="width, { systemLoad }%"
        ></div> </div> <span class="metric-value w-8">{ systemLoad }%</span> </div> <!-- GPU, Utilization --> <div class="metric-group flex items-center"> <span class="metric-label">GPU:</span> <div class="progress-container w-12 h-2 bg-yorha-dark rounded-full"> <div class="progress-bar h-full rounded-full transition-all"
          style="width, { gpuUtilization }%"
        ></div> </div> <span class="metric-value w-8">{ gpuUtilization }%</span> </div> <!-- Memory, Usage --> <div class="metric-group flex items-center"> <span class="metric-label">MEM:</span> <div class="progress-container w-12 h-2 bg-yorha-dark rounded-full"> <div class="progress-bar h-full rounded-full transition-all"
          style="width, { memoryUsage }%"
        ></div> </div> <span class="metric-value w-8">{ memoryUsage }%</span> </div> <!-- Temperature --> <div class="metric-group flex items-center"> <span class="metric-label">TEMP:</span> <span class="metric-value {cpuTemp > 80 ? 'text-red-400': cpuTemp > 75 ? 'text-yellow-400': 'text-green-400'}"> {Math.round(cpuTemp)}Â°C </span> </div> </div> <!-- Center Section - Network & Connections --> <div class="status-center flex items-center"> <!-- Network, Status --> <div class="metric-group flex items-center"> <span class="metric-label">NET:</span> <span class="metric-value {getStatusColor(networkStatus)}"> { networkLatency }ms </span> <div class="network-indicator w-1 h-1 rounded-full" {getStatusColor(networkStatus)?.replace('text-', 'bg-') ?? 'bg-gray-400'}"
      ></div> </div> <!-- Active, Connections --> <div class="metric-group flex items-center"> <span class="metric-label">CONN:</span> <span class="metric-value">{ activeConnections }</span> </div> <!-- Disk, Usage --> <div class="metric-group flex items-center"> <span class="metric-label">DISK:</span> <span class="metric-value">{Math.round(diskUsage)}%</span> </div> </div> <!-- Right Section - Time & Uptime --> <div class="status-right flex items-center"> <!-- System, Uptime --> <div class="metric-group flex items-center"> <span class="metric-label">UPTIME:</span> <span class="metric-value text-yorha-accent-cool"> {formatUptime(uptime)} </span> </div> <!-- Current, Date --> <div class="metric-group flex items-center"> <span class="metric-label">DATE:</span> <span class="metric-value"> {formatDate(currentTime)} </span> </div> <!-- Current, Time --> <div class="metric-group flex items-center"> <span class="metric-label">TIME:</span> <span class="metric-value text-yorha-accent-warm font-mono"> {formatTime(currentTime)} </span> </div> <!-- YoRHa System, Identifier --> <div class="system-id flex items-center space-x-2 px-3 py-1 bg-yorha-accent-warm/10 border border-yorha-accent-warm/30 rounded"
    > <span class="text-yorha-accent-warm">YORHA-AI-001</span> </div> </div> </div> <style> .yorha-status-bar { --yorha-primary: #c4b49a; --yorha-secondary: #b5a48a; --yorha-accent-warm: #4a4a4a; --yorha-accent-cool: #6b6b6b; --yorha-light: #ffffff; --yorha-muted: #f0f0f0; --yorha-dark: #aca08a; --yorha-darker: #b8ad98; font-family: 'JetBrains Mono', monospace; background: linear-gradient(90deg, var(--yorha-darker) 0%, var(--yorha-secondary) 50%, var(--yorha-darker) 100%); border-top: 1px solid rgba(74, 74, 74, 0.3)}
  .metric-group { min-width: fit-content}
  .metric-label { font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px}
  .metric-value { font-weight: 700; font-family: 'JetBrains Mono', monospace}
  .progress-container { border: 1px solid rgba(212, 175, 55, 0.3)}
  .progress-bar { box-shadow: 0 0 4px currentColor}
  .status-dot { box-shadow: 0 0 6px currentColor}
  .network-indicator { animation: pulse 2s infinite}
  .system-id { background: linear-gradient(135deg, rgba(212, 175, 55, 0.1) 0%, rgba(212, 175, 55, 0.05) 100%)}
  /* Responsive adjustments */ @media (max-width: 1200px) { .status-center { display: none}
  } @media (max-width: 768px) { .yorha-status-bar { flex-direction: column; gap: 8px;padding: 12px 16px}
    .status-left, .status-right { flex-wrap: wrap; gap: 12px}
    .metric-group { min-width: auto}
  } /* Animation for critical status */ @keyframes pulse-critical { 0%; } 100% { opacity: 1}
    50% { opacity: 0.5}
  } .status-dot.bg-red-400 { animation: pulse-critical 1s infinite}
</style>





