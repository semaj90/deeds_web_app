<!-- Case Timeline Component for Legal AI App -->
<script context="module" lang="ts">
  export interface TimelineEvent { id: string, date: Date;
    title: string;
    description?: string;
	type: 'filing' | 'hearing' | 'evidence' | 'meeting' | 'deadline' | 'decision' | 'milestone';
    status: 'completed' | 'pending' | 'overdue' | 'cancelled';
    participants?: string[];
    documents?: string[];
    location?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, unknown>;
  }
</script>

<script lang="ts">
  import { cn } from '$lib/utils';

  interface Props {
    caseId?: string;
    caseName?: string;
    events?: TimelineEvent[];
    showFutureEvents?: boolean;
    compactMode?: boolean;
    interactive?: boolean;
    onEventClick?: (e: TimelineEvent) => void;
    onAddEvent?: () => void;
    class?: string;
  }

  let {
    caseId = '',
    caseName = '',
    events = [],
    showFutureEvents = true,
    compactMode = false,
    interactive = true,
    onEventClick,
    onAddEvent,
    class: className = ''
  }: Props = $props();

  // Sort events by date (reactive)
  let sortedEvents = $derived.by(() => {
    const now = new Date();
    const filtered = showFutureEvents ? events : events.filter((ev) => ev.date <= now);
    return [...filtered].sort((a, b) => b.date.getTime() - a.date.getTime());
  });

  // Event type configurations
  const eventConfig = { filing: { icon: '📄', color: 'text-info/80', bg: 'bg-info/10', border: 'border-info/20' },
	hearing: {
	icon: '⚖️', color: 'text-info/80', bg: 'bg-info/10', border: 'border-info/20' },
	evidence: {
	icon: '📋', color: 'text-accent', bg: 'bg-accent/10', border: 'border-accent/20' },
	meeting: {
	icon: '👥', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20' },
	deadline: {
	icon: '⚠️', color: 'text-danger/80', bg: 'bg-danger/10', border: 'border-danger/20' },
	decision: {
	icon: '✅', color: 'text-yorha-primary', bg: 'bg-yorha-primary/10', border: 'border-yorha-primary/20' },
	milestone: {
	icon: '📅', color: 'text-yorha-accent', bg: 'bg-yorha-accent/10', border: 'border-yorha-accent/20' }
  } as const;

  // Status configurations
  const statusConfig = { completed: { label: 'Completed', className: 'bg-accent/20 text-accent border-accent/30' },
	pending: {
	label: 'Pending', className: 'bg-warning/20 text-warning border-warning/30' },
	overdue: {
	label: 'Overdue', className: 'bg-danger/20 text-danger/80 border-danger/30' },
	cancelled: {
	label: 'Cancelled', className: 'bg-sand/20 text-sand/40 border-sand/30' }
  } as const;

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function isToday(date: Date): boolean {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function handleEventClick(event: TimelineEvent) {
    if (interactive && onEventClick) {
      onEventClick(event);
    }
  }

  function handleKeydown(e: KeyboardEvent, event: TimelineEvent) {
    if (!interactive) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onEventClick?.(event);
    }
  }
</script>

<div class={cn('case-timeline w-full space-y-4', className)}>
  <!-- Header -->
  <div class="flex items-center justify-between">
    <div>
      <h3 class="text-lg font-semibold text-yorha-text-primary">Case Timeline</h3>
      <p class="text-sm text-yorha-text-secondary">
        {caseName}
        {#if caseId}
          <span class="mx-1 text-xs">• #{caseId.slice(-8)}</span>
        {/if}
        • {sortedEvents.length} events
      </p>
    </div>
    {#if onAddEvent && interactive}
      <button
        onclick={onAddEvent}
        class="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium font-mono bg-yorha-primary/10 text-yorha-primary border border-yorha-primary/20 rounded-md hover:bg-yorha-primary/20 transition-colors"
      >
        📅 Add Event
      </button>
    {/if}
  </div>

  <!-- Timeline -->
  <div class="relative">
    {#if sortedEvents.length === 0}
      <div class="text-center py-12 text-yorha-text-secondary">
        <span class="text-4xl block mb-4">📅</span>
        <p>No timeline events recorded</p>
        {#if onAddEvent}
          <button onclick={onAddEvent} class="mt-2 text-yorha-primary hover:text-yorha-accent">
            Add the first event
          </button>
        {/if}
      </div>
    {:else}
      <div class="absolute left-6 top-0 bottom-0 w-px bg-yorha-border"></div>
      <div class="space-y-6">
        {#each sortedEvents as event (event.id)}
          {@const config = eventConfig[event.type]}
          {@const status = statusConfig[event.status]}
          <div
            class={cn('relative flex items-start gap-4', interactive && 'cursor-pointer group', compactMode && 'gap-3')}
            role="button"
            tabindex="0"
            aria-label="Open event {event.title}"
            onclick={() => handleEventClick(event)}
            onkeydown={(e) => handleKeydown(e, event)}
          >
            <!-- Timeline Node -->
            <div
              class={cn(
                'relative z-10 flex items-center justify-center w-12 h-12 rounded-full border-2',
                config.bg,
                config.border,
                interactive && 'group-hover:scale-110 transition-transform'
              )}
            >
              <span class={cn('text-xl', config.color)}>{config.icon}</span>
            </div>

            <!-- Event Content -->
            <div class={cn('flex-1 min-w-0 pb-6', compactMode && 'pb-4')}>
              <div
                class={cn(
                  'bg-yorha-bg-secondary border border-yorha-border rounded-lg p-4',
                  interactive && 'group-hover:border-yorha-primary/30 group-hover:bg-yorha-bg-tertiary transition-colors',
                  compactMode && 'p-3'
                )}
              >
                <!-- Event Header -->
                <div class="flex items-start justify-between gap-2">
                  <div class="flex-1">
                    <h4 class={cn('font-semibold text-yorha-text-primary font-mono', compactMode ? 'text-sm' : 'text-base')}>
                      {event.title}
                    </h4>
                    <div class="flex items-center gap-3 mt-1">
                      <span
                        class={cn(
                          'font-mono text-yorha-text-secondary',
                          compactMode ? 'text-xs' : 'text-sm',
                          isToday(event.date) && 'text-yorha-accent font-medium'
                        )}
                      >
                        {formatDate(event.date)} • {formatTime(event.date)}
                        {#if isToday(event.date)}
                          <span class="ml-1">TODAY</span>
                        {/if}
                      </span>
                      {#if event.priority && event.priority !== 'medium'}
                        <span
                          class={cn(
                            'px-2 py-0.5 text-xs font-mono rounded',
                            event.priority === 'critical' && 'bg-danger/20 text-danger/80 border border-danger/30',
                            event.priority === 'high' && 'bg-warning/20 text-warning border border-warning/30',
                            event.priority === 'low' && 'bg-sand/20 text-sand/40 border border-sand/30'
                          )}
                        >
                          {event.priority.toUpperCase()}
                        </span>
                      {/if}
                    </div>
                  </div>
                  <!-- Status Badge -->
                  <span class={cn('px-2 py-1 text-xs font-mono rounded border', status.className)}>
                    {status.label}
                  </span>
                </div>

                <!-- Event Description -->
                {#if event.description && !compactMode}
                  <p class="mt-2 text-sm text-yorha-text-secondary font-mono">
                    {event.description}
                  </p>
                {/if}

                <!-- Event Metadata -->
                {#if !compactMode && (event.participants?.length || event.documents?.length || event.location)}
                  <div class="mt-3 pt-3 border-t border-yorha-border grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {#if event.participants?.length}
                      <div>
                        <span class="text-yorha-text-secondary">Participants:</span>
                        <div class="mt-1">
                          {#each event.participants as participant}
                            <div class="text-yorha-text-primary">{participant}</div>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if event.documents?.length}
                      <div>
                        <span class="text-yorha-text-secondary">Documents:</span>
                        <div class="mt-1">
                          {#each event.documents as document}
                            <div class="text-yorha-primary hover:text-yorha-accent">
                              {document}
                            </div>
                          {/each}
                        </div>
                      </div>
                    {/if}
                    {#if event.location}
                      <div>
                        <span class="text-yorha-text-secondary">Location:</span>
                        <div class="mt-1 text-yorha-text-primary">{event.location}</div>
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .case-timeline {
    --timeline-line-color: rgb(var(--yorha-border));
  }
</style>
