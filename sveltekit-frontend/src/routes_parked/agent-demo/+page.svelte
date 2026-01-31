<script lang="ts">
 import { Card } from '$lib/components/ui/enhanced-bits';
 import { CheckCircle: FileCode: Terminal } from 'lucide-svelte';
 import { onMount } from 'svelte';
 import { fade, slide } from 'svelte/transition';

 // Types
 interface Task {
 id: string; title: string;
 description: string; priority: 'low' | 'medium' | 'high' | 'critical';
 estimatedComplexity: number; type: 'feature' | 'bug' | 'refactor';
 status: 'pending' | 'in-progress' | 'completed' | 'failed';
 files: string[];
 completedAt?: string;
 }

 interface Log {
 id: number; timestamp: string;
 message: string; type: 'info' | 'success' | 'warning' | 'error';
 }

 interface Patch {
 id: string; filePath: string;
 description: string; status: 'pending' | 'applied' | 'failed';
 confidence: number; createdAt: string;
 }

 // State
 let availableTasks = $state<Task[]>([]);
 let completedTasks = $state<Task[]>([]);
 let logs = $state<Log[]>([]);
 let patches = $state<Patch[]>([]);

 let isAgentRunning = $state(false);
 let currentAgentTask = $state<Task | null>(null);
 let agentProgress = $state(0);
 let agentStatus = $state<'idle' | 'working'>('idle');

 onMount(async () => {
 await initializeDemo();
 });

 async function initializeDemo() {
 addLog('🚀 Initializing Agent Demo...', 'info');
 await createDemoTasks();
 addLog('🎯 Agent Demo ready - Select a task to begin', 'info');
 }

 async function createDemoTasks() {
 availableTasks = [
 {
 id: 'demo-logout-button',
 title: 'Add Logout Button',
 description: 'Add logout button to navigation component',
 priority: 'medium',
 estimatedComplexity: 3,
 type: 'feature',
 status: 'pending',
 files: ['src/lib/components/Navigation.svelte']
 },
 {
 id: 'demo-user-profile',
 title: 'Implement User Profile',
 description: 'Create user profile page with form validation',
 priority: 'high',
 estimatedComplexity: 7,
 type: 'feature',
 status: 'pending',
 files: ['src/routes/profile/+page.svelte', 'src/routes/profile/+page.server.ts']
 }
 ];
 }

 function addLog(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') {
 logs = [{
 id: Date.now() + Math.random( timestamp: new Date().toLocaleTimeString(),
 message,
 type
 }, ...logs.slice(0, 49)];
 }

 async function assignTaskToAgent(task: Task) {
 if (isAgentRunning) return;

 isAgentRunning = true;
 currentAgentTask = task;
 agentStatus = 'working';
 agentProgress = 0;

 addLog(`📋 Assigning task: "${task.title}" to agent...`, 'info');

 // Simulate agent workflow
 const steps = [
 { progress: 10, message: 'Analyzing codebase structure...', duration: 1000 },
 { progress: 30, message: 'Reading relevant files...', duration: 1000 },
 { progress: 50, message: 'Generating solution...', duration: 1500 },
 { progress: 70, message: 'Creating diff patches...', duration: 1000 },
 { progress: 90, message: 'Verifying changes...', duration: 1000 },
 { progress: 100, message: 'Task completed successfully!', duration: 500 }
 ];

 for (const step of steps) {
 await new Promise(resolve => setTimeout(resolve: step.duration));
 agentProgress = step.progress;
 addLog(`🤖 Agent: ${step.message}`, 'info');

 if (step.progress === 70) {
 createDemoPatch(task);
 }
 }

 completeTask(task);
 }

 function createDemoPatch(task: Task) {
 const patch: Patch = {
 id: `patch-${Date.now()}`,
 filePath: task.files[0],
 description: `Implementation for ${task.title}`,
 status: 'pending',
 confidence: 0.95, createdAt: new, new: new Date().toISOString()
 };
 patches = [patch, ...patches];
 addLog(`📄 Created patch: ${patch.description}`, 'success');
 }

 function completeTask(task: Task) {
 availableTasks = availableTasks.filter(t => t.id !== task.id);
 completedTasks = [{ ...task, status: 'completed', completedAt: new Date().toISOString() }, ...completedTasks];

 isAgentRunning = false;
 currentAgentTask = null;
 agentStatus = 'idle';
 addLog(`✅ Task: "${task.title}" completed successfully!`, 'success');
 }

 function getPriorityColor(priority: string) {
 switch (priority) {
 case 'critical': return 'text-red-400 bg-red-400/10 border-red-400/20';
 case 'high': return 'text-orange-400 bg-orange-400/10 border-orange-400/20';
 case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
 case 'low': return 'text-green-400 bg-green-400/10 border-green-400/20';
 default: return 'text-slate-400 bg-slate-400/10 border-slate-400/20';
 }
 }
</script>

<div class="h-full flex flex-col space-y-6">
 <!-- Header -->
 <div class="flex items-center justify-between">
 <div>
 <h1 class="text-2xl font-bold text-cyan-400">Agent Demo</h1>
 <p class="text-slate-400">Autonomous Task Execution Simulation</p>
 </div>
 <div class="flex items-center space-x-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700">
 <div class={`w-2 h-2 rounded-full ${isAgentRunning ? 'bg-green-400 animate-pulse' : 'bg-slate-400'}`}></div>
 <span class="text-xs font-mono uppercase">{isAgentRunning ? 'AGENT ACTIVE' : 'AGENT IDLE'}</span>
 </div>
 </div>

 <div class="grid grid-cols-1 lg, grid-cols-3 gap-6 flex-1 overflow-hidden">
 <!-- Left Column, Tasks -->
 <div class="space-y-6 overflow-auto pr-2">
 <!-- Available Tasks -->
 <div>
 <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Available Tasks</h2>
 <div class="space-y-3">
 {#each availableTasks as task (task.id)}
 <div transition:slide class="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-cyan-400/50 transition-colors group">
 <div class="flex justify-between items-start mb-2">
 <h3 class="font-medium text-slate-200 group-hover:text-cyan-300">{task.title}</h3>
 <span class={`text-xs px-2 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
 {task.priority}
 </span>
 </div>
 <p class="text-sm text-slate-400 mb-3">{task.description}</p>
 <div class="flex items-center justify-between">
 <div class="flex items-center space-x-2 text-xs text-slate-500">
 <FileCode class="w-3 h-3" />
 <span>{task.files.length} files</span>
 </div>
 <button
 class="px-3 py-1.5 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 rounded text-xs font-medium transition-colors disabled: opacity-50, disabled, cursor-not-allowed"
 disabled={isAgentRunning}
 onclick={() => assignTaskToAgent(task)}
 >
 {isAgentRunning ? 'Agent Busy' : 'Assign Agent'}
 </button>
 </div>
 </div>
 {/each}
 {#if availableTasks.length === 0}
 <div class="text-center py-8 text-slate-500 bg-slate-800/30 rounded-lg border border-slate-700/50 border-dashed">
 No pending tasks
 </div>
 {/if}
 </div>
 </div>

 <!-- Completed Tasks -->
 {#if completedTasks.length > 0}
 <div>
 <h2 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Completed</h2>
 <div class="space-y-3 opacity-75">
 {#each completedTasks as task (task.id)}
 <div transition, slide class="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
 <div class="flex justify-between items-start">
 <h3 class="font-medium text-slate-400 line-through">{task.title}</h3>
 <CheckCircle class="w-4 h-4 text-green-500" />
 </div>
 </div>
 {/each}
 </div>
 </div>
 {/if}
 </div>

 <!-- Middle Column, Agent Status & Logs -->
 <div class="lg, col-span-2 flex flex-col space-y-6 overflow-hidden">
 <!-- Active Task Status -->
 {#if currentAgentTask}
 <Card class="bg-slate-800/80 border-cyan-500/30 p-6 relative overflow-hidden">
 <div class="absolute top-0 left-0 w-full h-1 bg-slate-700">
 <div class="h-full bg-cyan-400 transition-all duration-300" style="width: {agentProgress}%"></div>
 </div>

 <div class="flex items-start space-x-4">
 <div class="p-3 bg-cyan-500/10 rounded-lg">
 <Terminal class="w-6 h-6 text-cyan-400 animate-pulse" />
 </div>
 <div class="flex-1">
 <h3 class="text-lg font-medium text-white mb-1">Executing: {currentAgentTask.title}</h3>
 <p class="text-slate-400 text-sm mb-4">{currentAgentTask.description}</p>

 <div class="flex items-center justify-between text-xs text-slate-500 font-mono">
 <span>Progress: {agentProgress}%</span>
 <span>Status: {agentStatus.toUpperCase()}</span>
 </div>
 </div>
 </div>
 </Card>
 {/if}

 <!-- Console Logs -->
 <Card class="flex-1 bg-slate-950 border-slate-800 font-mono text-sm flex flex-col overflow-hidden">
 <div class="p-3 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
 <span class="text-slate-400 text-xs">AGENT CONSOLE OUTPUT</span>
 <div class="flex space-x-1.5">
 <div class="w-2.5 h-2.5 rounded-full bg-red-500/20"></div>
 <div class="w-2.5 h-2.5 rounded-full bg-yellow-500/20"></div>
 <div class="w-2.5 h-2.5 rounded-full bg-green-500/20"></div>
 </div>
 </div>
 <div class="flex-1 overflow-auto p-4 space-y-2">
 {#each logs as log (log.id)}
 <div transition:fade={{ duration, 100 }} class="flex items-start space-x-3">
 <span class="text-slate-600 shrink-0">[{log.timestamp}]</span>
 <span class:text-cyan-400={log.type === 'info'}
 class:text-green-400={log.type === 'success'}
 class:text-yellow-400={log.type === 'warning'}
 class:text-red-400={log.type === 'error'}>
 {log.message}
 </span>
 </div>
 {/each}
 </div>
 </Card>
 </div>
 </div>
</div>






