<!-- YoRHa System Status Bar, Component -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
  // Migrated to $effect

  let { systemLoad = 42, gpuUtilization = 15, memoryUsage = 33, networkLatency = 24 } = $props();

  // Additional system metrics
  let cpuTemp = $state(72);
  let diskUsage = $state(45);
  let uptime = $state(0);
  let currentTime = $state(new Date());
  let activeConnections = $state(12);

  const systemStatus = $derived.by(() => {
    if (systemLoad > 90 || memoryUsage > 90) return 'CRITICAL';
    if (systemLoad > 75 || memoryUsage > 75) return 'WARNING';
    return 'NORMAL'
  });

  let interval: any;
  $effect(() => {
    interval = setInterval(() => {
      currentTime = new Date();
      uptime += 1;

      // Simulate minor fluctuations
      cpuTemp = Math.max(60, Math.min(85, cpuTemp + (Math.random() - 0.5) * 2));
      diskUsage = Math.max(40, Math.min(60, diskUsage + (Math.random() - 0.5) * 1));
      activeConnections = Math.max(8, Math.min(20, activeConnections + Math.floor((Math.random() - 0.5) * 3)));
    }, 1000);

    return () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
  });

  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  }
</script>

<!-- System Status Bar -->
<div class="bg-panel border-t border-sand/20 px-4 py-2 flex items-center justify-between text-[10px] font-mono whitespace-nowrap overflow-hidden">
  <!-- Status Indicators -->
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-2">
      <div class="w-2 h-2 rounded-full animate-pulse"
          class:bg-accent={systemStatus === 'NORMAL'}
          class:bg-warning={systemStatus === 'WARNING'}
          class:bg-rose-500={systemStatus === 'CRITICAL'}
        ></div>
      <span class="font-bold text-sand/40">SYS_STATUS: {systemStatus}</span>
    </div>

    <!-- Metrics -->
    <div class="hidden sm:flex items-center gap-4 text-sand/60">
      <div class="flex items-center gap-2">
        <span>CPU</span>
        <div class="w-12 h-1 bg-panelSoft rounded-full overflow-hidden">
          <div class="h-full bg-info" style:width={`${systemLoad}%`}></div>
        </div>
        <span class="text-sand/40">{ systemLoad }%</span>
      </div>
      <div class="flex items-center gap-2">
        <span>GPU</span>
        <div class="w-12 h-1 bg-panelSoft rounded-full overflow-hidden">
          <div class="h-full bg-info" style:width={`${gpuUtilization}%`}></div>
        </div>
        <span class="text-sand/40">{ gpuUtilization }%</span>
      </div>
      <div class="flex items-center gap-2">
        <span>MEM</span>
        <div class="w-12 h-1 bg-panelSoft rounded-full overflow-hidden">
          <div class="h-full bg-info" style:width={`${memoryUsage}%`}></div>
        </div>
        <span class="text-sand/40">{ memoryUsage }%</span>
      </div>
      <div class="flex items-center gap-2">
        <span>TEMP</span>
        <span class={cpuTemp > 80 ? 'text-rose-500' : 'text-sand/40'}>{Math.round(cpuTemp)}°C</span>
      </div>
    </div>
  </div>

  <!-- Center (Latency) -->
  <div class="hidden lg:flex items-center gap-4 text-sand/60">
    <div class="flex items-center gap-2">
      <span>LATENCY</span>
      <span class="text-accent">{ networkLatency }ms</span>
    </div>
    <div class="flex items-center gap-2">
      <span>DISK</span>
      <span class="text-sand/40">{ Math.round(diskUsage) }%</span>
    </div>
  </div>

  <!-- Right (Time/Uptime) -->
  <div class="flex items-center gap-6">
    <div class="flex items-center gap-2">
      <span class="text-sand/60">UPTIME</span>
      <span class="text-sand/40">{ formatUptime(uptime) }</span>
    </div>
    <div class="flex items-center bg-panelSoft px-3 py-1 border border-sand/20 rounded-sm">
      <span class="text-info font-bold tracking-widest"> {currentTime.toLocaleTimeString('en-GB', { hour12: false })} </span>
    </div>
    <div class="hidden xl:block bg-info/10 border border-info/30/50 px-2 py-1 rounded-sm">
      <span class="text-info font-bold">YORHA-ID: AI-NODE-2B</span>
    </div>
  </div>
</div>





