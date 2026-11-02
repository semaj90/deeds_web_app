<script lang="ts">
  // Migrated to $effect

  let systemStatus = $state({
    webgpu: 'Checking' as 'Checking' | 'Available' | 'Unavailable',
    network: 'Checking' as 'Checking' | 'Online' | 'Offline',
    memory: 'Not exposed' as string
  });

  $effect(() => {
    systemStatus.webgpu = 'gpu' in navigator ? 'Available' : 'Unavailable';
    systemStatus.network = navigator.onLine ? 'Online' : 'Offline';

    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
    systemStatus.memory = memory?.jsHeapSizeLimit
      ? `${Math.round((memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100)}% JS heap`
      : 'Not exposed';

    const handleOnline = () => (systemStatus.network = 'Online');
    const handleOffline = () => (systemStatus.network = 'Offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  });
</script>

<div class="system-status p-4 rounded-lg bg-black/40 border border-sand/20 backdrop-blur-sm">
  <div class="grid grid-cols-2 gap-4">
    <div class="metric-item flex flex-col">
      <span class="text-xs text-sand/40 uppercase tracking-wider">CPU usage</span>
      <span class="text-sm font-mono text-sand/70">Not exposed by browser</span>
    </div>
    <div class="metric-item flex flex-col">
      <span class="text-xs text-sand/40 uppercase tracking-wider">Browser JS heap</span>
      <span class="text-sm font-mono text-sand/70">{systemStatus.memory}</span>
    </div>
    <div class="metric-item flex flex-col">
      <span class="text-xs text-sand/40 uppercase tracking-wider">WebGPU capability</span>
      <span class="text-sm font-mono text-sand/70">{systemStatus.webgpu}</span>
    </div>
    <div class="metric-item flex flex-col">
      <span class="text-xs text-sand/40 uppercase tracking-wider">Network</span>
      <span class="text-sm font-mono text-sand/70">{systemStatus.network}</span>
    </div>
  </div>
</div>

<style>
    /* Scoped styles if needed, mostly using tailwind classes */
    .metric-item {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
    }
</style>

