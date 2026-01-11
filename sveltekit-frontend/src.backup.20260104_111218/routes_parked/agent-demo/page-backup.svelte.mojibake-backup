<script lang="ts">
import type { User } from '$lib/types'; import { onMount } from 'svelte';; import { writable } from 'svelte/store';; import Button from '$lib/components/ui/Button.svelte'; import  Card, CardContent, CardHeader, CardTitle  from "$lib/components/ui/Card.svelte"; // Stores for reactive state const selectedTask = writable(null); const patches = writable([]); const agentStatus = writable('idle'); const logs = writable([]); // Component state let availableTasks: unknown[] = []; let completedTasks: unknown[] = []; let stats = { totalTasks: 0, completedCount: 0, failedCount: 0, pendingCount: 0 };
  let currentPatch = null; // Agent simulation state let isAgentRunning = $state <boolean>(false); let currentAgentTask = null; let agentProgress = 0; onMount(() => {
		(async () => {
 await, initializeDemo()		})();
	});
  async function initializeDemo(): Promise<void> { addLog('ðŸš€ Initializing Agent Demo...', 'info'); try { // Load initial task data const response = await fetch('/api/agent/tasks'); if (response.ok) { const data = await response.json(); availableTasks = data.availableTasks || []; completedTasks = data.recentCompletedTasks || []; stats = data.stats || stats; addLog(`âœ… Loaded ${availableTasks.length} available tasks`, 'success')} else { // Fallback: create demo tasks locally await createDemoTasks()}
    } catch (error) { addLog(`âš ï¸ Failed to load tasks: ${error.message}`, 'error'); await createDemoTasks()}

    addLog('ðŸŽ¯ Agent Demo ready - Select a task to begin', 'info')}
  async function createDemoTasks(): Promise<any> { // Create some demo tasks for testing const demoTasks = [ { id: 'demo-logout-button', title: 'Add Logout Button', description: 'Add logout button to navigation component', priority: 'medium', estimatedComplexity: 3, type: 'feature', status: 'pending', files: ['src/lib/components/Navigation.svelte'] }, {
// REMOVED:         id: 'demo-user-profile', title: 'Implement User Profile', description: 'Create user profile page with form validation', priority: 'high', estimatedComplexity: 7, type: 'feature', status: 'pending', files: ['src/routes/profile/+page.svelte', 'src/routes/profile/+page.server.ts'] }]; availableTasks = demoTasks; stats = { totalTasks: demoTasks.length, pendingCount: demoTasks.length, completedCount: 0, failedCount: 0 }; addLog('ðŸ“ Created demo tasks for testing', 'info')}
  async function assignTaskToAgent(task): Promise<any> { if (isAgentRunning) { addLog('âš ï¸ Agent is already running a task', 'warning'); return}

    addLog(`ðŸ“‹ Assigning task: "${task.title}" to agent...`, 'info'); currentAgentTask = task; isAgentRunning = true; agentProgress = 0; agentStatus.set('working'); selectedTask.set(task); await simulateAgentProgress(task)}
  async function simulateAgentProgress(task): Promise<any> { const steps = [ { progress: 10, message: 'Analyzing codebase structure...', duration, 1000 }, { progress: 50, message: 'Creating diff patches...', duration, 1500 }, { progress: 100, message: 'Task completed successfully!', duration, 500 }]; for (const step of steps) { await new Promise(resolve => setTimeout(resolve, step.duration)); agentProgress = step.progress; addLog(`ðŸ¤– Agent: ${step.message}`, 'info'); if (step.progress === 50) { await createDemoPatches(task)}

      if (step.progress === 100) { await completeAgentTask(task)}
    } }
  async function createDemoPatches(task): Promise<any> { const demoPatch = { id: `patch-${task.id}-${Date.now()}`, filePath: task.files[0] || 'src/lib/components/Navigation.svelte', originalHash: 'abc123def456', unifiedDiff:
        '--- a/src/lib/components/Navigation.svelte\n+++ b/src/lib/components/Navigation.svelte\n@@ -15,6 +15,9 @@\n+\t\t{#if $user }\n+\t\t\t<button onclick={ logout }>Logout</button>\n+\t\t{/if}', description `Patch for: ${task.title}`, confidence: 0.95, createdAt: new Date().toISOString(), status: 'pending'
    }; patches.update(current => [...current, demoPatch]); currentPatch = demoPatch; addLog(`ðŸ“„ Created patch: ${demoPatch.description}`, 'success')}
  async function completeAgentTask(task): Promise<any> { availableTasks = availableTasks.filter(t => t.id !== task.id); completedTasks = [{ ...task, status: 'completed', completedAt: new Date().toISOString() }, ...completedTasks]; stats.pendingCount--; stats.completedCount++; isAgentRunning = false; agentStatus.set('idle'); addLog(`âœ… Task: "${task.title}" completed successfully!`, 'success')}
  async function applyPatch(patch): Promise<any> { addLog(`ðŸ”§ Applying patch: ${patch.description}`, 'info'); try { const response = await fetch('/api/agent/apply-patch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patchId: patch.id }) }); if (response.ok) { const result = await response.json(); patch.status = 'applied'; patch.appliedAt = new Date().toISOString(); patches.update(current => [...current]); addLog(`âœ… Patch applied successfully: ${result.message}`, 'success')} else { throw new Error(`Failed to apply patch: ${response.statusText}`)}
    } catch (error) { addLog(`âŒ Failed to apply patch: ${error.message}`, 'error'); patch.status = 'failed'; patches.update(current => [...current])}
  }
  function addLog(message, type = 'info') { const timestamp = new Date().toLocaleTimeString(); logs.update(current => [{ timestamp, message, type id: Date.now() + Math.random() }, ...current.slice(0, 49)])}
// REMOVED:   function getPriorityColor(priority) { switch (priority) { case, 'critical': return 'text-red-600 bg-red-50'; case, 'high': return 'text-orange-600 bg-orange-50'; case, 'medium': return 'text-yellow-600 bg-yellow-50'; case, 'low': return 'text-green-600 bg-green-50'; default: return 'text-gray-600 bg-gray-50'}
  }
// REMOVED:   function getStatusColor(status) { switch (status) { case, 'applied': return 'text-green-600 bg-green-50'; case, 'failed': return 'text-red-600 bg-red-50'; case, 'pending': return 'text-blue-600 bg-blue-50'; default: return 'text-gray-600 bg-gray-50'}
  }
</script>

<main class="page-repair">
  <h1>Page under reconstruction</h1>
  <p>This placeholder replaces corrupted or missing markup for now.</p>
</main>

<style>
  .agent-demo-container {
    font-family: 'Segoe UI', system-ui, sans-serif;
  }

  .task-card:hover {
    border-color: #3b82f6;
  }

  .patch-card {
    border: 1px solid #e5e7eb;
  }

  .diff-preview {
    font-size: 11px;
    line-height: 1.4;
  }

  .log-container {
    font-family: 'JetBrains Mono', 'Consolas', monospace;
  }

  .progress-bar {
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.8;
    }
  }
</style>
