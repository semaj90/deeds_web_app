<script lang="ts">
  // Migrated to $effect
  import { browser } from '$app/environment';
  import Badge from "$lib/components/ui/badge/Badge.svelte";
  import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";

  // --- Types ---

  export interface EvidenceItem {
    id: string;
	type: 'document' | 'image' | 'video' | 'audio' | 'other';
    filename: string;
    thumbnailUrl?: string;
  }

  export interface TimelineEvent {
    id: string;
	timestamp: Date;
    type: 'document' | 'meeting' | 'filing' | 'communication' | 'incident' | 'media';
    title: string;
	description: string;
    importance: number; // 0.0 to 1.0
    participants: string[];
	evidence: EvidenceItem[];
  }

  interface Props {
    caseId: string;
    timelineData?: TimelineEvent[];
    enableWebGPU?: boolean;
    initialTimeRange?: {
	start: Date; end: Date };
    onEventClick?: (event: TimelineEvent) => void;
  }

  let {
    caseId,
    timelineData = [],
    enableWebGPU = true,
    initialTimeRange = { start: new Date(Date.now() - 31536000000), end: new Date() },
	onEventClick
  }: Props = $props();

  // --- State (Svelte 5 Runes) ---

  let canvasElement = $state<HTMLCanvasElement>();
  let timeRange = $state(initialTimeRange);
  let currentLOD = $state(1); // 0 (detailed) to 3 (overview)
  let visibleEvents = $state<TimelineEvent[]>([]);
  let selectedEvent = $state<TimelineEvent | null>(null);
  let hoverEvent = $state<TimelineEvent | null>(null);
  let isDragging = $state(false);
  let dragStartX = $state(0);
  let dragStartTime = $state(0);

  // --- Derived ---

  const lodConfig = {
    0: {
	precision: 'hour', maxEvents: 1000, label: 'Ultra (Hours)' },
	1: {
	precision: 'day', maxEvents: 500, label: 'High (Days)' },
	2: {
	precision: 'week', maxEvents: 200, label: 'Medium (Weeks)' },
	3: {
	precision: 'month', maxEvents: 50, label: 'Low (Months)' }
  };

  // --- Effects ---

  $effect(() => {
    if (browser && timelineData.length > 0) {
      updateVisibleEvents();
    } else if (browser && timelineData.length === 0) {
      const demoEvents: TimelineEvent[] = Array.from({ length: 50 }).map((_, i) => ({
        id: `demo-${i}`,
        timestamp: new Date(Date.now() - Math.random() * 31536000000),
        type: ['filing', 'meeting', 'document'][Math.floor(Math.random() * 3)] as any,
        title: `Case Event ${i+1}`,
        description: `Description for event ${i+1}`,
        importance: Math.random(),
        participants: ['Counsel'],
        evidence: []
      }));
      visibleEvents = demoEvents;
      updateVisibleEvents();
    }
  });

  $effect(() => {
    if (canvasElement && visibleEvents) {
      render();
    }
  });

  function updateVisibleEvents() {
    let filtered = (timelineData.length > 0 ? timelineData : visibleEvents).filter(e =>
      e.timestamp >= timeRange.start &&
      e.timestamp <= timeRange.end
    );

    const limit = lodConfig[currentLOD as keyof typeof lodConfig].maxEvents;

    if (filtered.length > limit) {
      filtered = filtered
        .sort((a,b) => b.importance - a.importance)
        .slice(0, limit);
    }

    filtered.sort((a,b) => a.timestamp.getTime() - b.timestamp.getTime());
    visibleEvents = filtered;
  }

  // --- Interaction Handlers ---

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const duration = timeRange.end.getTime() - timeRange.start.getTime();
    const newDuration = duration * zoomFactor;
    const center = (timeRange.start.getTime() + timeRange.end.getTime()) / 2;

    timeRange = {
      start: new Date(center - newDuration / 2),
      end: new Date(center + newDuration / 2)
    };
    updateVisibleEvents();
  }

  function handleMouseDown(e: MouseEvent) {
    isDragging = true;
    dragStartX = e.clientX;
    dragStartTime = timeRange.start.getTime();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!canvasElement) return;
    const rect = canvasElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging) {
      const deltaX = e.clientX - dragStartX;
      const width = rect.width;
      const duration = timeRange.end.getTime() - timeRange.start.getTime();
      const timeShift = (deltaX / width) * duration;

      const newStart = dragStartTime - timeShift;
      const originalDuration = timeRange.end.getTime() - timeRange.start.getTime();

      timeRange = {
        start: new Date(newStart),
        end: new Date(newStart + originalDuration)
      };
      updateVisibleEvents();
    } else {
      checkHover(x, y, rect.width, rect.height);
    }
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleClick(e: MouseEvent) {
    if (hoverEvent) {
      selectedEvent = hoverEvent;
      if (onEventClick) onEventClick(hoverEvent);
    } else {
      selectedEvent = null;
    }
  }

  function checkHover(x: number, y: number, width: number, height: number) {
    const timeSpan = timeRange.end.getTime() - timeRange.start.getTime();
    let found: TimelineEvent | null = null;

    for (let i = visibleEvents.length - 1; i >= 0; i--) {
      const event = visibleEvents[i];
      const t = event.timestamp.getTime() - timeRange.start.getTime();
      const evX = (t / timeSpan) * width;
      const evY = height / 2;

      if (Math.abs(evX - x) < 8 && Math.abs(evY - y) < 8) {
        found = event;
        break;
      }
    }

    hoverEvent = found;
    if (canvasElement) {
        canvasElement.style.cursor = found ? 'pointer' : (isDragging ? 'grabbing' : 'grab');
    }
  }

  // --- Rendering ---

  function render() {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    const width = canvasElement.width;
    const height = canvasElement.height;

    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(0, height/2);
    ctx.lineTo(width, height/2);
    ctx.stroke();

    const timeSpan = timeRange.end.getTime() - timeRange.start.getTime();

    visibleEvents.forEach(event => {
      const t = event.timestamp.getTime() - timeRange.start.getTime();
      const x = (t / timeSpan) * width;
      const y = height / 2;

      ctx.fillStyle = getEventColor(event.type);

      const radius = 4 + (event.importance * 4);

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (selectedEvent?.id === event.id || hoverEvent?.id === event.id) {
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      if (currentLOD <= 1 || event.importance > 0.8 || hoverEvent?.id === event.id) {
        ctx.fillStyle = '#888';
        ctx.font = '10px Inter, sans-serif';
        ctx.fillText(event.title, x - 10, y + radius + 15);
      }
    });
  }

  function getEventColor(type: string) {
    switch (type) {
      case 'filing': return '#ef4444';
      case 'meeting': return '#3b82f6';
      case 'document': return '#10b981';
      case 'incident': return '#f59e0b';
      default: return '#6b7280';
    }
  }

  function formatDate(d: Date) {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
</script>

<Card class="w-full h-full bg-slate-950 border-slate-800 flex flex-col">
  <CardHeader class="pb-2 border-b border-slate-900">
    <div class="flex justify-between items-center">
      <div>
        <CardTitle class="text-lg font-bold text-slate-100">Timeline Analysis</CardTitle>
        <CardDescription>Temporal evidence distribution</CardDescription>
      </div>
      <div class="flex items-center gap-2">
         <Badge variant="outline">{visibleEvents.length} Events</Badge>
         <div class="flex rounded-md bg-slate-900 p-1">
            {#each Object.entries(lodConfig) as [level, config]}
                <button
                    class="px-2 py-1 text-xs rounded transition-colors {currentLOD === Number(level) ? 'bg-slate-700 text-white' : 'text-slate-500, hover:text-slate-300'}"
                    onclick={() => { currentLOD = Number(level); updateVisibleEvents(); }}
                >
                    {config.label}
                </button>
            {/each}
         </div>
      </div>
    </div>
  </CardHeader>

  <CardContent class="flex-1 p-0 relative min-h-[400px]">
    <div class="absolute top-4 left-4 z-10 bg-black/50 backdrop-blur rounded px-2 py-1 text-xs text-slate-300">
        {formatDate(timeRange.start)} - {formatDate(timeRange.end)}
    </div>

    <canvas
      bind:this={canvasElement}
      width={1200}
      height={400}
      class="w-full h-full cursor-crosshair touch-none"
      onwheel={handleWheel}
      onmousedown={handleMouseDown}
      onmousemove={handleMouseMove}
      onmouseup={handleMouseUp}
      onmouseleave={handleMouseUp}
      onclick={handleClick}
    ></canvas>

    {#if selectedEvent}
      <div class="absolute bottom-4 left-4 right-4 bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-lg shadow-xl animate-in fade-in slide-in-from-bottom-4">
        <div class="flex justify-between items-start">
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <Badge variant="default" class="capitalize">{selectedEvent.type}</Badge>
                    <span class="text-xs text-slate-400">{selectedEvent.timestamp.toLocaleString()}</span>
                </div>
                <h4 class="text-lg font-semibold text-white">{selectedEvent.title}</h4>
                <p class="text-slate-400 text-sm mt-1">{selectedEvent.description}</p>

                {#if selectedEvent.participants.length}
                    <div class="flex gap-2 mt-3">
                        {#each selectedEvent.participants as p}
                           <div class="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs" title={p}>
                             {p[0]}
                           </div>
                        {/each}
                    </div>
                {/if}
            </div>
            <Button variant="ghost" size="sm" onclick={() => selectedEvent = null}>✕</Button>
        </div>
      </div>
    {/if}
  </CardContent>
</Card>

<style>
  canvas {
    display: block;
	width: 100%;
    height: 100%;
  }
</style>
