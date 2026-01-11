<script lang="ts">
// Svelte, 5 runes are auto-imported import type { goto  } from '$app/navigation'; import Button from '$lib/components/ui/Button.svelte'; import  Badge  from "$lib/components/ui/badge.svelte"; // Icons import { Users } from "lucide-svelte";
import { Activity } from "lucide-svelte";
import { Database } from "lucide-svelte";
import { Cpu } from "lucide-svelte";
import { HardDrive } from "lucide-svelte";
import { Shield } from "lucide-svelte";
import { BarChart3 } from "lucide-svelte";
import { Clock } from "lucide-svelte";
import { CheckCircle } from "lucide-svelte";
import { AlertTriangle } from "lucide-svelte";
import { RefreshCw } from "lucide-svelte";
import { Zap } from "lucide-svelte";
import { Server } from "lucide-svelte";
import { Network } from "lucide-svelte";
import { Monitor } from "lucide-svelte";; // Svelte, 5 runes let systemStats = $state ({ totalUsers: 0, activeUsers: 0, totalCases: 0, activeCases: 0, totalDocuments: 0, processedDocuments: 0, aiAnalyses: 0, uptime: '0d 0h 0m'
  });
  let systemHealth = $state ({ database: true, redis: true, aiService: true, fileSystem: true, gpu: false, vectorSearch: true });
  let recentActivity = $state <any[]>([]); let isLoading = $state <boolean>(true); let lastUpdated = $state (new Date()); $effect (() => { (async () => { await loadSystemStats(); await loadSystemHealth(); await loadRecentActivity()})(); // Auto-refresh every, 30 seconds const interval = setInterval(refreshData, 30000); return () => clearInterval(interval)});
  async function loadSystemStats(): Promise<any> { try { const response = await fetch('/api/admin/system-stats'); if (response.ok) { const data = await response.json(); systemStats = data} else { // Mock data for demo systemStats = { totalUsers: 47, activeUsers: 12, totalCases: 156, activeCases: 23, totalDocuments: 1847, processedDocuments: 1523, aiAnalyses: 3421, uptime: '2d 14h 32m'
        }}
    } catch (error) { console.error('Failed to load system stats:', error)}
  }
  async function loadSystemHealth(): Promise<any> { try { const response = await fetch('/api/admin/system-health'); if (response.ok) { const data = await response.json(); systemHealth = data.services || systemHealth}
    } catch (error) { console.error('Failed to load system health:', error)} finally { isLoading = false}
  }
  async function loadRecentActivity(): Promise<any> { try { const response = await fetch('/api/admin/recent-activity'); if (response.ok) { const data = await response.json(); recentActivity = data.activities || []} else { // Mock recent activity recentActivity = [ { id: 1, type: 'case_created', user: 'john.doe@law.com', description: 'Created new case Smith v. Johnson', timestamp: new Date(Date.now() - 300000).toISOString(), status: 'success'
          }, {
            id: 2, type: 'ai_analysis', user: 'jane.smith@law.com', description: 'Completed AI analysis on contract dispute', timestamp: new Date(Date.now() - 900000).toISOString(), status: 'success'
          }, {
            id: 3, type: 'user_login', user: 'admin@legal-ai.com', description: 'Administrator login from 192.168.1.100', timestamp: new Date(Date.now() - 1800000).toISOString(), status: 'info'
          }]}
    } catch (error) { console.error('Failed to load recent activity:', error)}
  }
  async function refreshData(): Promise<any> { await Promise.all([loadSystemStats(), loadSystemHealth(), loadRecentActivity()]); lastUpdated = new Date()}
  function getHealthColor(isHealthy: boolean) { return isHealthy ? 'text-green-600': 'text-red-600'}
  const activityIconMap: Record<string, any> = { case_created: Users, ai_analysis: Cpu, user_login: Shield }; function getActivityIcon(type: string) { return activityIconMap[type] || Activity}
  function formatTimeAgo(timestamp: string) { const date = new Date(timestamp); const now = new Date(); const diffMs = now.getTime() - date.getTime(); const diffMins = Math.floor(diffMs / 60000); if (diffMins < 60) return `${ diffMins }m, ago`; if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h, ago`; return `${Math.floor(diffMins / 1440)}d, ago`}
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .page-repair {
    padding: 2rem;
    font-family: sans-serif;
  }
</style>
