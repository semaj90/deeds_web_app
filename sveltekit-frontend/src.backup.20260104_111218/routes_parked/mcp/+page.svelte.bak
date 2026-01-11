<script lang="ts">
import type { Document } from '$lib/types'; // Svelte, 5 runes are auto-imported import type { goto  } from '$app/navigation'; import type { mcpApi  } from '$lib/api/mcp-client.js'; import { writable } from 'svelte/store';; // Server status const serverStatus = writable({ status: 'checking', workers: 0, uptime: 0, version: 'Unknown'
  }); // Quick stats let totalProcessed = 1247; let avgProcessingTime = 2.3; let successRate = 97.8; let gpuAcceleration = true; // Feature cards data const features = [ { title: 'Document Analysis', description: 'AI-powered legal document processing with entity extraction, risk assessment, and compliance checking', icon: 'ðŸ“„', href: '/mcp/demo', stats: { processed: '450+ docs', accuracy: '95%' }, color: 'blue'
    }, {
      title: 'Legal Processor', description: 'Batch document processing with parallel worker threads and real-time progress tracking', icon: 'âš–ï¸', href: '/mcp/processor', stats: { workers: '4 cores', speed: '2.3s avg' }, color: 'purple'
    }, {
      title: 'Server Dashboard', description: 'Real-time monitoring of MCP server performance, GPU utilization, and system metrics', icon: 'ðŸ“Š', href: '/mcp/dashboard', stats: { uptime: '99.9%', gpu: 'RTX, 3060 Ti' }, color: 'green'
    }]; // Recent activity (mock data) const recentActivity = [ { time: '2 min ago', action: 'Processed employment contract', status: 'completed', risk: 25 }, { time: '5 min ago', action: 'Analyzed NDA template', status: 'completed', risk: 15 }, { time: '8 min ago', action: 'Real estate agreement review', status: 'completed', risk: 42 }, { time: '12 min ago', action: 'Corporate merger LOI', status: 'completed', risk: 38 }, { time: '15 min ago', action: 'Partnership agreement scan', status: 'completed', risk: 22 }]; // Check server status on mount / reactive effect $effect (() => { (async () => { try { const health = await mcpApi.getHealth(); serverStatus.set({ status: health.status, workers: health.workers, uptime: health.uptime, version: health.version })} catch (error) { console.error('Failed to get server status:', error)}
    })()}); function navigateToFeature(href: string) { goto(href)}
  function getStatusColor(status: string) { switch (status) { case, 'healthy': return 'text-green-500'; case, 'degraded': return 'text-yellow-500'; case, 'error': return 'text-red-500'; default: return 'text-gray-500'}
  }
  function getStatusIcon(status: string) { switch (status) { case, 'healthy': return 'ðŸŸ¢'; case, 'degraded': return 'ðŸŸ¡'; case, 'error': return 'ðŸ”´'; default: return 'âšª'}
  }
  function getRiskColor(risk: number) { if (risk < 30) return 'text-green-600'; if (risk < 60) return 'text-yellow-600'; return 'text-red-600'}
  function formatUptime(seconds: number): string { if (seconds < 60) return `${ seconds }s`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`; return `${Math.floor(seconds / 86400)}d`}
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
</style>
