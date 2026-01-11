<script lang="ts">
  import Button from './Button.svelte';
  import Tag from './Tag.svelte';

  type TimelineEvent = {
    id: string;
    timestamp: Date;
    title: string;
    description: string;
    type: 'evidence' | 'person' | 'location' | 'action';
    evidenceIds?: string[];
    personIds?: string[];
  };

  let { events = [], caseId = 'CASE-001' } = $props<{
    events?: TimelineEvent[];
    caseId?: string;
  }>();

  // Demo data - don't mutate props, use derived
  const demoEvents: TimelineEvent[] = [
    {
      id: 'T-001',
      timestamp: new Date('2024-12-05T20:00:00'),
      title: 'Suspect Arrives at Building',
      description: 'Security footage shows suspect entering lobby',
      type: 'evidence',
      evidenceIds: ['EV-001'],
    },
    {
      id: 'T-002',
      timestamp: new Date('2024-12-05T21:15:00'),
      title: 'Badge Access to Server Room',
      description: 'Stolen credentials used to access restricted area',
      type: 'action',
      evidenceIds: ['EV-003'],
    },
    {
      id: 'T-003',
      timestamp: new Date('2024-12-05T21:34:00'),
      title: 'Physical Evidence Created',
      description: 'Forced entry marks photographed',
      type: 'evidence',
      evidenceIds: ['EV-004'],
    },
    {
      id: 'T-004',
      timestamp: new Date('2024-12-05T21:45:00'),
      title: 'Witness Observation',
      description: 'K. Ito hears suspicious activity',
      type: 'person',
      personIds: ['POI-002'],
    },
    {
      id: 'T-005',
      timestamp: new Date('2024-12-05T22:10:00'),
      title: 'Suspect Exits Building',
      description: 'Final security camera footage',
      type: 'evidence',
      evidenceIds: ['EV-001'],
    },
  ];

  // Use demo data if events is empty
  const viewEvents = $derived(events.length > 0 ? events : demoEvents);

  // Sort by timestamp
  let sortedEvents = $derived([...viewEvents].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()));

  function formatTime(date: Date): string {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function typeColor(type: TimelineEvent['type']): 'blue' | 'green' | 'yellow' | 'red' {
    if (type === 'evidence') return 'blue';
    if (type === 'person') return 'green';
    if (type === 'location') return 'yellow';
    return 'red';
  }

  function typeIcon(type: TimelineEvent['type']): string {
    if (type === 'evidence') return 'i-heroicons-document-text';
    if (type === 'person') return 'i-heroicons-user';
    if (type === 'location') return 'i-heroicons-map-pin';
    return 'i-heroicons-bolt';
  }
</script>

<div class="panel p-4">
  <div class="flex items-center justify-between mb-4">
    <div class="heading-sub">Case Timeline – {caseId}</div>
    <div class="flex gap-2">
      <Button variant="secondary">
        <span class="i-heroicons-funnel mr-1" ></span>
        Filter
      </Button>
      <Button variant="primary">
        <span class="i-heroicons-plus-20-solid mr-1" ></span>
        Add Event
      </Button>
    </div>
  </div>

  <!-- Timeline -->
  <div class="relative">
    <!-- Vertical line -->
    <div class="absolute left-8 top-0 bottom-0 w-0.5 bg-black/30"></div>

    <!-- Events -->
    <div class="flex flex-col gap-0">
      {#each sortedEvents as event, i (event.id)}
        <div class="relative flex gap-4 pb-8">
          <!-- Time marker -->
          <div class="flex-shrink-0 w-16 text-right">
            <div class="text-xs font-mono text-black/60">{formatTime(event.timestamp)}</div>
            {#if i === 0 || formatDate(event.timestamp) !== formatDate(sortedEvents[i - 1].timestamp)}
              <div class="text-[10px] font-mono uppercase tracking-wider text-black/40">
                {formatDate(event.timestamp)}
              </div>
            {/if}
          </div>

          <!-- Dot -->
          <div class="relative z-10 flex-shrink-0">
            <div class="w-8 h-8 rounded-full bg-panel border-2 border-black flex items-center justify-center">
              <span class="{typeIcon(event.type)} text-sand text-sm" ></span>
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 panel-soft p-3 cursor-pointer hover:bg-panel">
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex-1">
                <div class="font-mono text-sm tracking-[0.12em] uppercase mb-1">
                  {event.title}
                </div>
                <div class="text-xs text-black/80">
                  {event.description}
                </div>
              </div>
              <Tag color={typeColor(event.type)}>
                {event.type}
              </Tag>
            </div>

            <!-- Related items -->
            {#if event.evidenceIds && event.evidenceIds.length > 0}
              <div class="flex gap-1 mt-2">
                <span class="text-[10px] font-mono text-black/60">Evidence:</span>
                {#each event.evidenceIds as evidId}
                  <span class="tag">{evidId}</span>
                {/each}
              </div>
            {/if}

            {#if event.personIds && event.personIds.length > 0}
              <div class="flex gap-1 mt-2">
                <span class="text-[10px] font-mono text-black/60">Persons:</span>
                {#each event.personIds as personId}
                  <span class="tag">{personId}</span>
                {/each}
              </div>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <!-- Summary stats -->
  <div class="mt-4 pt-4 border-t border-black/20">
    <div class="grid grid-cols-4 gap-3 text-center text-xs font-mono">
      <div>
        <div class="text-black/60">Total Events</div>
        <div class="text-lg">{events.length}</div>
      </div>
      <div>
        <div class="text-black/60">Time Span</div>
        <div class="text-lg">
          {#if events.length >= 2}
            {Math.ceil((sortedEvents[sortedEvents.length - 1].timestamp.getTime() - sortedEvents[0].timestamp.getTime()) / 1000 / 60)}m
          {:else}
            -
          {/if}
        </div>
      </div>
      <div>
        <div class="text-black/60">Evidence</div>
        <div class="text-lg">{events.filter(e => e.type === 'evidence').length}</div>
      </div>
      <div>
        <div class="text-black/60">Persons</div>
        <div class="text-lg">{events.filter(e => e.type === 'person').length}</div>
      </div>
    </div>
  </div>
</div>
