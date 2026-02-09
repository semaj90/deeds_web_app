<script lang="ts">
 import * as d3 from 'd3';
 // Migrated to $effect

 interface EvidenceNode { id: string, title: string;
 type: string;
	color: string;
 size: number;
 status?: string;
 timestamp?: string;
 contradictions?: number;
 }

 interface GraphLink { source: string, target:string;
 score: number;
	type: string;
 }

 interface DetectiveMapData { evidence: EvidenceNode[], links: GraphLink[];
 contradictions: Array<{ sourceId: string, targetId: string;
	type: string }>;
 timeline: Array<{ evidenceId: string, timestamp: string;
	description: string }>;
 }

 interface Props {
  data?: DetectiveMapData | null;
  caseId?: string | null;
  show?: boolean;
  caseEvidence?: any[];
  witnesses?: any[];
  onevidenceUpdate?: (data: any) => void;
 }

 let { data = $bindable(null), caseId = null, show = true }: Props = $props();

 let container = $state<HTMLElement | null>(null);
 let svg: any;
 let simulation: any;
 let width = $state(1200);
 let height = $state(800);
 let zoom: any;
 let isLoading = $state(true);
 let selectedNode = $state<EvidenceNode | null>(null);
 let filterMode = $state<'all' | 'evidence' | 'contradictions' | 'timeline'>('all');

 // Phoenix Wright color scheme
 const colors = { evidence: { approved: '#10b981',
 reviewing: '#f59e0b',
 rejected: '#ef4444',
 new: '#3b82f6'
 },
	poi: {
	high: '#ef4444',
 normal: '#f59e0b',
 low: '#10b981'
 },
	links: {
	similar: '#6b7280',
 contradicts: '#ef4444',
 timeline: '#3b82f6'
 }
 };

 $effect(() => {
   const init = async () => {
     if (show && !data) {
       await loadData();
     } else if (data) {
       initializeVisualization();
     }
   };

   init();

   return () => {
     if (simulation) {
       simulation.stop();
     }
   };
 });

 async function loadData() {
 try {
 isLoading = true;
 const url = caseId ? `/api/detective/map?caseId=${caseId}` : '/api/detective/map';
 const response = await fetch(url);

 if (!response.ok) {
 throw new Error(`Failed to load map data: ${response.status}`);
 }

 data = await response.json();
 initializeVisualization();
 } catch (error) {
 console.error('Error loading detective map:', error);
 } finally {
 isLoading = false;
 }
 }

 function initializeVisualization() {
 if (!container || !data) return;

 // Clear existing SVG
 d3.select(container).selectAll('*').remove();

 // Create SVG
 svg = d3.select(container)
 .append('svg')
 .attr('width', width)
 .attr('height', height)
 .attr('class', 'detective-map-svg');

 // Add zoom behavior
 zoom = d3.zoom()
 .scaleExtent([0.1, 4])
 .on('zoom', (event: any) => {
 svg.select('.graph-group').attr('transform', event.transform);
 });

 svg.call(zoom);

 // Create main group
 const g = svg.append('g').attr('class', 'graph-group');

 // Add gradient definitions for pulsing effects
 const defs = svg.append('defs');

 // Contradiction pulse gradient
 defs.append('radialGradient')
 .attr('id', 'contradiction-pulse')
 .attr('cx', '50%')
 .attr('cy', '50%')
 .attr('r', '50%')
 .html(`
 <stop offset="0%" style="stop-color:#ef4444;stop-opacity:0.8"/>
 <stop offset="70%" style="stop-color:#ef4444;stop-opacity:0.4"/>
 <stop offset="100%" style="stop-color:#ef4444;stop-opacity:0"/>
 `);

 // Timeline connection gradient
 defs.append('linearGradient')
 .attr('id', 'timeline-gradient')
 .html(`
 <stop offset="0%" style="stop-color: #3b82f6"/>
 <stop offset="100%" style="stop-color: #1d4ed8"/>
 `);

 // Prepare nodes and links
 const nodes = prepareNodes();
 const links = prepareLinks();

 // Create force simulation
 simulation = d3.forceSimulation(nodes)
 .force('link', d3.forceLink(links)
 .id((d: any) => d.id)
 .distance((d: any) => getLinkDistance(d))
 .strength((d: any) => getLinkStrength(d))
 )
 .force('charge', d3.forceManyBody()
 .strength((d: any) => d.type === 'poi' ? -300 : -200)
 )
 .force('center', d3.forceCenter(width / 2, height / 2))
 .force('collision', d3.forceCollide()
 .radius((d: any) => d.size + 5)
 );

 // Create links
 const link = g.append('g')
 .attr('class', 'links')
 .selectAll('line')
 .data(links)
 .enter().append('line')
 .attr('class', (d: any) => `link ${d.type}`)
 .attr('stroke', (d: any) => getLinkColor(d))
 .attr('stroke-width', (d: any) => getLinkWidth(d))
 .attr('stroke-dasharray', (d: any) => d.type === 'timeline' ? '5,5' : null)
 .style('opacity', 0.6);

 // Add link animations for contradictions
 link.filter((d: any) => d.type === 'contradicts')
 .append('animate')
 .attr('attributeName', 'stroke-width')
 .attr('values', '2,4,2')
 .attr('dur', '2s')
 .attr('repeatCount', 'indefinite');

 // Create nodes
 const node = g.append('g')
 .attr('class', 'nodes')
 .selectAll('circle')
 .data(nodes)
 .enter().append('g')
 .attr('class', 'node');

 // Node circles
 node.append('circle')
 .attr('r', (d: any) => d.size)
 .attr('fill', (d: any) => d.color)
 .attr('stroke', '#fff')
 .attr('stroke-width', 2)
 .style('cursor', 'pointer')
 .on('click', (event: any, d: any) => handleNodeClick(d))
 .on('mouseover', function(event: any, d: any) {
  const nodeThis = d3.select(this as any);
  nodeThis
 .transition()
 .duration(200)
 .attr('r', d.size * 1.2);

 // Show tooltip
 showTooltip(event, d);
 })
 .on('mouseout', function(event: any, d: any) {
  const nodeThis = d3.select(this as any);
  nodeThis
 .transition()
 .duration(200)
 .attr('r', d.size);

 hideTooltip();
 });

 node.filter((d: any) => d.contradictions && d.contradictions > 0)
 .append('circle')
 .attr('r', (d: any) => d.size * 1.5)
 .attr('fill', 'url(#contradiction-pulse)')
 .attr('class', 'contradiction-pulse')
 .style('pointer-events', 'none');

 // Node labels
 node.append('text')
 .attr('dx', 0)
 .attr('dy', (d: any) => d.size + 15)
 .attr('text-anchor', 'middle')
 .attr('font-size', '10px')
 .attr('fill', '#fff')
 .attr('font-weight', 'bold')
 .style('pointer-events', 'none')
 .text((d: any) => d.title.length > 15 ? d.title.substring(0, 15) + '...' : d.title);

 // Update positions on simulation tick
 simulation.on('tick', () => {
 link
 .attr('x1', (d: any) => d.source.x)
 .attr('y1', (d: any) => d.source.y)
 .attr('x2', (d: any) => d.target.x)
 .attr('y2', (d: any) => d.target.y);

 node
 .attr('transform', (d: any) => `translate(${d.x},
	${d.y})`);
 });

 node.call(d3.drag()
 .on('start', (event: any, d: any) => {
 if (!event.active) simulation.alphaTarget(0.3).restart();
 d.fx = d.x;
 d.fy = d.y;
 })
 .on('drag', (event: any, d: any) => {
 d.fx = event.x;
 d.fy = event.y;
 })
 .on('end', (event: any, d: any) => {
 if (!event.active) simulation.alphaTarget(0);
 d.fx = null;
 d.fy = null;
 }) as any
 );

 isLoading = false;
 }

 function prepareNodes(): any[] {
 if (!data) return [];

 const nodes = [...data.evidence];

 // Add contradiction counts
 data.contradictions.forEach(contradiction => {
 const sourceNode = nodes.find(n => n.id === contradiction.sourceId);
 const targetNode = nodes.find(n => n.id === contradiction.targetId);

 if (sourceNode) sourceNode.contradictions = (sourceNode.contradictions || 0) + 1;
 if (targetNode) targetNode.contradictions = (targetNode.contradictions || 0) + 1;
 });

 return nodes;
 }

 function prepareLinks(): any[] {
 if (!data) return [];

 const links = [...data.links];

 // Add contradiction links
 data.contradictions.forEach(contradiction => {
 links.push({
 source: contradiction.sourceId, target:contradiction.targetId, score: 1, type: 'contradicts'
 });
 });

 if (data.timeline && data.timeline.length > 1) {
 for (let i = 0; i < data.timeline.length - 1; i++) {
 const current = data.timeline[i];
 const next = data.timeline[i + 1];

 links.push({
 source: current.evidenceId, target:next.evidenceId, score: 0.8,
 type: 'timeline'
 });
 }
 }

 return links;
 }

 function getLinkDistance(link:any): number {
 switch (link.type) {
 case 'contradicts': return 100;
 case 'timeline': return 150;
 default:return 120;
 }
 }

 function getLinkStrength(link:any): number {
 switch (link.type) {
 case 'contradicts': return 0.8;
 case 'timeline': return 0.6;
 default:return 0.3;
 }
 }

 function getLinkColor(link:any): string {
 switch (link.type) {
 case 'contradicts': return colors.links.contradicts;
 case 'timeline': return 'url(#timeline-gradient)';
 default:return colors.links.similar;
 }
 }

 function getLinkWidth(link:any): number {
 switch (link.type) {
 case 'contradicts': return 3;
 case 'timeline': return 2;
 default:return 1;
 }
 }

 function handleNodeClick(node: EvidenceNode) {
 selectedNode = selectedNode?.id === node.id ? null : node;
 }

 function showTooltip(event: MouseEvent, node: EvidenceNode) {
 // Create tooltip (implement based on your tooltip system)
 console.log('Show tooltip for:', node.title);
 }

 function hideTooltip() {
 // Hide tooltip
 console.log('Hide tooltip');
 }

 function resetZoom() {
 if (svg && zoom) {
 svg.transition().duration(750)
  .call(zoom.transform, (d3 as any).zoomIdentity);
 }
 }

 function centerOnNode(nodeId: string) {
 const node = data?.evidence.find(n => n.id === nodeId);
 if (node && svg) {
 // Implement centering logic
 }
 }

 $effect(() => {
 if (data && show) {
 initializeVisualization();
 }
 });
</script>

{#if show}
 <div class="detective-map-container bg-slate-900 rounded-lg p-4">
 <!-- Header -->
 <div class="flex items-center justify-between mb-4">
 <div class="flex items-center gap-4">
 <h2 class="text-xl font-bold text-cyan-400">🕵️♂️ Detective Evidence Map</h2>
 <div class="flex gap-2">
 <button
 onclick={() => filterMode = 'all'}
 class="px-3 py-1 text-xs rounded {filterMode === 'all' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'}"
 >
 All
 </button>
 <button
 onclick={() => filterMode = 'evidence'}
 class="px-3 py-1 text-xs rounded {filterMode === 'evidence' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'}"
 >
 Evidence
 </button>
 <button
 onclick={() => filterMode = 'contradictions'}
 class="px-3 py-1 text-xs rounded {filterMode === 'contradictions' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'}"
 >
 Contradictions
 </button>
 <button
 onclick={() => filterMode = 'timeline'}
 class="px-3 py-1 text-xs rounded {filterMode === 'timeline' ? 'bg-cyan-600 text-white' : 'bg-slate-700 text-slate-300'}"
 >
 Timeline
 </button>
 </div>
 </div>

 <div class="flex gap-2">
 <button onclick={resetZoom} class="px-3 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600">
 Reset Zoom
 </button>
 <button onclick={ loadData } class="px-3 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600">
 Refresh
 </button>
 </div>
 </div>

 <!-- Legend -->
 <div class="flex gap-6 mb-4 text-xs">
 <div class="flex items-center gap-2">
 <div class="w-3 h-3 rounded-full bg-blue-500"></div>
 <span>New Evidence</span>
 </div>
 <div class="flex items-center gap-2">
 <div class="w-3 h-3 rounded-full bg-yellow-500"></div>
 <span>Under Review</span>
 </div>
 <div class="flex items-center gap-2">
 <div class="w-3 h-3 rounded-full bg-green-500"></div>
 <span>Approved</span>
 </div>
 <div class="flex items-center gap-2">
 <div class="w-3 h-3 rounded-full bg-red-500"></div>
 <span>Rejected/POI</span>
 </div>
 <div class="flex items-center gap-2">
 <span class="text-red-400">━━</span>
 <span>Contradiction</span>
 </div>
 <div class="flex items-center gap-2">
 <span class="text-blue-400" style="text-decoration: underline;">╌╌</span>
 <span>Timeline</span>
 </div>
 </div>

 <!-- Visualization -->
 <div class="relative">
 {#if isLoading}
 <div class="absolute inset-0 flex items-center justify-center bg-slate-900/80 rounded">
 <div class="text-center">
 <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
 <p class="text-cyan-400">Analyzing evidence relationships...</p>
 </div>
 </div>
 {/if}

 <div bind:this={container} class="w-full h-[600px] bg-slate-950 rounded border border-slate-700"></div>
 </div>

 <!-- Selected Node Details -->
 {#if selectedNode}
 <div class="mt-4 p-4 bg-slate-800 rounded border border-slate-600">
 <h3 class="font-bold text-cyan-400 mb-2">{selectedNode.title}</h3>
 <div class="grid grid-cols-2 gap-4 text-sm">
 <div>
 <span class="text-slate-400">Type:</span>
 <span class="ml-2 text-white">{selectedNode.type}</span>
 </div>
 <div>
 <span class="text-slate-400">Status:</span>
 <span class="ml-2 text-white">{selectedNode.status || 'Unknown'}</span>
 </div>
 {#if selectedNode.timestamp}
 <div>
 <span class="text-slate-400">Timestamp:</span>
 <span class="ml-2 text-white">{new Date(selectedNode.timestamp).toLocaleString()}</span>
 </div>
 {/if}
 {#if selectedNode.contradictions}
 <div>
 <span class="text-slate-400">Contradictions:</span>
 <span class="ml-2 text-red-400">{selectedNode.contradictions}</span>
 </div>
 {/if}
 </div>
 </div>
 {/if}
 </div>
{/if}

<style>
 :global(.link.contradicts) {
  stroke-dasharray: 5, 5;
 }

 @keyframes contradiction-pulse {
 0%, 100% { opacity: 0.6; }
 50% { opacity: 1; }
 }

 :global(.contradiction-pulse) {
 animation: contradiction-glow 3s infinite;
 }

 @keyframes contradiction-glow {
 0%, 100% { r: 0, opacity: 0;
 }
 50% { r: 30, opacity: 0.3;
 }
 }
</style>




