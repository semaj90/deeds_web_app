<!-- Unified System Dashboard Showcases integration between Phase, 2 GPU Acceleration and Production, Pipeline --> <script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import {
    Activity,
    AlertTriangle,
    BarChart3,
    CheckCircle2,
    Cloud,
    Cpu,
    RefreshCcw,
    Server,
    Shield,
    Terminal,
    Zap
  } from 'lucide-svelte';
  import { onDestroy, onMount } from 'svelte';

  // System State with Svelte 5 Runes
  let systemStatus = $state<'healthy' | 'warning' | 'critical' | 'unknown'>('healthy');
  let lastUpdate = $state<string>(new Date().toLocaleTimeString());
  let activeAlerts = $state<any[]>([]);

  // Real-time metrics
  let performanceMetrics = $state({
    cpuUsage: 12,
    memoryUsage: 45,
    gpuEfficiency: 88,
    responseTime: 120,
    activeSockets: 4
  });

  // Service status tracking
  let services = $state([
    { id: 'legal-engine', name: 'Legal Engine', status: 'online', latency: 45, uptime: '99.9%' },
    { id: 'rag-service', name: 'RAG Pipeline', status: 'online', latency: 120, uptime: '98.5%' },
    { id: 'qdrant', name: 'Vector DB', status: 'online', latency: 12, uptime: '100%' },
    { id: 'redis', name: 'Cache Layer', status: 'online', latency: 2, uptime: '99.9%' },
    { id: 'postgres', name: 'Core DB', status: 'online', latency: 5, uptime: '99.9%' },
    { id: 'ollama', name: 'Ollama Inference', status: 'online', latency: 850, uptime: '95.2%' }
  ]);

  let isRefreshing = $state(false);
  let timer: any;

  onMount(() => {
    startMonitoring();
  });

  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function startMonitoring() {
    timer = setInterval(() => {
      updateMetrics();
    }, 3000);
  }

  async function updateMetrics() {
    // Simulate real-time jitter
    performanceMetrics.cpuUsage = Math.min(100, Math.max(0, performanceMetrics.cpuUsage + (Math.random() * 10 - 5)));
    performanceMetrics.memoryUsage = Math.min(100, Math.max(0, performanceMetrics.memoryUsage + (Math.random() * 4 - 2)));
    performanceMetrics.responseTime = Math.round(100 + Math.random() * 50);

    lastUpdate = new Date().toLocaleTimeString();

    // Check system threshold for overall status
    if (performanceMetrics.cpuUsage > 90 || performanceMetrics.memoryUsage > 95) {
      systemStatus = 'critical';
    } else if (performanceMetrics.cpuUsage > 70) {
      systemStatus = 'warning';
    } else {
      systemStatus = 'healthy';
    }
  }

  async function handleRefresh() {
    isRefreshing = true;
    // Simulate API call to check services
    await new Promise(resolve => setTimeout(resolve, 800));
    updateMetrics();
    isRefreshing = false;
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'online': return 'text-green-500';
      case 'offline': return 'text-red-500';
      case 'degraded': return 'text-yellow-500';
      default: return 'text-muted-foreground';
    }
  }

  function getSystemBadgeVariant(status: string) {
    switch (status) {
      case 'healthy': return 'default';
      case 'warning': return 'secondary';
      case 'critical': return 'destructive';
      default: return 'outline';
    }
  }
</script>

<div class="space-y-6">
  <!-- Top Header Section -->
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div class="flex items-center gap-4">
      <div class="p-3 bg-primary/10 rounded-xl">
        <Shield class="w-8 h-8 text-primary" />
      </div>
      <div>
        <h1 class="text-3xl font-bold tracking-tight">System Infrastructure</h1>
        <div class="flex items-center gap-2 mt-1">
          <Badge variant={getSystemBadgeVariant(systemStatus)} class="uppercase">
            System {systemStatus}
          </Badge>
          <span class="text-sm text-muted-foreground flex items-center gap-1">
            <Activity class="w-3 h-3" /> Last check: {lastUpdate}
          </span>
        </div>
      </div>
    </div>

    <div class="flex items-center gap-2">
      <Button variant="outline" size="sm" onclick={handleRefresh} disabled={isRefreshing}>
        <RefreshCcw class="w-4 h-4 mr-2 {isRefreshing ? 'animate-spin' : ''}" />
        Refresh All
      </Button>
      <Button variant="default" size="sm">
        <Terminal class="w-4 h-4 mr-2" />
        Debug Console
      </Button>
    </div>
  </div>

  <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
    <!-- Resource Usage Cards -->
    <Card.Root>
      <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">CPU Usage</Card.Title>
        <Cpu class="h-4 w-4 text-primary" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{performanceMetrics.cpuUsage.toFixed(1)}%</div>
        <Progress value={performanceMetrics.cpuUsage} class="mt-2 h-1" />
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">Memory Usage</Card.Title>
        <Server class="h-4 w-4 text-primary" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{performanceMetrics.memoryUsage.toFixed(1)}%</div>
        <Progress value={performanceMetrics.memoryUsage} class="mt-2 h-1" />
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">GPU Efficiency</Card.Title>
        <Zap class="h-4 w-4 text-amber-500" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{performanceMetrics.gpuEfficiency}%</div>
        <Progress value={performanceMetrics.gpuEfficiency} class="mt-2 h-1 bg-amber-100/20" />
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium text-muted-foreground">Avg Latency</Card.Title>
        <BarChart3 class="h-4 w-4 text-primary" />
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{performanceMetrics.responseTime}ms</div>
        <p class="text-xs text-muted-foreground mt-1">Slightly below average</p>
      </Card.Content>
    </Card.Root>
  </div>

  <div class="grid gap-4 md:grid-cols-7">
    <!-- Main Service List -->
    <Card.Root class="md:col-span-4">
      <Card.Header>
        <Card.Title>Core Services</Card.Title>
        <Card.Description>Status monitor for internal microservices and databases.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="space-y-4">
          {#each services as service}
            <div class="flex items-center justify-between border-b border-border/40 pb-3 last:border-0 last:pb-0">
              <div class="flex items-center gap-3">
                <div class="w-2 h-2 rounded-full {service.status === 'online' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-red-500'}"></div>
                <div>
                  <div class="font-medium">{service.name}</div>
                  <div class="text-[10px] text-muted-foreground uppercase tracking-wider">{service.id}</div>
                </div>
              </div>
              <div class="flex items-center gap-6">
                <div class="text-right">
                  <div class="text-xs font-semibold">{service.latency}ms</div>
                  <div class="text-[10px] text-muted-foreground">Latency</div>
                </div>
                <div class="text-right min-w-[60px]">
                  <div class="text-xs font-semibold">{service.uptime}</div>
                  <div class="text-[10px] text-muted-foreground">Uptime</div>
                </div>
                <Badge variant="outline" class="text-[10px]">
                  {service.status}
                </Badge>
              </div>
            </div>
          {/each}
        </div>
      </Card.Content>
    </Card.Root>

    <!-- System Alerts/Logs -->
    <Card.Root class="md:col-span-3">
      <Card.Header>
        <Card.Title>System Alerts</Card.Title>
        <Card.Description>Incident reports and infrastructure events.</Card.Description>
      </Card.Header>
      <Card.Content>
        <div class="space-y-3">
          <div class="p-3 bg-muted/50 rounded-lg border border-border/50 flex gap-3">
            <CheckCircle2 class="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <div class="text-sm font-semibold">PostgreSQL Mirroring Complete</div>
              <p class="text-xs text-muted-foreground">Database synchronization finished successfully across all nodes.</p>
              <div class="text-[10px] text-muted-foreground mt-1">2 minutes ago</div>
            </div>
          </div>

          <div class="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/20 flex gap-3">
            <AlertTriangle class="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <div class="text-sm font-semibold">Inference Latency Spike</div>
              <p class="text-xs text-muted-foreground">Ollama queue increased by 25%. Automatic scaling triggered.</p>
              <div class="text-[10px] text-muted-foreground mt-1">15 minutes ago</div>
            </div>
          </div>

          <div class="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20 flex gap-3">
            <Cloud class="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <div class="text-sm font-semibold">Cloud Sync Active</div>
              <p class="text-xs text-muted-foreground">Offsite backup is currently uploading current session data.</p>
              <div class="text-[10px] text-muted-foreground mt-1">45 minutes ago</div>
            </div>
          </div>
        </div>

        <div class="mt-4 pt-4 border-t border-border/50">
          <Button variant="ghost" size="sm" class="w-full justify-start text-xs">
            View full infrastructure log
          </Button>
        </div>
      </Card.Content>
    </Card.Root>
  </div>
</div>

<style>
  :global(.system-dashboard) {
    background-color: transparent;
  }
</style>






