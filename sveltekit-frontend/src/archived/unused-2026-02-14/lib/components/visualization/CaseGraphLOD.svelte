<script lang="ts">
  import { browser } from '$app/environment';
  // Migrated to $effect
  import Badge from "$lib/components/ui/badge/Badge.svelte";
  import Card from '$lib/components/ui/card/Card.svelte';
  import CardContent from '$lib/components/ui/card/CardContent.svelte';
  import CardHeader from '$lib/components/ui/card/CardHeader.svelte';
  import CardTitle from '$lib/components/ui/card/CardTitle.svelte';
  import Network from 'lucide-svelte/icons/network';
  // Explicitly typing $props to avoid interface merge issues on single lines
  interface GraphNode { id: string, label: string;
    type: string;
    x?: number;
    y?: number;
	connections: string[];
    importance: number;
  }

  interface GraphEdge { source: string, target:string;
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

  const lodConfig = { 0: { maxNodes: 500, label: 'High' },
	1: {
	maxNodes: 200, label: 'Medium' },
	2: {
	maxNodes: 50, label: 'Low' }
  };

  $effect(() => {
    if (browser) {
        initializeGraph();
    }
    return () => {
        if (browser && frameId) cancelAnimationFrame(frameId);
    };
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

  // Cleanup handled in $effect above


</script>

<Card class="w-full h-[600px] flex flex-col bg-panel border-sand/20">
    <CardHeader class="flex flex-row items-center justify-between py-3">
        <div class="flex items-center gap-2">
            <Network class="w-5 h-5 text-info/80"/>
            <CardTitle>Case Graph</CardTitle>
            <Badge variant="outline" class="ml-2">{visibleNodes.length} Nodes</Badge>
        </div>
        <div class="flex gap-1">
             {#each Object.entries(lodConfig) as [lvl, cfg]}
                <button
                  class="px-2 py-1 text-xs rounded border border-sand/20 {currentLOD === Number(lvl) ? 'bg-panelSoft text-white' : 'text-sand/40'}"
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
        <div class="absolute bottom-2 right-2 text-xs text-sand/60">
            WebGPU: {enableWebGPU ? 'Enabled' : 'Disabled'}
        </div>
    </CardContent>
</Card>
