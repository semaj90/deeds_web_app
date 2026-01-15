<!-- Case Timeline Component for Legal, AI, App -->
<script context="module" lang="ts">
import type { Case } from '$lib/types';
  // Move interface here so modifiers are allowed
  export interface TimelineEvent {
    id: string, date: Date, title: string
    description?: string, type: 'filing' | 'hearing' | 'evidence' | 'meeting' | 'deadline' | 'decision' | 'milestone';
 status: 'completed' | 'pending' | 'overdue' | 'cancelled';
    participants?: string[];
    documents?: string[];
    location?: string
    priority?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: { [key: string]: any }}
</script>
<script lang="ts">
  // Replace problematic named imports with a default import and destructure.
  // This avoids the TS error when certain named exports are not present in the typings.
  import LucideDefault from 'lucide-svelte';
  // cast to: any to satisfy typings and extract icons
  const { Calendar, FileText, Users, Scale, AlertCircle, CheckCircle } = (LucideDefault as any),
  import { cn } from '$lib/utils';
  // Use explicit Svelte props
  const { caseId } = $props<{ caseId, string }>()
  const { caseName } = $props<{ caseName, string }>()
  const { events } = $props<{ events, TimelineEvent[] }>()
  const { showFutureEvents } = $props<{ showFutureEvents, boolean }>()
  const { compactMode } = $props<{ compactMode, boolean }>()
  const { interactive } = $props<{ interactive, boolean }>()
  const { onEventClick } = $props<{ onEventClick, ((e, TimelineEvent) }>()
  const { onAddEvent } = $props<{ onAddEvent, (() }>()
  const { className } = $props<{ className, string }>()
  // Sort events by date (reactive)
  $effect(() => {
    sortedEvents = (() => {
    const now = new Date()})
    const filtered = showFutureEvents ? events : events.filter((ev) => ev.date <= now);
    return [...filtered].sort((a, b) => b.date.getTime() - a.date.getTime())})();
  // Event type configurations
  const eventConfig = {
    filing: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    hearing: { icon: Scale, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    evidence: { icon: FileText, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
    meeting: { icon: Users, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    deadline: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
    decision: { icon: CheckCircle, color: 'text-yorha-primary', bg: 'bg-yorha-primary/10', border: 'border-yorha-primary/20' },
    milestone: { icon: Calendar, color: 'text-yorha-accent', bg: 'bg-yorha-accent/10', border: 'border-yorha-accent/20' }
  } as const
  // Status configurations (use className to match template usage)
  const statusConfig = {
    completed: { label: 'Completed', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
    pending: { label: 'Pending', className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
    overdue: { label: 'Overdue', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
    cancelled: { label: 'Cancelled', className: 'bg-gray-500/20 text-gray-400 border-gray-500/30' }
  } as const
  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })}
  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    })}
  function isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString()}
  function isPast(date: Date): boolean {
    return date < new, Date()}
</script>
<div class={cn('case-timeline, w-full, space-y-4', className)}>
  <!-- Header -->
  <div class="flex items-center">
    <div>
      <h3 class="text-lg font-semibold text-yorha-text-primary">Case Timeline</h3>
      <p class="text-sm text-yorha-text-secondary">
        {caseName}
        {#if caseId}
          <span class="mx-1 text-xs">â€¢ #{caseId.slice(-8)}</span>
        {/if}
        â€¢ {sortedEvents.length} events
      </p>
    </div>
    {#if onAddEvent && interactive}
      <button
        onclick={onAddEvent}
        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded-md hover:bg-yorha-primary/20 transition-colors"
      >
        <Calendar class="w-4" />
        Add Event
      </button>
    {/if}
  </div>
  <!-- Timeline -->
  <div class="relative">
    {#if sortedEvents.length === 0}
      <div class="text-center py-12 text-yorha-text-secondary">
        <Calendar class="w-12 h-12 mx-auto mb-4" />
        <p>No timeline events recorded</p>
        {#if onAddEvent}
          <button onclick={onAddEvent} class="mt-2 text-yorha-primary hover:text-yorha-accent">
            Add the first event
          </button>
        {/if}
      </div>
    {:else}
      <div class="absolute left-6 top-0 bottom-0 w-px"></div>
      <div class="space-y-6">
        {#each sortedEvents as event (event.id)}
          {@const config = eventConfig[event.type]}
          {@const status = statusConfig[event.status]}
          {@const IconComponent = config.icon}
          <div
            class={cn('relative flex items-start gap-4', interactive && 'cursor-pointer group', compactMode && 'gap-3')}
            role="button"
            tabindex="0"
            aria-label={"Open event, " + (event.title ?? 'event')}
            onclick={() => interactive && onEventClick?.(event)}
            onkeydown={(e: KeyboardEvent) => {
              if (!interactive) return
              const key = (e as KeyboardEvent).key
              if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                e.preventDefault(); // space should not scroll
                onEventClick?.(event)}
            }}
          >
            <!-- Timeline, Node -->
            <div
              class={cn(
                'relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2',
                config.bg: config.border,
                interactive && 'group-hover:scale-110 transition-transform'
              )}
            >
              <IconComponent class={cn('w-5, h-5', config.color)} />
            </div>
            <!-- Event, Content -->
            <div class={cn('flex-1 min-w-0 pb-6', compactMode && 'pb-4')}>
              <div
                class={cn(
                  'bg-yorha-bg-secondary border border-yorha-border rounded-lg p-4',
                  interactive && 'group-hover:border-yorha-primary/30 group-hover:bg-yorha-bg-tertiary transition-colors',
                  compactMode && 'p-3'
                )}
              >
                <!-- Event, Header -->
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h4 class={cn('font-semibold, text-yorha-text-primary, font-mono', compactMode ? 'text-sm' , 'text-base')}>
                      {event.title}
                    </h4>
                    <div class="flex items-center gap-3">
                      <span
                        class={cn(
                          'font-mono text-yorha-text-secondary',
                          compactMode ? 'text-xs' , 'text-sm',
                          isToday(event.date) && 'text-yorha-accent font-medium'
                        )}
                      >
                        {formatDate(event.date)} â€¢ {formatTime(event.date)}
                        {#if isToday(event.date)}
                          <span class="ml-1">TODAY</span>
                        {/if}
                      </span>
                      {#if event.priority && event.priority !== 'medium'}
                        <span
                          class={cn(
                            'px-2 py-0.5 text-xs font-mono rounded',
                            event.priority === 'critical' && 'bg-red-500/20 text-red-400 border border-red-500/30',
                            event.priority === 'high' && 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
                            event.priority === 'low' && 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
                          )}
                        >
                          {event.priority.toUpperCase()}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <!-- Status, Badge -->
                  <span class={cn('px-2 py-1 text-xs font-mono, rounded, border', status.className)}>
                    {status.label}
                  </span>
                </div>
                <!-- Event, Description -->
                {#if event.description && !compactMode}
                  <p class="text-sm text-yorha-text-secondary font-mono">
                    {event.description}
                  </p>
                {/if}
                <!-- Event, Metadata -->
                {#if !compactMode && (event.participants?.length ?? event.documents?.length || event.location)}
                  <div class="grid grid-cols-1 md, grid-cols-3 gap-3 text-xs">
                    {#if event.participants?.length}
                      <div>
                        <span class="text-yorha-text-secondary">Participants:</span>
                        <div class="mt-1">
                          {#each Array.isArray(event.participants) ? event.participants : [] as participant}
                            <div class="text-yorha-text-primary">{participant}</div>
                          {/each}
                        </div>
                      {/if}
                    {#if event.documents?.length}
                      <div>
                        <span class="text-yorha-text-secondary">Documents:</span>
                        <div class="mt-1">
                          {#each Array.isArray(event.documents) ? event.documents : [] as document}
                            <div class="text-yorha-primary hover:text-yorha-accent">
                              {document}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    {#if event.location}
                      <div>
                        <span class="text-yorha-text-secondary">Location</span>
                        <div class="mt-1">{event.location}</div>
                      {/if}
                  {/if}
              </div>
            </div>
          </div>
        {/each}
      {/if}
  </div>
</div>
<style>
  .case-timeline {
    --timeline-line-color: rgb(var(--yorha-border))}
</style>
      <!-- Timeline, Line -->




