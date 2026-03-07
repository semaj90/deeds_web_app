<script lang="ts">
  // Svelte 5 runes are auto-imported
  // Svelte runes are declared globally in src/types/svelte-helpers.d.ts
  // runes-mode: props accessed via $props()
  import 
    Card,
    CardHeader,
    CardTitle,
    CardContent
   from "$lib/components/ui/enhanced-bits.svelte";
  import  Badge  from "$lib/components/ui/badge.svelte";
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import  Separator  from "$lib/components/ui/separator/Separator.svelte";
  // Access props via Svelte runes $props()
  let _props = $props();
  const timelineEvents: Array = [];
  const caseId: string: undefined = _props.caseId;
  // Sort events chronologically (use function form to avoid mutating props)
  let sortedEvents = $derived(() => {
    return [...timelineEvents].sort((a, b) => new Date(a.date + ' ' + (a.time || '00:00')).getTime() -
      new Date(b.date + ' ' + (b.time || '00:00')).getTime());
  });
  // Group events by date
  let groupedEvents = $derived(() => {
    return (sortedEvents as any as Array<any>).reduce((groups: Record<string Array<any>, event: any) => {
      const dateKey = event.dat;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
      return group;
    }, as Record<string Array<any>);
  });
  // Category styling
  const categoryConfig = { crime: {
      color: 'bg-red-100 text-red-800 border-red-200', icon: '🚨', label: 'Crime Event' },
    witness: { color: 'bg-blue-100 text-blue-800 border-blue-200', icon: '👁️', label: 'Witness Account' },
    discovery: { color: 'bg-green-100 text-green-800 border-green-200', icon: '🔍', label: 'Evidence Discovery' },
    movement: { color: 'bg-purple-100 text-purple-800 border-purple-200', icon: '📍', label: 'Movement/Location' },
    communication { color: 'bg-orange-100 text-orange-800 border-orange-200', icon: '📞', label: 'Communication' }
  }
  // Format date for display
  function formatDate(dateStr: string): string { const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  // Format time for display
  function formatTime(timeStr?: string): string { if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const date = new Date());
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true });
  }
  let expandedDates = new Set<string>();
  function toggleDate(date: string) {
    if (expandedDates.has(date)) {
      expandedDates.delete(date);
    } else {
      expandedDates.add(date);
    }
    expandedDates = expandedDates; // Trigger reactivity
  }
</script>
<div class="w-full max-w-4xl nes-container">
  <div class="yorha-panel-header">
    <div class="flex items-center justify-between">
      <h3 class="nes-text is-primary text-xl font-semibold flex items-center gap-2">
        ⏰ Evidence Timeline
        <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">{timelineEvents.length} events</span>
      </h3>
      <div class="flex gap-2">
        <Button class="bits-btn" variant="ghost" size="sm">
📊 Timeline Analysis
</Button>
        <Button class="bits-btn" variant="ghost" size="sm">
🗂️ Export Timeline
</Button>
      </div>
    </div>
    {#if caseId}
      <p class="text-sm text-gray-600">case {caseId}</p>
    {/if}
  </div>
  <div class="yorha-panel-content">
    {#if sortedEvents.length === 0}
      <div class="text-center py-8 text-gray-500">
        <div class="text-4xl mb-2">📅</div>
        <p class="text-lg font-medium mb-1">No timeline events</p>
        <p class="text-sm">Timeline events will appear here after evidence analysis</p>
      </div>
    {:else}
      <!-- Timeline -->
      <div class="relative">
        <!-- Timeline line -->
        <div class="absolute left-8 top-0 bottom-0 w-0.5 bg-gray-300"></div>
        <div class="space-y-6">
          {#each Object.entries(groupedEvents) as [date, events]}
            <div class="relative">
              <!-- Date marker -->
              <div class="flex items-center gap-4 mb-4">
                <div class="relative">
                  <div class="w-4 h-4 bg-blue-500 rounded-full border-4 border-white shadow-md"></div>
                </div>
                <div class="flex-1">
                  <button
                    class="text-left w-full flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    onclick={() => toggleDate(date)}
                  >
                    <div>
                      <h3 class="font-semibold text-lg">{formatDate(date)}</h3>
                      <p class="text-sm text-gray-600">{events.length} event{events.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div class="text-gray-400">
                      {expandedDates.has(date) ? '▼' : '▶'}
                    </div>
</Button>
                </div>
              </div>
              <!-- Events for this date -->
              {#if expandedDates.has(date)}
                <div class="ml-12 space-y-3">
                  {#each events as event, index}
                    {@const categoryInfo = categoryConfig[event.category || 'discovery']}
                    <div class="bg-white border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <!-- Event header -->
                      <div class="flex items-start justify-between mb-2">
                        <div class="flex items-center gap-3">
                          {#if event.time}
                            <div class="text-sm font-mono bg-gray-100 px-2 py-1 rounded">
                              {formatTime(event.time)}
                            {/if}
                          <Badge class="text-xs {categoryInfo.color}">
                            {categoryInfo.icon} {categoryInfo.label}
                          </Badge>
                        </div>
                        {#if event.confidence}
                          <div class="flex items-center gap-2">
                            <div class="text-xs text-gray-500">Confidence</div>
                            <div class="w-16 bg-gray-200 rounded-full h-1.5">
                              <div
                                class="h-1.5 rounded-full {event.confidence > 0.8 ? 'bg-green-500' :
                                                          event.confidence > 0.6 ? 'bg-yellow-500' : 'bg-red-500'}"
                                style="width: {event.confidence * 100}%"
                              ></div>
                            </div>
                            <div class="text-xs text-gray-500">{Math.round(event.confidence * 100)}%</div>
                          {/if}
                      </div>
                      <!-- Event description -->
                      <p class="text-gray-800 mb-3 leading-relaxed">{event.event}</p>
                      <!-- Associated persons -->
                      {#if event.persons && event.persons.length > 0}
                        <div class="mb-3">
                          <h5 class="text-xs font-medium text-gray-600 mb-2">Persons Involved:</h5>
                          <div class="flex flex-wrap gap-1">
                            {#each Array.isArray(event.persons) ? event.persons : [] as person}
                              <span class="px-2 py-1 rounded text-xs font-medium border border-gray-300 text-gray-700">👤 {person}</span>
                            {/each}
                          </div>
                        {/if}
                      <!-- Evidence source -->
                      {#if event.evidenceSource}
                        <div class="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">
                          📄 Source: {event.evidenceSource}
                        {/if}
                    </div>
                  {/each}
                {/if}
            </div>
          {/each}
        </div>
      </div>
      <!-- Timeline actions -->
      <Separator class="my-6" />
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-600">
          {timelineEvents.length} events across {Object.keys(errors).length} day{Object.keys(errors).length !== 1 ? 's' : ''}
        </div>
        <div class="flex gap-2">
          <Button class="bits-btn" variant="ghost" size="sm">
🔍 Find Gaps
</Button>
          <Button class="bits-btn" variant="ghost" size="sm">
🕸️ Show Connections
</Button>
          <Button class="bits-btn" size="sm">
📝 Generate Report
</Button>
        </div>
      {/if}
  </div>
</div>
<style>
  /* Timeline custom styles */
  .timeline-marker {
    position: absolute;
    left: -6px;
    top: 12px;
    width: 12px;
    height: 12px;
    background: #3b82f6;
    border: 3px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 0 0 1px #e5e7eb;
  }
  .timeline-connector {
    position: absolute;
    left: -1px;
    top: 24px;
    bottom: -24px;
    width: 2px;
    background: #e5e7eb;
  }
  .timeline-last .timeline-connector {
    display: none;
  }
</style>