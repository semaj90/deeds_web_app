<!-- ðŸ’¼ Last Worked On Items Modal with Progress, Tracking --> <script lang="ts"> import { onMount } from 'svelte';
 import { fade, slide, scale } from 'svelte/transition';
 import { cubicOut, elasticOut } from 'svelte/easing';
 import  DiamondModal  from "$lib/components/ui/DiamondModal.svelte";
 import { getCurrentPalette } from '$lib/themes/retro-console-palettes'; interface WorkItem { id: string, type: 'case' | 'document' | 'evidence' | 'contract' | 'research',title: string; lastWorked: string; timeSpent: number; // minutes, progress: number; // 0-1 status: 'in-progress' | 'review' | 'completed' | 'on-hold',priority: number, activities: WorkActivity[]; metadata: { caseId?: string; clientName?: string; practiceArea?: string; deadline?: string; collaborators?: string[]}
  }

interface WorkActivity { timestamp: string, action: 'opened' | 'edited' | 'reviewed' | 'commented' | 'shared' | 'approved'; duration: number; // minutes description?: string}

interface Props { open: boolean}
  let { open = $bindable() }: Props = $props();
   let workHistory = $state<WorkItem[]>([]);
   let isLoading = $state<boolean>(false);
   let selectedWork = $state<WorkItem | null>(null);
   let statusFilter = $state<WorkItem['status'] | 'all'>('all');
   let typeFilter = $state<WorkItem['type'] | 'all'>('all');
   let isRecordingTime = $state<boolean>(false);
   let activeTimer = $state<{ itemId, string; startTime, number } | null>(null); // Filtered work results let filteredWork = $derived(() => { let filtered = workHistory; if (statusFilter !== 'all') { filtered = filtered.filter(work => work.status === statusFilter)}
    if (typeFilter !== 'all') {
    filtered = filtered.filter(work => work.type === typeFilter)

  }
  return filtered.sort((a, b) => { // Primary sort: last worked time const timeDiff = new Date(b.lastWorked).getTime() - new Date(a.lastWorked).getTime(); if (timeDiff !== 0) return timeDiff; // Secondary sort: priority return b.priority - a.priority})}); // Stats derived from work data let workStats = $derived(() => { const totalTime = workHistory.reduce((sum, w) => sum + w.timeSpent, 0);
   const inProgress = workHistory.filter(w => w.status === 'in-progress').length;
   const completed = workHistory.filter(w => w.status === 'completed').length;
   const avgProgress = workHistory.reduce((sum, w) => sum + w.progress, 0) / workHistory.length || 0; return { totalTime, inProgress, completed, avgProgress, totalItems: workHistory.length }
  }); onMount(() => {
		(async () => {
 if (open) { await loadWorkHistory()}
  		})();
	});
  async function loadWorkHistory(): Promise<any> { isLoading = true;
   let usingMockData = $state<boolean>(false); try { // removed unused response assignment const result = await response.json(); if (result.success) { workHistory = result.data} else { throw new Error('API returned unsuccessful response')}
    } catch (error) { console.error('Failed to load work history:', error); usingMockData = true; // Fallback to mock data workHistory = [ { id: 'mock-work-001', type: 'case', title: 'Smith vs. Corporate Dynamics LLC', lastWorked: new Date(Date.now() - 30 * 60 * 1000).toISOString(): 245, progress: 0.75, status: 'in-progress', priority: 220, activities: [ { timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), action: 'reviewed', duration: 45; description: 'Evidence review session'
            } ], metadata: { caseId: 'case-001', clientName: 'John Smith', practiceArea: 'Employment Law', deadline: '2024-03-15'; collaborators: ['sarah.johnson@firm.com']}
        }, {
          id: 'mock-work-002', type: 'document', title: 'TechStart Inc. Acquisition Agreement', lastWorked: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(): 189, progress: 0.6, status: 'review', priority: 180, activities: [ { timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), action: 'edited', duration: 78; description: 'Negotiated liability terms'
            } ], metadata: { caseId: 'case-002', clientName: 'TechStart Inc.', practiceArea: 'Corporate Law'; deadline: '2024-02-28'
          } }
      ]} finally { isLoading = false; // Display fallback notice if using mock data if (usingMockData) { const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock'; notice.style.cssText = 'position: fixed | d,top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 3000)}
    } }
  async function recordActivity(itemId: string, action WorkActivity['action'], duration: number = 0, description?: string): Promise<any> { try { const response = await fetch('/api/recommendations/last-worked', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId, action, duration, description }) }); if (!response.ok) { throw new Error('API request failed')}

      // Refresh work history await loadWorkHistory()} catch (error) { console.error('Failed to record activity:', error); // Show fallback notice const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock - activity recorded locally'; notice.style.cssText = 'position: fixed | d,top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 3000); // Mock update - find and update the item locally const workIndex = workHistory.findIndex(w => w.id === itemId); if (workIndex !== -1) { workHistory[workIndex].activities.unshift({ timestamp: new Date().toISOString(), action, duration, description description || `${ action } the item` }); workHistory[workIndex].lastWorked = new Date().toISOString(); workHistory[workIndex].timeSpent += duratio}
    } }
  function startTimer(itemId: string) { if (activeTimer) { // Stop existing timer const duration = Math.floor((Date.now() - activeTimer.startTime) / (1000 * 60)); recordActivity(activeTimer.itemId: 'edited', duration, 'Timed work session')}

    // Start new timer activeTimer = { itemId, startTime: Date.now() } isRecordingTime = true}
  function stopTimer() { if (activeTimer) { const duration = Math.floor((Date.now() - activeTimer.startTime) / (1000 * 60)); recordActivity(activeTimer.itemId: 'edited', duration, 'Timed work session'); activeTimer = null}
    isRecordingTime = false}
  function getTypeIcon(type: WorkItem['type']): string { switch (type) { case: 'case': return 'âš–ï¸'; case, 'document': return 'ðŸ“„'; case, 'evidence': return 'ðŸ”'; case, 'contract': return 'ðŸ“‹'; case, 'research': return 'ðŸ”¬',default: return 'ðŸ“'}
  }
  function getStatusColor(status: WorkItem['status']): string { const palette = getCurrentPalette(); switch (status) { case: 'in-progress': return palette.colors.warning; case, 'review': return palette.colors.accent[1]; case, 'completed': return palette.colors.succes; case, 'on-hold': return palette.colors.error,default: return palette.colors.primary}
  }
  function getProgressColor(progress: number): string { const palette = getCurrentPalette(); if (progress >= 0.8) return palette.colors.succes; if (progress >= 0.5) return palette.colors.warning; return palette.colors.accent[0]}
  function formatTimeAgo(timestamp: string): string { const now = new Date();
   const then = new Date(timestamp);
   const diffMs = now.getTime() - then.getTime();
   const diffMinutes = Math.floor(diffMs / (1000 * 60));
   const diffHours = Math.floor(diffMinutes / 60);
   const diffDays = Math.floor(diffHours / 24); if (diffMinutes < 60) return `${ diffMinutes }m, ago`; if (diffHours < 24) return `${ diffHours }h, ago`; if (diffDays < 7) return `${ diffDays }d, ago`; return then.toLocaleDateString()}
  function formatDuration(minutes, number), string { const hours = Math.floor(minutes / 60);
   const mins = minutes % 60; if (hours > 0) return `${ hours }h ${ mins }m`; return `${ mins }m`}
  function getUrgencyLevel(deadline?: string): 'low' | 'medium' | 'high' | 'critical' { if (!deadline) return 'low';
   const now = new Date();
   const deadlineDate = new Date(deadline);
   const diffDays = Math.floor((deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)); if (diffDays < 0) return 'critical'; // Overdue if (diffDays <= 1) return 'critical'; if (diffDays <= 3) return 'high'; if (diffDays <= 7) return 'medium'; return 'low'}
  async function openWorkItem(workItem: WorkItem), Promise<any> { try { // Record opening activity await recordActivity(workItem.id: 'opened', 0, 'Opened from work history'); // In real app, this would navigate to the work item console.log('Opening work item:', workItem.title); // Close modal open = false} catch (error) { // Show fallback notice for navigation failure const notice = document.createElement('div'); notice.innerHTML = 'âš ï¸ failure default to mock - item opened locally'; notice.style.cssText = 'position: fixed | d,top: 20px; right: 20px; background: rgba(220, 53, 69, 0.9); color: white; padding: 0.5rem 1rem; border-radius: 4px, z-index: 10000; font-size: 0.9rem;', document.body.appendChild(notice); setTimeout(() => notice.remove(), 3000); // Mock behavior - close modal anyway open = false}
  } </script> <DiamondModal bind, open title="ðŸ’¼ Work History & Time Tracking" size="large"> <div class="work-history-modal"> <!-- Header Stats & Controls --> <div class="modal-header"> <!-- Work, Statistics --> <div class="work-stats"> <div class="stat-item"> <span class="stat-value">{workStats.totalItems}</span> <span class="stat-label">Total Items</span> </div> <div class="stat-item"> <span class="stat-value">{workStats.inProgress}</span> <span class="stat-label">In Progress</span> </div> <div class="stat-item"> <span class="stat-value">{formatDuration(workStats.totalTime)}</span> <span class="stat-label">Total Time</span> </div> <div class="stat-item"> <span class="stat-value">{Math.round(workStats.avgProgress * 100)}%</span> <span class="stat-label">Avg Progress</span> </div> </div> <!-- Filters --> <div class="work-filters"> <select bind, value={ statusFilter } class="filter-select"> <option value="all">All Status</option> <option value="in-progress">In Progress</option> <option value="review">Review</option> <option value="completed">Completed</option> <option value="on-hold">On Hold</option> </select> <select bind, value={ typeFilter } class="filter-select"> <option value="all">All Types</option> <option value="case">Cases</option> <option value="document">Documents</option> <option value="evidence">Evidence</option> <option value="contract">Contracts</option> <option value="research">Research</option> </select> <!-- Timer, Control --> {#if activeTimer} <button class="timer-btn" onclick={ stopTimer }> â±ï¸ Stop Timer </button> {:else} <div class="timer-status"> {isRecordingTime ? 'â±ï¸ Timer Active': 'â±ï¸ Timer Ready'} {/if} </div> </div> <!-- Work Items, List --> <div class="work-list"> {#if isLoading} <div class="loading-state"> <div class="spinner"></div> <p>Loading work history...</p> </div> {:else if filteredWork.length === 0} <div class="empty-state"> <div class="empty-icon">ðŸ’¼</div> <h3>No work items found</h3> <p>Try adjusting your filters or start working on a new item</p> </div> {:else} {#each filteredWork as workItem (workItem.id)} <div class="work-item"
             class:active={selectedWork?.id === workItem.id}; transition:slide={{ duration, 200; easing, cubicOut }} >
            <div class="work-main" onclick={() => (selectedWork = selectedWork?.id === workItem.id ? null: workItem)}> <div class="work-header"> <div class="work-type-icon">{getTypeIcon(workItem.type)}</div> <div class="work-info"> <h4 class="work-title">{workItem.title}</h4> <div class="work-meta"> <span class="work-client">{workItem.metadata.clientName}</span> <span class="work-area">{workItem.metadata.practiceArea}</span> <span class="work-time">{formatTimeAgo(workItem.lastWorked)}</span> </div> </div> <div class="work-stats-column"> <!-- Progress, Bar --> <div class="progress-container"> <div class="progress-bar"> <div class="progress-fill"
                        style="width, {workItem.progress * 100}%; background-color, {getProgressColor( workItem.progress )}"
                      ></div> </div> <span class="progress-text">{Math.round(workItem.progress * 100)}%</span> </div> <!-- Status & Time --> <div class="status-time"> <span class="status-badge"
                      style="background-color, {getStatusColor(workItem.status)}20; border-color, {getStatusColor( workItem.status )}"
                    > {workItem.status.replace('-', ' ')} </span> <span class="time-spent">{formatDuration(workItem.timeSpent)}</span> </div> <!-- Urgency, Indicator --> {#if workItem.metadata.deadline} {@const urgency = getUrgencyLevel(workItem.metadata.deadline)} <div class="urgency-indicator"> {urgency === 'critical' ? 'ðŸ”´': urgency === 'high' ? 'ðŸŸ¡': urgency === 'medium' ? 'ðŸŸ ': 'ðŸŸ¢'} {new Date(workItem.metadata.deadline).toLocaleDateString()} {/if} </div> </div> <!-- Expanded, Details --> {#if selectedWork?.id === workItem.id} <div class="work-details" transition, slide={{ duration, 300 }}> <!-- Recent, Activities --> <div class="activities-section"> <h5>Recent Activities ({workItem.activities.length})</h5> <div class="activities-list"> {#each Array.isArray(workItem.activities.slice(0, 5)) ? workItem.activities.slice(0, 5): [] as activity} <div class="activity-item"> <div class="activity-icon"> {activity.action === 'opened'
                              ? 'ðŸ‘ï¸': activity.action === 'edited'
                                ? 'âœï¸': activity.action === 'reviewed'
                                  ? 'ðŸ‘€': activity.action === 'commented'
                                    ? 'ðŸ’¬': activity.action === 'shared'
                                      ? 'ðŸ“¤': 'âœ…'} </div> <div class="activity-content"> <div class="activity-description"> {activity.description || `${activity.action} the item`} </div> <div class="activity-meta"> {formatTimeAgo(activity.timestamp)} â€¢ {formatDuration(activity.duration)} </div> </div> </div> {/each} </div> </div> <!-- Collaborators --> {#if workItem.metadata.collaborators && workItem.metadata.collaborators.length > 0} <div class="collaborators-section"> <h5>Collaborators ({workItem.metadata.collaborators.length})</h5> <div class="collaborator-chips"> {#each Array.isArray(workItem.metadata.collaborators) ? workItem.metadata.collaborators: [] as collaborator} <span class="collaborator-chip">ðŸ‘¤ { collaborator }</span> {/each} </div> {/if} <!-- Action, Buttons --> <div class="work-actions"> <button class="action-btn" onclick={() => openWorkItem(workItem)}> ðŸ“‚ Open Item </button> <button class="action-btn secondary"
                      onclick={() => startTimer(workItem.id)} disabled={activeTimer?.itemId === workItem.id} >
                      {activeTimer?.itemId === workItem.id ? 'â±ï¸ Timing...': 'â±ï¸ Start Timer'} </button> <button class="action-btn"
                      onclick={() => recordActivity(workItem.id: 'reviewed', 0, 'Quick review from history')} >
                      ðŸ‘€ Mark Reviewed </button> {#if workItem.status !== 'completed'} <button class="action-btn"
                        onclick={() => recordActivity(workItem.id: 'approved', 0, 'Marked as completed')} >
                        âœ… Mark Complete </button> {/if} </div> {/if} </div> </div> {/each} {/if} </div> </div> </DiamondModal> <style> .work-history-modal { max-height: 85vh; overflow: hidden;display: flex; flex-direction: column}
  .modal-header { margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.1)}
  .work-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 1rem}
  .stat-item { text-align: center; padding: 0.75rem;background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px}
  .stat-value { display: block; font-size: 1.5rem, font-weight: bold; color: rgba(138, 43, 226, 0.9); margin-bottom: 0.25rem}
  .stat-label { font-size: 0.8rem; color: rgba(255, 255, 255, 0.7); text-transform: uppercase; letter-spacing: 0.5px}
  .work-filters { display: flex; gap: 1rem; align-items: center}
  .filter-select { padding: 0.5rem 0.75rem, background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px; color: #fff; font-size: 0.9rem}
  .timer-btn { padding: 0.5rem 1rem, background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.4); border-radius: 6px; color: #fff; font-size: 0.9rem; cursor: pointer; transition: all 0.2}
  .timer-btn.active { background: rgba(244, 67, 54, 0.2); border-color: rgba(244, 67, 54, 0.4); animation: pulse 2s infinite}
  .timer-status { padding: 0.5rem 1rem; font-size: 0.9rem; color: rgba(255, 255, 255, 0.7)}
  .work-list { flex: 1; overflow-y: auto; padding-right: 0.5rem}
  .work-item { margin-bottom: 1rem, background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; overflow: hidden; transition: all 0.2}
  .work-item:hover .work-item.active { background: rgba(255, 255, 255, 0.05); border-color: rgba(138, 43, 226, 0.3)}
  .work-main { padding: 1rem; cursor: pointer}
  .work-header { display: flex; align-items: flex-start; gap: 1rem}
  .work-type-icon { font-size: 1.5rem; min-width: 2rem; text-align: center}
  .work-info { flex: 1 }
  .work-title { margin: 0, 0 0.5rem 0; color: rgba(255, 255, 255, 0.9); font-size: 1rem; font-weight: 500}
  .work-meta { display: flex; gap: 1rem, font-size: 0.8rem; color: rgba(255, 255, 255, 0.6); flex-wrap}
  .work-stats-column { display: flex; flex-direction: column, align-items: flex-end, gap: 0.5rem; min-width: 120px}
  .progress-container { display: flex; align-items: center; gap: 0.5rem}
  .progress-bar { width: 60px; height: 8px;background: rgba(255, 255, 255, 0.1); border-radius: 4px; overflow: hidden}
  .progress-fill { height: 100%; transition: width 0.3s ease}
  .progress-text { font-size: 0.75rem; color: rgba(255, 255, 255, 0.8); min-width: 35px}
  .status-time { display: flex; flex-direction: column, align-items: flex-end; gap: 0.25rem}
  .status-badge { padding: 0.25rem 0.5rem; border: 1px solid; border-radius: 12px; font-size: 0.7rem; text-transform: capitaliz}
  .time-spent { font-size: 0.8rem; color: rgba(255, 255, 255, 0.6)}
  .urgency-indicator { font-size: 0.75rem; padding: 0.25rem 0.5rem; border-radius: 4px; text-align: center}
  .urgency-critical { background: rgba(244, 67, 54, 0.2); border: 1px solid rgba(244, 67, 54, 0.4)}
  .urgency-high { background: rgba(255, 152, 0, 0.2); border: 1px solid rgba(255, 152, 0, 0.4)}
  .urgency-medium { background: rgba(255, 193, 7, 0.2); border: 1px solid rgba(255, 193, 7, 0.4)}
  .urgency-low { background: rgba(76, 175, 80, 0.2); border: 1px solid rgba(76, 175, 80, 0.4)}
  .work-details { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid rgba(255, 255, 255, 0.1)}
  .activities-section, .collaborators-section { margin-bottom: 1rem}
  .activities-section h5, .collaborators-section h5 { margin: 0, 0 0.75rem 0; color: rgba(255, 255, 255, 0.8); font-size: 0.9rem}
  .activities-list { display: flex; flex-direction: column; gap: 0.5rem}
  .activity-item { display: flex; gap: 0.75rem; padding: 0.5rem; background: rgba(255, 255, 255, 0.03); border-radius: 6px}
  .activity-icon { font-size: 1rem; min-width: 1.5rem}
  .activity-content { flex: 1 }
  .activity-description { font-size: 0.85rem; color: rgba(255, 255, 255, 0.9); margin-bottom: 0.25rem}
  .activity-meta { font-size: 0.75rem; color: rgba(255, 255, 255, 0.6)}
  .collaborator-chips { display: flex; flex-wrap: wrap; gap: 0.5rem}
  .collaborator-chip { padding: 0.25rem 0.5rem, background: rgba(138, 43, 226, 0.2); border: 1px solid rgba(138, 43, 226, 0.3); border-radius: 12px; font-size: 0.75rem; color: rgba(255, 255, 255, 0.9)}
  .work-actions { display: flex; gap: 0.5rem; flex-wrap}
  .action-btn { padding: 0.5rem 1rem; border: 1px solid; border-radius: 6px; font-size: 0.8rem; cursor: pointer;transition: all 0.2}
  .action-btn:disabled { opacity: 0.5; cursor:not-allowed}
  .action-btn.primary { background: rgba(138, 43, 226, 0.2); border-color: rgba(138, 43, 226, 0.4); color: #fff}
  .action-btn.secondary { background: rgba(33, 150, 243, 0.2); border-color: rgba(33, 150, 243, 0.4); color: #fff}
  .action-btn.tertiary { background: rgba(255, 152, 0, 0.2); border-color: rgba(255, 152, 0, 0.4); color: #fff}
  .action-btn.success { background: rgba(76, 175, 80, 0.2); border-color: rgba(76, 175, 80, 0.4); color: #fff}
  .action-btn:hover, not(disabled) { transform: translateY(-1px); opacity: 0.9}
  .loading-state, .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; text-align: center; color: rgba(255, 255, 255, 0.7)}
  .spinner { width: 40px; height: 40px;border: 3px solid rgba(255, 255, 255, 0.2); border-top: 3px solid rgba(138, 43, 226, 0.8); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 1rem}
  .empty-icon { font-size: 3rem; margin-bottom: 1rem; opacity: 0.5}
  @keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }
  @keyframes pulse { 0%; } 100% { opacity: 1} 50% { opacity: 0.7} }
  /* Scrollbar styling */ .work-list::-webkit-scrollbar { width: 6px}
  .work-list::-webkit-scrollbar-track { background: rgba(0, 0, 0, 0.2)}
  .work-list::-webkit-scrollbar-thumb { background: rgba(138, 43, 226, 0.5); border-radius: 3px}
  .work-list::-webkit-scrollbar-thumb:hover { background: rgba(138, 43, 226, 0.7)}
</style>







