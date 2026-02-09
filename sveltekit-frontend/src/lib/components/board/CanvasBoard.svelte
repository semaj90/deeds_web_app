<script lang="ts">
  // Migrated to $effect

  interface Evidence { id: string, title: string;
    classification: 'public' | 'confidential' | 'sealed';
    status: 'pending' | 'approved' | 'locked' | 'rejected';
    type: 'document' | 'image' | 'audio' | 'video';
    boardPosition: { x: number; y: number };
  }

  interface Relationship { id: string, sourceNodeId: string;
    targetNodeId: string;
    type: 'mentions' | 'contradicts' | 'supports' | 'references' | 'timeline';
    confidence: number;
  }

  let {
    evidence = [],
    relationships = [],
    zoomLevel = 1,
    panX = 0,
    panY = 0,
    onUpdatePosition
  } = $props<{
    evidence?: Evidence[];
    relationships?: Relationship[];
    zoomLevel?: number;
    panX?: number;
    panY?: number;
    onUpdatePosition?: (event: { id: string, position: { x: number, y: number } }) => void;
  }>();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D | null = null;
  let isDragging = false;
  let draggedNodeId: string | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 120;
  const GRID_SIZE = 20;
  let animationFrameId: number;

  function getNodeAtPoint(x: number, y: number): Evidence | null {
    for (const node of evidence) {
      if (
        x >= node.boardPosition.x &&
        x <= node.boardPosition.x + NODE_WIDTH &&
        y >= node.boardPosition.y &&
        y <= node.boardPosition.y + NODE_HEIGHT
      ) {
        return node;
      }
    }
    return null;
  }

  function getStatusColor(status: string): string {
    switch (status) {
      case 'pending': return '#FFA500';
      case 'approved': return '#00AA00';
      case 'locked': return '#9E0000';
      case 'rejected': return '#CC0000';
      default:return '#CCCCCC';
    }
  }

  function drawGrid() {
    if (!ctx || !canvas) return;

    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = 0.5;

    const width = canvas.width;
    const height = canvas.height;

    for (let x = 0; x < width; x += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y < height; y += GRID_SIZE) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  }

  function drawRelationships() {
    if (!ctx) return;

    ctx.strokeStyle = '#9E0000';
    ctx.lineWidth = 2;

    for (const rel of relationships) {
      const source = evidence.find((e) => e.id === rel.sourceNodeId);
      const target = evidence.find((e) => e.id === rel.targetNodeId);

      if (!source || !target) continue;

      const x1 = source.boardPosition.x + NODE_WIDTH / 2;
      const y1 = source.boardPosition.y + NODE_HEIGHT / 2;
      const x2 = target.boardPosition.x + NODE_WIDTH / 2;
      const y2 = target.boardPosition.y + NODE_HEIGHT / 2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw relationship label at midpoint
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;

      ctx.fillStyle = '#9E0000';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(rel.type, midX, midY - 5);
    }
  }

  function drawNodes() {
    if (!ctx) return;

    for (const node of evidence) {
      const x = node.boardPosition.x;
      const y = node.boardPosition.y;

      // Draw node background
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#9E0000';
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, NODE_WIDTH, NODE_HEIGHT);
      ctx.strokeRect(x, y, NODE_WIDTH, NODE_HEIGHT);

      // Draw status indicator
      const statusColor = getStatusColor(node.status);
      ctx.fillStyle = statusColor;
      ctx.fillRect(x, y, 4, NODE_HEIGHT);

      // Draw title
      ctx.fillStyle = '#1F2937';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const title = node.title.length > 20 ? node.title.substring(0, 20) + '...' : node.title;
      ctx.fillText(title, x + 12, y + 20);

      // Draw ID
      ctx.fillStyle = '#6B7280';
      ctx.font = '10px monospace';
      ctx.fillText(node.id.substring(0, 12), x + 12, y + 35);

      // Draw classification
      ctx.fillStyle = '#9E0000';
      ctx.font = '9px monospace';
      ctx.fillText(node.classification.toUpperCase(), x + 12, y + 50);

      // Draw status
      ctx.fillStyle = statusColor;
      ctx.font = '9px monospace';
      ctx.fillText(node.status.toUpperCase(), x + 12, y + 65);
    }
  }

  function redraw() {
    if (!canvas || !ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.fillStyle = '#FAF7F1';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    // In a real implementation apply pan/zoom here:
    // ctx.translate(panX, panY);
    // ctx.scale(zoomLevel, zoomLevel);

    drawGrid();
    drawRelationships();
    drawNodes();

    ctx.restore();
  }

  function handleMouseDown(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Adjust for pan/zoom if implemented
    const node = getNodeAtPoint(x, y);
    if (node) {
      isDragging = true;
      draggedNodeId = node.id;
      dragOffsetX = x - node.boardPosition.x;
      dragOffsetY = y - node.boardPosition.y;
    }
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging || !draggedNodeId) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const nodeIdx = evidence.findIndex((n) => n.id === draggedNodeId);
    if (nodeIdx >= 0) {
      // Direct mutation of prop array element - requires parent to handle binding or reactivity
      // But for local render update:
      evidence[nodeIdx].boardPosition = {
        x: Math.max(0, x - dragOffsetX),
        y: Math.max(0, y - dragOffsetY),
      };
      redraw();
    }
  }

  function handleMouseUp() {
    if (isDragging && draggedNodeId) {
      const node = evidence.find((n) => n.id === draggedNodeId);
      if (node) {
        onUpdatePosition?.({
          id: draggedNodeId,
          position: { ...node.boardPosition } // clone to avoid reference issues
        });
      }
    }
    isDragging = false;
    draggedNodeId = null;
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    // Zoom logic would invoke parent callback or local state
  }

  $effect(() => {
    evidence; relationships; zoomLevel; panX; panY; // dependencies
    if (canvas) {
        // Simple debounce via RAF could be added
        redraw();
    }
  });

  $effect(() => {

    if (canvas) {
      ctx = canvas.getContext('2d');
      // Set actual canvas size to match display size
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      redraw();
    }
  
});
</script>

<div class="w-full h-full bg-white border-2 border-gray-300 rounded overflow-hidden relative">
  <canvas
    bind:this={canvas}
    onmousedown={handleMouseDown}
    onmousemove={handleMouseMove}
    onmouseup={handleMouseUp}
    onmouseleave={handleMouseUp}
    onwheel={handleWheel}
    class="w-full h-full cursor-grab active:cursor-grabbing block"
  ></canvas>
</div>

<style>
  /* Scoped styles if needed */
</style>
