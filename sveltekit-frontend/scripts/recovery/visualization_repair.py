
import os

files_to_fix = {
    "src/lib/components/visualization/EvidenceTimelineLOD.svelte": r"""<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
    initialTimeRange?: { start: Date; end: Date };
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
    0: { precision: 'hour', maxEvents: 1000, label: 'Ultra (Hours)' },
    1: { precision: 'day', maxEvents: 500, label: 'High (Days)' },
    2: { precision: 'week', maxEvents: 200, label: 'Medium (Weeks)' },
    3: { precision: 'month', maxEvents: 50, label: 'Low (Months)' }
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
                    class="px-2 py-1 text-xs rounded transition-colors {currentLOD === Number(level) ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}"
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
""",

    "src/lib/components/visualization/CaseGraphLOD.svelte": r"""<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
  import Badge from "$lib/components/ui/badge/Badge.svelte";
  import { Network, Layers, ZoomOut, Maximize2 } from 'lucide-svelte';

  // Explicitly typing $props to avoid interface merge issues on single lines
  interface GraphNode {
    id: string;
    label: string;
    type: string;
    x?: number;
    y?: number;
    connections: string[];
    importance: number;
  }

  interface GraphEdge {
    source: string;
    target: string;
    value: number;
  }

  interface Props {
    caseId: string;
    graphData?: { nodes: GraphNode[]; edges: GraphEdge[] };
    enableWebGPU?: boolean;
    maxNodes?: number;
  }

  let {
    caseId,
    graphData = { nodes: [], edges: [] },
    enableWebGPU = true,
    maxNodes = 1000
  }: Props = $props();

  let canvasElement = $state<HTMLCanvasElement>();
  let currentLOD = $state(1);
  let visibleNodes = $state<GraphNode[]>([]);
  let visibleEdges = $state<GraphEdge[]>([]);
  let simulatedNodes = $state<GraphNode[]>([]);
  let isSimulating = $state(true);
  let frameId: number;

  const lodConfig = {
    0: { maxNodes: 500, label: 'High' },
    1: { maxNodes: 200, label: 'Medium' },
    2: { maxNodes: 50, label: 'Low' }
  };

  $effect(() => {
    if (browser) {
        initializeGraph();
    }
  });

  function initializeGraph() {
    // Generate dummy data if empty
    if (graphData.nodes.length === 0) {
        generateDummyData();
    } else {
        simulatedNodes = [...graphData.nodes];
        visibleEdges = [...graphData.edges];
    }
    updateLOD();
    animate();
  }

  function generateDummyData() {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    for (let i = 0; i < 50; i++) {
        nodes.push({
            id: `n${i}`,
            label: `Entity ${i}`,
            type: i % 2 === 0 ? 'person' : 'document',
            x: Math.random() * 800,
            y: Math.random() * 600,
            connections: [],
            importance: Math.random()
        });
    }
    // Random edges
    for (let i = 0; i < 30; i++) {
        edges.push({
            source: `n${Math.floor(Math.random() * 50)}`,
            target: `n${Math.floor(Math.random() * 50)}`,
            value: Math.random()
        });
    }
    simulatedNodes = nodes;
    visibleEdges = edges;
  }

  function updateLOD() {
    const config = lodConfig[currentLOD as keyof typeof lodConfig] || lodConfig[1];
    const max = config.maxNodes;
    visibleNodes = simulatedNodes
        .sort((a,b) => b.importance - a.importance)
        .slice(0, max);
  }

  function animate() {
    if (!canvasElement) return;
    const ctx = canvasElement.getContext('2d');
    if (!ctx) return;

    if (isSimulating) {
       // Simple force directed step (mock)
       visibleNodes.forEach(n => {
           if (n.x) n.x += (Math.random() - 0.5) * 0.5;
           if (n.y) n.y += (Math.random() - 0.5) * 0.5;
       });
    }

    render(ctx);
    frameId = requestAnimationFrame(animate);
  }

  function render(ctx: CanvasRenderingContext2D) {
    const w = canvasElement!.width;
    const h = canvasElement!.height;
    ctx.clearRect(0,0,w,h);

    // Edges
    ctx.strokeStyle = '#333';
    ctx.beginPath();
    visibleEdges.forEach(e => {
        const s = visibleNodes.find(n => n.id === e.source);
        const t = visibleNodes.find(n => n.id === e.target);
        if (s && t && s.x && s.y && t.x && t.y) {
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(t.x, t.y);
        }
    });
    ctx.stroke();

    // Nodes
    visibleNodes.forEach(n => {
        if (!n.x || !n.y) return;
        ctx.fillStyle = n.type === 'person' ? '#3b82f6' : '#10b981';
        ctx.beginPath();
        ctx.arc(n.x, n.y, 5 + n.importance * 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ccc';
        ctx.font = '10px sans-serif';
        ctx.fillText(n.label, n.x + 8, n.y + 3);
    });
  }

  onDestroy(() => {
    if (browser && frameId) cancelAnimationFrame(frameId);
  });

</script>

<Card class="w-full h-[600px] flex flex-col bg-slate-950 border-slate-800">
    <CardHeader class="flex flex-row items-center justify-between py-3">
        <div class="flex items-center gap-2">
            <Network class="w-5 h-5 text-blue-400"/>
            <CardTitle>Case Graph</CardTitle>
            <Badge variant="outline" class="ml-2">{visibleNodes.length} Nodes</Badge>
        </div>
        <div class="flex gap-1">
             {#each Object.entries(lodConfig) as [lvl, cfg]}
                <button
                  class="px-2 py-1 text-xs rounded border border-slate-700 {currentLOD === Number(lvl) ? 'bg-slate-800 text-white' : 'text-slate-400'}"
                  onclick={() => { currentLOD = Number(lvl); updateLOD(); }}
                >
                  {cfg.label}
                </button>
             {/each}
        </div>
    </CardHeader>
    <CardContent class="flex-1 p-0 relative overflow-hidden bg-[#0f1016]">
        <canvas
            bind:this={canvasElement}
            width={800}
            height={500}
            class="w-full h-full"
        ></canvas>
        <div class="absolute bottom-2 right-2 text-xs text-slate-500">
            WebGPU: {enableWebGPU ? 'Enabled' : 'Disabled'}
        </div>
    </CardContent>
</Card>
""",

    "src/lib/components/visualization/Advanced3DEvidenceMap.svelte": r"""<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import * as THREE from 'three';
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";

  // Mock types for Three.js interactions
  interface Props {
    caseId: string;
    evidenceData?: any[];
    width?: number;
    height?: number;
  }

  let {
    caseId,
    evidenceData = [],
    width = 800,
    height = 600
  }: Props = $props();

  let container = $state<HTMLDivElement>();
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer;
  let frameId: number;
  let isMounted = false;

  $effect(() => {
    if (browser && container && !isMounted) {
        init();
        isMounted = true;
    }
  });

  function init() {
     if (!container) return;
     scene = new THREE.Scene();
     scene.background = new THREE.Color(0x0f1016);
     scene.fog = new THREE.FogExp2(0x0f1016, 0.002);

     camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 1, 1000);
     camera.position.set(400, 200, 0);
     camera.lookAt(0, 0, 0);

     renderer = new THREE.WebGLRenderer({ antialias: true });
     renderer.setPixelRatio(window.devicePixelRatio);
     renderer.setSize(container.clientWidth, container.clientHeight);
     container.appendChild(renderer.domElement);

     // Lights
     const dirLight = new THREE.DirectionalLight(0xffffff, 3);
     dirLight.position.set(1, 1, 1);
     scene.add(dirLight);

     const ambientLight = new THREE.AmbientLight(0x222222);
     scene.add(ambientLight);

     // Add some objects
     const geometry = new THREE.CylinderGeometry(0, 10, 30, 4, 1);
     const material = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true });

     for (let i = 0; i < 50; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.x = Math.random() * 1600 - 800;
        mesh.position.y = 0;
        mesh.position.z = Math.random() * 1600 - 800;
        mesh.updateMatrix();
        mesh.matrixAutoUpdate = false;
        scene.add(mesh);
     }

     animate();
     window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
     if (!container || !camera || !renderer) return;
     camera.aspect = container.clientWidth / container.clientHeight;
     camera.updateProjectionMatrix();
     renderer.setSize(container.clientWidth, container.clientHeight);
  }

  function animate() {
     frameId = requestAnimationFrame(animate);
     render();
  }

  function render() {
     if (renderer && scene && camera) {
         const time = Date.now() * 0.001;
         scene.rotation.y = time * 0.1;
         renderer.render(scene, camera);
     }
  }

  onDestroy(() => {
     if (browser) {
         window.removeEventListener('resize', onWindowResize);
         if (frameId) cancelAnimationFrame(frameId);
         if (renderer) renderer.dispose();
     }
  });

</script>

<div class="relative w-full h-[600px] rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
    <div bind:this={container} class="w-full h-full"></div>

    <div class="absolute top-4 left-4 p-4 bg-black/50 backdrop-blur rounded flex flex-col gap-2">
        <h3 class="text-white font-bold">3D Evidence Map</h3>
        <div class="flex gap-2">
            <Badge variant="secondary">Orbit</Badge>
            <Badge variant="outline">{evidenceData.length} items</Badge>
        </div>
    </div>

    <div class="absolute bottom-4 right-4 flex gap-2">
        <Button variant="outline" size="sm" onclick={() => {
            camera.position.set(0, 500, 0);
            camera.lookAt(0,0,0);
        }}>Top View</Button>
        <Button variant="outline" size="sm" onclick={() => {
            camera.position.set(400, 200, 0);
            camera.lookAt(0,0,0);
        }}>Reset</Button>
    </div>
</div>
"""
}

for path, content in files_to_fix.items():
    directory = os.path.dirname(path)
    if directory and not os.path.exists(directory):
        os.makedirs(directory)

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"Repaired: {path}")

