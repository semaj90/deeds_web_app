<script lang="ts">
  type EvidenceNodeType = {
    id: string; caseId: string; title: string;
    description?: string; evidenceType: string;
    fileType?: string; fileName?: string; fileUrl?: string;
    canvasPosition: { x: number; y: number };
    uploadedBy?: number; uploadedAt: string; updatedAt: string;
    x: number; y: number;
  };

  type EvidenceConnection = {
    id: string; caseId: string;
    fromEvidenceId: string; toEvidenceId: string;
    connectionType: string; label?: string; notes?: string;
    strength: number; isVisible: boolean;
    createdBy?: number; createdAt: string; updatedAt: string;
  };

  let { nodes, connections }: { nodes: EvidenceNodeType[]; connections: EvidenceConnection[] } = $props();

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;

  function getConnectionStyle(strength: number) {
    if (strength >= 0.8) return { color: '#10b981', width: 3 };
    if (strength >= 0.5) return { color: '#f59e0b', width: 2 };
    return { color: '#ef4444', width: 1 };
  }

  function drawConnections() {
    if (!ctx || !nodes.length) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    connections.forEach(conn => {
      const from = nodes.find(n => n.id === conn.fromEvidenceId);
      const to = nodes.find(n => n.id === conn.toEvidenceId);
      if (!from || !to) return;
      const style = getConnectionStyle(conn.strength);
      const fx = from.x + 125, fy = from.y + 50;
      const tx = to.x + 125, ty = to.y + 50;

      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
      drawArrowhead(fx, fy, tx, ty, style.color);
      if (conn.strength > 0.3) drawLabel(fx, fy, tx, ty, conn.strength);
    });
  }

  function drawArrowhead(fx:number,fy:number,tx:number,ty:number,color:string) {
    const len=10, angle=Math.atan2(ty-fy,tx-fx);
    ctx.fillStyle=color; ctx.beginPath(); ctx.moveTo(tx,ty);
    ctx.lineTo(tx-len*Math.cos(angle-Math.PI/6),ty-len*Math.sin(angle-Math.PI/6));
    ctx.lineTo(tx-len*Math.cos(angle+Math.PI/6),ty-len*Math.sin(angle+Math.PI/6));
    ctx.closePath(); ctx.fill();
  }

  function drawLabel(fx:number,fy:number,tx:number,ty:number,strength:number) {
    const mx=(fx+tx)/2, my=(fy+ty)/2;
    ctx.fillStyle='rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(mx,my,12,0,2*Math.PI); ctx.fill();
    ctx.strokeStyle='#d1d5db'; ctx.lineWidth=1; ctx.stroke();
    ctx.fillStyle='#374151'; ctx.font='10px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(Math.round(strength*100)+'%',mx,my);
  }

  function resizeCanvas() {
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    canvas.width=r.width; canvas.height=r.height;
    drawConnections();
  }

  $effect(() => {
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    drawConnections();
    const handleResize = () => resizeCanvas();
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); };
  });
</script>

<canvas bind:this={canvas} class="connections-canvas"></canvas>

<style>
  .connections-canvas {
    position:absolute; top:0; left:0; width:100%; height:100%;
    pointer-events:none; z-index:5;
  }
</style>
